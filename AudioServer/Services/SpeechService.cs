using Microsoft.CognitiveServices.Speech;
using Microsoft.CognitiveServices.Speech.Audio;
using Microsoft.Extensions.Configuration;
using System.IO;
using System.Threading.Tasks;

public class SpeechService
{
    private readonly string _speechKey;
    private readonly string _speechRegion;

    public SpeechService(IConfiguration configuration)
    {
        _speechKey = configuration["Azure:SpeechKey"];
        _speechRegion = configuration["Azure:SpeechRegion"];
    }

    // Converte audio in testo
    public async Task<string> SpeechToTextAsync(string audioBase64, string language)
    {
        // Configura il servizio Speech
        var config = SpeechConfig.FromSubscription(_speechKey, _speechRegion);
        config.SpeechRecognitionLanguage = GetSpeechLanguageCode(language);

        // Converte base64 in stream di byte
        byte[] audioBytes = Convert.FromBase64String(audioBase64);
        using var audioStream = new MemoryStream(audioBytes);

        // Crea il formato audio corretto per SpeechSDK
        using var audioInput = AudioInputStream.CreatePushStream();

        // Copia i dati dal MemoryStream al PushStream
        byte[] buffer = new byte[4096];
        int bytesRead;
        audioStream.Position = 0;
        while ((bytesRead = audioStream.Read(buffer, 0, buffer.Length)) > 0)
        {
            audioInput.Write(buffer, bytesRead);
        }

        // Segnala la fine dello stream
        audioInput.Close();

        // Crea il riconoscitore vocale con lo stream corretto
        using var audioConfig = AudioConfig.FromStreamInput(audioInput);
        using var recognizer = new SpeechRecognizer(config, audioConfig);

        // Esegui il riconoscimento
        var result = await recognizer.RecognizeOnceAsync();

        // Verifica il risultato
        if (result.Reason == ResultReason.RecognizedSpeech)
        {
            return result.Text;
        }

        return string.Empty;
    }

    // Converte testo in audio
    public async Task<string> TextToSpeechAsync(string text, string language)
    {
        // Configura il servizio Speech
        var config = SpeechConfig.FromSubscription(_speechKey, _speechRegion);
        config.SpeechSynthesisLanguage = GetSpeechLanguageCode(language);

        // Imposta una voce appropriata per la lingua
        config.SpeechSynthesisVoiceName = GetVoiceForLanguage(language);

        // Crea il sintetizzatore
        using var synthesizer = new SpeechSynthesizer(config);

        // Sintetizza il testo in audio
        using var result = await synthesizer.SpeakTextAsync(text);

        // Verifica il risultato
        if (result.Reason == ResultReason.SynthesizingAudioCompleted)
        {
            // Converte l'audio in base64
            return Convert.ToBase64String(result.AudioData);
        }

        return string.Empty;
    }

    // Mappa codici lingua per il servizio Speech
    private string GetSpeechLanguageCode(string language)
    {
        return language switch
        {
            "it" => "it-IT",
            "en" => "en-US",
            "fr" => "fr-FR",
            "es" => "es-ES",
            "de" => "de-DE",
            _ => "en-US"
        };
    }

    // Mappa voci per il servizio Speech
    private string GetVoiceForLanguage(string language)
    {
        return language switch
        {
            "it" => "it-IT-DiegoNeural",
            "en" => "en-US-JennyNeural",
            "fr" => "fr-FR-DeniseNeural",
            "es" => "es-ES-ElviraNeural",
            "de" => "de-DE-KatjaNeural",
            _ => "en-US-JennyNeural"
        };
    }
}