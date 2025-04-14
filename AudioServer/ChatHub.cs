using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

public class ChatHub : Hub
{
    private readonly ILogger<ChatHub> _logger;

    // Dizionario per memorizzare connessioni utente: connectionId -> (userName, roomName)
    private static readonly ConcurrentDictionary<string, UserConnection> _connections =
        new ConcurrentDictionary<string, UserConnection>();

    // Dizionario per tracciare gli utenti in ogni stanza: roomName -> set of userNames
    private static readonly ConcurrentDictionary<string, ConcurrentDictionary<string, bool>> _rooms =
        new ConcurrentDictionary<string, ConcurrentDictionary<string, bool>>();

    public ChatHub(ILogger<ChatHub> logger)
    {
        _logger = logger;
    }

    // Utente entra in una stanza
    public async Task JoinRoom(string userName, string roomName, string language)
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

        // Aggiungi l'utente alla stanza nel dizionario delle stanze
        _rooms.AddOrUpdate(
            roomName,
            // Se la stanza non esiste, creala con questo utente
            (key) => new ConcurrentDictionary<string, bool>(new[] { new KeyValuePair<string, bool>(userName, true) }),
            // Se la stanza esiste, aggiungi l'utente
            (key, room) =>
            {
                room[userName] = true;
                return room;
            }
        );

        // Aggiungi l'utente al gruppo SignalR per la stanza
        await Groups.AddToGroupAsync(connectionId, roomName);
        _logger.LogInformation($"Utente {userName} aggiunto al gruppo {roomName}");

        // Notifica altri nella stanza
        await Clients.Group(roomName).SendAsync("UserJoined", userName);

        // Invia all'utente la lista degli utenti nella stanza
        var usersInRoom = _rooms[roomName].Keys.ToList();
        await Clients.Caller.SendAsync("UsersInRoom", usersInRoom);
    }

    // Disconnessione utente
    public override async Task OnDisconnectedAsync(Exception? exception)
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
            }

            // Rimuovi l'utente dal gruppo SignalR
            await Groups.RemoveFromGroupAsync(connectionId, roomName);

            // Notifica gli altri nella stanza
            await Clients.Group(roomName).SendAsync("UserLeft", userName);
            _logger.LogInformation($"Utente {userName} ha lasciato la stanza {roomName}");
        }

        await base.OnDisconnectedAsync(exception);
    }

    // Invia messaggio di testo
    public async Task SendMessage(string userName, string message)
    {
        var connectionId = Context.ConnectionId;

        if (_connections.TryGetValue(connectionId, out var userConnection))
        {
            var roomName = userConnection.RoomName;
            _logger.LogInformation($"Messaggio da {userName} nella stanza {roomName}: {message}");

            // Invia messaggio a tutti nella stanza 
            await Clients.Group(roomName).SendAsync("ReceiveMessage", userName, message);
        }
        else
        {
            _logger.LogWarning($"SendMessage: Utente {userName} non trovato nelle connessioni");
        }
    }

    // Invia un chunk audio
    public async Task SendAudioChunk(string userName, string chunk, int chunkId, bool isLastChunk, int totalChunks)
    {
        var connectionId = Context.ConnectionId;

        if (_connections.TryGetValue(connectionId, out var userConnection))
        {
            var roomName = userConnection.RoomName;
            _logger.LogInformation($"Chunk audio {chunkId}/{totalChunks} da {userName} nella stanza {roomName}");

            // Invia chunk audio a tutti gli altri nella stanza
            await Clients.GroupExcept(roomName, connectionId).SendAsync(
                "ReceiveAudioChunk",
                userName,
                chunk,
                chunkId,
                isLastChunk,
                totalChunks);
        }
        else
        {
            _logger.LogWarning($"SendAudioChunk: Utente {userName} non trovato nelle connessioni");
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