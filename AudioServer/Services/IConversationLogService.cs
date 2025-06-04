public interface IConversationLogService
{
    Task LogMessageAsync(string roomName, string userName, string message, string language, string messageType = "text");
    Task<List<ConversationMessage>> GetConversationHistoryAsync(string roomName);
    
    Task<List<RoomSummary>> GetUserRoomsAsync(string userName);
    Task<List<ConversationMessage>> GetConversationHistoryAsync(string roomName, int limit = 50);

    Task<object> DebugGetAllMessagesForUserAsync(string userName);
}