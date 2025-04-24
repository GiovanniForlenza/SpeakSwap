using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

public class ChatHub : Hub
{
    private readonly ILogger<ChatHub> _logger;
    private readonly TranslationService _translationService;
    private readonly SpeechService _speechService;

    // Dizionario per memorizzare connessioni utente: connectionId -> (userName, roomName)
    private static readonly ConcurrentDictionary<string, UserConnection> _connections =
        new ConcurrentDictionary<string, UserConnection>();

    // Dizionario per tracciare gli utenti in ogni stanza: roomName -> set of userNames
    private static readonly ConcurrentDictionary<string, ConcurrentDictionary<string, string>> _rooms =
        new ConcurrentDictionary<string, ConcurrentDictionary<string, string>>();

    public ChatHub(ILogger<ChatHub> logger, TranslationService translationService, SpeechService speechService)
    {
        _logger = logger;
        _translationService = translationService;
        _speechService = speechService;
    }

    // Utente entra in una stanza
    public async Task JoinRoom(string userName, string roomName, string language)
    {
        try
        {
            var connectionId = Context.ConnectionId;
            _logger.LogInformation($"Utente {userName} sta tentando di unirsi alla stanza {roomName} [ConnectionId: {connectionId}]");

            // Memorizza le informazioni utente
            var userConnection = new UserConnection
            {
                UserName = userName.Trim(),
                RoomName = roomName.Trim(),
                Language = language
            };

            _connections[connectionId] = userConnection;

            _rooms.AddOrUpdate(
                roomName,
                (key) => new ConcurrentDictionary<string, string>(new[] { new KeyValuePair<string, string>(userName, connectionId) }),
                (key, room) =>
                {
                    room[userName] = connectionId;
                    return room;
                }
            );

            try
            {
                // Prima aggiungi al gruppo
                await Groups.AddToGroupAsync(connectionId, roomName);
                _logger.LogInformation($"Utente {userName} aggiunto al gruppo {roomName}");

                // Invia messaggio di conferma al chiamante
                await Clients.Caller.SendAsync("JoinedRoom", roomName);

                // Poi notifica altri utenti
                await Clients.OthersInGroup(roomName).SendAsync("UserJoined", userName);

                // Infine, invia la lista utenti al nuovo membro
                var usersInRoom = _rooms[roomName].Keys.ToList();
                await Clients.Caller.SendAsync("UsersInRoom", usersInRoom);

                _logger.LogInformation($"Utente {userName} si è unito alla stanza {roomName} con successo. Utenti nella stanza: {string.Join(", ", usersInRoom)}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Errore nell'aggiungere l'utente {userName} al gruppo {roomName}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Errore globale in JoinRoom per {userName} in {roomName}");
        }
    }

    // Disconnessione utente
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        try
        {
            var connectionId = Context.ConnectionId;
            _logger.LogInformation($"Connection disconnected: {connectionId}");

            // Rimuovi l'utente dalle mappature
            if (_connections.TryRemove(connectionId, out var userConnection))
            {
                var userName = userConnection.UserName;
                var roomName = userConnection.RoomName;

                // Rimuovi l'utente dalla stanza
                if (_rooms.TryGetValue(roomName, out var users))
                {
                    users.TryRemove(userName, out _);

                    // Se la stanza è vuota, rimuovila
                    if (users.IsEmpty)
                    {
                        _rooms.TryRemove(roomName, out _);
                        _logger.LogInformation($"Stanza {roomName} rimossa perché vuota");
                    }
                    else
                    {
                        // Notifica gli altri utenti nella stanza
                        foreach (var user in users)
                        {
                            try
                            {
                                await Clients.Client(user.Value).SendAsync("UserLeft", userName);
                            }
                            catch (Exception ex)
                            {
                                _logger.LogError(ex, $"Errore nell'inviare UserLeft a {user.Key} ({user.Value})");
                            }
                        }
                    }
                }

                try
                {
                    // Tentativo di rimuovere l'utente dal gruppo SignalR
                    await Groups.RemoveFromGroupAsync(connectionId, roomName);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Errore nel rimuovere l'utente {userName} dal gruppo {roomName}");
                }

                _logger.LogInformation($"Utente {userName} ha lasciato la stanza {roomName}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Errore globale in OnDisconnectedAsync");
        }

        await base.OnDisconnectedAsync(exception);
    }

    // Invia messaggio di testo
    public async Task SendMessage(string userName, string message, string sourceLanguage)
    {
        try
        {
            var connectionId = Context.ConnectionId;

            if (_connections.TryGetValue(connectionId, out var userConnection))
            {
                var roomName = userConnection.RoomName;
                _logger.LogInformation($"Messaggio da {userName} in lingua {sourceLanguage} nella stanza {roomName}: {message}");

                // Invia il messaggio originale al mittente
                await Clients.Caller.SendAsync("ReceiveMessage", userName, message);

                // Ottieni le lingue dei destinatari e crea un dizionario di lingue e connessioni
                var targetLanguages = GetTargetLanguagesInRoom(roomName, userName);
                var connectionsByLanguage = GetConnectionsByLanguage(roomName, userName);

                // Traduci e invia il messaggio agli altri utenti
                foreach (var entry in connectionsByLanguage)
                {
                    var targetLanguage = entry.Key;
                    var targetConnections = entry.Value;

                    // Traduci il messaggio
                    string translatedMessage;
                    if (targetLanguage == sourceLanguage)
                    {
                        translatedMessage = message;
                    }
                    else
                    {
                        try
                        {
                            translatedMessage = await _translationService.TranslateTextAsync(message, sourceLanguage, targetLanguage);
                            _logger.LogInformation($"Messaggio tradotto da {sourceLanguage} a {targetLanguage}: {translatedMessage}");
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, $"Errore nella traduzione del messaggio da {sourceLanguage} a {targetLanguage}");
                            translatedMessage = message; // Fallback al messaggio originale
                        }
                    }

                    // Invia il messaggio tradotto agli utenti con questa lingua
                    await Clients.Clients(targetConnections).SendAsync("ReceiveMessage", userName, translatedMessage);
                }
            }
            else
            {
                _logger.LogWarning($"SendMessage: Utente {userName} non trovato nelle connessioni");
                await Clients.Caller.SendAsync("Reconnect");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Errore globale in SendMessage per {userName}");
        }
    }

    private readonly ConcurrentDictionary<string, List<AudioChunk>> _pendingAudioChunks =
        new ConcurrentDictionary<string, List<AudioChunk>>();

    // Invia un chunk audio
    public async Task SendAudioChunk(string userName, string chunk, int chunkId, bool isLastChunk, int totalChunks, string sourceLanguage)
    {
        try
        {
            var connectionId = Context.ConnectionId;

            if (_connections.TryGetValue(connectionId, out var userConnection))
            {
                var roomName = userConnection.RoomName;
                _logger.LogInformation($"Chunk audio {chunkId}/{totalChunks} da {userName} nella stanza {roomName}");

                // Crea una chiave unica per questo messaggio audio
                string audioMessageKey = $"{userName}_{roomName}_{DateTime.Now.Ticks}";

                // Aggiungi il chunk alla collezione
                if (chunkId == 0)
                {
                    _pendingAudioChunks[audioMessageKey] = new List<AudioChunk>();
                }

                if (_pendingAudioChunks.TryGetValue(audioMessageKey, out var chunks))
                {
                    chunks.Add(new AudioChunk { ChunkId = chunkId, Data = chunk, IsLastChunk = isLastChunk });

                    // Invia il chunk audio a tutti gli altri utenti nella stanza
                    await Clients.GroupExcept(roomName, connectionId).SendAsync(
                        "ReceiveAudioChunk",
                        userName,
                        chunk,
                        chunkId,
                        isLastChunk,
                        totalChunks);

                    // Se è l'ultimo chunk, processa l'audio completo
                    if (isLastChunk)
                    {
                        // Ordina i chunk per ID
                        chunks.Sort((a, b) => a.ChunkId.CompareTo(b.ChunkId));

                        // Combina tutti i chunk in un unico blob audio
                        string completeAudioBase64 = CombineAudioChunks(chunks);

                        // Processa l'audio per la traduzione
                        _ = Task.Run(async () =>
                        {
                            try
                            {
                                await ProcessAudioForTranslation(
                                    userName,
                                    roomName,
                                    completeAudioBase64,
                                    sourceLanguage);

                                // Rimuovi i chunk dopo il processamento
                                _pendingAudioChunks.TryRemove(audioMessageKey, out _);
                            }
                            catch (Exception ex)
                            {
                                _logger.LogError(ex, $"Errore nel processamento dell'audio per {userName}");
                            }
                        });
                    }
                }
            }
            else
            {
                _logger.LogWarning($"SendAudioChunk: Utente {userName} non trovato nelle connessioni");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Errore globale in SendAudioChunk per {userName}");
        }
    }

    private string CombineAudioChunks(List<AudioChunk> chunks)
    {
        var combinedChunks = string.Join("", chunks.Select(c => c.Data));
        return combinedChunks;
    }

    private async Task ProcessAudioForTranslation(string userName, string roomName, string audioBase64, string sourceLanguage)
    {
        try
        {
            // 1. Converti audio in testo
            string recognizedText = await _speechService.SpeechToTextAsync(audioBase64, sourceLanguage);

            if (string.IsNullOrEmpty(recognizedText))
            {
                _logger.LogWarning($"Nessun testo riconosciuto dall'audio di {userName}");
                return;
            }

            _logger.LogInformation($"Testo riconosciuto dall'audio di {userName}: {recognizedText}");

            // 2. Ottieni le lingue target e le connessioni per ciascuna lingua
            var connectionsByLanguage = GetConnectionsByLanguage(roomName, userName);

            // 3. Per ogni lingua target, traduci e converti in audio
            foreach (var entry in connectionsByLanguage)
            {
                var targetLanguage = entry.Key;
                var targetConnections = entry.Value;

                // Salta la traduzione se la lingua è la stessa
                if (targetLanguage == sourceLanguage)
                {
                    continue;
                }

                // Traduci il testo
                string translatedText;
                try
                {
                    translatedText = await _translationService.TranslateTextAsync(recognizedText, sourceLanguage, targetLanguage);
                    _logger.LogInformation($"Testo audio tradotto da {sourceLanguage} a {targetLanguage}: {translatedText}");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Errore nella traduzione del testo audio da {sourceLanguage} a {targetLanguage}");
                    continue;
                }

                // Converti il testo tradotto in audio
                string translatedAudioBase64;
                try
                {
                    translatedAudioBase64 = await _speechService.TextToSpeechAsync(translatedText, targetLanguage);
                    _logger.LogInformation($"Testo tradotto convertito in audio per lingua {targetLanguage}");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Errore nella conversione testo-audio per lingua {targetLanguage}");
                    continue;
                }

                // Invia l'audio tradotto agli utenti
                try
                {
                    await Clients.Clients(targetConnections).SendAsync(
                        "ReceiveTranslatedAudio",
                        userName,
                        translatedAudioBase64,
                        targetLanguage,
                        translatedText);

                    _logger.LogInformation($"Audio tradotto inviato a {targetConnections.Count} utenti con lingua {targetLanguage}");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Errore nell'invio dell'audio tradotto per lingua {targetLanguage}");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Errore globale nel processamento dell'audio per {userName}");
        }
    }

    private Dictionary<string, List<string>> GetConnectionsByLanguage(string roomName, string exceptUserName)
    {
        var connectionsByLanguage = new Dictionary<string, List<string>>();

        if (_rooms.TryGetValue(roomName, out var users))
        {
            foreach (var user in users)
            {
                // Salta l'utente che ha inviato il messaggio
                if (user.Key == exceptUserName)
                    continue;

                if (_connections.TryGetValue(user.Value, out var conn))
                {
                    var lang = conn.Language;
                    if (!connectionsByLanguage.ContainsKey(lang))
                    {
                        connectionsByLanguage[lang] = new List<string>();
                    }
                    connectionsByLanguage[lang].Add(user.Value);
                }
            }
        }

        return connectionsByLanguage;
    }

    private List<string> GetTargetLanguagesInRoom(string roomName, string exceptUserName)
    {
        var languages = new HashSet<string>();

        if (_rooms.TryGetValue(roomName, out var users))
        {
            foreach (var user in users)
            {
                if (user.Key != exceptUserName && _connections.TryGetValue(user.Value, out var conn))
                {
                    languages.Add(conn.Language);
                }
            }
        }

        return languages.ToList();
    }

    public string Ping()
    {
        _logger.LogInformation($"Ping chiamato da ConnectionId {Context.ConnectionId}");
        return "Pong";
    }

    private class AudioChunk
    {
        public int ChunkId { get; set; }
        public string Data { get; set; }
        public bool IsLastChunk { get; set; }
    }

    // Classe per memorizzare le connessioni
    public class UserConnection
    {
        public string UserName { get; set; } = string.Empty;
        public string RoomName { get; set; } = string.Empty;
        public string Language { get; set; } = "it";
    }
}