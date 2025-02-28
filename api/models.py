from enum import Enum
from datetime import datetime
from pydantic import BaseModel

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

# Dizionario globale per memorizzare le conversazioni
conversations = {}