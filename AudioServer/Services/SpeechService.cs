using Microsoft.CognitiveServices.Speech;
using Microsoft.CognitiveServices.Speech.Audio;
using System;
using System.IO;
using System.Threading.Tasks;

namespace AudioChatServer.Services
{
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
        }

        // Converte audio (base64) in testo
        public async Task<string> SpeechToTextAsync(string audioBase64, string language)
        {
            try
            {
                // Configurazione del servizio
                var config = SpeechConfig.FromSubscription(_speechKey, _speechRegion);
                config.SpeechRecognitionLanguage = GetLanguageCode(language);

                config.EnableDictation(); 
                config.SetProperty(PropertyId.Speech_SegmentationSilenceTimeoutMs, "1000");

                // Converti base64 in byte array
                byte[] audioBytes = Convert.FromBase64String(audioBase64);

                // Crea un PushAudioInputStream
                using var audioInputStream = AudioInputStream.CreatePushStream();
                using var audioConfig = AudioConfig.FromStreamInput(audioInputStream);

                // Scrivi i dati nello stream
                audioInputStream.Write(audioBytes);
                audioInputStream.Close();

                // Crea un riconoscitore
                using var recognizer = new SpeechRecognizer(config, audioConfig);

                // Riconosci l'audio
                var result = await recognizer.RecognizeOnceAsync();

                // Gestisci il risultato
                if (result.Reason == ResultReason.RecognizedSpeech)
                {
                    _logger.LogInformation($"STT completato con successo: '{result.Text}'");
                    return result.Text;
                }
                else
                {
                    _logger.LogWarning($"STT fallito: {result.Reason}");
                    return string.Empty;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Errore durante Speech-to-Text");
                throw;
            }
        }

        // Converte testo in audio (base64)
        public async Task<string> TextToSpeechAsync(string text, string language)
        {
            try
            {
                // Configurazione del servizio
                var config = SpeechConfig.FromSubscription(_speechKey, _speechRegion);
                config.SpeechSynthesisLanguage = GetLanguageCode(language);
                config.SpeechSynthesisVoiceName = GetVoiceName(language);

                // Crea un sintetizzatore
                using var synthesizer = new SpeechSynthesizer(config);

                // Sintetizza il testo in audio
                using var result = await synthesizer.SpeakTextAsync(text);

                // Gestisci il risultato
                if (result.Reason == ResultReason.SynthesizingAudioCompleted)
                {
                    // Converti l'audio in base64
                    var audioBase64 = Convert.ToBase64String(result.AudioData);
                    _logger.LogInformation($"TTS completato con successo, dimensione audio: {audioBase64.Length} bytes");
                    return audioBase64;
                }
                else
                {
                    _logger.LogWarning($"TTS fallito: {result.Reason}");
                    return string.Empty;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Errore durante Text-to-Speech");
                throw;
            }
        }

        // Mappa codici lingua brevi in codici BCP-47 completi
        private string GetLanguageCode(string shortCode)
        {
            return shortCode switch
            {
                "it" => "it-IT",
                "en" => "en-US",
                "fr" => "fr-FR",
                "de" => "de-DE",
                "es" => "es-ES",
                _ => "it-IT" // Default
            };
        }

        // Seleziona la voce in base alla lingua
        private string GetVoiceName(string shortCode)
        {
            return shortCode switch
            {
                "it" => "it-IT-ElsaNeural",
                "en" => "en-US-AriaNeural",
                "fr" => "fr-FR-DeniseNeural",
                "de" => "de-DE-KatjaNeural",
                "es" => "es-ES-ElviraNeural",
                _ => "it-IT-ElsaNeural" // Default
            };
        }
    }
}