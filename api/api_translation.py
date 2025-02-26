from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Form, Query
from fastapi.middleware.cors import CORSMiddleware
import azure.cognitiveservices.speech as speechsdk
import aiohttp
import uuid
import os
import json
import asyncio
from enum import Enum
from datetime import datetime
from pydantic import BaseModel
from fastapi.responses import FileResponse, JSONResponse
from dotenv import load_dotenv
from azure.cognitiveservices.speech import SpeechConfig, AudioConfig, SpeechSynthesizer
import tempfile

load_dotenv()
app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Welcome to SpeakSwap API"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

async def translate_text(text: str, source_language: str = "it", target_language: str = "en") -> str:
    """Traduce il testo da una lingua all'altra utilizzando Azure Translator"""
    translator_key = os.getenv("TRANSLATOR_KEY")
    translator_endpoint = os.getenv("TRANSLATOR_ENDPOINT")
    
    if not translator_key or not translator_endpoint:
        raise Exception("Chiavi Azure Translator non configurate")

    headers = {
        "Ocp-Apim-Subscription-Key": translator_key,
        "Ocp-Apim-Subscription-Region": "italynorth",
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

async def transcribe_audio(file_path: str, language: str = "it") -> str:
    """Trascrive l'audio in testo utilizzando Azure Speech Services"""
    speech_key = os.getenv("SPEECH_KEY")
    speech_region = os.getenv("SPEECH_REGION")
    
    if not speech_key or not speech_region:
        raise Exception("Chiavi Azure Speech non configurate")

    speech_config = speechsdk.SpeechConfig(
        subscription=speech_key, 
        region=speech_region
    )
    audio_config = speechsdk.audio.AudioConfig(filename=file_path)
    
    # Imposta la lingua di riconoscimento
    speech_config.speech_recognition_language = LANGUAGE_MAP.get(language, "it-IT")
    
    recognizer = speechsdk.SpeechRecognizer(
        speech_config=speech_config, 
        audio_config=audio_config
    )

    done = False
    transcript = []

    def handle_result(evt):
        if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
            transcript.append(evt.result.text)
    
    def stop_cb(evt):
        nonlocal done
        done = True

    recognizer.recognized.connect(handle_result)
    recognizer.session_stopped.connect(stop_cb)
    recognizer.canceled.connect(stop_cb)

    recognizer.start_continuous_recognition()
    while not done:
        await asyncio.sleep(0.5)
    
    recognizer.stop_continuous_recognition()
    return " ".join(transcript)

async def generate_audio_file(text: str, output_path: str, language: str = "en") -> str:
    """Genera un file audio da testo utilizzando Azure Speech Services"""
    speech_key = os.getenv("SPEECH_KEY")
    speech_region = os.getenv("SPEECH_REGION")
    
    if not speech_key or not speech_region:
        raise Exception("Chiavi Azure Speech non configurate")

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

    return output_path

class ConversationStatus(Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    TRANSLATING = "translating"
    COMPLETED = "completed"
    ERROR = "error"

class AudioRequestModel(BaseModel):
    text: str
    target_language: str = "en"

class Conversation:
    def __init__(self, original_file: str, source_language: str = "it"):
        self.original_file = original_file
        self.source_language = source_language
        self.status = ConversationStatus.UPLOADED
        self.created_at = datetime.now()
        self.transcribed_text = None
        self.translated_text = {}  # Dizionario per memorizzare traduzioni in diverse lingue
        self.error_message = None
        self.audio_files = {}  # Dizionario per memorizzare i percorsi dei file audio tradotti

conversations = {}

async def process_audio(conversation_code: str, target_language: str = "en"):
    """Elabora l'audio in background: trascrive, traduce e genera audio tradotto"""
    try:
        conversation = conversations[conversation_code]
        conversation.status = ConversationStatus.PROCESSING
        
        # Trascrizione
        text = await transcribe_audio(conversation.original_file, conversation.source_language)
        if text:
            conversation.transcribed_text = text
            conversation.status = ConversationStatus.TRANSLATING
            
            # Traduzione
            translated_text = await translate_text(
                text, 
                source_language=conversation.source_language,
                target_language=target_language
            )
            conversation.translated_text[target_language] = translated_text
            
            # Genera audio tradotto
            audio_path = f"translated_audio/{conversation_code}_{target_language}.wav"
            os.makedirs("translated_audio", exist_ok=True)
            
            await generate_audio_file(translated_text, audio_path, target_language)
            conversation.audio_files[target_language] = audio_path
            
            conversation.status = ConversationStatus.COMPLETED
        else:
            conversation.status = ConversationStatus.ERROR
            conversation.error_message = "Nessun testo riconosciuto"
            
    except Exception as e:
        conversation.status = ConversationStatus.ERROR
        conversation.error_message = str(e)

@app.post("/upload-audio")
async def upload_audio(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...),
    source_language: str = Form("it"),
    target_language: str = Form("en")
):
    """Carica un file audio per la trascrizione e traduzione"""
    try:
        conversation_code = str(uuid.uuid4())[:8]
        file_path = f"audio_files/{conversation_code}.wav"
        os.makedirs("audio_files", exist_ok=True)
        
        # Salva il file
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Verifica che la lingua di origine sia supportata
        if source_language not in LANGUAGE_MAP:
            return JSONResponse(
                status_code=400,
                content={"error": f"Lingua di origine non supportata. Lingue disponibili: {', '.join(LANGUAGE_MAP.keys())}"}
            )
        
        # Crea la conversazione
        conversations[conversation_code] = Conversation(file_path, source_language)
        
        # Avvia il processo in background
        background_tasks.add_task(process_audio, conversation_code, target_language)
        
        return {
            "conversation_code": conversation_code,
            "status": conversations[conversation_code].status.value,
            "source_language": source_language,
            "target_language": target_language
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-audio")
async def generate_audio(request: AudioRequestModel):
    """Genera un file audio da testo"""
    try:
        # Crea un ID univoco per il file audio
        audio_id = str(uuid.uuid4())[:8]
        output_path = f"generated_audio/{audio_id}.wav"
        os.makedirs("generated_audio", exist_ok=True)
        
        # Genera il file audio
        await generate_audio_file(request.text, output_path, request.target_language)
        
        # Restituisci l'URL del file audio
        base_url = os.getenv("BASE_URL", "http://localhost:8000")
        audio_url = f"{base_url}/audio-file/{audio_id}"
        
        return {
            "audio_id": audio_id,
            "audio_url": audio_url,
            "text": request.text,
            "language": request.target_language
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/conversation/{code}")
async def get_conversation(code: str, target_language: str = Query("en")):
    """Restituisce i dettagli di una conversazione"""
    if code not in conversations:
        raise HTTPException(status_code=404, detail="Conversazione non trovata")
    
    conversation = conversations[code]
    translated_text = conversation.translated_text.get(target_language)
    
    return {
        "status": conversation.status.value,
        "created_at": conversation.created_at.isoformat(),
        "transcribed_text": conversation.transcribed_text,
        "translated_text": translated_text,
        "error_message": conversation.error_message,
        "source_language": conversation.source_language,
        "audio_file": conversation.audio_files.get(target_language)
    }

@app.get("/audio/{code}")
async def get_audio(code: str):
    """Restituisce il file audio originale"""
    if code not in conversations:
        raise HTTPException(status_code=404, detail="Conversazione non trovata")
    
    conversation = conversations[code]
    return FileResponse(conversation.original_file, media_type="audio/wav")

@app.get("/audio-file/{audio_id}")
async def get_audio_file(audio_id: str):
    """Restituisce un file audio generato"""
    file_path = f"generated_audio/{audio_id}.wav"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File audio non trovato")
    
    return FileResponse(file_path, media_type="audio/wav")

@app.get("/translated-audio/{code}")
async def get_translated_audio(code: str, target_language: str = Query("en")):
    """Restituisce l'audio tradotto"""
    if code not in conversations:
        raise HTTPException(status_code=404, detail="Conversazione non trovata")
    
    conversation = conversations[code]
    audio_path = conversation.audio_files.get(target_language)
    
    if not audio_path or not os.path.exists(audio_path):
        # Se l'audio tradotto non esiste ancora, genera l'audio dalla traduzione esistente
        if target_language in conversation.translated_text:
            try:
                audio_path = f"translated_audio/{code}_{target_language}.wav"
                os.makedirs("translated_audio", exist_ok=True)
                
                await generate_audio_file(
                    conversation.translated_text[target_language],
                    audio_path,
                    target_language
                )
                
                conversation.audio_files[target_language] = audio_path
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Errore durante la generazione dell'audio: {str(e)}")
        else:
            raise HTTPException(status_code=404, detail="Traduzione audio non disponibile")
    
    return FileResponse(audio_path, media_type="audio/wav")

@app.get("/supported-languages")
async def get_supported_languages():
    """Restituisce l'elenco delle lingue supportate"""
    return {
        "languages": [
            {"code": code, "name": LANGUAGE_MAP[code]} 
            for code in LANGUAGE_MAP
        ]
    }

@app.get("/test")
async def test_endpoint():
    """Endpoint di test per verificare che l'API sia funzionante"""
    return {"status": "API is working", "timestamp": datetime.now().isoformat()}