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

    // Dizionario per memorizzare le sessioni audio: userKey -> sessionId
    private static readonly ConcurrentDictionary<string, string> _userAudioSessions =
        new ConcurrentDictionary<string, string>();

    // Dizionario per memorizzare i chunk audio: sessionKeyFull -> List<AudioChunk>
    private static readonly ConcurrentDictionary<string, List<AudioChunk>> _pendingAudioChunks =
        new ConcurrentDictionary<string, List<AudioChunk>>();

    // Contatori per generare ID sessione univoci
    private static readonly ConcurrentDictionary<string, long> _sessionCounters =
        new ConcurrentDictionary<string, long>();

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

                // Rimuovi le sessioni audio dell'utente
                string userKey = $"{userName}_{roomName}";
                if (_userAudioSessions.TryRemove(userKey, out var sessionKey))
                {
                    _pendingAudioChunks.TryRemove(sessionKey, out _);
                    _logger.LogInformation($"Sessione audio rimossa per l'utente {userName}");
                }

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

    public async Task SendAudioChunk(string userName, string chunk, int chunkId, bool isLastChunk, int totalChunks, string sourceLanguage)
    {
        try
        {
            var connectionId = Context.ConnectionId;

            if (_connections.TryGetValue(connectionId, out var userConnection))
            {
                var roomName = userConnection.RoomName;
                _logger.LogInformation($"Chunk audio {chunkId}/{totalChunks} da {userName} nella stanza {roomName}, isLastChunk: {isLastChunk}");

                // IMPORTANTE: Crea una chiave utente
                string userKey = $"{userName}_{roomName}";

                // Dichiara le variabili per ID sessione e chiave completa
                string sessionId;
                string sessionKeyFull;

                // --------- GESTIONE PRIMO CHUNK (ID = 0) ---------
                if (chunkId == 0)
                {
                    // Per il primo chunk, genera un nuovo ID sessione
                    long counter = _sessionCounters.AddOrUpdate(userKey, 1, (_, count) => count + 1);
                    sessionId = counter.ToString();

                    // Memorizza l'ID sessione per questo utente
                    _userAudioSessions[userKey] = sessionId;

                    // Crea la chiave completa per la sessione
                    sessionKeyFull = $"{userKey}_{sessionId}";

                    // Crea una nuova lista per i chunk
                    _pendingAudioChunks[sessionKeyFull] = new List<AudioChunk>();

                    _logger.LogInformation($"Creata nuova sessione audio {sessionKeyFull} per il primo chunk");
                }
                // --------- GESTIONE CHUNK SUCCESSIVI (ID > 0) ---------
                else
                {
                    // Recupera l'ID sessione associato a questo utente
                    bool hasSession = _userAudioSessions.TryGetValue(userKey, out sessionId);

                    if (!hasSession)
                    {
                        _logger.LogError($"ERRORE: Sessione non trovata per chunk {chunkId}. Questo non dovrebbe accadere con chunk in ordine.");

                        // Come fallback, crea comunque una nuova sessione
                        long counter = _sessionCounters.AddOrUpdate(userKey, 1, (_, count) => count + 1);
                        sessionId = counter.ToString();
                        _userAudioSessions[userKey] = sessionId;

                        sessionKeyFull = $"{userKey}_{sessionId}";
                        _pendingAudioChunks[sessionKeyFull] = new List<AudioChunk>();

                        _logger.LogWarning($"Sessione non trovata per chunk {chunkId}. Creata nuova sessione {sessionKeyFull}");
                    }
                    else
                    {
                        // Usa la sessione esistente
                        sessionKeyFull = $"{userKey}_{sessionId}";

                        // Verifica se la collezione esiste per questa sessione
                        if (!_pendingAudioChunks.ContainsKey(sessionKeyFull))
                        {
                            // Questo non dovrebbe accadere, ma in caso di errore crea una nuova collezione
                            _pendingAudioChunks[sessionKeyFull] = new List<AudioChunk>();
                            _logger.LogWarning($"Collezione mancante per sessione {sessionKeyFull}. Creata nuova collezione.");
                        }

                        _logger.LogInformation($"Usando sessione esistente {sessionKeyFull} per chunk {chunkId}");
                    }
                }

                // --------- AGGIUNTA DEL CHUNK ALLA SESSIONE ---------
                if (_pendingAudioChunks.TryGetValue(sessionKeyFull, out var chunks))
                {
                    chunks.Add(new AudioChunk { ChunkId = chunkId, Data = chunk, IsLastChunk = isLastChunk });
                    _logger.LogInformation($"Chunk {chunkId} aggiunto alla sessione {sessionKeyFull}, ora contiene {chunks.Count}/{totalChunks} chunks");

                    // --------- INVIO DEL CHUNK AGLI ALTRI UTENTI ---------
                    await Clients.GroupExcept(roomName, connectionId).SendAsync(
                        "ReceiveAudioChunk",
                        userName,
                        chunk,
                        chunkId,
                        isLastChunk,
                        totalChunks);

                    // --------- PROCESSAMENTO AUDIO SE COMPLETO ---------
                    // Processa l'audio solo se:
                    // 1. È l'ultimo chunk (isLastChunk = true) OPPURE
                    // 2. Abbiamo ricevuto tutti i chunk previsti
                    if (isLastChunk || chunks.Count >= totalChunks)
                    {
                        _logger.LogInformation($"Elaborazione audio avviata per {sessionKeyFull}: {chunks.Count}/{totalChunks} chunks");

                        // Ordina i chunk per ID per garantire l'ordine corretto
                        chunks.Sort((a, b) => a.ChunkId.CompareTo(b.ChunkId));

                        // Decodifica tutti i chunk e combina i byte
                        byte[] combinedAudioBytes;
                        try
                        {
                            var allBytes = new List<byte>();
                            foreach (var audioChunk in chunks)
                            {
                                byte[] chunkBytes = Convert.FromBase64String(audioChunk.Data);
                                allBytes.AddRange(chunkBytes);
                            }

                            combinedAudioBytes = allBytes.ToArray();
                            _logger.LogInformation($"Audio combinato con successo: {combinedAudioBytes.Length} byte");
                        }
                        catch (FormatException ex)
                        {
                            _logger.LogError(ex, $"Errore nella decodifica base64 dei chunk audio per {sessionKeyFull}");
                            return;
                        }

                        // Codifica in un'unica stringa base64 valida
                        string completeAudioBase64 = Convert.ToBase64String(combinedAudioBytes);
                        _logger.LogInformation($"Audio ricodificato in base64: {completeAudioBase64.Length} caratteri");

                        // Processa l'audio in un task separato
                        _ = Task.Run(async () =>
                        {
                            try
                            {
                                await ProcessAudioForTranslation(userName, roomName, completeAudioBase64, sourceLanguage);

                                // Pulisci le risorse
                                _pendingAudioChunks.TryRemove(sessionKeyFull, out _);
                                _userAudioSessions.TryRemove(userKey, out _);
                                _logger.LogInformation($"Risorse pulite per sessione {sessionKeyFull} dopo elaborazione completa");
                            }
                            catch (Exception ex)
                            {
                                _logger.LogError(ex, $"Errore nell'elaborazione dell'audio per {sessionKeyFull}");
                            }
                        });
                    }
                }
                else
                {
                    _logger.LogError($"Impossibile trovare la collezione per la sessione {sessionKeyFull}");
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
        _logger.LogInformation($"Combinazione di {chunks.Count} chunks audio");
        var combinedChunks = string.Join("", chunks.Select(c => c.Data));
        _logger.LogInformation($"Chunks combinati, lunghezza totale: {combinedChunks.Length} caratteri");
        return combinedChunks;
    }

    private async Task<bool> ProcessAudioForTranslation(string userName, string roomName, string audioBase64, string sourceLanguage)
    {
        try
        {
            _logger.LogInformation($"INIZIO PROCESSAMENTO AUDIO per {userName} in stanza {roomName}, lunghezza base64: {audioBase64.Length} caratteri");

            // 1. Converti audio in testo
            string recognizedText;
            try
            {
                recognizedText = await _speechService.SpeechToTextAsync(audioBase64, sourceLanguage);
                _logger.LogInformation($"Speech-to-text completato per {userName}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"ERRORE in speech-to-text per {userName}: {ex.Message}");
                return false;
            }

            if (string.IsNullOrEmpty(recognizedText))
            {
                _logger.LogWarning($"Nessun testo riconosciuto dall'audio di {userName}");

                // Debug: Verifica formato audio salvando un campione
                try
                {
                    byte[] audioBytes = Convert.FromBase64String(audioBase64);
                    _logger.LogInformation($"[DEBUG] Audio decodificato: {audioBytes.Length} bytes, primi byte: {string.Join(", ", audioBytes.Take(20).Select(b => b.ToString("X2")))}");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[DEBUG] Errore nella decodifica dell'audio base64");
                }

                return false;
            }

            _logger.LogInformation($"Testo riconosciuto dall'audio di {userName}: \"{recognizedText}\"");

            // 2. Ottieni le lingue target e le connessioni per ciascuna lingua
            var connectionsByLanguage = GetConnectionsByLanguage(roomName, userName);
            _logger.LogInformation($"Traduzione necessaria per {connectionsByLanguage.Count} lingue diverse");

            // 3. Per ogni lingua target, traduci e converti in audio
            bool anySuccess = false;
            foreach (var entry in connectionsByLanguage)
            {
                var targetLanguage = entry.Key;
                var targetConnections = entry.Value;

                // Salta la traduzione se la lingua è la stessa
                if (targetLanguage == sourceLanguage)
                {
                    _logger.LogInformation($"Lingua target {targetLanguage} uguale a lingua sorgente, salto traduzione");
                    continue;
                }

                // Traduci il testo
                string translatedText;
                try
                {
                    translatedText = await _translationService.TranslateTextAsync(recognizedText, sourceLanguage, targetLanguage);
                    _logger.LogInformation($"Testo audio tradotto da {sourceLanguage} a {targetLanguage}: \"{translatedText}\"");
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
                    _logger.LogInformation($"Testo tradotto convertito in audio per lingua {targetLanguage}, lunghezza audio: {translatedAudioBase64.Length} caratteri");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Errore nella conversione testo-audio per lingua {targetLanguage}");
                    continue;
                }

                // Invia l'audio tradotto agli utenti
                try
                {
                    _logger.LogInformation($"Invio audio tradotto a {targetConnections.Count} utenti con lingua {targetLanguage}");

                    foreach (var conn in targetConnections)
                    {
                        await Clients.Client(conn).SendAsync(
                            "ReceiveTranslatedAudio",
                            userName,
                            translatedAudioBase64,
                            targetLanguage,
                            translatedText);
                    }

                    _logger.LogInformation($"Audio tradotto inviato con successo a utenti con lingua {targetLanguage}");
                    anySuccess = true;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Errore nell'invio dell'audio tradotto per lingua {targetLanguage}: {ex.Message}");
                }
            }

            // Se almeno una traduzione ha avuto successo, considera l'intero processo come riuscito
            if (anySuccess)
            {
                _logger.LogInformation($"COMPLETATO processamento audio per {userName} con successo");
                return true;
            }
            else
            {
                _logger.LogWarning($"Processamento audio per {userName} completato senza successi");
                return false;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Errore globale nel processamento dell'audio per {userName}");
            return false;
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

    // Pulisce le sessioni audio scadute
    private void CleanupOldAudioSessions()
    {
        // Chiamato periodicamente o dopo ogni completamento audio
        var keysToRemove = new List<string>();

        foreach (var session in _userAudioSessions)
        {
            if (!_pendingAudioChunks.ContainsKey(session.Value))
            {
                keysToRemove.Add(session.Key);
            }
        }

        foreach (var key in keysToRemove)
        {
            _userAudioSessions.TryRemove(key, out _);
            _logger.LogInformation($"Sessione audio rimossa per {key}");
        }
    }

    public string Ping()
    {
        _logger.LogInformation($"Ping chiamato da ConnectionId {Context.ConnectionId}");
        return "Pong";
    }

    private class AudioChunk
    {
        public int ChunkId { get; set; }
        public string Data { get; set; } = string.Empty;
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