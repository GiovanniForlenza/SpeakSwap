public interface IConversationLogService
{
    Task LogMessageAsync(string roomName, string userName, string message, string language, string messageType = "text");
    Task<List<ConversationMessage>> GetConversationHistoryAsync(string roomName);
}