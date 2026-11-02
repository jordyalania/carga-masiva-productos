using System.Net;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Shared;

if (Platform.IsProbe(args)) { await Platform.Probe(); return; }
var builder = Platform.Builder(args);
builder.Services.AddHttpClient("proxy", c => c.Timeout = TimeSpan.FromSeconds(90));
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
        RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ =>
            new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ =>
        new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
var app = builder.Build();
Platform.Pipeline(app);
app.UseRateLimiter();

async Task Proxy(HttpContext ctx, string target, string path)
{
    using var request = new HttpRequestMessage(new HttpMethod(ctx.Request.Method), target + path + ctx.Request.QueryString);
    if (ctx.Request.ContentLength > 0 || ctx.Request.Headers.ContainsKey("Transfer-Encoding"))
    {
        request.Content = new StreamContent(ctx.Request.Body);
        if (ctx.Request.ContentType is not null) request.Content.Headers.TryAddWithoutValidation("Content-Type", ctx.Request.ContentType);
    }
    if (ctx.Request.Headers.TryGetValue("Authorization", out var token)) request.Headers.TryAddWithoutValidation("Authorization", token.ToString());
    request.Headers.TryAddWithoutValidation("X-Request-Id", ctx.TraceIdentifier);
    var client = ctx.RequestServices.GetRequiredService<IHttpClientFactory>().CreateClient("proxy");
    using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ctx.RequestAborted);
    ctx.Response.StatusCode = (int)response.StatusCode;
    if (response.Content.Headers.ContentType is not null) ctx.Response.ContentType = response.Content.Headers.ContentType.ToString();
    foreach (var name in new[] { "Content-Disposition", "Location", "Retry-After" })
    {
        if (response.Content.Headers.TryGetValues(name, out var contentValues)) ctx.Response.Headers[name] = string.Join(",", contentValues);
        else if (response.Headers.TryGetValues(name, out var values)) ctx.Response.Headers[name] = string.Join(",", values);
    }
    await response.Content.CopyToAsync(ctx.Response.Body, ctx.RequestAborted);
}
app.MapPost("/auth/login", (HttpContext c) => Proxy(c, app.Configuration["AuthUrl"]!, "/auth/login")).RequireRateLimiting("login");
app.MapMethods("/api/{**path}", ["GET", "POST"], (HttpContext c, string path) => Proxy(c, app.Configuration["ControlUrl"]!, "/api/" + path)).RequireAuthorization();
app.MapGet("/", () => Results.Ok(new
{
    service = "Carga masiva de productos", version = "1.0",
    login = "POST /auth/login", upload = "POST /api/cargas (multipart field: file)", history = "GET /api/cargas",
    detail = "GET /api/cargas/{id}", rows = "GET /api/cargas/{id}/filas", original = "GET /api/cargas/{id}/archivo"
}));
await app.RunAsync();
