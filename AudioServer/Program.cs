using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Azure.SignalR;
using System;


var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddEnvironmentVariables();

builder.Logging.AddConsole();
builder.Logging.SetMinimumLevel(LogLevel.Information);

// Configura SignalR con impostazioni specifiche per Azure SignalR Service
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = true;
    options.MaximumReceiveMessageSize = 10 * 1024 * 1024;
    options.ClientTimeoutInterval = TimeSpan.FromMinutes(2);
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);
})
.AddAzureSignalR(options =>
{
    options.ConnectionString = builder.Configuration["Azure:SignalR:ConnectionString"];

    options.ServerStickyMode = ServerStickyMode.Preferred;

    options.InitialHubServerConnectionCount = 5;

    options.GracefulShutdown.Mode = GracefulShutdownMode.WaitForClientsClose;
    options.GracefulShutdown.Timeout = TimeSpan.FromSeconds(30);
});

// Configura CORS con le origini corrette
builder.Services.AddCors(options =>
{
    options.AddPolicy("CorsPolicy", builder =>
    {
        builder
            .WithOrigins(
                "http://localhost:3000",
                "https://blue-desert-0eae36610.6.azurestaticapps.net"
            )
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials();
    });
});

builder.Services.AddSingleton<TranslationService>();
builder.Services.AddSingleton<SpeechService>();

var app = builder.Build();

app.UseCors("CorsPolicy");

app.UseRouting();

app.MapGet("/", () => "Chat server running!");

app.MapGet("/healthcheck", () =>
{
    return new
    {
        Status = "Healthy",
        Timestamp = DateTime.UtcNow,
        Version = "1.0.0"
    };
});

app.MapHub<ChatHub>("/chatHub");

app.Run();