from fastapi import APIRouter
from datetime import datetime
import os
from services.function_service import call_speech_function

router = APIRouter(tags=["Test"])

@router.get("/test")
async def test_endpoint():
    """Endpoint di test per verificare che l'API sia funzionante"""
    return {"status": "API is working", "timestamp": datetime.now().isoformat()}

@router.get("/test-function")
async def test_function():
    """Endpoint di test per verificare che la function sia funzionante"""
    try:
        # Crea un semplice file audio di test
        test_file = "test_audio.wav"
        if not os.path.exists(test_file):
            # Se non esiste un file di test, usa il primo file disponibile nella cartella audio_files
            audio_files = os.listdir("audio_files") if os.path.exists("audio_files") else []
            if audio_files:
                test_file = os.path.join("audio_files", audio_files[0])
            else:
                return {"status": "error", "message": "Nessun file audio di test disponibile"}
        
        # Leggi il file audio
        with open(test_file, "rb") as f:
            audio_data = f.read()
        
        # Chiama la function
        result = await call_speech_function(audio_data, "it", ["en"])
        
        if result and result.get("success", False):
            return {
                "status": "function working",
                "message": "La function ha elaborato correttamente l'audio di test",
                "result": result
            }
        else:
            return {
                "status": "error",
                "message": "La function ha risposto ma con errori",
                "result": result
            }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Errore durante il test della function: {str(e)}"
        }