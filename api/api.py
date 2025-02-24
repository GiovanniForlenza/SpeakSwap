from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import azure.cognitiveservices.speech as speechsdk
import aiohttp
import uuid
import os
import json
import asyncio
from enum import Enum
from datetime import datetime
from fastapi.responses import FileResponse
from dotenv import load_dotenv

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


async def transcribe_audio(file_path: str) -> str:
    speech_key = os.getenv("SPEECH_KEY")
    speech_region = os.getenv("SPEECH_REGION")
    
    if not speech_key or not speech_region:
        raise Exception("Chiavi Azure Speech non configurate")

    speech_config = speechsdk.SpeechConfig(
        subscription=speech_key, 
        region=speech_region
    )
    audio_config = speechsdk.audio.AudioConfig(filename=file_path)
    speech_config.speech_recognition_language = "it-IT"
    
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

class ConversationStatus(Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    TRANSLATING = "translating"
    COMPLETED = "completed"
    ERROR = "error"

class Conversation:
    def __init__(self, original_file: str):
        self.original_file = original_file
        self.status = ConversationStatus.UPLOADED
        self.created_at = datetime.now()
        self.transcribed_text = None
        self.error_message = None

conversations = {}

async def process_audio(conversation_code: str):
    try:
        conversation = conversations[conversation_code]
        conversation.status = ConversationStatus.PROCESSING
        
        # Esegui la trascrizione
        text = await transcribe_audio(conversation.original_file)
        
        if text:
            conversation.transcribed_text = text
            conversation.status = ConversationStatus.COMPLETED
        else:
            conversation.status = ConversationStatus.ERROR
            conversation.error_message = "Nessun testo riconosciuto"
            
    except Exception as e:
        conversation.status = ConversationStatus.ERROR
        conversation.error_message = str(e)

@app.post("/upload-audio")
async def upload_audio(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    try:
        conversation_code = str(uuid.uuid4())[:8]
        file_path = f"audio_files/{conversation_code}.wav"
        os.makedirs("audio_files", exist_ok=True)
        
        # Salva il file
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Crea la conversazione
        conversations[conversation_code] = Conversation(file_path)
        
        # Avvia il processo in background
        background_tasks.add_task(process_audio, conversation_code)
        
        return {
            "conversation_code": conversation_code,
            "status": conversations[conversation_code].status.value
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/conversation/{code}")
async def get_conversation(code: str):
    if code not in conversations:
        raise HTTPException(status_code=404, detail="Conversazione non trovata")
    
    conversation = conversations[code]
    return {
        "status": conversation.status.value,
        "created_at": conversation.created_at.isoformat(),
        "transcribed_text": conversation.transcribed_text,
        "error_message": conversation.error_message,
        "original_file": os.path.basename(conversation.original_file)
    }

@app.get("/audio/{code}")
async def get_audio(code: str):
    if code not in conversations:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    conversation = conversations[code]
    return FileResponse(conversation.original_file, media_type="audio/wav")

@app.get("/test")
async def test_endpoint():
    return {"status": "API is working"}