using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class UserHistoryController : ControllerBase
{
    private readonly IConversationLogService _conversationLogService;
    private readonly ILogger<UserHistoryController> _logger;

    public UserHistoryController(IConversationLogService conversationLogService, ILogger<UserHistoryController> logger)
    {
        _conversationLogService = conversationLogService;
        _logger = logger;
    }

    [HttpGet("test")]
    public IActionResult Test()
    {
        return Ok(new { 
            message = "API UserHistory funziona!", 
            timestamp = DateTime.UtcNow,
            server = "SpeakSwap" 
        });
    }

    [HttpGet("rooms/{userName}")]
    public async Task<IActionResult> GetUserRooms(string userName)
    {
        if (string.IsNullOrWhiteSpace(userName))
        {
            return BadRequest("Nome utente richiesto");
        }

        try
        {
            var rooms = await _conversationLogService.GetUserRoomsAsync(userName);
            
            return Ok(new 
            {
                userName = userName,
                roomCount = rooms.Count,
                rooms = rooms.Select(r => new 
                {
                    roomName = r.RoomName,
                    messageCount = r.MessageCount,
                    lastActivity = r.LastActivityFormatted,
                    daysAgo = r.DaysAgo,
                    firstActivity = r.FirstActivity.ToString("dd/MM/yyyy HH:mm")
                })
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Errore nel recuperare le stanze per {userName}");
            return StatusCode(500, "Errore nel recuperare lo storico delle stanze");
        }
    }

    [HttpGet("conversation/{roomName}/{userName}")]
    public async Task<IActionResult> GetConversationForUser(string roomName, string userName, [FromQuery] int limit = 50)
    {
        if (string.IsNullOrWhiteSpace(roomName) || string.IsNullOrWhiteSpace(userName))
        {
            return BadRequest("Nome stanza e utente richiesti");
        }

        try
        {
            var history = await _conversationLogService.GetConversationHistoryAsync(roomName);
            
            return Ok(new 
            {
                roomName = roomName,
                userName = userName,
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
            _logger.LogError(ex, $"Errore nel recuperare conversazione {roomName} per {userName}");
            return StatusCode(500, "Errore nel recuperare la conversazione");
        }
    }

    // METODI DI DEBUG - TUTTI DENTRO LA CLASSE
    [HttpGet("debug/raw/{userName}")]
    public async Task<IActionResult> DebugRawData(string userName)
    {
        try
        {
            _logger.LogInformation($"=== DEBUG RAW DATA per '{userName}' ===");
            
            var rooms = await _conversationLogService.GetUserRoomsAsync(userName);
            
            return Ok(new 
            {
                userName = userName,
                serviceResult = rooms,
                roomCount = rooms?.Count ?? 0,
                debug = "Risultato diretto dal servizio"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Errore nel debug per {userName}");
            return Ok(new 
            { 
                error = ex.Message,
                stackTrace = ex.StackTrace,
                userName = userName
            });
        }
    }

    [HttpGet("debug/messages/{userName}")]
    public async Task<IActionResult> DebugMessages(string userName)
    {
        try
        {
            var result = await _conversationLogService.DebugGetAllMessagesForUserAsync(userName);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return Ok(new { error = ex.Message, userName = userName });
        }
    }

}