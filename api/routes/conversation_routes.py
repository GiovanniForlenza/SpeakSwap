from fastapi import APIRouter, HTTPException, Query
from models import conversations, ConversationStatus
from services.translation_service import translate_text
from services.speech_service import generate_audio_file
from utils.path_utils import get_translated_audio_path

router = APIRouter(tags=["Conversation"])

@router.get("/conversation/{code}")
async def get_conversation(code: str, target_language: str = Query("en")):
    """Restituisce i dettagli di una conversazione"""
    if code not in conversations:
        raise HTTPException(status_code=404, detail="Conversazione non trovata")
    
    conversation = conversations[code]
    
    # Se il target_language non è ancora tradotto ma la conversazione è completata,
    # prova a tradurre on-demand
    if (target_language not in conversation.translated_text and 
        conversation.status == ConversationStatus.COMPLETED and
        conversation.transcribed_text):
        try:
            # Traduci il testo nella lingua richiesta
            translated_text = await translate_text(
                conversation.transcribed_text,
                source_language=conversation.source_language,
                target_language=target_language
            )
            conversation.translated_text[target_language] = translated_text
            
            # Genera anche l'audio
            audio_path = get_translated_audio_path(code, target_language)
            
            await generate_audio_file(translated_text, audio_path, target_language)
            conversation.audio_files[target_language] = audio_path
        except Exception as e:
            print(f"Errore nella traduzione on-demand: {e}")
    
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