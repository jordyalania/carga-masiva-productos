using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Dapper;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using Shared;

if (Platform.IsProbe(args)) { await Platform.Probe(); return; }
var builder = Platform.Builder(args);
var app = builder.Build();
Platform.Pipeline(app);
var store = app.Services.GetRequiredService<Store>();
await store.Migrate("auth-v1", """
    create schema auth;
    create table auth.users(id uuid primary key, email text unique not null, password_hash text not null);
    """);
var hasher = new PasswordHasher<string>();
var email = app.Configuration["Demo:Email"]?.Trim().ToLowerInvariant() ?? throw new InvalidOperationException("Demo email missing");
var password = app.Configuration["Demo:Password"] ?? throw new InvalidOperationException("Demo password missing");
if (password.Length < 16) throw new InvalidOperationException("Use a demo password of at least 16 characters");
await using (var db = await store.Open())
    await db.ExecuteAsync("insert into auth.users values(@id,@email,@hash) on conflict(email) do nothing", new { id = Guid.NewGuid(), email, hash = hasher.HashPassword(email, password) });

app.MapPost("/auth/login", async (Login request, Store dbStore) =>
{
    if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrEmpty(request.Password) || request.Password.Length > 1024) return Results.Unauthorized();
    var normalized = request.Email.Trim().ToLowerInvariant();
    await using var db = await dbStore.Open();
    var user = await db.QuerySingleOrDefaultAsync<User>("select id,email,password_hash as PasswordHash from auth.users where email=@normalized", new { normalized });
    // A dummy hash check keeps missing-user requests on the same expensive path.
    var hash = user?.PasswordHash ?? hasher.HashPassword("dummy", "unused-random-fallback-password");
    if (hasher.VerifyHashedPassword(normalized, hash, request.Password) == PasswordVerificationResult.Failed || user is null) return Results.Unauthorized();
    var expires = DateTime.UtcNow.AddMinutes(60);
    var jwt = new JwtSecurityToken(app.Configuration["Jwt:Issuer"], "carga-api",
        [new Claim("sub", user.Id.ToString()), new Claim("email", user.Email), new Claim("permission", "loads:write")],
        expires: expires,
        signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(app.Configuration["Jwt:Key"]!)), SecurityAlgorithms.HmacSha256));
    return Results.Ok(new { accessToken = new JwtSecurityTokenHandler().WriteToken(jwt), tokenType = "Bearer", expiresAt = expires });
});
await app.RunAsync();
record Login(string Email, string Password);
record User(Guid Id, string Email, string PasswordHash);
