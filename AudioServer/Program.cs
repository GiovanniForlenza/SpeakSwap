using AudioChatServer;
using Microsoft.Azure.SignalR;

var builder = WebApplication.CreateBuilder(args);

// Aggiungi il supporto CORS per comunicare con il client React
builder.Services.AddCors(options =>
{
    options.AddPolicy("CorsPolicy", builder =>
    {
        builder
            .WithOrigins("http://localhost:3000")
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials();
    });
});

// Configura SignalR con Azure SignalR Service con ServerStickyMode per connessioni stabili
builder.Services.AddSignalR(hubOptions =>
{
    // Aumenta il limite dimensione messaggi per supportare audio
    hubOptions.MaximumReceiveMessageSize = 1024 * 1024; // 1MB
    
    // Abilita dettagli degli errori per il debug
    hubOptions.EnableDetailedErrors = true;
    
    // Aumenta il timeout di disconnessione
    hubOptions.ClientTimeoutInterval = TimeSpan.FromMinutes(2);
    hubOptions.KeepAliveInterval = TimeSpan.FromSeconds(15);
})
.AddAzureSignalR(options =>
{
    options.ConnectionString = builder.Configuration["Azure:SignalR:ConnectionString"];
    
    // Imposta la modalità ServerStickyMode per mantenere connessioni più stabili
    options.ServerStickyMode = ServerStickyMode.Required;
    
    // Usa InitialHubServerConnectionCount invece di ConnectionCount (obsoleto)
    options.InitialHubServerConnectionCount = 5;
    
    // Configurazione per la gestione graceful shutdown
    options.GracefulShutdown.Mode = GracefulShutdownMode.WaitForClientsClose;
    options.GracefulShutdown.Timeout = TimeSpan.FromSeconds(30);
});

// Configura il logging
builder.Logging.AddConsole();
builder.Logging.SetMinimumLevel(LogLevel.Information);

var app = builder.Build();

// Configura il pipeline HTTP
app.UseCors("CorsPolicy");
app.UseRouting();

app.MapGet("/", () => "Server audio in tempo reale attivo con Azure SignalR Service");

app.UseEndpoints(endpoints =>
{
    // Mappa l'hub SignalR all'endpoint /audiohub
    endpoints.MapHub<AudioHub>("/audiohub");
});

app.Run();