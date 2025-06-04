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

    public async Task<List<RoomSummary>> GetUserRoomsAsync(string userName)
    {
        if (!_isEnabled) return new List<RoomSummary>();

        try
        {
            _logger.LogInformation($"[DEBUG] GetUserRoomsAsync per '{userName}'");
            
            // Prima otteniamo tutti i messaggi dell'utente
            var messagesQuery = new QueryDefinition("SELECT * FROM c WHERE c.userName = @userName ORDER BY c.timestamp DESC")
                .WithParameter("@userName", userName);

            var iterator = _container.GetItemQueryIterator<ConversationMessage>(messagesQuery);
            var allMessages = new List<ConversationMessage>();
            
            while (iterator.HasMoreResults)
            {
                var response = await iterator.ReadNextAsync();
                foreach (var message in response)
                {
                    allMessages.Add(message);
                    _logger.LogInformation($"[DEBUG] Messaggio: {message.RoomName} - {message.Message}");
                }
            }

            // Poi raggruppiamo per stanza in memoria (più affidabile)
            var roomGroups = allMessages
                .GroupBy(m => m.RoomName)
                .Select(g => new RoomSummary
                {
                    RoomName = g.Key,
                    MessageCount = g.Count(),
                    LastActivity = g.Max(m => m.Timestamp),
                    FirstActivity = g.Min(m => m.Timestamp)
                })
                .OrderByDescending(r => r.LastActivity)
                .ToList();

            _logger.LogInformation($"[DEBUG] Trovate {roomGroups.Count} stanze per {userName}");
            return roomGroups;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Errore nel recuperare le stanze per l'utente {userName}: {ex.Message}");
            return new List<RoomSummary>();
        }
    }

    public async Task<List<ConversationMessage>> GetConversationHistoryAsync(string roomName, int limit)
    {
        if (!_isEnabled) return new List<ConversationMessage>();

        try
        {
            var query = new QueryDefinition(@"
                SELECT TOP @limit * 
                FROM c 
                WHERE c.roomName = @roomName 
                ORDER BY c.timestamp DESC")
                .WithParameter("@roomName", roomName)
                .WithParameter("@limit", limit);

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

            // Ordina per timestamp crescente (più vecchi prima)
            messages.Reverse();
            
            _logger.LogInformation($"Recuperati {messages.Count} messaggi per stanza {roomName}");
            return messages;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Errore nel recuperare storico per stanza {roomName}");
            return new List<ConversationMessage>();
        }
    }

    public async Task<object> DebugGetAllMessagesForUserAsync(string userName)
    {
        if (!_isEnabled) 
        {
            return new { error = "Cosmos DB non abilitato" };
        }

        try
        {
            _logger.LogInformation($"[DEBUG] Cerco TUTTI i messaggi per userName: '{userName}'");
            
            // Prima query: vediamo tutto il database senza filtri
            var allQuery = new QueryDefinition("SELECT TOP 5 * FROM c");
            var allIterator = _container.GetItemQueryIterator<dynamic>(allQuery);
            var allDocs = new List<dynamic>();
            
            while (allIterator.HasMoreResults)
            {
                var response = await allIterator.ReadNextAsync();
                foreach (var item in response)
                {
                    allDocs.Add(item);
                    _logger.LogInformation($"[DEBUG] Documento trovato: {System.Text.Json.JsonSerializer.Serialize(item)}");
                }
            }

            // Seconda query: cerchiamo specificamente l'utente
            var userQuery = new QueryDefinition("SELECT * FROM c WHERE c.userName = @userName")
                .WithParameter("@userName", userName);
            
            var userIterator = _container.GetItemQueryIterator<dynamic>(userQuery);
            var userDocs = new List<dynamic>();
            
            while (userIterator.HasMoreResults)
            {
                var response = await userIterator.ReadNextAsync();
                foreach (var item in response)
                {
                    userDocs.Add(item);
                    _logger.LogInformation($"[DEBUG] Documento utente: {System.Text.Json.JsonSerializer.Serialize(item)}");
                }
            }

            // Terza query: proviamo diverse varianti del nome
            var nameVariants = new[]
            {
                userName,
                userName.ToUpper(),
                userName.ToLower(),
                userName.Trim()
            };

            var variantResults = new List<object>();
            
            foreach (var variant in nameVariants)
            {
                var variantQuery = new QueryDefinition("SELECT VALUE COUNT(1) FROM c WHERE c.userName = @userName")
                    .WithParameter("@userName", variant);
                
                var variantIterator = _container.GetItemQueryIterator<int>(variantQuery);
                if (variantIterator.HasMoreResults)
                {
                    var response = await variantIterator.ReadNextAsync();
                    var count = response.FirstOrDefault();
                    variantResults.Add(new { variant = variant, count = count });
                }
            }

            return new 
            {
                userName = userName,
                allDocuments = allDocs,
                userDocuments = userDocs,
                nameVariantTests = variantResults,
                debug = "Query raw completata"
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"[DEBUG] Errore nella query debug per {userName}");
            return new 
            { 
                error = ex.Message,
                userName = userName,
                stackTrace = ex.StackTrace
            };
        }
    }
}