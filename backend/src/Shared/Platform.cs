using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using Npgsql;

namespace Shared;

public static class Platform
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static bool IsProbe(string[] args) => args.Contains("--healthcheck");
    public static async Task Probe()
    {
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
            var response = await client.GetAsync("http://127.0.0.1:8080/health");
            Environment.ExitCode = response.IsSuccessStatusCode ? 0 : 1;
        }
        catch { Environment.ExitCode = 1; }
    }
    public static WebApplicationBuilder Builder(string[] args)
    {
        var b = WebApplication.CreateBuilder(args);
        b.Logging.ClearProviders();
        b.Logging.AddJsonConsole();
        b.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 12 * 1024 * 1024);
        b.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(o => o.MultipartBodyLengthLimit = 11 * 1024 * 1024);
        b.Services.AddSingleton<Store>();
        b.Services.AddHttpClient("internal", c =>
        {
            c.Timeout = TimeSpan.FromSeconds(60);
            c.DefaultRequestHeaders.Add("X-Internal-Key", b.Configuration["InternalKey"] ?? throw new InvalidOperationException("InternalKey missing"));
        });
        b.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
        {
            o.MapInboundClaims = false;
            o.TokenValidationParameters = new()
            {
                ValidateIssuer = true, ValidIssuer = b.Configuration["Jwt:Issuer"],
                ValidateAudience = true, ValidAudience = "carga-api",
                ValidateLifetime = true, ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(b.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("JWT key missing"))),
                ClockSkew = TimeSpan.FromSeconds(10), NameClaimType = "sub"
            };
        });
        b.Services.AddAuthorization();
        return b;
    }
    public static void Pipeline(WebApplication app)
    {
        app.Use(async (ctx, next) =>
        {
            ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
            ctx.Response.Headers["X-Request-Id"] = ctx.TraceIdentifier;
            try { await next(); }
            catch (BadHttpRequestException ex) { ctx.Response.StatusCode = ex.StatusCode; await ctx.Response.WriteAsJsonAsync(new { error = "Solicitud inválida o demasiado grande" }); }
            catch (Exception ex)
            {
                app.Logger.LogError(ex, "Unhandled request failure {RequestId}", ctx.TraceIdentifier);
                if (ctx.Response.HasStarted) { ctx.Abort(); return; }
                ctx.Response.StatusCode = 503;
                await ctx.Response.WriteAsJsonAsync(new { error = "Servicio temporalmente no disponible", requestId = ctx.TraceIdentifier });
            }
        });
        app.Use(async (ctx, next) =>
        {
            if (ctx.Request.Path.StartsWithSegments("/internal"))
            {
                var expected = Encoding.UTF8.GetBytes(app.Configuration["InternalKey"]!);
                var actual = Encoding.UTF8.GetBytes(ctx.Request.Headers["X-Internal-Key"].ToString());
                if (!System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(expected, actual))
                { ctx.Response.StatusCode = 401; return; }
            }
            await next();
        });
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGet("/health", async (Store store) =>
        {
            await using var db = await store.Open();
            await db.ExecuteScalarAsync<int>("select 1");
            return Results.Ok(new { status = "healthy" });
        });
    }
    public static string UserId(HttpContext ctx) => ctx.User.FindFirstValue("sub")!;
    public static string Email(HttpContext ctx) => ctx.User.FindFirstValue("email")!;
    public static string Serialize(object value) => JsonSerializer.Serialize(value, Json);
    public static HttpClient Client(IServiceProvider sp) => sp.GetRequiredService<IHttpClientFactory>().CreateClient("internal");
    public static async Task InternalPost(HttpClient client, string url, object value, CancellationToken ct)
    {
        using var response = await client.PostAsync(url, new StringContent(Serialize(value), Encoding.UTF8, "application/json"), ct);
        if (response.StatusCode == HttpStatusCode.Conflict) throw new RejectedException("Periodo ocupado por otra carga");
        response.EnsureSuccessStatusCode();
    }
}

public class RejectedException(string message) : Exception(message);
public record LoadMessage(Guid LoadId, string FileKey, string Email, int Attempts = 0, string[]? Recipients = null);
public record NotificationMessage(Guid LoadId, string Email, int Inserted, int Existing, int Invalid, int Attempts = 0, string[]? Recipients = null);

public sealed class Store(IConfiguration config)
{
    public async Task<NpgsqlConnection> Open()
    {
        var db = new NpgsqlConnection(config.GetConnectionString("Db"));
        await db.OpenAsync();
        return db;
    }
    public async Task Migrate(string name, string sql)
    {
        await using var db = await Open();
        await using var tx = await db.BeginTransactionAsync();
        await db.ExecuteAsync("select pg_advisory_xact_lock(790001)", transaction: tx);
        await db.ExecuteAsync("create schema if not exists platform; create table if not exists platform.migrations(name text primary key, applied_at timestamptz not null default now())", transaction: tx);
        if (!await db.ExecuteScalarAsync<bool>("select exists(select 1 from platform.migrations where name=@name)", new { name }, tx))
        {
            await db.ExecuteAsync(sql, transaction: tx);
            await db.ExecuteAsync("insert into platform.migrations(name) values(@name)", new { name }, tx);
        }
        await tx.CommitAsync();
    }
    public async Task AddOutbox(NpgsqlConnection db, NpgsqlTransaction tx, string topic, object value) =>
        await db.ExecuteAsync("insert into platform.outbox(id,topic,payload) values(@id,@topic,cast(@payload as jsonb))", new { id = Guid.NewGuid(), topic, payload = Platform.Serialize(value) }, tx);

    public const string OutboxSql = """
        create table if not exists platform.outbox(
            id uuid primary key, topic text not null, payload jsonb not null,
            created_at timestamptz not null default now(), published_at timestamptz);
        create index if not exists ix_outbox_pending on platform.outbox(created_at) where published_at is null;
        """;
}
