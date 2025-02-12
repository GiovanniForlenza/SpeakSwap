from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import aiohttp
import uuid
import os
import json
from enum import Enum
from datetime import datetime
from fastapi.responses import FileResponse

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
        self.translated_text = None
        self.translated_audio = None
        self.error_message = None

conversations = {}

@app.post("/upload-audio")
async def upload_audio(file: UploadFile = File(...)):
    try:
        
        conversation_code = str(uuid.uuid4())[:8]
        
        
        file_path = f"audio_files/{conversation_code}.wav"
        os.makedirs("audio_files", exist_ok=True)
        
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        conversations[conversation_code] = Conversation(file_path)
        
        # Qui potresti avviare il processo di traduzione in background
        # Per ora simuliamo solo il cambio di stato
        conversations[conversation_code].status = ConversationStatus.PROCESSING
        
        return {
            "conversation_code": conversation_code,
            "status": conversations[conversation_code].status.value
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/conversation/{code}")
async def get_conversation(code: str):
    if code not in conversations:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    conversation = conversations[code]
    return {
        "status": conversation.status.value,
        "created_at": conversation.created_at.isoformat(),
        "translated_text": conversation.translated_text,
        "has_translated_audio": bool(conversation.translated_audio),
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