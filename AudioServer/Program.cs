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

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddEnvironmentVariables();
builder.Services.AddSignalR().AddAzureSignalR(options =>
{
    options.ConnectionString = builder.Configuration["Azure:SignalR:ConnectionString"];
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("CorsPolicy", builder =>
        builder
            .WithOrigins(
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "https://blue-desert-0eae36610.6.azurestaticapps.net"
            )
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials());
});

var app = builder.Build();

// Configura la pipeline HTTP
app.UseCors("CorsPolicy");
app.UseRouting();
app.MapHub<ChatHub>("/chathub");

app.Run();