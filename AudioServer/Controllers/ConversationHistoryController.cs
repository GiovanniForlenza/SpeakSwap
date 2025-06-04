using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ConversationHistoryController : ControllerBase
{
    private readonly IConversationLogService _conversationLogService;
    private readonly ILogger<ConversationHistoryController> _logger;

    public ConversationHistoryController(IConversationLogService conversationLogService, ILogger<ConversationHistoryController> logger)
    {
        _conversationLogService = conversationLogService;
        _logger = logger;
    }

    [HttpGet("{roomName}")]
    public async Task<IActionResult> GetHistory(string roomName)
    {
        if (string.IsNullOrWhiteSpace(roomName))
        {
            return BadRequest("Nome stanza richiesto");
        }

        try
        {
            var history = await _conversationLogService.GetConversationHistoryAsync(roomName);
            
            return Ok(new 
            {
                roomName = roomName,
                messageCount = history.Count,
                messages = history.Select(m => new 
                {
                    userName = m.UserName,
                    message = m.Message,
                    language = m.Language,
                    messageType = m.MessageType,
                    timestamp = m.Timestamp.ToString("yyyy-MM-dd HH:mm:ss")
                })
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Errore nel recuperare storico per {roomName}");
            return StatusCode(500, "Errore nel recuperare lo storico");
        }
    }
}