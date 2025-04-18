// using AudioChatServer;
// using Microsoft.Azure.SignalR;
// using AudioChatServer.Services;
// using Microsoft.AspNetCore.SignalR.Protocol;
// using Microsoft.Extensions.DependencyInjection;

// var builder = WebApplication.CreateBuilder(args);

// // Aggiungi il supporto CORS per comunicare con il client React
// builder.Services.AddCors(options =>
// {
//     options.AddPolicy("CorsPolicy", builder =>
//     {
//         builder
//             .WithOrigins(
//                 "http://localhost:3000",
//                 "http://127.0.0.1:3000",
//                 "https://blue-desert-0eae36610.6.azurestaticapps.net"
//             )
//             .AllowAnyMethod()
//             .AllowAnyHeader()
//             .AllowCredentials();
//     });
// });

// // Aggiungi i servizi per Speech-to-Text e Translation
// builder.Services.AddSingleton<SpeechService>();
// builder.Services.AddSingleton<TranslationService>();

// // Configura SignalR con Azure SignalR Service
// builder.Services.AddSignalR(hubOptions =>
// {
//     // Aumenta il limite dimensione messaggi per supportare audio
//     hubOptions.MaximumReceiveMessageSize = 1024 * 1024; // 1MB

//     // Abilita dettagli degli errori per il debug
//     hubOptions.EnableDetailedErrors = true;

//     // Aumenta il timeout di disconnessione
//     hubOptions.ClientTimeoutInterval = TimeSpan.FromMinutes(2);
//     hubOptions.KeepAliveInterval = TimeSpan.FromSeconds(15);
// })
// .AddMessagePackProtocol(options =>
// {
//     // Configura MessagePack per serializzazione efficiente
//     options.SerializerOptions = MessagePack.MessagePackSerializerOptions.Standard;
// })
// .AddAzureSignalR(options =>
// {
//     options.ConnectionString = builder.Configuration["Azure:SignalR:ConnectionString"];

//     // Imposta la modalità ServerStickyMode per mantenere connessioni più stabili
//     options.ServerStickyMode = ServerStickyMode.Required;

//     // Configura la gestione graceful shutdown
//     options.GracefulShutdown.Mode = GracefulShutdownMode.WaitForClientsClose;
//     options.GracefulShutdown.Timeout = TimeSpan.FromSeconds(30);
// });

// // Aggiungi i controller
// builder.Services.AddControllers();

// // Configura il logging
// builder.Logging.AddConsole();
// builder.Logging.SetMinimumLevel(LogLevel.Information);

// var app = builder.Build();

// // Configura il pipeline HTTP
// app.UseCors("CorsPolicy");
// app.UseRouting();

// app.MapControllers(); // Mappa i controller
// app.MapGet("/", () => "Server audio in tempo reale attivo con Azure SignalR Service");

// app.UseEndpoints(endpoints =>
// {
//     // Mappa l'hub SignalR all'endpoint /audiohub
//     endpoints.MapHub<AudioHub>("/audiohub");
// });

// app.Run();

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
    options.MaximumReceiveMessageSize = 5 * 1024 * 1024; // 5MB
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