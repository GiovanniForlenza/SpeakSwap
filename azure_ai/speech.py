import azure.cognitiveservices.speech as speechsdk
import os
import time
from dotenv import load_dotenv
load_dotenv()

def from_file_continuous(audio_path):
    speech_key = os.getenv("SPEECH_KEY")
    speech_region = os.getenv("SPEECH_REGION")

    speech_config = speechsdk.SpeechConfig(subscription=speech_key, region=speech_region)
    audio_config = speechsdk.audio.AudioConfig(filename=audio_path)
    speech_config.speech_recognition_language = "it-IT"
    
    recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)

    done = False
    transcript = []

    def stop_cb(evt):
        """Callback per segnalare la fine della trascrizione"""
        nonlocal done
        done = True

    def recognized_cb(evt):
        """Callback per raccogliere i segmenti di testo"""
        if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
            transcript.append(evt.result.text)

    recognizer.recognized.connect(recognized_cb)
    recognizer.session_stopped.connect(stop_cb)
    recognizer.canceled.connect(stop_cb)

    recognizer.start_continuous_recognition()

    while not done:
        time.sleep(0.5)  # Aspetta la fine della trascrizione

    recognizer.stop_continuous_recognition()
    return " ".join(transcript)

# Esempio di utilizzo
testo = from_file_continuous("/workspaces/SpeakSwap/recordings/audio_558033906918490113_1739523418.wav")
print("Testo trascritto:", testo)

# audio_to_text("/workspaces/SpeakSwap/recordings/audio_convertito.wav")
# audio_to_text("/workspaces/SpeakSwap/recordings/audio_558033906918490113_1739523418.wav")