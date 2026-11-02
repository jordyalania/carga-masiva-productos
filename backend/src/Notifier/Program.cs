using MimeKit;
using Shared;

if (Platform.IsProbe(args)) { await Platform.Probe(); return; }
var builder = Platform.Builder(args);
builder.Services.AddHostedService<NotificationWorker>();
var app = builder.Build();
Platform.Pipeline(app);
await app.Services.GetRequiredService<Store>().Migrate("notifier-v1", """
    create schema notifier;
    create table notifier.deliveries(load_id uuid primary key, status text not null default 'Pending',
        attempts int not null default 0, last_error text, accepted_at timestamptz, updated_at timestamptz not null default now());
    create table notifier.attempts(id bigint generated always as identity primary key,load_id uuid not null,
        outcome text not null, detail text, at timestamptz not null default now());
    """);
await app.Services.GetRequiredService<Store>().Migrate("notifier-v2", """
    alter table notifier.deliveries add column recipient text;
    """);
if (!string.IsNullOrWhiteSpace(app.Configuration["Notification:RecipientOverride"]))
    MailboxAddress.Parse(app.Configuration["Notification:RecipientOverride"]!);
app.MapGet("/internal/notifications/settings", () => Results.Ok(new
{
    sender = app.Configuration["Smtp:From"],
    defaultRecipient = app.Configuration["Notification:RecipientOverride"]
}));
await app.RunAsync();
