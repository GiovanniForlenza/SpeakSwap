from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Form, Query
from fastapi.responses import FileResponse, JSONResponse
import uuid
import os

from models import conversations, Conversation, AudioRequestModel, LANGUAGE_MAP
from utils.path_utils import get_audio_file_path, get_generated_audio_path, get_translated_audio_path
from services.audio_processing import process_audio
from services.speech_service import generate_audio_file
from services.translation_service import translate_text

router = APIRouter(tags=["Audio"])

@router.post("/upload-audio")
async def upload_audio(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...),
    source_language: str = Form("it"),
    target_language: str = Form(None)  # Rendi opzionale
):
    """Carica un file audio per la trascrizione e traduzione"""
    try:
        conversation_code = str(uuid.uuid4())[:8]
        file_path = get_audio_file_path(conversation_code)
        
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

@router.post("/generate-audio")
async def generate_audio(request: AudioRequestModel):
    """Genera un file audio da testo"""
    try:
        # Crea un ID univoco per il file audio
        audio_id = str(uuid.uuid4())[:8]
        output_path = get_generated_audio_path(audio_id)
        
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

@router.get("/audio/{code}")
async def get_audio(code: str):
    """Restituisce il file audio originale"""
    if code not in conversations:
        raise HTTPException(status_code=404, detail="Conversazione non trovata")
    
    conversation = conversations[code]
    return FileResponse(conversation.original_file, media_type="audio/wav")

@router.get("/audio-file/{audio_id}")
async def get_audio_file(audio_id: str):
    """Restituisce un file audio generato"""
    file_path = get_generated_audio_path(audio_id)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File audio non trovato")
    
    return FileResponse(file_path, media_type="audio/wav")

@router.get("/translated-audio/{code}")
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
                audio_path = get_translated_audio_path(code, target_language)
                
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

@router.get("/supported-languages")
async def get_supported_languages():
    """Restituisce l'elenco delle lingue supportate"""
    return {
        "languages": [
            {"code": code, "name": LANGUAGE_MAP[code]} 
            for code in LANGUAGE_MAP
        ]
    }