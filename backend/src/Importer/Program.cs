using Dapper;
using Shared;

if (Platform.IsProbe(args)) { await Platform.Probe(); return; }
var builder = Platform.Builder(args);
builder.Services.AddHostedService<OutboxPublisher>();
builder.Services.AddHostedService<ImportWorker>();
var app = builder.Build();
Platform.Pipeline(app);
await app.Services.GetRequiredService<Store>().Migrate("outbox-v1", Store.OutboxSql);
await app.Services.GetRequiredService<Store>().Migrate("importer-v1", """
    create schema importer;
    create table importer.jobs(load_id uuid primary key, stage text not null, inserted int not null default 0,
        existing int not null default 0, invalid int not null default 0, reason text, updated_at timestamptz not null default now());
    create table importer.products(code text primary key, period text not null, name text not null, price numeric(18,2) not null,
        load_id uuid not null, source_row int not null, created_at timestamptz not null default now());
    create table importer.rows(load_id uuid not null, row_num int not null, period text not null, code text not null,
        name text not null, price numeric(18,2) not null, outcome text not null, reason text, primary key(load_id,row_num));
    create procedure importer.consolidate(p_load uuid) language plpgsql as $$
    begin
        -- Only the brief merge is serialized; file reading remains concurrent.
        perform pg_advisory_xact_lock(790003);
        update importer.rows r set outcome='Existente',reason='Código ya registrado en base'
            where r.load_id=p_load and r.outcome='Pendiente' and exists(select 1 from importer.products p where p.code=r.code);
        with ranked as (
            select row_num,row_number() over(partition by code order by row_num) as occurrence
            from importer.rows where load_id=p_load and outcome='Pendiente')
        update importer.rows r set outcome='Existente',reason='Código repetido dentro del archivo'
            from ranked d where r.load_id=p_load and r.row_num=d.row_num and d.occurrence>1;
        insert into importer.products(code,period,name,price,load_id,source_row)
            select code,period,name,price,load_id,row_num from importer.rows where load_id=p_load and outcome='Pendiente';
        update importer.rows set outcome='Insertado' where load_id=p_load and outcome='Pendiente';
    end $$;
    """);
app.MapGet("/internal/loads/{id:guid}/rows", async (Guid id, Store store, int page = 1, int pageSize = 100) =>
{
    page = Math.Clamp(page, 1, 100000); pageSize = Math.Clamp(pageSize, 1, 1000);
    await using var db = await store.Open();
    var total = await db.ExecuteScalarAsync<int>("select count(*) from importer.rows where load_id=@id", new { id });
    var items = await db.QueryAsync("select row_num,period,code,name,price,outcome,reason from importer.rows where load_id=@id order by row_num limit @pageSize offset @offset", new { id, pageSize, offset = (page - 1) * pageSize });
    return Results.Ok(new { page, pageSize, total, items });
});
await app.RunAsync();
