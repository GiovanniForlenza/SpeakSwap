import azure.functions as func
import logging
import json
import os
import tempfile
import azure.cognitiveservices.speech as speechsdk
from azure.cognitiveservices.speech import SpeechConfig, AudioConfig, SpeechSynthesizer
import asyncio

# Configurazione del logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("speech_translation_function")

# Mappa dei codici lingua supportati
LANGUAGE_MAP = {
    "it": "it-IT",
    "en": "en-US",
    "fr": "fr-FR",
    "es": "es-ES",
    "de": "de-DE",
    "zh": "zh-CN",
    "ja": "ja-JP",
    "ru": "ru-RU",
    "ar": "ar-SA",
    "pt": "pt-BR"
}

# Mappa delle voci TTS per le diverse lingue
TTS_VOICES = {
    "it": "it-IT-ElsaNeural",
    "en": "en-US-JennyNeural",
    "fr": "fr-FR-DeniseNeural",
    "es": "es-ES-ElviraNeural",
    "de": "de-DE-KatjaNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
    "ja": "ja-JP-NanamiNeural",
    "ru": "ru-RU-SvetlanaNeural",
    "ar": "ar-SA-ZariyahNeural",
    "pt": "pt-BR-FranciscaNeural"
}

# Funzione per la trascrizione dell'audio
async def transcribe_audio(audio_data, language="it"):
    """Trascrive l'audio in testo utilizzando Azure Speech Services"""
    speech_key = os.environ.get("SPEECH_KEY")
    speech_region = os.environ.get("SPEECH_REGION")
    
    if not speech_key or not speech_region:
        raise Exception("Chiavi Azure Speech non configurate")
    
    # Salva i dati audio in un file temporaneo
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
        temp_path = temp_file.name
        temp_file.write(audio_data)
    
    try:
        speech_config = speechsdk.SpeechConfig(
            subscription=speech_key, 
            region=speech_region
        )
        audio_config = speechsdk.audio.AudioConfig(filename=temp_path)
        
        # Imposta la lingua di riconoscimento
        speech_config.speech_recognition_language = LANGUAGE_MAP.get(language, "it-IT")
        
        recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config, 
            audio_config=audio_config
        )

        # Crea variabili per la gestione asincrona
        done = False
        transcript = []

        def handle_result(evt):
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                transcript.append(evt.result.text)
        
        def stop_cb(evt):
            nonlocal done
            done = True

        # Configura gli handler
        recognizer.recognized.connect(handle_result)
        recognizer.session_stopped.connect(stop_cb)
        recognizer.canceled.connect(stop_cb)

        # Avvia la trascrizione continua
        recognizer.start_continuous_recognition()
        while not done:
            await asyncio.sleep(0.5)
        
        recognizer.stop_continuous_recognition()
        return " ".join(transcript)
    finally:
        # Pulizia: rimuovi il file temporaneo
        try:
            os.unlink(temp_path)
        except:
            pass

# Funzione per la traduzione del testo
async def translate_text(text, source_language="it", target_language="en"):
    """Traduce il testo da una lingua all'altra utilizzando Azure Translator"""
    import aiohttp
    
    translator_key = os.environ.get("TRANSLATOR_KEY")
    translator_endpoint = os.environ.get("TRANSLATOR_ENDPOINT")
    
    if not translator_key or not translator_endpoint:
        raise Exception("Chiavi Azure Translator non configurate")
    
    # Controllo per evitare traduzioni nella stessa lingua
    if source_language == target_language:
        logger.info(f"Traduzione evitata: lingua sorgente e target identiche ({source_language})")
        return text

    headers = {
        "Ocp-Apim-Subscription-Key": translator_key,
        "Ocp-Apim-Subscription-Region": os.environ.get("TRANSLATOR_REGION", "italynorth"),
        "Content-Type": "application/json",
    }

    body = [{"text": text}]
    params = {
        "api-version": "3.0", 
        "from": LANGUAGE_MAP.get(source_language, "it-IT").split("-")[0],
        "to": LANGUAGE_MAP.get(target_language, "en-US").split("-")[0]
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{translator_endpoint}/translate",
            headers=headers,
            json=body,
            params=params
        ) as response:
            result = await response.json()
            return result[0]["translations"][0]["text"]

# Funzione per la generazione di audio
async def generate_audio(text, language="en"):
    """Genera un file audio da testo utilizzando Azure Speech Services"""
    speech_key = os.environ.get("SPEECH_KEY")
    speech_region = os.environ.get("SPEECH_REGION")
    
    if not speech_key or not speech_region:
        raise Exception("Chiavi Azure Speech non configurate")
    
    # Crea un file temporaneo per l'output audio
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
        output_path = temp_file.name
    
    try:
        speech_config = SpeechConfig(subscription=speech_key, region=speech_region)
        
        # Imposta la voce in base alla lingua
        voice_name = TTS_VOICES.get(language, TTS_VOICES["en"])
        speech_config.speech_synthesis_voice_name = voice_name
        
        # Formato audio ottimizzato per la qualità/dimensione
        speech_config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm
        )
        
        audio_config = AudioConfig(filename=output_path)
        synthesizer = SpeechSynthesizer(speech_config=speech_config, audio_config=audio_config)

        # Utilizziamo SSML per un maggiore controllo sulla velocità e l'intonazione
        ssml = f"""
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{language}">
            <voice name="{voice_name}">
                <prosody rate="1.1" pitch="+0%">{text}</prosody>
            </voice>
        </speak>
        """
        
        result = synthesizer.speak_ssml_async(ssml).get()
        if result.reason == speechsdk.ResultReason.Canceled:
            raise Exception(f"Errore durante la generazione dell'audio: {result.cancellation_details.reason}")

        # Leggi il file generato
        with open(output_path, "rb") as audio_file:
            audio_data = audio_file.read()
            
        return audio_data
    finally:
        # Pulizia: rimuovi il file temporaneo
        try:
            os.unlink(output_path)
        except:
            pass

async def process_speech(audio_data, source_language, target_languages):
    """Processo completo: audio -> testo -> traduzione -> audio tradotto"""
    results = {
        "source_language": source_language,
        "transcription": None,
        "translations": {}
    }
    
    try:
        # 1. Trascrizione audio -> testo
        logger.info(f"Trascrizione audio in lingua: {source_language}")
        transcription = await transcribe_audio(audio_data, source_language)
        
        if not transcription:
            logger.warning("Nessun testo riconosciuto nell'audio")
            return {
                "success": False,
                "error": "Nessun testo riconosciuto",
                "source_language": source_language
            }
        
        results["transcription"] = transcription
        logger.info(f"Testo trascritto: {transcription[:100]}...")
        
        # 2. Per ogni lingua target, traduzione e generazione audio
        for target_lang in target_languages:
            # Salta traduzione nella stessa lingua
            if target_lang == source_language:
                logger.info(f"Saltata traduzione in {target_lang} (stessa lingua del source)")
                continue
            
            # Traduzione
            logger.info(f"Traduzione da {source_language} a {target_lang}")
            translated_text = await translate_text(transcription, source_language, target_lang)
            
            if not translated_text:
                logger.warning(f"Traduzione in {target_lang} fallita")
                continue
            
            # Generazione audio
            logger.info(f"Generazione audio per traduzione in {target_lang}")
            audio_data = await generate_audio(translated_text, target_lang)
            
            # Salva risultati
            results["translations"][target_lang] = {
                "text": translated_text,
                "audio": audio_data.hex() if audio_data else None  # Converti in formato hex per JSON
            }
        
        return {
            "success": True,
            "results": results
        }
    except Exception as e:
        logger.error(f"Errore durante l'elaborazione: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": str(e),
            "source_language": source_language
        }

# Funzione principale che viene chiamata quando la function viene invocata
async def main(req: func.HttpRequest) -> func.HttpResponse:
    logger.info('Avvio elaborazione richiesta speech translation')
    
    try:
        # Estrai i parametri dalla richiesta
        req_body = req.get_body()
        
        if not req_body:
            return func.HttpResponse(
                json.dumps({"error": "Nessun dato audio fornito"}),
                mimetype="application/json",
                status_code=400
            )
        
        # Se i dati sono in formato JSON
        try:
            params = req.get_json()
            # Estrai audio dai parametri base64
            import base64
            audio_data = base64.b64decode(params.get("audio_data", ""))
            source_language = params.get("source_language", "it")
            target_languages = params.get("target_languages", ["en"])
        except:
            # Se non è JSON, è probabile che sia audio raw
            audio_data = req_body
            source_language = req.params.get("source_language", "it")
            target_languages_str = req.params.get("target_languages", "en")
            target_languages = target_languages_str.split(",")
        
        # Valida i parametri
        if not audio_data:
            return func.HttpResponse(
                json.dumps({"error": "Dati audio non validi"}),
                mimetype="application/json",
                status_code=400
            )
            
        # Elabora l'audio
        result = await process_speech(audio_data, source_language, target_languages)
        
        # Restituisci la risposta
        return func.HttpResponse(
            json.dumps(result),
            mimetype="application/json"
        )
    except Exception as e:
        logger.error(f"Errore nell'elaborazione della richiesta: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500
        )