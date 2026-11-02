using Dapper;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using Shared;

// Consume el resultado de una carga; el transporte SMTP se elige por configuración.
public sealed class NotificationWorker(Store store, IConfiguration config, IHttpClientFactory clients, ILogger<NotificationWorker> log)
    : QueueWorker<NotificationMessage>(config, log, "notificaciones")
{
    protected override int Attempts(NotificationMessage m) => m.Attempts;
    protected override NotificationMessage Retry(NotificationMessage m) => m with { Attempts = m.Attempts + 1 };
    protected override async Task Exhausted(NotificationMessage m, Exception error, CancellationToken ct)
    {
        await using var db = await store.Open();
        await db.ExecuteAsync("update notifier.deliveries set last_error='Reintentos agotados; revisar cola notificaciones.failed',updated_at=now() where load_id=@id", new { id = m.LoadId });
    }
    protected override async Task Process(NotificationMessage m, CancellationToken ct)
    {
        using var scope = Logger.BeginScope(new Dictionary<string, object> { ["LoadId"] = m.LoadId });
        await using var db = await store.Open();
        // Serializa redeliveries de la misma carga incluso entre réplicas del servicio.
        var lockKey = "notify:" + m.LoadId;
        await db.ExecuteAsync("select pg_advisory_lock(hashtextextended(@lockKey,0))", new { lockKey });
        try
        {
            await db.ExecuteAsync("insert into notifier.deliveries(load_id) values(@id) on conflict do nothing", new { id = m.LoadId });
            var status = await db.QuerySingleAsync<string>("select status from notifier.deliveries where load_id=@id", new { id = m.LoadId });
            if (status == "Completed") return;
            // Si SMTP ya aceptó, solo falta reconciliar Control: no volver a enviar.
            if (status != "Accepted")
            {
                await db.ExecuteAsync("update notifier.deliveries set attempts=attempts+1,updated_at=now() where load_id=@id", new { id = m.LoadId });
                try
                {
                    var message = new MimeMessage();
                    message.From.Add(MailboxAddress.Parse(Config["Smtp:From"]!));
                    // La selección explícita de esta carga prevalece sobre el destino de pruebas.
                    var recipients = m.Recipients is { Length: > 0 } ? m.Recipients
                        : new[] { string.IsNullOrWhiteSpace(Config["Notification:RecipientOverride"])
                            ? m.Email : Config["Notification:RecipientOverride"]! };
                    if (recipients.Length > 5) throw new InvalidOperationException("Too many recipients");
                    var recipient = string.Join(", ", recipients);
                    // Bcc evita revelar las direcciones entre destinatarios de la misma carga.
                    foreach (var address in recipients) message.Bcc.Add(MailboxAddress.Parse(address));
                    message.MessageId = $"carga-{m.LoadId:N}@majestic.local";
                    message.Subject = $"Carga {m.LoadId}: procesamiento finalizado";
                    message.Body = new TextPart("plain") { Text = $"Carga: {m.LoadId}\nInsertados: {m.Inserted}\nExistentes: {m.Existing}\nInválidos: {m.Invalid}\nConsulta el detalle de tu carga para revisar los resultados por fila." };
                    using var smtp = new SmtpClient { Timeout = 15000 };
                    var security = Enum.Parse<SecureSocketOptions>(Config["Smtp:Security"] ?? "StartTls", true);
                    await smtp.ConnectAsync(Config["Smtp:Host"]!, Config.GetValue<int>("Smtp:Port"), security, ct);
                    if (!string.IsNullOrWhiteSpace(Config["Smtp:User"])) await smtp.AuthenticateAsync(Config["Smtp:User"]!, Config["Smtp:Password"] ?? "", ct);
                    await smtp.SendAsync(message, ct);
                    // Registrar inmediatamente la aceptación SMTP. No equivale a entrega en bandeja.
                    // Una caída antes de este commit aún puede causar un envío duplicado.
                    await using (var tx = await db.BeginTransactionAsync(ct))
                    {
                        await db.ExecuteAsync("update notifier.deliveries set status='Accepted',accepted_at=now(),last_error=null,recipient=@recipient,updated_at=now() where load_id=@id; insert into notifier.attempts(load_id,outcome) values(@id,'Accepted')", new { id = m.LoadId, recipient }, tx);
                        await tx.CommitAsync(ct);
                    }
                }
                catch (Exception ex)
                {
                    await db.ExecuteAsync("update notifier.deliveries set last_error=@error,updated_at=now() where load_id=@id; insert into notifier.attempts(load_id,outcome,detail) values(@id,'Failed',@error)", new { id = m.LoadId, error = ex.GetType().Name });
                    throw;
                }
            }
            await Platform.InternalPost(clients.CreateClient("internal"), $"{Config["ControlUrl"]}/internal/loads/{m.LoadId}/notified", new { }, ct);
            await db.ExecuteAsync("update notifier.deliveries set status='Completed',updated_at=now() where load_id=@id", new { id = m.LoadId });
            Logger.LogInformation("Notification accepted by SMTP for load {LoadId}", m.LoadId);
        }
        finally { await db.ExecuteAsync("select pg_advisory_unlock(hashtextextended(@lockKey,0))", new { lockKey }); }
    }
}
