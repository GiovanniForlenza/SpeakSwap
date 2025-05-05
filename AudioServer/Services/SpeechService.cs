using Microsoft.CognitiveServices.Speech;
using Microsoft.CognitiveServices.Speech.Audio;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

public class SpeechService
{
    private readonly string _speechKey;
    private readonly string _speechRegion;
    private readonly ILogger<SpeechService> _logger;
    private readonly string _ffmpegPath;

    public SpeechService(IConfiguration configuration, ILogger<SpeechService> logger)
    {
        _speechKey = configuration["Azure:SpeechKey"];
        _speechRegion = configuration["Azure:SpeechRegion"];
        _logger = logger;

        // Usa un percorso personalizzato per FFmpeg se configurato, altrimenti assume che sia disponibile nel PATH
        _ffmpegPath = configuration["FFmpeg:Path"] ?? "ffmpeg";

        _logger.LogInformation($"SpeechService inizializzato con regione: {_speechRegion}");
    }
    // Converte audio in testo
    public async Task<string> SpeechToTextAsync(string audioBase64, string language)
    {
        try
        {
            _logger.LogInformation($"[SPEECH] Inizio conversione speech-to-text, lunghezza audio: {audioBase64.Length}, lingua: {language}");

            // Valida input
            if (string.IsNullOrEmpty(audioBase64))
            {
                _logger.LogWarning("[SPEECH] Input audio base64 vuoto o nullo");
                return string.Empty;
            }

            // Converte base64 in array di byte
            byte[] audioBytes;
            try
            {
                audioBytes = Convert.FromBase64String(audioBase64);
                _logger.LogInformation($"[SPEECH] Audio convertito in {audioBytes.Length} bytes");

                // Debug: controlla i primi byte per verificare il formato
                var headerBytes = string.Join(", ", audioBytes.Take(16).Select(b => b.ToString("X2")));
                _logger.LogInformation($"[SPEECH] Primi byte dell'audio: {headerBytes}");

                // Verifica la dimensione minima per il riconoscimento
                if (audioBytes.Length < 1000)
                {
                    _logger.LogWarning($"[SPEECH] Audio troppo piccolo ({audioBytes.Length} bytes) per essere riconosciuto");
                    return string.Empty;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[SPEECH] Errore nella decodifica del base64");
                return string.Empty;
            }

            // Rileva il formato audio dai primi byte
            if (IsWebMFormat(audioBytes))
            {
                _logger.LogInformation("[SPEECH] Rilevato formato WebM, conversione a WAV richiesta");
                audioBytes = await ConvertWebMToWavAsync(audioBytes);

                if (audioBytes == null || audioBytes.Length == 0)
                {
                    _logger.LogError("[SPEECH] Conversione WebM a WAV fallita");
                    return string.Empty;
                }

                _logger.LogInformation($"[SPEECH] Formato convertito in WAV, nuova dimensione: {audioBytes.Length} bytes");
            }
            else if (!IsWavFormat(audioBytes))
            {
                _logger.LogWarning("[SPEECH] Formato audio non riconosciuto, tentativo di conversione a WAV");
                audioBytes = await ConvertToWavAsync(audioBytes);

                if (audioBytes == null || audioBytes.Length == 0)
                {
                    _logger.LogError("[SPEECH] Conversione a WAV fallita");
                    return string.Empty;
                }
            }

            // Configura il servizio Speech
            var config = SpeechConfig.FromSubscription(_speechKey, _speechRegion);
            config.SpeechRecognitionLanguage = GetSpeechLanguageCode(language);

            // Configura ulteriori opzioni per migliorare il riconoscimento
            config.SetProperty(PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "10000");
            config.SetProperty(PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "10000");

            _logger.LogInformation($"[SPEECH] Configurato riconoscimento per lingua: {config.SpeechRecognitionLanguage}");

            // Usa file temporaneo per riconoscimento - metodo più affidabile per vari formati audio
            return await RecognizeWithTempFile(config, audioBytes);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[SPEECH] Errore globale nel riconoscimento vocale");
            return string.Empty;
        }
    }

    // Controlla se i byte rappresentano un file WebM
    private bool IsWebMFormat(byte[] audioBytes)
    {
        // Il file WebM inizia con i bytes 0x1A 0x45 0xDF 0xA3 (firma EBML)
        if (audioBytes.Length < 4)
            return false;

        return (audioBytes[0] == 0x1A && audioBytes[1] == 0x45 && audioBytes[2] == 0xDF && audioBytes[3] == 0xA3) ||
           (audioBytes[0] == 0x1A && audioBytes[1] == 0x45 && audioBytes[2] == 0xDF);
    }

    private bool IsWavFormat(byte[] audioBytes)
    {
        // Il file WAV inizia con "RIFF" seguito da 4 bytes di lunghezza, poi "WAVE"
        if (audioBytes.Length < 12)
            return false;

        return audioBytes[0] == 0x52 && audioBytes[1] == 0x49 && audioBytes[2] == 0x46 && audioBytes[3] == 0x46 &&
               audioBytes[8] == 0x57 && audioBytes[9] == 0x41 && audioBytes[10] == 0x56 && audioBytes[11] == 0x45;
    }

    // Converte WebM in WAV usando FFmpeg
    private async Task<byte[]> ConvertWebMToWavAsync(byte[] webmBytes)
    {
        try
        {
            _logger.LogInformation("[SPEECH] Avvio conversione WebM a WAV con FFmpeg");

            // Crea file temporanei per input e output
            string inputFilePath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString() + ".webm");
            string outputFilePath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString() + ".wav");

            try
            {
                // Scrivi i bytes WebM su un file temporaneo
                await File.WriteAllBytesAsync(inputFilePath, webmBytes);

                // Prepara il processo FFmpeg per la conversione
                var startInfo = new ProcessStartInfo
                {
                    FileName = _ffmpegPath,
                    Arguments = $"-i \"{inputFilePath}\" -acodec pcm_s16le -ar 16000 -ac 1 \"{outputFilePath}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                // Avvia FFmpeg
                using var process = new Process { StartInfo = startInfo };
                process.Start();

                // Cattura output e errori per logging
                string output = await process.StandardOutput.ReadToEndAsync();
                string error = await process.StandardError.ReadToEndAsync();

                // Attendi il completamento con timeout
                if (!process.WaitForExit(10000)) // 10 secondi di timeout
                {
                    process.Kill();
                    _logger.LogError("[SPEECH] Timeout nella conversione FFmpeg");
                    return null;
                }

                // Verifica esito
                if (process.ExitCode != 0)
                {
                    _logger.LogError($"[SPEECH] FFmpeg fallito con codice {process.ExitCode}: {error}");
                    return null;
                }

                // Verifica che il file di output esista
                if (!File.Exists(outputFilePath))
                {
                    _logger.LogError("[SPEECH] File di output FFmpeg non trovato");
                    return null;
                }

                // Leggi il file WAV convertito
                byte[] wavBytes = await File.ReadAllBytesAsync(outputFilePath);
                _logger.LogInformation($"[SPEECH] Conversione completata, dimensione WAV: {wavBytes.Length} bytes");

                return wavBytes;
            }
            finally
            {
                // Pulizia dei file temporanei
                if (File.Exists(inputFilePath))
                    File.Delete(inputFilePath);

                if (File.Exists(outputFilePath))
                    File.Delete(outputFilePath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[SPEECH] Errore nella conversione WebM a WAV");
            return null;
        }
    }

    private async Task<byte[]> ConvertToWavAsync(byte[] audioBytes)
    {
        try
        {
            _logger.LogInformation("[SPEECH] Avvio conversione generica a WAV con FFmpeg");

            // Crea file temporanei per input e output
            string inputFilePath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString() + ".audio");
            string outputFilePath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString() + ".wav");

            try
            {
                // Scrivi i bytes audio su un file temporaneo
                await File.WriteAllBytesAsync(inputFilePath, audioBytes);

                // Prepara il processo FFmpeg per la conversione - lascia che FFmpeg rilevi il formato di input
                var startInfo = new ProcessStartInfo
                {
                    FileName = _ffmpegPath,
                    Arguments = $"-i \"{inputFilePath}\" -acodec pcm_s16le -ar 16000 -ac 1 \"{outputFilePath}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                // Avvia FFmpeg
                using var process = new Process { StartInfo = startInfo };
                process.Start();

                // Cattura output e errori per logging
                string output = await process.StandardOutput.ReadToEndAsync();
                string error = await process.StandardError.ReadToEndAsync();

                // Attendi il completamento con timeout
                if (!process.WaitForExit(10000)) // 10 secondi di timeout
                {
                    process.Kill();
                    _logger.LogError("[SPEECH] Timeout nella conversione FFmpeg");
                    return null;
                }

                // Verifica esito
                if (process.ExitCode != 0)
                {
                    _logger.LogError($"[SPEECH] FFmpeg fallito con codice {process.ExitCode}: {error}");
                    return null;
                }

                // Verifica che il file di output esista
                if (!File.Exists(outputFilePath))
                {
                    _logger.LogError("[SPEECH] File di output FFmpeg non trovato");
                    return null;
                }

                // Leggi il file WAV convertito
                byte[] wavBytes = await File.ReadAllBytesAsync(outputFilePath);
                _logger.LogInformation($"[SPEECH] Conversione completata, dimensione WAV: {wavBytes.Length} bytes");

                return wavBytes;
            }
            finally
            {
                // Pulizia dei file temporanei
                if (File.Exists(inputFilePath))
                    File.Delete(inputFilePath);

                if (File.Exists(outputFilePath))
                    File.Delete(outputFilePath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[SPEECH] Errore nella conversione generica a WAV");
            return null;
        }
    }

    // Riconoscimento con file temporaneo - versione semplificata
    private async Task<string> RecognizeWithTempFile(SpeechConfig config, byte[] audioBytes)
    {
        string tempFilePath = null;
        try
        {
            _logger.LogInformation("[SPEECH] Tentativo riconoscimento con file temporaneo");

            // Crea un file temporaneo per l'audio
            tempFilePath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString() + ".wav");
            await File.WriteAllBytesAsync(tempFilePath, audioBytes);
            _logger.LogInformation($"[SPEECH] File temporaneo creato: {tempFilePath}");

            // Configura il riconoscitore con il file WAV
            using var audioConfig = AudioConfig.FromWavFileInput(tempFilePath);
            using var recognizer = new SpeechRecognizer(config, audioConfig);

            // Esegui il riconoscimento
            var result = await recognizer.RecognizeOnceAsync();
            _logger.LogInformation($"[SPEECH] Risultato riconoscimento da file: {result.Reason}");

            if (result.Reason == ResultReason.RecognizedSpeech)
            {
                _logger.LogInformation($"[SPEECH] Testo riconosciuto: \"{result.Text}\"");
                return result.Text;
            }
            else
            {
                _logger.LogWarning($"[SPEECH] Nessun testo riconosciuto. Motivo: {result.Reason}");
                return string.Empty;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[SPEECH] Errore nel riconoscimento con file temporaneo");
            return string.Empty;
        }
        finally
        {
            // Pulizia del file temporaneo
            if (tempFilePath != null && File.Exists(tempFilePath))
            {
                try
                {
                    File.Delete(tempFilePath);
                    _logger.LogInformation($"[SPEECH] File temporaneo eliminato: {tempFilePath}");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"[SPEECH] Errore nell'eliminazione del file temporaneo: {tempFilePath}");
                }
            }
        }
    }

    // Metodo 1: Riconoscimento con PushStream
    private async Task<string> RecognizeWithPushStream(SpeechConfig config, byte[] audioBytes)
    {
        try
        {
            _logger.LogInformation("[SPEECH] Tentativo riconoscimento con PushStream");

            // Crea un PushStream per l'input audio
            using var audioInput = AudioInputStream.CreatePushStream();
            using var audioConfig = AudioConfig.FromStreamInput(audioInput);
            using var recognizer = new SpeechRecognizer(config, audioConfig);

            // Imposta un timeout per il riconoscimento
            var recognitionCompletedTask = new TaskCompletionSource<SpeechRecognitionResult>();
            recognizer.Recognized += (s, e) =>
            {
                if (e.Result.Reason == ResultReason.RecognizedSpeech)
                {
                    recognitionCompletedTask.TrySetResult(e.Result);
                }
            };

            recognizer.SessionStopped += (s, e) =>
            {
                recognitionCompletedTask.TrySetResult(null);
            };

            // Avvia la sessione di riconoscimento
            await recognizer.StartContinuousRecognitionAsync();

            // Invia i dati audio al PushStream
            int chunkSize = 4096;
            for (int i = 0; i < audioBytes.Length; i += chunkSize)
            {
                int size = Math.Min(chunkSize, audioBytes.Length - i);
                byte[] chunk = new byte[size];
                Array.Copy(audioBytes, i, chunk, 0, size);
                audioInput.Write(chunk);
            }

            // Segnala la fine dello stream
            audioInput.Close();

            // Attendi il risultato con timeout
            var timeoutTask = Task.Delay(TimeSpan.FromSeconds(30));
            await Task.WhenAny(recognitionCompletedTask.Task, timeoutTask);

            // Ferma il riconoscimento
            await recognizer.StopContinuousRecognitionAsync();

            if (timeoutTask.IsCompleted && !recognitionCompletedTask.Task.IsCompleted)
            {
                _logger.LogWarning("[SPEECH] Timeout nel riconoscimento con PushStream");
                return string.Empty;
            }

            var result = await recognitionCompletedTask.Task;
            if (result != null && !string.IsNullOrEmpty(result.Text))
            {
                return result.Text;
            }

            // Fallback a riconoscimento singolo
            _logger.LogInformation("[SPEECH] Tentativo di riconoscimento singolo con PushStream");
            result = await recognizer.RecognizeOnceAsync();
            if (result.Reason == ResultReason.RecognizedSpeech)
            {
                return result.Text;
            }

            return string.Empty;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[SPEECH] Errore nel riconoscimento con PushStream");
            return string.Empty;
        }
    }


    // Converte testo in audio
    public async Task<string> TextToSpeechAsync(string text, string language)
    {
        try
        {
            if (string.IsNullOrEmpty(text))
            {
                _logger.LogWarning("[SPEECH] Testo vuoto o nullo per la sintesi vocale");
                return string.Empty;
            }

            _logger.LogInformation($"[SPEECH] Inizio sintesi vocale per: \"{text}\", lingua: {language}");

            // Gestione di timeout più ampio e tentativi multipli
            int maxAttempts = 3;
            int attempt = 0;
            Exception lastException = null;

            while (attempt < maxAttempts)
            {
                attempt++;
                _logger.LogInformation($"[SPEECH] Tentativo {attempt}/{maxAttempts} di sintesi vocale");

                try
                {
                    // Configura il servizio Speech con opzioni ottimizzate
                    var config = SpeechConfig.FromSubscription(_speechKey, _speechRegion);
                    config.SpeechSynthesisLanguage = GetSpeechLanguageCode(language);
                    config.SpeechSynthesisVoiceName = GetVoiceForLanguage(language);

                    // Imposta una preferenza di formato più semplice (più affidabile)
                    config.SetSpeechSynthesisOutputFormat(SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm);

                    config.SetProperty(PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "10000");  // 10 secondi
                    config.SetProperty(PropertyId.SpeechServiceResponse_RequestSentenceBoundary, "true");

                    _logger.LogInformation($"[SPEECH] Configurato sintetizzatore per lingua: {config.SpeechSynthesisLanguage}, voce: {config.SpeechSynthesisVoiceName}");

                    // Crea il sintetizzatore
                    using var synthesizer = new SpeechSynthesizer(config);
                    _logger.LogInformation("[SPEECH] Sintetizzatore configurato, inizio sintesi");

                    // Utilizza direttamente il testo semplice, senza SSML
                    var result = await synthesizer.SpeakTextAsync(text);
                    _logger.LogInformation($"[SPEECH] Sintesi testo completata, status: {result.Reason}");

                    // Verifica il risultato
                    if (result.Reason == ResultReason.SynthesizingAudioCompleted && result.AudioData != null && result.AudioData.Length > 0)
                    {
                        var audioBase64 = Convert.ToBase64String(result.AudioData);
                        _logger.LogInformation($"[SPEECH] Audio generato con successo, lunghezza: {audioBase64.Length} caratteri");
                        return audioBase64;
                    }
                    else
                    {
                        _logger.LogWarning($"[SPEECH] Sintesi vocale non ha prodotto audio. Motivo: {result.Reason}, AudioData presente: {result.AudioData != null}, Lunghezza: {result.AudioData?.Length ?? 0}");
                    }
                }
                catch (OperationCanceledException ocEx)
                {
                    lastException = ocEx;
                    _logger.LogWarning(ocEx, $"[SPEECH] Operazione di sintesi vocale cancellata (tentativo {attempt}/{maxAttempts})");

                    // Piccola pausa prima del prossimo tentativo
                    await Task.Delay(500);
                }
                catch (Exception ex)
                {
                    lastException = ex;
                    _logger.LogError(ex, $"[SPEECH] Errore nella sintesi vocale (tentativo {attempt}/{maxAttempts})");

                    // Piccola pausa prima del prossimo tentativo
                    await Task.Delay(500);
                }
            }

            if (lastException != null)
            {
                _logger.LogError(lastException, $"[SPEECH] Tutti i tentativi di sintesi vocale falliti dopo {maxAttempts} tentativi");
            }

            // Come fallback, genera un "placeholder" audio WAV vuoto breve
            try
            {
                _logger.LogInformation("[SPEECH] Generazione audio placeholder come fallback");
                byte[] placeholderAudio = GeneratePlaceholderWavAudio();
                string placeholderBase64 = Convert.ToBase64String(placeholderAudio);
                _logger.LogInformation($"[SPEECH] Audio placeholder generato, lunghezza: {placeholderBase64.Length} caratteri");
                return placeholderBase64;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[SPEECH] Errore nella generazione del placeholder audio");
            }

            return string.Empty;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[SPEECH] Errore globale nella sintesi vocale");
            return string.Empty;
        }
    }

    // Genera un file WAV vuoto come placeholder
    private byte[] GeneratePlaceholderWavAudio()
    {
        // Parametri audio
        int sampleRate = 16000;   // 16kHz
        int channels = 1;         // mono
        int bitsPerSample = 16;   // 16 bit
        float durationSecs = 0.5f;  // mezzo secondo

        // Calcola dimensioni
        int bytesPerSample = bitsPerSample / 8;
        int dataSize = (int)(sampleRate * durationSecs * channels * bytesPerSample);
        int fileSize = 44 + dataSize;  // 44 bytes di header WAV

        // Crea buffer per il file WAV
        byte[] wavFile = new byte[fileSize];

        // Scrivi WAV header (44 bytes standard)
        // "RIFF" chunk
        wavFile[0] = (byte)'R'; wavFile[1] = (byte)'I'; wavFile[2] = (byte)'F'; wavFile[3] = (byte)'F';
        wavFile[4] = (byte)((dataSize + 36) & 0xff);
        wavFile[5] = (byte)(((dataSize + 36) >> 8) & 0xff);
        wavFile[6] = (byte)(((dataSize + 36) >> 16) & 0xff);
        wavFile[7] = (byte)(((dataSize + 36) >> 24) & 0xff);
        // "WAVE"
        wavFile[8] = (byte)'W'; wavFile[9] = (byte)'A'; wavFile[10] = (byte)'V'; wavFile[11] = (byte)'E';
        // "fmt " chunk
        wavFile[12] = (byte)'f'; wavFile[13] = (byte)'m'; wavFile[14] = (byte)'t'; wavFile[15] = (byte)' ';
        // lunghezza chunk fmt (16 bytes)
        wavFile[16] = 16; wavFile[17] = 0; wavFile[18] = 0; wavFile[19] = 0;
        // formato audio (1 = PCM)
        wavFile[20] = 1; wavFile[21] = 0;
        // canali
        wavFile[22] = (byte)channels; wavFile[23] = 0;
        // sample rate
        wavFile[24] = (byte)(sampleRate & 0xff);
        wavFile[25] = (byte)((sampleRate >> 8) & 0xff);
        wavFile[26] = (byte)((sampleRate >> 16) & 0xff);
        wavFile[27] = (byte)((sampleRate >> 24) & 0xff);
        // byte rate = SampleRate * NumChannels * BitsPerSample/8
        int byteRate = sampleRate * channels * bytesPerSample;
        wavFile[28] = (byte)(byteRate & 0xff);
        wavFile[29] = (byte)((byteRate >> 8) & 0xff);
        wavFile[30] = (byte)((byteRate >> 16) & 0xff);
        wavFile[31] = (byte)((byteRate >> 24) & 0xff);
        // block align = NumChannels * BitsPerSample/8
        wavFile[32] = (byte)(channels * bytesPerSample); wavFile[33] = 0;
        // bits per sample
        wavFile[34] = (byte)bitsPerSample; wavFile[35] = 0;

        // "data" chunk
        wavFile[36] = (byte)'d'; wavFile[37] = (byte)'a'; wavFile[38] = (byte)'t'; wavFile[39] = (byte)'a';
        // data size
        wavFile[40] = (byte)(dataSize & 0xff);
        wavFile[41] = (byte)((dataSize >> 8) & 0xff);
        wavFile[42] = (byte)((dataSize >> 16) & 0xff);
        wavFile[43] = (byte)((dataSize >> 24) & 0xff);

        // Dati audio - silenzio (tutti zero)
        // Già inizializzato a zero con new byte[fileSize]

        return wavFile;
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
            "zh" => "zh-CN",
            "ja" => "ja-JP",
            "ru" => "ru-RU",
            "pt" => "pt-BR",
            "ar" => "ar-SA",
            _ => "en-US"
        };
    }

    // Mappa voci per il servizio Speech (seleziona voci neurali di alta qualità)
    private string GetVoiceForLanguage(string language)
    {
        return language switch
        {
            "it" => "it-IT-DiegoNeural",      // Italiano
            "en" => "en-US-JennyNeural",      // Inglese US
            "fr" => "fr-FR-DeniseNeural",     // Francese
            "es" => "es-ES-ElviraNeural",     // Spagnolo
            "de" => "de-DE-KatjaNeural",      // Tedesco
            "zh" => "zh-CN-XiaoxiaoNeural",   // Cinese
            "ja" => "ja-JP-NanamiNeural",     // Giapponese
            "ru" => "ru-RU-SvetlanaNeural",   // Russo
            "pt" => "pt-BR-FranciscaNeural",  // Portoghese Brasiliano
            "ar" => "ar-SA-ZariyahNeural",    // Arabo
            _ => "en-US-JennyNeural"          // Default
        };
    }
}