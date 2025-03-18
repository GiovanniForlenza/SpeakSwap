using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

public class TranslationService
{
    private readonly string _translatorKey;
    private readonly string _translatorEndpoint;
    private readonly HttpClient _httpClient;
    private readonly ILogger<TranslationService> _logger;

    public TranslationService(IConfiguration configuration, ILogger<TranslationService> logger)
    {
        _translatorKey = configuration["Azure:TranslatorKey"] ?? throw new ArgumentNullException(nameof(configuration), "Translator key is not configured.");
        _translatorEndpoint = configuration["Azure:TranslatorEndpoint"] ?? throw new ArgumentNullException(nameof(configuration), "Translator endpoint is not configured.");
        _httpClient = new HttpClient();
        _httpClient.DefaultRequestHeaders.Add("Ocp-Apim-Subscription-Region", configuration["Azure:TranslatorRegion"] ?? "global");
        _logger = logger;
        
        // Configure HttpClient
        _httpClient.DefaultRequestHeaders.Add("Ocp-Apim-Subscription-Key", _translatorKey);
        _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    }

    // Translate text into multiple target languages
    public async Task<Dictionary<string, string>> TranslateTextAsync(string text, string sourceLanguage, List<string> targetLanguages)
    {
        try
        {
            var result = new Dictionary<string, string>();

            // Filter target languages to exclude the source language
            var filteredTargets = targetLanguages.FindAll(lang => lang != sourceLanguage);

            if (string.IsNullOrEmpty(text) || filteredTargets.Count == 0)
            {
                return result;
            }

            _logger.LogInformation($"Translating from {sourceLanguage} to {string.Join(",", filteredTargets)}: '{text}'");
    
            // Send a separate request for each target language
            foreach (var targetLang in filteredTargets)
            {
                _logger.LogInformation("Sending translation request...");
                // Build the request URL
                var requestUri = $"{_translatorEndpoint}translate?api-version=3.0&from={GetLanguageCode(sourceLanguage)}&to={GetLanguageCode(targetLang)}";

                _logger.LogInformation($"Request URI: {requestUri}");
                
                // Prepare the request body
                var requestBody = new object[]
                {
                    new { Text = text }
                };

                var requestJson = JsonSerializer.Serialize(requestBody);
                var content = new StringContent(requestJson, Encoding.UTF8, "application/json");

                _logger.LogInformation($"Request Body: {requestJson}");

                // Send the request
                var response = await _httpClient.PostAsync(requestUri, content);

                // Check the success of the response
                if (response.IsSuccessStatusCode)
                {
                    var responseJson = await response.Content.ReadAsStringAsync();
                    _logger.LogInformation($"Response JSON: {responseJson}");

                    var translations = JsonSerializer.Deserialize<List<TranslationResult>>(responseJson);

                    if (translations != null && translations.Count > 0 &&
                        translations[0].translations != null && translations[0].translations.Count > 0)
                    {
                        var translation = translations[0].translations[0];
                        result[targetLang] = translation.text;
                        _logger.LogInformation($"Text translated to {targetLang}: '{translation.text}'");
                    }
                    _logger.LogInformation($"Translation response status: {response.StatusCode}");
                }
                else
                {
                    _logger.LogWarning($"Translation request error: {response.StatusCode}");
                }
            }

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during text translation");
            throw;
        }
    }

    // Map short language codes to full ISO codes
    private string GetLanguageCode(string shortCode)
    {
        return shortCode switch
        {
            "it" => "it",
            "en" => "en",
            "fr" => "fr",
            "de" => "de",
            "es" => "es",
            _ => throw new ArgumentException("Unsupported language code", nameof(shortCode))
        };
    }

    // Classes for deserializing the response
    private class TranslationResult
    {
        public List<Translation> translations { get; set; } 
    }

    private class Translation
    {
        public string text { get; set; }
        public string to { get; set; }
    }
}