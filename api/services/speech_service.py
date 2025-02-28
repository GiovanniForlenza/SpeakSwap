import os
import asyncio
import azure.cognitiveservices.speech as speechsdk
from azure.cognitiveservices.speech import SpeechConfig, AudioConfig, SpeechSynthesizer
from models import LANGUAGE_MAP, TTS_VOICES

async def transcribe_audio(file_path: str, language: str = "it") -> str:
    """Trascrive l'audio in testo utilizzando Azure Speech Services"""
    speech_key = os.getenv("SPEECH_KEY")
    speech_region = os.getenv("SPEECH_REGION")
    
    if not speech_key or not speech_region:
        raise Exception("Chiavi Azure Speech non configurate")

    speech_config = speechsdk.SpeechConfig(
        subscription=speech_key, 
        region=speech_region
    )
    audio_config = speechsdk.audio.AudioConfig(filename=file_path)
    
    # Imposta la lingua di riconoscimento
    speech_config.speech_recognition_language = LANGUAGE_MAP.get(language, "it-IT")
    
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

async def generate_audio_file(text: str, output_path: str, language: str = "en") -> str:
    """Genera un file audio da testo utilizzando Azure Speech Services"""
    speech_key = os.getenv("SPEECH_KEY")
    speech_region = os.getenv("SPEECH_REGION")
    
    if not speech_key or not speech_region:
        raise Exception("Chiavi Azure Speech non configurate")

    speech_config = SpeechConfig(subscription=speech_key, region=speech_region)
    
    # Imposta la voce in base alla lingua
    voice_name = TTS_VOICES.get(language, TTS_VOICES["en"])
    speech_config.speech_synthesis_voice_name = voice_name
    
    # Formato audio ottimizzato per la qualità/dimensione
    speech_config.set_speech_synthesis_output_format(
        speechsdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm
    )
    
    audio_config = AudioConfig(filename=output_path)
    synthesizer = SpeechSynthesizer(speech_config=speech_config, audio_config=audio_config)

    # Utilizziamo SSML per un maggiore controllo sulla velocità e l'intonazione
    ssml = f"""
    <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{language}">
        <voice name="{voice_name}">
            <prosody rate="1.1" pitch="+0%">{text}</prosody>
        </voice>
    </speak>
    """
    
    result = synthesizer.speak_ssml_async(ssml).get()
    if result.reason == speechsdk.ResultReason.Canceled:
        raise Exception(f"Errore durante la generazione dell'audio: {result.cancellation_details.reason}")

    return output_path