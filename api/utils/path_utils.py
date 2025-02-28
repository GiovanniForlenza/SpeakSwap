import os

def ensure_dir(directory):
    """Crea una directory se non esiste"""
    os.makedirs(directory, exist_ok=True)

def get_audio_file_path(conversation_code):
    """Restituisce il percorso per un file audio originale"""
    directory = "audio_files"
    ensure_dir(directory)
    return f"{directory}/{conversation_code}.wav"

def get_translated_audio_path(conversation_code, language):
    """Restituisce il percorso per un file audio tradotto"""
    directory = f"translated_audio/{conversation_code}"
    ensure_dir(directory)
    return f"{directory}/{language}.wav"

def get_generated_audio_path(audio_id):
    """Restituisce il percorso per un file audio generato"""
    directory = "generated_audio"
    ensure_dir(directory)
    return f"{directory}/{audio_id}.wav"