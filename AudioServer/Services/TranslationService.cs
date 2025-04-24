using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Newtonsoft.Json;

public class TranslationService
{
    private readonly HttpClient _httpClient;
    private readonly string _translatorKey;
    private readonly string _translatorEndpoint;
    private readonly string _translatorRegion;

    public TranslationService(IConfiguration configuration)
    {
        _httpClient = new HttpClient();
        _translatorKey = configuration["Azure:TranslatorKey"];
        _translatorEndpoint = configuration["Azure:TranslatorEndpoint"];
        _translatorRegion = configuration["Azure:TranslatorRegion"];
    }

    public async Task<string> TranslateTextAsync(string text, string sourceLanguage, string targetLanguage)
    {
        if (string.IsNullOrEmpty(text))
            return text;

        if (sourceLanguage == targetLanguage)
            return text;

        string route = $"/translate?api-version=3.0&from={sourceLanguage}&to={targetLanguage}";

        var requestBody = new[] { new { Text = text } };
        var requestBodyJson = JsonConvert.SerializeObject(requestBody);

        using (var request = new HttpRequestMessage())
        {
            request.Method = HttpMethod.Post;
            request.RequestUri = new Uri(_translatorEndpoint + route);
            request.Content = new StringContent(requestBodyJson, Encoding.UTF8, "application/json");
            request.Headers.Add("Ocp-Apim-Subscription-Key", _translatorKey);
            request.Headers.Add("Ocp-Apim-Subscription-Region", _translatorRegion);

            var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var responseBody = await response.Content.ReadAsStringAsync();
            var result = JsonConvert.DeserializeObject<TranslationResult[]>(responseBody);

            if (result?.Length > 0 && result[0].Translations.Length > 0)
            {
                return result[0].Translations[0].Text;
            }

            return text; // Fallback al testo originale
        }
    }

    private class TranslationResult
    {
        public Translation[] Translations { get; set; }
    }

    private class Translation
    {
        public string Text { get; set; }
        public string To { get; set; }
    }
}