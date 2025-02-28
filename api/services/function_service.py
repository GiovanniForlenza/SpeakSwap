import os
import base64
import aiohttp

# Configura l'URL della function
FUNCTION_URL = os.getenv("SPEECH_FUNCTION_URL", "http://localhost:7071/api/speakswap_trigger")
FUNCTION_KEY = os.getenv("SPEECH_FUNCTION_KEY", "")  # Chiave di autenticazione se necessaria

async def call_speech_function(audio_data, source_language, target_languages):
    """Chiama la Function Azure per elaborare l'audio"""
    headers = {}
    if FUNCTION_KEY:
        headers["x-functions-key"] = FUNCTION_KEY
    
    # Prepara i dati per l'invio
    payload = {
        "audio_data": base64.b64encode(audio_data).decode("utf-8"),
        "source_language": source_language,
        "target_languages": target_languages
    }
    
    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(FUNCTION_URL, json=payload, headers=headers) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Errore nella funzione: {response.status}, {error_text}")
                
                return await response.json()
        except Exception as e:
            print(f"Errore durante la chiamata alla funzione: {e}")
            # Fallback alle funzioni locali se la chiamata alla funzione fallisce
            return None