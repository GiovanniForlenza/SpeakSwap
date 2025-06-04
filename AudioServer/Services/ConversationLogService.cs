using Microsoft.Azure.Cosmos;

public class ConversationLogService : IConversationLogService
{
    private readonly CosmosClient _cosmosClient;
    private readonly Container _container;
    private readonly ILogger<ConversationLogService> _logger;
    private readonly bool _isEnabled;

    public ConversationLogService(IConfiguration configuration, ILogger<ConversationLogService> logger)
    {
        _logger = logger;
        
        var connectionString = configuration["Azure:CosmosDB:ConnectionString"];
        _isEnabled = !string.IsNullOrEmpty(connectionString);
        
        if (_isEnabled)
        {
            try
            {
                _cosmosClient = new CosmosClient(connectionString);
                
                // Usa database e container semplici
                var database = _cosmosClient.GetDatabase("SpeakSwap");
                _container = database.GetContainer("Messages");
                
                _logger.LogInformation("Cosmos DB connesso con successo");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Errore nella connessione a Cosmos DB, logging disabilitato");
                _isEnabled = false;
            }
        }
        else
        {
            _logger.LogWarning("Cosmos DB non configurato, logging conversazioni disabilitato");
        }
    }

    public async Task LogMessageAsync(string roomName, string userName, string message, string language, string messageType = "text")
    {
        if (!_isEnabled || _container == null) return;

        try
        {
            // USA OGGETTO ANONIMO invece della classe
            var conversationMessage = new
            {
                id = Guid.NewGuid().ToString(),
                roomName = roomName,
                userName = userName,
                message = message,
                language = language,
                messageType = messageType,
                timestamp = DateTime.UtcNow
            };

            _logger.LogInformation($"[DEBUG] Tentativo di salvare messaggio con ID: {conversationMessage.id}");
            
            await _container.CreateItemAsync(conversationMessage, new PartitionKey(roomName));
            _logger.LogInformation($"Messaggio loggato: {userName} in {roomName}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Errore nel logging messaggio: {userName} in {roomName}");
        }
    }

    public async Task<List<ConversationMessage>> GetConversationHistoryAsync(string roomName)
    {
        if (!_isEnabled) return new List<ConversationMessage>();

        try
        {
            var query = new QueryDefinition(
                "SELECT * FROM c WHERE c.roomName = @roomName ORDER BY c.timestamp ASC")
                .WithParameter("@roomName", roomName);

            var iterator = _container.GetItemQueryIterator<dynamic>(query);
            var messages = new List<ConversationMessage>();

            while (iterator.HasMoreResults)
            {
                var response = await iterator.ReadNextAsync();
                foreach (var item in response)
                {
                    messages.Add(new ConversationMessage
                    {
                        Id = item.id,
                        RoomName = item.roomName,
                        UserName = item.userName,
                        Message = item.message,
                        Language = item.language,
                        MessageType = item.messageType,
                        Timestamp = item.timestamp
                    });
                }
            }

            _logger.LogInformation($"Recuperati {messages.Count} messaggi per stanza {roomName}");
            return messages;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Errore nel recuperare storico per stanza {roomName}");
            return new List<ConversationMessage>();
        }
    }
}