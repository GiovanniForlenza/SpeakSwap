from models import conversations, ConversationStatus
from services.speech_service import transcribe_audio, generate_audio_file
from services.translation_service import translate_text
from services.function_service import call_speech_function
from utils.path_utils import get_translated_audio_path
import os

async def process_audio(conversation_code: str, target_language: str = None):
    """Elabora l'audio in background utilizzando la function o il metodo locale"""
    try:
        conversation = conversations[conversation_code]
        conversation.status = ConversationStatus.PROCESSING
        
        # Leggi il file audio
        with open(conversation.original_file, "rb") as f:
            audio_data = f.read()
        
        # Imposta le lingue target
        if target_language is None:
            target_languages = [lang for lang in ["it", "en", "fr", "es", "de", "zh", "ja", "ru", "ar", "pt"] 
                              if lang != conversation.source_language]
        else:
            target_languages = [target_language]
        
        # Prova a usare la function
        function_result = await call_speech_function(audio_data, conversation.source_language, target_languages)
        
        if function_result and function_result.get("success", False):
            # La function ha elaborato con successo l'audio
            results = function_result.get("results", {})
            
            # Salva la trascrizione
            conversation.transcribed_text = results.get("transcription")
            
            # Salva le traduzioni e gli audio
            for lang, translation_data in results.get("translations", {}).items():
                # Salva la traduzione
                conversation.translated_text[lang] = translation_data.get("text")
                
                # Salva l'audio se presente
                audio_hex = translation_data.get("audio")
                if audio_hex:
                    audio_data = bytes.fromhex(audio_hex)
                    audio_path = get_translated_audio_path(conversation_code, lang)
                    
                    with open(audio_path, "wb") as f:
                        f.write(audio_data)
                    
                    conversation.audio_files[lang] = audio_path
            
            conversation.status = ConversationStatus.COMPLETED
        else:
            # Fallback al metodo precedente se la function non ha funzionato
            print("Function fallita, utilizzo metodo locale...")
            
            # Trascrizione
            text = await transcribe_audio(conversation.original_file, conversation.source_language)
            if text:
                conversation.transcribed_text = text
                conversation.status = ConversationStatus.TRANSLATING
                
                # Traduci in tutte le lingue target richieste
                for lang in target_languages:
                    # Salta la lingua di origine
                    if lang == conversation.source_language:
                        continue
                        
                    # Traduzione
                    translated_text = await translate_text(
                        text, 
                        source_language=conversation.source_language,
                        target_language=lang
                    )
                    conversation.translated_text[lang] = translated_text
                    
                    # Genera audio tradotto
                    audio_path = get_translated_audio_path(conversation_code, lang)
                    
                    await generate_audio_file(translated_text, audio_path, lang)
                    conversation.audio_files[lang] = audio_path
                
                conversation.status = ConversationStatus.COMPLETED
            else:
                conversation.status = ConversationStatus.ERROR
                conversation.error_message = "Nessun testo riconosciuto"
    except Exception as e:
        print(f"Errore durante l'elaborazione dell'audio: {e}")
        conversation.status = ConversationStatus.ERROR
        conversation.error_message = str(e)