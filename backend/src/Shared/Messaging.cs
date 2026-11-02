using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace Shared;

public sealed class Broker(IConfiguration config) : IAsyncDisposable
{
    private IConnection? connection;
    private IChannel? channel;
    public async Task<IChannel> Connect(CancellationToken ct)
    {
        var factory = new ConnectionFactory
        {
            HostName = config["Rabbit:Host"]!, UserName = config["Rabbit:User"]!, Password = config["Rabbit:Password"]!,
            AutomaticRecoveryEnabled = true, NetworkRecoveryInterval = TimeSpan.FromSeconds(3)
        };
        connection = await factory.CreateConnectionAsync(ct);
        channel = await connection.CreateChannelAsync(new CreateChannelOptions(publisherConfirmationsEnabled: true, publisherConfirmationTrackingEnabled: true), ct);
        await channel.ExchangeDeclareAsync("cargas", ExchangeType.Direct, durable: true, cancellationToken: ct);
        foreach (var queue in new[] { "carga_masiva", "notificaciones" })
        {
            await channel.QueueDeclareAsync(queue, true, false, false, cancellationToken: ct);
            await channel.QueueBindAsync(queue, "cargas", queue, cancellationToken: ct);
            await channel.QueueDeclareAsync(queue + ".failed", true, false, false, cancellationToken: ct);
            await channel.QueueBindAsync(queue + ".failed", "cargas", queue + ".failed", cancellationToken: ct);
            for (var attempt = 1; attempt <= 3; attempt++)
            {
                var retry = $"{queue}.retry.{attempt}";
                await channel.QueueDeclareAsync(retry, true, false, false, new Dictionary<string, object?>
                {
                    ["x-message-ttl"] = attempt * 5000,
                    ["x-dead-letter-exchange"] = "cargas", ["x-dead-letter-routing-key"] = queue
                }, cancellationToken: ct);
                await channel.QueueBindAsync(retry, "cargas", retry, cancellationToken: ct);
            }
        }
        return channel;
    }
    public async Task Publish(string topic, string json, CancellationToken ct)
    {
        await channel!.BasicPublishAsync("cargas", topic, mandatory: true,
            basicProperties: new BasicProperties { Persistent = true, ContentType = "application/json", MessageId = Guid.NewGuid().ToString() },
            body: Encoding.UTF8.GetBytes(json), cancellationToken: ct);
    }
    public async ValueTask DisposeAsync()
    {
        if (channel is not null) await channel.DisposeAsync();
        if (connection is not null) await connection.DisposeAsync();
    }
}

public sealed class OutboxPublisher(Store store, IConfiguration config, ILogger<OutboxPublisher> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var broker = new Broker(config);
                await broker.Connect(stoppingToken);
                while (!stoppingToken.IsCancellationRequested)
                {
                    await using var db = await store.Open();
                    await using var tx = await db.BeginTransactionAsync(stoppingToken);
                    // SKIP LOCKED permite varios publicadores sin tomar la misma fila a la vez.
                    // Si el proceso cae tras publicar y antes del commit, habrá redelivery:
                    // los consumidores deben recuperar su checkpoint por LoadId.
                    var rows = await db.QueryAsync("select id,topic,payload::text as payload from platform.outbox where published_at is null order by created_at limit 10 for update skip locked", transaction: tx);
                    foreach (var row in rows)
                    {
                        await broker.Publish((string)row.topic, (string)row.payload, stoppingToken);
                        await db.ExecuteAsync("update platform.outbox set published_at=now() where id=@id", new { id = (Guid)row.id }, tx);
                    }
                    await tx.CommitAsync(stoppingToken);
                    await Task.Delay(500, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { log.LogWarning(ex, "Outbox unavailable; reconnecting"); await Task.Delay(3000, stoppingToken); }
        }
    }
}

public abstract class QueueWorker<T>(IConfiguration config, ILogger log, string queue) : BackgroundService where T : class
{
    protected IConfiguration Config { get; } = config;
    protected ILogger Logger { get; } = log;
    protected abstract Task Process(T message, CancellationToken ct);
    protected abstract int Attempts(T message);
    protected abstract T Retry(T message);
    protected virtual Task Exhausted(T message, Exception error, CancellationToken ct) => Task.CompletedTask;
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var broker = new Broker(Config);
                var channel = await broker.Connect(stoppingToken);
                await channel.BasicQosAsync(0, 1, false, stoppingToken);
                var consumer = new AsyncEventingBasicConsumer(channel);
                consumer.ReceivedAsync += async (_, delivery) =>
                {
                    T? message = null;
                    try
                    {
                        message = JsonSerializer.Deserialize<T>(delivery.Body.Span, Platform.Json) ?? throw new JsonException("Empty message");
                        // Confirmar RabbitMQ solo después de completar el trabajo durable.
                        await Process(message, stoppingToken);
                        await channel.BasicAckAsync(delivery.DeliveryTag, false, stoppingToken);
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
                    catch (Exception ex)
                    {
                        Logger.LogWarning(ex, "Queue {Queue} message failed", queue);
                        try
                        {
                            if (message is null)
                                await broker.Publish(queue + ".failed", Encoding.UTF8.GetString(delivery.Body.Span), stoppingToken);
                            else if (Attempts(message) < 3)
                                await broker.Publish($"{queue}.retry.{Attempts(message) + 1}", Platform.Serialize(Retry(message)), stoppingToken);
                            else
                            {
                                await Exhausted(message, ex, stoppingToken);
                                await broker.Publish(queue + ".failed", Platform.Serialize(message), stoppingToken);
                            }
                            // El mensaje original se confirma después de publicar su reemplazo.
                            await channel.BasicAckAsync(delivery.DeliveryTag, false, stoppingToken);
                        }
                        catch (Exception retryError)
                        {
                            Logger.LogError(retryError, "Could not safely move message; returning it to queue");
                            if (!stoppingToken.IsCancellationRequested)
                            {
                                await Task.Delay(3000, stoppingToken);
                                await channel.BasicNackAsync(delivery.DeliveryTag, false, true, stoppingToken);
                            }
                        }
                    }
                };
                await channel.BasicConsumeAsync(queue, false, consumer, stoppingToken);
                while (!stoppingToken.IsCancellationRequested && channel.IsOpen) await Task.Delay(1000, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { Logger.LogWarning(ex, "Queue connection failed; reconnecting"); await Task.Delay(3000, stoppingToken); }
        }
    }
}
