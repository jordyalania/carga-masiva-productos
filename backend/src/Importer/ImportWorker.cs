using Dapper;
using NpgsqlTypes;
using Shared;

public sealed class ImportWorker(Store store, IConfiguration config, IHttpClientFactory clients, ILogger<ImportWorker> log)
    : QueueWorker<LoadMessage>(config, log, "carga_masiva")
{
    protected override int Attempts(LoadMessage m) => m.Attempts;
    protected override LoadMessage Retry(LoadMessage m) => m with { Attempts = m.Attempts + 1 };
    protected override async Task Exhausted(LoadMessage m, Exception ex, CancellationToken ct)
    {
        await using var db = await store.Open();
        var stage = await db.QuerySingleOrDefaultAsync<string>("select stage from importer.jobs where load_id=@id", new { id = m.LoadId });
        // Persisted data must be reconciled, never relabelled as unprocessed failure.
        if (stage != "Persisted")
            await Platform.InternalPost(clients.CreateClient("internal"), $"{Config["ControlUrl"]}/internal/loads/{m.LoadId}/failed", new { reason = "Reintentos agotados. Revisar cola de fallidos y logs de esta carga." }, ct);
    }
    protected override async Task Process(LoadMessage m, CancellationToken ct)
    {
        using var scope = Logger.BeginScope(new Dictionary<string, object> { ["LoadId"] = m.LoadId });
        await using var db = await store.Open();
        var lockKey = "import:" + m.LoadId;
        await db.ExecuteAsync("select pg_advisory_lock(hashtextextended(@lockKey,0))", new { lockKey });
        try
        {
            var client = clients.CreateClient("internal");
            await db.ExecuteAsync("insert into importer.jobs(load_id,stage) values(@id,'Received') on conflict do nothing", new { id = m.LoadId });
            var job = await db.QuerySingleAsync<Job>("select stage,inserted,existing,invalid,reason from importer.jobs where load_id=@id", new { id = m.LoadId });
            if (job.Stage == "Completed") return;
            if (job.Stage == "Rejected")
            {
                await Reject(m, job.Reason!, ct);
                return;
            }
            // Persisted retoma desde la coordinación con Control, sin repetir COPY.
            if (job.Stage == "Received")
            {
                List<ParsedRow> rows;
                try
                {
                    if (m.FileKey != $"/uploads/{m.LoadId:N}.xlsx") throw new RejectedException("Referencia de archivo inválida");
                    using var response = await client.GetAsync(Config["FilesUrl"] + m.FileKey, HttpCompletionOption.ResponseHeadersRead, ct);
                    response.EnsureSuccessStatusCode();
                    await using var stream = await response.Content.ReadAsStreamAsync(ct);
                    using var buffer = new MemoryStream();
                    var chunk = new byte[65536];
                    int read;
                    while ((read = await stream.ReadAsync(chunk, ct)) > 0)
                    {
                        if (buffer.Length + read > Config.GetValue<long>("MaxUploadBytes")) throw new RejectedException("Archivo demasiado grande");
                        buffer.Write(chunk, 0, read);
                    }
                    rows = ExcelReader.Read(buffer.ToArray(), Config.GetValue<int>("MaxRows"), Config.GetValue<long>("MaxExpandedBytes"));
                    var periods = rows.Select(r => r.Period).Where(p => System.Text.RegularExpressions.Regex.IsMatch(p, @"^\d{4}-(0[1-9]|1[0-2])$")).Distinct().Order().ToArray();
                    if (periods.Length == 0) throw new RejectedException("No hay periodos válidos en el archivo");
                    await Platform.InternalPost(client, $"{Config["ControlUrl"]}/internal/loads/{m.LoadId}/reserve", new { periods }, ct);
                }
                catch (RejectedException ex)
                {
                    await db.ExecuteAsync("update importer.jobs set stage='Rejected',reason=@reason,updated_at=now() where load_id=@id", new { id = m.LoadId, reason = ex.Message });
                    await Reject(m, ex.Message, ct);
                    Logger.LogInformation("Rejected load: {Reason}", ex.Message);
                    return;
                }
                var delay = Config.GetValue<int>("ProcessingDelayMs");
                if (delay > 0) await Task.Delay(delay, ct); // Deterministic local crash-test hook, default disabled.
                // Filas, productos y checkpoint se confirman juntos o se revierten juntos.
                await using (var tx = await db.BeginTransactionAsync(ct))
                {
                    await using (var copy = await db.BeginBinaryImportAsync("COPY importer.rows(load_id,row_num,period,code,name,price,outcome,reason) FROM STDIN (FORMAT BINARY)", ct))
                    {
                        foreach (var row in rows)
                        {
                            await copy.StartRowAsync(ct);
                            await copy.WriteAsync(m.LoadId, NpgsqlDbType.Uuid, ct);
                            await copy.WriteAsync(row.Number, NpgsqlDbType.Integer, ct);
                            await copy.WriteAsync(row.Period, NpgsqlDbType.Text, ct);
                            await copy.WriteAsync(row.Code, NpgsqlDbType.Text, ct);
                            await copy.WriteAsync(row.Name, NpgsqlDbType.Text, ct);
                            await copy.WriteAsync(row.Price, NpgsqlDbType.Numeric, ct);
                            await copy.WriteAsync(row.Error is null ? "Pendiente" : "Inválido", NpgsqlDbType.Text, ct);
                            if (row.Error is null) await copy.WriteNullAsync(ct); else await copy.WriteAsync(row.Error, NpgsqlDbType.Text, ct);
                        }
                        await copy.CompleteAsync(ct);
                    }
                    await db.ExecuteAsync("call importer.consolidate(@id)", new { id = m.LoadId }, tx);
                    await db.ExecuteAsync("""
                        update importer.jobs set stage='Persisted',updated_at=now(),
                        inserted=(select count(*) from importer.rows where load_id=@id and outcome='Insertado'),
                        existing=(select count(*) from importer.rows where load_id=@id and outcome='Existente'),
                        invalid=(select count(*) from importer.rows where load_id=@id and outcome='Inválido') where load_id=@id
                        """, new { id = m.LoadId }, tx);
                    await tx.CommitAsync(ct);
                }
                job = await db.QuerySingleAsync<Job>("select stage,inserted,existing,invalid,reason from importer.jobs where load_id=@id", new { id = m.LoadId });
                var afterPersistDelay = Config.GetValue<int>("AfterPersistDelayMs");
                if (afterPersistDelay > 0) await Task.Delay(afterPersistDelay, ct);
            }
            await Platform.InternalPost(client, $"{Config["ControlUrl"]}/internal/loads/{m.LoadId}/complete", new { job.Inserted, job.Existing, job.Invalid }, ct);
            // El checkpoint Completed y el evento de notificación son una unidad atómica.
            await using (var tx = await db.BeginTransactionAsync(ct))
            {
                await store.AddOutbox(db, tx, "notificaciones", new NotificationMessage(m.LoadId, m.Email, job.Inserted, job.Existing, job.Invalid, Recipients: m.Recipients));
                await db.ExecuteAsync("update importer.jobs set stage='Completed',updated_at=now() where load_id=@id", new { id = m.LoadId }, tx);
                await tx.CommitAsync(ct);
            }
            Logger.LogInformation("Load persisted: {Inserted} inserted, {Existing} existing, {Invalid} invalid", job.Inserted, job.Existing, job.Invalid);
        }
        finally { await db.ExecuteAsync("select pg_advisory_unlock(hashtextextended(@lockKey,0))", new { lockKey }); }
    }
    private Task Reject(LoadMessage m, string reason, CancellationToken ct) =>
        Platform.InternalPost(clients.CreateClient("internal"), $"{Config["ControlUrl"]}/internal/loads/{m.LoadId}/reject", new { reason }, ct);
    private record Job(string Stage, int Inserted, int Existing, int Invalid, string? Reason);
}
