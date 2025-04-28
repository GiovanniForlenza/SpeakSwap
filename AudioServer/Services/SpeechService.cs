using Microsoft.CognitiveServices.Speech;
using Microsoft.CognitiveServices.Speech.Audio;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

public class SpeechService
{
    private readonly string _speechKey;
    private readonly string _speechRegion;
    private readonly ILogger<SpeechService> _logger;

    public SpeechService(IConfiguration configuration, ILogger<SpeechService> logger)
    {
        _speechKey = configuration["Azure:SpeechKey"];
        _speechRegion = configuration["Azure:SpeechRegion"];
        _logger = logger;

        _logger.LogInformation($"SpeechService inizializzato con regione: {_speechRegion}");
    }

    // Converte audio in testo
    public async Task<string> SpeechToTextAsync(string audioBase64, string language)
    {
        try
        {
            _logger.LogInformation($"[SPEECH] Inizio conversione speech-to-text, lunghezza audio: {audioBase64.Length}, lingua: {language}");

            // Configura il servizio Speech
            var config = SpeechConfig.FromSubscription(_speechKey, _speechRegion);
            config.SpeechRecognitionLanguage = GetSpeechLanguageCode(language);
            _logger.LogInformation($"[SPEECH] Configurato riconoscimento per lingua: {config.SpeechRecognitionLanguage}");

            // Converte base64 in array di byte
            byte[] audioBytes;
            try
            {
                audioBytes = Convert.FromBase64String(audioBase64);
                _logger.LogInformation($"[SPEECH] Audio convertito in {audioBytes.Length} bytes");

                // Debug: controlla i primi byte per verificare il formato
                var headerBytes = string.Join(", ", audioBytes.Take(16).Select(b => b.ToString("X2")));
                _logger.LogInformation($"[SPEECH] Primi byte dell'audio: {headerBytes}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[SPEECH] Errore nella decodifica del base64");
                return string.Empty;
            }

            if (audioBytes.Length < 100)
            {
                _logger.LogWarning($"[SPEECH] Audio troppo piccolo ({audioBytes.Length} bytes) per essere riconosciuto");
                return string.Empty;
            }

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
            _logger.LogInformation("[SPEECH] Stream audio creato correttamente");

            // Crea il riconoscitore vocale con lo stream corretto
            using var audioConfig = AudioConfig.FromStreamInput(audioInput);
            using var recognizer = new SpeechRecognizer(config, audioConfig);
            _logger.LogInformation("[SPEECH] SpeechRecognizer configurato, inizio riconoscimento");

            // Esegui il riconoscimento con timeout
            var result = await recognizer.RecognizeOnceAsync();
            _logger.LogInformation($"[SPEECH] Riconoscimento completato, status: {result.Reason}");

            // Verifica il risultato
            if (result.Reason == ResultReason.RecognizedSpeech)
            {
                _logger.LogInformation($"[SPEECH] Testo riconosciuto: \"{result.Text}\"");
                return result.Text;
            }
            else
            {
                _logger.LogWarning($"[SPEECH] Nessun testo riconosciuto. Motivo: {result.Reason}");

                // Tentativo con configurazione alternativa?
                if (result.Reason == ResultReason.NoMatch || result.Reason == ResultReason.Canceled)
                {
                    _logger.LogInformation("[SPEECH] Tentativo di riconoscimento con configurazione alternativa");
                    return await RetryWithAlternativeConfig(audioBytes, language);
                }
            }

            return string.Empty;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[SPEECH] Errore globale nel riconoscimento vocale");
            return string.Empty;
        }
    }

    // Tentativo di riconoscimento alternativo
    private async Task<string> RetryWithAlternativeConfig(byte[] audioBytes, string language)
    {
        try
        {
            _logger.LogInformation("[SPEECH] Avvio riconoscimento alternativo");

            // Configurazione alternativa
            var config = SpeechConfig.FromSubscription(_speechKey, _speechRegion);
            config.SpeechRecognitionLanguage = GetSpeechLanguageCode(language);
            config.SetProperty("SpeechServiceConnection_LanguageIdMode", "AtStart");
            config.SetProperty("SpeechServiceConnection_ContinuousLanguageIdEnabled", "true");
            config.SetProperty("SpeechServiceConnection_SingleLanguageIdEnabled", "true");

            // Usa un formato WAV più generico
            using var audioStream = new MemoryStream(audioBytes);
            using var waveStream = new MemoryStream();

            // Configura l'audio
            // Save MemoryStream to a temporary file
            var tempFilePath = Path.GetTempFileName();
            await File.WriteAllBytesAsync(tempFilePath, audioBytes);

            // Use the temporary file for AudioConfig
            using var audioConfig = AudioConfig.FromWavFileInput(tempFilePath);

            // Clean up the temporary file after use
            File.Delete(tempFilePath);
            using var recognizer = new SpeechRecognizer(config, audioConfig);

            _logger.LogInformation("[SPEECH] Configurazione alternativa pronta, inizio riconoscimento");
            var result = await recognizer.RecognizeOnceAsync();

            if (result.Reason == ResultReason.RecognizedSpeech)
            {
                _logger.LogInformation($"[SPEECH] Riconoscimento alternativo riuscito: \"{result.Text}\"");
                return result.Text;
            }
            else
            {
                _logger.LogWarning($"[SPEECH] Anche il riconoscimento alternativo è fallito. Motivo: {result.Reason}");
            }

            return string.Empty;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[SPEECH] Errore nel riconoscimento alternativo");
            return string.Empty;
        }
    }

    // Converte testo in audio
    public async Task<string> TextToSpeechAsync(string text, string language)
    {
        try
        {
            _logger.LogInformation($"[SPEECH] Inizio sintesi vocale per: \"{text}\", lingua: {language}");

            // Configura il servizio Speech
            var config = SpeechConfig.FromSubscription(_speechKey, _speechRegion);
            config.SpeechSynthesisLanguage = GetSpeechLanguageCode(language);
            config.SpeechSynthesisVoiceName = GetVoiceForLanguage(language);

            _logger.LogInformation($"[SPEECH] Configurato sintetizzatore per lingua: {config.SpeechSynthesisLanguage}, voce: {config.SpeechSynthesisVoiceName}");

            // Crea il sintetizzatore
            using var synthesizer = new SpeechSynthesizer(config);
            _logger.LogInformation("[SPEECH] Sintetizzatore configurato, inizio sintesi");

            // Sintetizza il testo in audio
            using var result = await synthesizer.SpeakTextAsync(text);
            _logger.LogInformation($"[SPEECH] Sintesi completata, status: {result.Reason}");

            // Verifica il risultato
            if (result.Reason == ResultReason.SynthesizingAudioCompleted)
            {
                var audioBase64 = Convert.ToBase64String(result.AudioData);
                _logger.LogInformation($"[SPEECH] Audio generato con successo, lunghezza: {audioBase64.Length} caratteri");
                return audioBase64;
            }
            else
            {
                _logger.LogWarning($"[SPEECH] Sintesi vocale fallita. Motivo: {result.Reason}");
                return string.Empty;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[SPEECH] Errore globale nella sintesi vocale");
            return string.Empty;
        }
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