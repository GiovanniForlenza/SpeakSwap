using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

public class ChatHub : Hub
{
    private readonly ILogger<ChatHub> _logger;

    // Dizionario per memorizzare connessioni utente: connectionId -> (userName, roomName)
    private static readonly ConcurrentDictionary<string, UserConnection> _connections =
        new ConcurrentDictionary<string, UserConnection>();

    // Dizionario per tracciare gli utenti in ogni stanza: roomName -> set of userNames
    private static readonly ConcurrentDictionary<string, ConcurrentDictionary<string, string>> _rooms =
        new ConcurrentDictionary<string, ConcurrentDictionary<string, string>>();

    public ChatHub(ILogger<ChatHub> logger)
    {
        _logger = logger;
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
                UserName = userName,
                RoomName = roomName,
                Language = language
            };

            _connections[connectionId] = userConnection;

            // Aggiungi l'utente alla stanza nel dizionario delle stanze (ora memorizza connectionId invece di true)
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
                await Groups.AddToGroupAsync(connectionId, roomName);
                _logger.LogInformation($"Utente {userName} aggiunto al gruppo {roomName}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Errore nell'aggiungere l'utente {userName} al gruppo {roomName}, continuiamo comunque");
            }

            var usersInRoom = _rooms[roomName];
            foreach (var user in usersInRoom)
            {
                if (user.Key != userName)
                {
                    try
                    {
                        await Clients.Client(user.Value).SendAsync("UserJoined", userName);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, $"Errore nell'inviare UserJoined a {user.Key} ({user.Value})");
                    }
                }
            }

            var userList = usersInRoom.Keys.ToList();
            await Clients.Caller.SendAsync("UsersInRoom", userList);

            _logger.LogInformation($"Utente {userName} si è unito alla stanza {roomName} con successo. Utenti nella stanza: {string.Join(", ", userList)}");
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
    public async Task SendMessage(string userName, string message)
    {
        try
        {
            var connectionId = Context.ConnectionId;

            if (_connections.TryGetValue(connectionId, out var userConnection))
            {
                var roomName = userConnection.RoomName;
                _logger.LogInformation($"Messaggio da {userName} nella stanza {roomName}: {message}");

                // Prima tenta di inviare il messaggio usando i gruppi 
                try
                {
                    await Clients.Group(roomName).SendAsync("ReceiveMessage", userName, message);
                    _logger.LogInformation($"Messaggio inviato al gruppo {roomName}");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Errore nell'inviare messaggio al gruppo {roomName}, fallback all'invio diretto");

                    // Fallback: invia messaggio direttamente a tutti gli utenti nella stanza
                    if (_rooms.TryGetValue(roomName, out var users))
                    {
                        foreach (var user in users)
                        {
                            try
                            {
                                await Clients.Client(user.Value).SendAsync("ReceiveMessage", userName, message);
                            }
                            catch (Exception innerEx)
                            {
                                _logger.LogError(innerEx, $"Errore nell'inviare messaggio diretto a {user.Key} ({user.Value})");
                            }
                        }
                    }
                }
            }
            else
            {
                _logger.LogWarning($"SendMessage: Utente {userName} non trovato nelle connessioni");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Errore globale in SendMessage per {userName}");
        }
    }

    // Invia un chunk audio
    public async Task SendAudioChunk(string userName, string chunk, int chunkId, bool isLastChunk, int totalChunks)
    {
        try
        {
            var connectionId = Context.ConnectionId;

            if (_connections.TryGetValue(connectionId, out var userConnection))
            {
                var roomName = userConnection.RoomName;
                _logger.LogInformation($"Chunk audio {chunkId}/{totalChunks} da {userName} nella stanza {roomName}");

                try
                {
                    await Clients.GroupExcept(roomName, connectionId).SendAsync(
                        "ReceiveAudioChunk",
                        userName,
                        chunk,
                        chunkId,
                        isLastChunk,
                        totalChunks);

                    _logger.LogInformation($"Chunk audio inviato al gruppo {roomName} (escludendo mittente)");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Errore nell'inviare chunk audio al gruppo {roomName}, fallback all'invio diretto");

                    if (_rooms.TryGetValue(roomName, out var users))
                    {
                        foreach (var user in users)
                        {
                            // Non inviare al mittente
                            if (user.Value != connectionId)
                            {
                                try
                                {
                                    await Clients.Client(user.Value).SendAsync(
                                        "ReceiveAudioChunk",
                                        userName,
                                        chunk,
                                        chunkId,
                                        isLastChunk,
                                        totalChunks);
                                }
                                catch (Exception innerEx)
                                {
                                    _logger.LogError(innerEx, $"Errore nell'inviare chunk audio diretto a {user.Key} ({user.Value})");
                                }
                            }
                        }
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

    public string Ping()
    {
        _logger.LogInformation($"Ping chiamato da ConnectionId {Context.ConnectionId}");
        return "Pong";
    }

    // Classe per memorizzare le connessioni
    public class UserConnection
    {
        public string UserName { get; set; } = string.Empty;
        public string RoomName { get; set; } = string.Empty;
        public string Language { get; set; } = "it";
    }
}