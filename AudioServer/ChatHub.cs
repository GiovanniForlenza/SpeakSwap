using Microsoft.AspNetCore.SignalR;
using System.Threading.Tasks;

public class ChatHub : Hub
{
    public async Task SendMessage(string user, string message)
    {
        // Invia il messaggio a tutti i client connessi
        await Clients.All.SendAsync("ReceiveMessage", user, message);
    }

    public async Task SendAudioChunk(string user, string chunkBase64, int chunkId, bool isLastChunk, int totalChunks)
    {
        await Clients.All.SendAsync("ReceiveAudioChunk", user, chunkBase64, chunkId, isLastChunk, totalChunks);
    }

    public async Task JoinGroup(string groupName)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
    }

    public async Task SendToGroup(string groupName, string user, string message)
    {
        await Clients.Group(groupName).SendAsync("ReceiveMessage", user, message);
    }

    public override async Task OnConnectedAsync()
    {
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception exception)
    {
        await base.OnDisconnectedAsync(exception);
    }

}