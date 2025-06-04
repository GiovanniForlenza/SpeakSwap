using System.Text.Json.Serialization;

public class RoomSummary
{
    [JsonPropertyName("roomName")]
    public string RoomName { get; set; } = string.Empty;
    
    [JsonPropertyName("messageCount")]
    public int MessageCount { get; set; }
    
    [JsonPropertyName("lastActivity")]
    public DateTime LastActivity { get; set; }
    
    [JsonPropertyName("firstActivity")]
    public DateTime FirstActivity { get; set; }
    
    // Proprietà calcolate (non serializzate nel JSON)
    [JsonIgnore]
    public string LastActivityFormatted => LastActivity.ToString("dd/MM/yyyy HH:mm");
    
    [JsonIgnore]
    public int DaysAgo => (DateTime.UtcNow - LastActivity).Days;
    
    [JsonIgnore]
    public string ActivityDescription => DaysAgo switch
    {
        0 => "Oggi",
        1 => "Ieri", 
        <= 7 => $"{DaysAgo} giorni fa",
        <= 30 => $"{DaysAgo / 7} settimane fa",
        _ => $"{DaysAgo / 30} mesi fa"
    };
}