using System.Net.Http.Json;
using Dapper;
using Shared;

if (Platform.IsProbe(args)) { await Platform.Probe(); return; }
var builder = Platform.Builder(args);
builder.Services.AddHostedService<OutboxPublisher>();
var app = builder.Build();
Platform.Pipeline(app);
var store = app.Services.GetRequiredService<Store>();
await store.Migrate("outbox-v1", Store.OutboxSql);
await store.Migrate("control-v1", """
    create schema control;
    create table control.loads(
        id uuid primary key, owner_id uuid not null, email text not null, filename text not null, file_key text not null,
        status text not null default 'Pendiente', result text, error text,
        inserted int not null default 0, existing int not null default 0, invalid int not null default 0,
        created_at timestamptz not null default now(), finished_at timestamptz, notified_at timestamptz);
    create index on control.loads(owner_id,created_at desc);
    create table control.periods(period text primary key, load_id uuid not null references control.loads);
    create table control.history(id bigint generated always as identity primary key, load_id uuid not null references control.loads, status text not null, detail text, at timestamptz not null default now());
    """);

await app.Services.GetRequiredService<Store>().Migrate("control-v2", """
    alter table control.loads add column recipients text[] not null default '{}';
    """);
var api = app.MapGroup("/api/cargas").RequireAuthorization();
api.MapPost("", async (HttpContext ctx, Store st) =>
{
    if (!ctx.User.HasClaim("permission", "loads:write")) return Results.Forbid();
    if (!ctx.Request.HasFormContentType) return Results.BadRequest(new { error = "Use multipart/form-data con el campo file" });
    var form = await ctx.Request.ReadFormAsync(ctx.RequestAborted);
    // Solo direcciones simples: sin nombres, listas ocultas ni cabeceras inyectadas.
    var rawRecipients = form["recipients"].ToString();
    if (rawRecipients.Length > 1500) return Results.BadRequest(new { error = "Máximo cinco correos de hasta 254 caracteres." });
    var addresses = rawRecipients.Split([',', ';', '\n'], StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
    if (addresses.Length > 5 || addresses.Any(a => a.Length > 254 || a.Any(char.IsControl)
        || !System.Net.Mail.MailAddress.TryCreate(a, out var parsed) || parsed.Address != a
        || !a.Contains('@') || a.Contains(' ') || a.Contains('<') || a.Contains('>')))
        return Results.BadRequest(new { error = "Indica hasta cinco correos válidos, separados por comas." });
    var recipients = addresses.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
    var file = form.Files.GetFile("file");
    var max = app.Configuration.GetValue<long>("MaxUploadBytes");
    if (file is null || file.Length == 0 || file.Length > max || !Path.GetExtension(file.FileName).Equals(".xlsx", StringComparison.OrdinalIgnoreCase))
        return Results.BadRequest(new { error = $"Se requiere un XLSX no vacío de máximo {max} bytes" });
    var id = Guid.NewGuid();
    var key = $"/uploads/{id:N}.xlsx";
    var client = Platform.Client(ctx.RequestServices);
    await using (var stream = file.OpenReadStream())
    using (var content = new StreamContent(stream))
    using (var response = await client.PutAsync(app.Configuration["FilesUrl"] + key, content, ctx.RequestAborted))
        response.EnsureSuccessStatusCode();
    try
    {
        await using var db = await st.Open();
        await using var tx = await db.BeginTransactionAsync(ctx.RequestAborted);
        await db.ExecuteAsync("insert into control.loads(id,owner_id,email,filename,file_key,recipients) values(@id,@owner,@email,@filename,@key,@recipients)",
            new { id, owner = Guid.Parse(Platform.UserId(ctx)), email = Platform.Email(ctx), recipients, filename = Path.GetFileName(file.FileName).Replace('\\', '_')[..Math.Min(Path.GetFileName(file.FileName).Length, 200)], key }, tx);
        await db.ExecuteAsync("insert into control.history(load_id,status,detail) values(@id,'Pendiente','Archivo recibido; publicación en cola pendiente')", new { id }, tx);
        // Crear la carga y su evento en una transacción evita perder el trabajo si RabbitMQ cae.
        await st.AddOutbox(db, tx, "carga_masiva", new LoadMessage(id, key, Platform.Email(ctx), Recipients: recipients));
        await tx.CommitAsync(ctx.RequestAborted);
    }
    catch
    {
        // An interrupted commit can be ambiguous: only remove the file if absence is verified.
        await using var check = await st.Open();
        if (!await check.ExecuteScalarAsync<bool>("select exists(select 1 from control.loads where id=@id)", new { id }))
        {
            try { using var response = await client.DeleteAsync(app.Configuration["FilesUrl"] + key); }
            catch (Exception cleanup) { app.Logger.LogWarning(cleanup, "Orphan file needs cleanup {LoadId}", id); }
        }
        throw;
    }
    app.Logger.LogInformation("Accepted load {LoadId} for {OwnerId}", id, Platform.UserId(ctx));
    return Results.Accepted($"/api/cargas/{id}", new { id, status = "Pendiente" });
});
api.MapGet("/notificacion", async (HttpContext ctx) =>
{
    var client = Platform.Client(ctx.RequestServices);
    using var response = await client.GetAsync(app.Configuration["NotifierUrl"] + "/internal/notifications/settings", ctx.RequestAborted);
    response.EnsureSuccessStatusCode();
    return Results.Content(await response.Content.ReadAsStringAsync(ctx.RequestAborted), "application/json");
});
api.MapGet("", async (HttpContext ctx, Store st, int page = 1, int pageSize = 20) =>
{
    page = Math.Clamp(page, 1, 100000); pageSize = Math.Clamp(pageSize, 1, 100);
    await using var db = await st.Open();
    var owner = Guid.Parse(Platform.UserId(ctx));
    var total = await db.ExecuteScalarAsync<int>("select count(*) from control.loads where owner_id=@owner", new { owner });
    var items = await db.QueryAsync("select id,filename,status,result,error,inserted,existing,invalid,created_at,finished_at,notified_at from control.loads where owner_id=@owner order by created_at desc limit @pageSize offset @offset", new { owner, pageSize, offset = (page - 1) * pageSize });
    return Results.Ok(new { page, pageSize, total, items });
});
api.MapGet("/{id:guid}", async (Guid id, HttpContext ctx, Store st) =>
{
    await using var db = await st.Open();
    var load = await db.QuerySingleOrDefaultAsync("select id,filename,status,result,error,inserted,existing,invalid,created_at,finished_at,notified_at,recipients from control.loads where id=@id and owner_id=@owner", new { id, owner = Guid.Parse(Platform.UserId(ctx)) });
    if (load is null) return Results.NotFound();
    var periods = await db.QueryAsync<string>("select period from control.periods where load_id=@id order by period", new { id });
    var history = await db.QueryAsync("select status,detail,at from control.history where load_id=@id order by id", new { id });
    return Results.Ok(new { load, periods, history });
});
api.MapGet("/{id:guid}/filas", async (Guid id, HttpContext ctx, Store st, int page = 1, int pageSize = 100) =>
{
    await using var db = await st.Open();
    if (!await db.ExecuteScalarAsync<bool>("select exists(select 1 from control.loads where id=@id and owner_id=@owner)", new { id, owner = Guid.Parse(Platform.UserId(ctx)) })) return Results.NotFound();
    var client = Platform.Client(ctx.RequestServices);
    using var response = await client.GetAsync($"{app.Configuration["ImporterUrl"]}/internal/loads/{id}/rows?page={Math.Clamp(page, 1, 100000)}&pageSize={Math.Clamp(pageSize, 1, 1000)}", ctx.RequestAborted);
    response.EnsureSuccessStatusCode();
    return Results.Content(await response.Content.ReadAsStringAsync(ctx.RequestAborted), "application/json");
});
api.MapGet("/{id:guid}/archivo", async (Guid id, HttpContext ctx, Store st) =>
{
    await using var db = await st.Open();
    var row = await db.QuerySingleOrDefaultAsync("select filename,file_key from control.loads where id=@id and owner_id=@owner", new { id, owner = Guid.Parse(Platform.UserId(ctx)) });
    if (row is null) return Results.NotFound();
    var client = Platform.Client(ctx.RequestServices);
    using var response = await client.GetAsync(app.Configuration["FilesUrl"] + (string)row.file_key, ctx.RequestAborted);
    response.EnsureSuccessStatusCode();
    return Results.File(await response.Content.ReadAsByteArrayAsync(ctx.RequestAborted), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", (string)row.filename);
});

app.MapPost("/internal/loads/{id:guid}/reserve", async (Guid id, Reserve request, Store st) =>
{
    if (request.Periods.Length == 0 || request.Periods.Any(p => !System.Text.RegularExpressions.Regex.IsMatch(p, @"^\d{4}-(0[1-9]|1[0-2])$"))) return Results.BadRequest();
    await using var db = await st.Open();
    await using var tx = await db.BeginTransactionAsync();
    // Reservar todos los periodos bajo el mismo bloqueo: aceptación o rechazo del archivo completo.
    await db.ExecuteAsync("select pg_advisory_xact_lock(790002)", transaction: tx);
    var status = await db.QuerySingleOrDefaultAsync<string>("select status from control.loads where id=@id for update", new { id }, tx);
    if (status is null) return Results.NotFound();
    if (status is "Rechazado" or "Fallido") return Results.Conflict(new { error = "Carga no activa" });
    var conflict = await db.QueryAsync<string>("select period from control.periods where period=any(@periods) and load_id<>@id", new { periods = request.Periods, id }, tx);
    if (conflict.Any()) return Results.Conflict(new { error = "Periodos ocupados", periods = conflict });
    foreach (var period in request.Periods.Distinct().Order())
        await db.ExecuteAsync("insert into control.periods(period,load_id) values(@period,@id) on conflict(period) do nothing", new { period, id }, tx);
    if (status == "Pendiente")
    {
        await db.ExecuteAsync("update control.loads set status='En proceso' where id=@id; insert into control.history(load_id,status) values(@id,'En proceso')", new { id }, tx);
    }
    await tx.CommitAsync();
    return Results.Ok();
});
app.MapPost("/internal/loads/{id:guid}/complete", async (Guid id, Complete request, Store st) =>
{
    await using var db = await st.Open();
    await using var tx = await db.BeginTransactionAsync();
    var status = await db.QuerySingleOrDefaultAsync<string>("select status from control.loads where id=@id for update", new { id }, tx);
    if (status is null) return Results.NotFound();
    if (status is "Finalizado" or "Notificado") return Results.Ok();
    if (status != "En proceso") return Results.Conflict();
    await db.ExecuteAsync("""
        update control.loads set status='Finalizado',inserted=@Inserted,existing=@Existing,invalid=@Invalid,
        result=@result,finished_at=now() where id=@id;
        insert into control.history(load_id,status,detail) values(@id,'Cargado','Resultados persistidos');
        insert into control.history(load_id,status,detail) values(@id,'Finalizado',@result);
        """, new { id, request.Inserted, request.Existing, request.Invalid,
            result = request.Inserted == 0 ? "Sin registros nuevos" : request.Invalid > 0 ? "Completado con errores de fila" : "Completado" }, tx);
    await tx.CommitAsync();
    return Results.Ok();
});
app.MapPost("/internal/loads/{id:guid}/reject", async (Guid id, Failure request, Store st) =>
{
    await using var db = await st.Open();
    await using var tx = await db.BeginTransactionAsync();
    var changed = await db.ExecuteAsync("update control.loads set status='Rechazado',error=@Reason,finished_at=now() where id=@id and status in ('Pendiente','En proceso')", new { id, request.Reason }, tx);
    if (changed > 0)
    {
        await db.ExecuteAsync("delete from control.periods where load_id=@id; insert into control.history(load_id,status,detail) values(@id,'Rechazado',@Reason)", new { id, request.Reason }, tx);
    }
    await tx.CommitAsync();
    return Results.Ok();
});
app.MapPost("/internal/loads/{id:guid}/failed", async (Guid id, Failure request, Store st) =>
{
    await using var db = await st.Open();
    await using var tx = await db.BeginTransactionAsync();
    var changed = await db.ExecuteAsync("update control.loads set status='Fallido',error=@Reason,finished_at=now() where id=@id and status in ('Pendiente','En proceso')", new { id, request.Reason }, tx);
    if (changed > 0) await db.ExecuteAsync("insert into control.history(load_id,status,detail) values(@id,'Fallido',@Reason)", new { id, request.Reason }, tx);
    await tx.CommitAsync();
    return Results.Ok();
});
app.MapPost("/internal/loads/{id:guid}/notified", async (Guid id, Store st) =>
{
    await using var db = await st.Open();
    await using var tx = await db.BeginTransactionAsync();
    var changed = await db.ExecuteAsync("update control.loads set status='Notificado',notified_at=now() where id=@id and status='Finalizado'", new { id }, tx);
    if (changed > 0) await db.ExecuteAsync("insert into control.history(load_id,status,detail) values(@id,'Notificado','Mensaje aceptado por SMTP')", new { id }, tx);
    await tx.CommitAsync();
    return Results.Ok();
});
await app.RunAsync();
record Reserve(string[] Periods);
record Complete(int Inserted, int Existing, int Invalid);
record Failure(string Reason);
