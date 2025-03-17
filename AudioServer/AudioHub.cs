using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

namespace AudioChatServer
{
    // Classe per memorizzare le informazioni dell'utente
    public class UserConnection
    {
        public string Username { get; set; } = string.Empty;
        public string RoomName { get; set; } = string.Empty;
    }

    public class AudioHub : Hub
    {
        private readonly ILogger<AudioHub> _logger;

        // Dizionario thread-safe per memorizzare le connessioni utente
        private static readonly ConcurrentDictionary<string, UserConnection> _connections =
            new ConcurrentDictionary<string, UserConnection>();

        // Dizionario per mappare username alle connessioni attive
        private static readonly ConcurrentDictionary<string, HashSet<string>> _userConnections =
            new ConcurrentDictionary<string, HashSet<string>>();

        public AudioHub(ILogger<AudioHub> logger)
        {
            _logger = logger;
        }

        // Utility privata per ottenere una chiave utente unica (username + room)
        private static string GetUserKey(string username, string roomName)
        {
            return $"{username}:{roomName}";
        }

        // Metodo chiamato quando un utente si unisce a una stanza
        public async Task JoinRoom(string username, string roomName)
        {
            try
            {
                var connectionId = Context.ConnectionId;
                _logger.LogInformation($"Utente {username} sta tentando di unirsi alla stanza {roomName} con ConnectionId {connectionId}");

                // Memorizza le informazioni di connessione dell'utente
                _connections[connectionId] = new UserConnection
                {
                    Username = username,
                    RoomName = roomName
                };

                // Aggiorna la mappa delle connessioni utente
                string userKey = GetUserKey(username, roomName);
                _userConnections.AddOrUpdate(
                    userKey,
                    // Se la chiave non esiste, crea un nuovo set con questa connessione
                    new HashSet<string> { connectionId },
                    // Se la chiave esiste, aggiungi questa connessione al set esistente
                    (key, existingConnections) =>
                    {
                        existingConnections.Add(connectionId);
                        return existingConnections;
                    }
                );

                // Aggiungi l'utente al gruppo corrispondente alla stanza
                await Groups.AddToGroupAsync(connectionId, roomName);
                _logger.LogInformation($"Utente {username} aggiunto al gruppo {roomName}");

                // Notifica tutti nella stanza che un nuovo utente si è unito
                // Ma solo se questa è la prima connessione per questo utente in questa stanza
                if (_userConnections[userKey].Count == 1)
                {
                    await Clients.Group(roomName).SendAsync("UserJoined", username);
                    _logger.LogInformation($"Notifica UserJoined inviata per {username} nella stanza {roomName} (prima connessione)");
                }
                else
                {
                    _logger.LogInformation($"Utente {username} ha connessioni multiple nella stanza {roomName}, notifica UserJoined saltata");
                }

                // Invia la lista degli utenti unici nella stanza
                var usersInRoom = GetUniqueUsersInRoom(roomName);

                _logger.LogInformation($"Utenti unici nella stanza {roomName}: {string.Join(", ", usersInRoom)}");
                await Clients.Caller.SendAsync("UsersInRoom", usersInRoom);
                _logger.LogInformation($"Lista utenti inviata a {username}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Errore durante JoinRoom per l'utente {username} nella stanza {roomName}");
                throw;
            }
        }

        // Metodo per ottenere utenti unici in una stanza
        private List<string> GetUniqueUsersInRoom(string roomName)
        {
            var uniqueUsers = new HashSet<string>();

            foreach (var conn in _connections)
            {
                if (conn.Value.RoomName == roomName)
                {
                    uniqueUsers.Add(conn.Value.Username);
                }
            }

            return uniqueUsers.ToList();
        }

        // Metodo chiamato quando un utente invia dati audio
        public async Task SendAudio(string audioBase64)
        {
            try
            {
                var connectionId = Context.ConnectionId;
                _logger.LogInformation($"[AUDIO-DEBUG] SendAudio chiamato da ConnectionId {connectionId}, lunghezza audio: {audioBase64?.Length ?? 0} bytes");

                if (string.IsNullOrEmpty(audioBase64))
                {
                    _logger.LogWarning($"SendAudio chiamato con audioBase64 vuoto da {connectionId}");
                    return;
                }

                if (_connections.TryGetValue(connectionId, out var userConnection))
                {
                    var senderUsername = userConnection.Username;
                    var roomName = userConnection.RoomName;
                    _logger.LogInformation($"[AUDIO-DEBUG] Audio inviato da utente {senderUsername} nella stanza {roomName}");

                    // Ottieni gli altri client nella stanza, ma escludendo tutte le connessioni dello stesso utente
                    var otherUsersInRoom = _connections
                        .Where(c => c.Value.RoomName == userConnection.RoomName &&
                                c.Value.Username != userConnection.Username)
                        .Select(c => c.Key)
                        .ToList();

                    _logger.LogInformation($"[AUDIO-DEBUG] Trovati {otherUsersInRoom.Count} destinatari: {string.Join(", ", otherUsersInRoom)}");

                    if (otherUsersInRoom.Count > 0)
                    {
                        // Aggiungi log per visualizzare i nomi degli utenti destinatari
                        var recipientUsernames = otherUsersInRoom
                            .Where(id => _connections.ContainsKey(id))
                            .Select(id => _connections[id].Username)
                            .ToList();

                        _logger.LogInformation($"[AUDIO-DEBUG] Invio audio a utenti: {string.Join(", ", recipientUsernames)}");

                        // Invia l'audio a tutte le connessioni degli altri utenti
                        await Clients.Clients(otherUsersInRoom)
                            .SendAsync("ReceiveAudio", userConnection.Username, audioBase64);

                        _logger.LogInformation($"[AUDIO-DEBUG] Audio inviato correttamente a {otherUsersInRoom.Count} utenti");
                    }
                    else
                    {
                        _logger.LogWarning($"[AUDIO-DEBUG] Nessun altro utente trovato nella stanza {roomName} per inviare l'audio");
                    }
                }
                else
                {
                    _logger.LogWarning($"Connessione non trovata per ConnectionId {connectionId}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Errore durante SendAudio da ConnectionId {Context.ConnectionId}");
                throw;
            }
        }

        // Metodo chiamato quando un utente si disconnette
        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            try
            {
                var connectionId = Context.ConnectionId;
                _logger.LogInformation($"OnDisconnectedAsync chiamato per ConnectionId {connectionId}");

                // Verifica se l'utente era connesso
                if (_connections.TryRemove(connectionId, out var userConnection))
                {
                    var username = userConnection.Username;
                    var roomName = userConnection.RoomName;
                    var userKey = GetUserKey(username, roomName);

                    // Rimuovi questa connessione dal set di connessioni dell'utente
                    if (_userConnections.TryGetValue(userKey, out var userConns))
                    {
                        userConns.Remove(connectionId);

                        // Se questa era l'ultima connessione dell'utente, notifica gli altri e rimuovi la chiave
                        if (userConns.Count == 0)
                        {
                            _userConnections.TryRemove(userKey, out _);

                            _logger.LogInformation($"Ultima connessione di {username} disconnessa dalla stanza {roomName}");

                            // Notifica gli altri utenti nella stanza
                            await Clients.Group(roomName)
                                .SendAsync("UserLeft", username);

                            _logger.LogInformation($"Notifica UserLeft inviata per {username} nella stanza {roomName}");
                        }
                        else
                        {
                            _logger.LogInformation($"Connessione di {username} disconnessa, ma l'utente ha ancora {userConns.Count} connessioni attive nella stanza {roomName}");
                        }
                    }

                    // Rimuovi sempre l'utente dal gruppo SignalR
                    await Groups.RemoveFromGroupAsync(connectionId, roomName);
                    _logger.LogInformation($"Connessione {connectionId} rimossa dal gruppo {roomName}");
                }
                else
                {
                    _logger.LogWarning($"Nessuna connessione trovata per ConnectionId {connectionId} durante OnDisconnectedAsync");
                }

                await base.OnDisconnectedAsync(exception);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Errore durante OnDisconnectedAsync per ConnectionId {Context.ConnectionId}");
                throw;
            }
        }

        // Metodo di ping per testare la connessione
        public string Ping()
        {
            _logger.LogInformation($"Ping chiamato da ConnectionId {Context.ConnectionId}");
            return "Pong";
        }

        // Metodo di echo per testare la trasmissione audio
        public async Task EchoAudio(string audioBase64)
        {
            try
            {
                var connectionId = Context.ConnectionId;
                _logger.LogInformation($"EchoAudio chiamato da ConnectionId {connectionId}, lunghezza audio: {audioBase64?.Length ?? 0} caratteri");

                if (string.IsNullOrEmpty(audioBase64))
                {
                    _logger.LogWarning($"EchoAudio chiamato con audioBase64 vuoto da {connectionId}");
                    return;
                }

                // Rimanda lo stesso audio al mittente
                await Clients.Caller.SendAsync("ReceiveAudio", "Echo", audioBase64);

                _logger.LogInformation($"Audio rimandato in echo a {connectionId}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Errore durante EchoAudio da ConnectionId {Context.ConnectionId}");
                throw;
            }
        }

        // Metodo per inviare dati audio PCM
        public async Task SendPCMAudio(string pcmData)
        {
            try
            {
                var connectionId = Context.ConnectionId;
                _logger.LogInformation($"[PCM-DEBUG] SendPCMAudio chiamato da ConnectionId {connectionId}, lunghezza dati: {pcmData?.Length ?? 0} bytes");

                if (string.IsNullOrEmpty(pcmData))
                {
                    _logger.LogWarning($"SendPCMAudio chiamato con pcmData vuoto da {connectionId}");
                    return;
                }

                if (_connections.TryGetValue(connectionId, out var userConnection))
                {
                    var senderUsername = userConnection.Username;
                    var roomName = userConnection.RoomName;
                    _logger.LogInformation($"[PCM-DEBUG] Audio PCM inviato da utente {senderUsername} nella stanza {roomName}");

                    // Invia a tutti gli altri nella stanza tranne il mittente
                    await Clients.OthersInGroup(roomName).SendAsync("ReceivePCMAudio", senderUsername, pcmData);
                    _logger.LogInformation($"[PCM-DEBUG] Audio PCM inviato agli altri utenti nella stanza {roomName}");
                }
                else
                {
                    _logger.LogWarning($"Connessione non trovata per ConnectionId {connectionId} in SendPCMAudio");
                }
                
            } catch (Exception ex)
            {
                _logger.LogError(ex, $"Errore durante SendPCMAudio da ConnectionId {Context.ConnectionId}");
                throw;
            }
        }      
    }
}
