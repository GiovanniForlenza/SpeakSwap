import wave
import discord
from discord.ext import commands
import numpy as np
import asyncio
import time
import os
import aiohttp
from datetime import datetime
import threading
import queue
from dotenv import load_dotenv


load_dotenv()
TOKEN = os.getenv('DISCORD_TOKEN')


user_languages = {}
active_users = {}

class PlaybackSourceTracker(discord.PCMVolumeTransformer):
    def __init__(self, source, ctx):
        super().__init__(source, volume=1.0)
        self.ctx = ctx
        self.completed = False
        
    def cleanup(self):
        self.completed = True
        super().cleanup()
        print("DEBUG: Pulizia risorse audio completata")

class RealTimeTranslationSink(discord.sinks.WaveSink):
    def __init__(self, ctx):
        super().__init__()
        self.audio_data = {}
        self.last_speech = {}
        self.silence_threshold = 0.015  # Soglia di rilevamento del silenzio
        self.silence_duration = 0.8  # Durata del silenzio per considerare finito il discorso (secondi)
        self.min_speech_duration = 0.5  # Durata minima per considerare un input valido (secondi)
        self.format = {
            'channels': 2,
            'sample_width': 2,
            'sample_rate': 48000,
        }
        self.is_processing = {}
        self.processing_start_time = {}  # Per tenere traccia di quando è iniziata l'elaborazione
        self.ctx = ctx
        self.speech_start_time = {}
        self.last_user_speaking = None
        
        self.speech_queue = queue.Queue()
        self.active_users = {}  # Aggiunto per garantire l'inizializzazione
        self.user_languages = {}  # Aggiunto per garantire l'inizializzazione
        
        self.processing_task = None
        asyncio.create_task(self.start_processing_loop())
    
    async def start_processing_loop(self):
        """Avvia il loop asincrono per elaborare l'audio"""
        print("DEBUG: Loop di elaborazione avviato")
        while True:
            try:
                if not self.speech_queue.empty():
                    user_id, speech_data = self.speech_queue.get()
                    print(f"DEBUG: Elaborazione audio per utente {user_id}, {len(speech_data)} pacchetti")
                    if user_id and speech_data:
                        # Esegui l'elaborazione in un task separato per evitare blocchi
                        # del loop principale
                        task = asyncio.create_task(self.process_speech(user_id, speech_data))
                        
                        # Se l'elaborazione fallisce, assicurati che lo stato venga resettato
                        def handle_completion(future):
                            try:
                                future.result()
                            except Exception as e:
                                print(f"ERRORE nel task di elaborazione: {e}")
                                # Resetta lo stato di elaborazione in caso di errore
                                if hasattr(self, "is_processing") and user_id in self.is_processing:
                                    self.is_processing[user_id] = False
                                    print(f"DEBUG: Reset dello stato di elaborazione per {user_id} dopo errore")
                        
                        task.add_done_callback(handle_completion)
                    else:
                        print(f"DEBUG: Dati non validi nella coda: user_id={user_id}, speech_data={bool(speech_data)}")
                    self.speech_queue.task_done()
                
                await asyncio.sleep(0.1)
            except Exception as e:
                print(f"ERRORE nel loop di elaborazione: {e}")
                import traceback
                print(traceback.format_exc())
                # Breve pausa per evitare loop di errori rapidi
                await asyncio.sleep(1)
    
    def write(self, data, user_id):
        """Chiamato quando viene ricevuto nuovo audio"""
        # Converti l'user_id in stringa per uniformità
        user_id = str(user_id)
        
        if not hasattr(self, "audio_data") or not hasattr(self, "last_speech"):
            print(f"DEBUG: Inizializzazione strutture dati per utente {user_id}")
            self.audio_data = {}
            self.last_speech = {}
            self.is_processing = {}
            self.speech_start_time = {}
        
        # Verifica se l'utente è attivo
        if not hasattr(self, "active_users"):
            print(f"DEBUG: active_users non esiste, inizializzazione")
            self.active_users = {}
        
        if user_id not in self.active_users:
            print(f"DEBUG: Utente {user_id} non è nella lista degli utenti attivi")
            return
        
        if not self.active_users.get(user_id, False):
            print(f"DEBUG: Utente {user_id} non è attivo")
            return
        
        # Inizializza strutture dati per l'utente se non esistono
        if user_id not in self.audio_data:
            print(f"DEBUG: Primo audio ricevuto da utente {user_id}")
            self.audio_data[user_id] = []
            self.last_speech[user_id] = time.time()
            self.is_processing[user_id] = False
            self.speech_start_time[user_id] = time.time()
        
        # Elabora l'audio
        audio_array = np.frombuffer(data, dtype=np.int16)
        volume = np.abs(audio_array).mean() / 32768.0
        
        # Log del volume ogni 50 pacchetti audio per non riempire il log
        if len(self.audio_data[user_id]) % 50 == 0:
            print(f"DEBUG: Volume audio utente {user_id}: {volume:.4f} (threshold: {self.silence_threshold:.4f})")
        
        if volume > self.silence_threshold:
            self.last_speech[user_id] = time.time()
            if not self.audio_data[user_id]:
                self.speech_start_time[user_id] = time.time()
            self.last_user_speaking = user_id
        
        self.audio_data[user_id].append(data)
        
        # Verifica se l'utente ha finito di parlare
        current_time = time.time()
        speech_duration = current_time - self.speech_start_time.get(user_id, current_time)
        silence_time = current_time - self.last_speech[user_id]
        
        # Verifica se è in corso l'elaborazione per l'utente
        if self.is_processing.get(user_id, False):
            # Se è in elaborazione da più di 10 secondi, resettiamo lo stato
            # Questo evita blocchi se qualcosa è andato storto
            processing_time = current_time - getattr(self, "processing_start_time", {}).get(user_id, current_time)
            if processing_time > 10.0:  # 10 secondi è un timeout ragionevole
                print(f"DEBUG: Timeout elaborazione per utente {user_id}, resetto lo stato")
                self.is_processing[user_id] = False
        
        if (silence_time > self.silence_duration and 
            len(self.audio_data[user_id]) > 0 and 
            not self.is_processing.get(user_id, False) and
            speech_duration > self.min_speech_duration):
            
            print(f"DEBUG: Utente {user_id} ha finito di parlare. Silenzio: {silence_time:.2f}s, Durata: {speech_duration:.2f}s, Pacchetti: {len(self.audio_data[user_id])}")
            
            self.is_processing[user_id] = True
            
            # Salva l'orario di inizio elaborazione per controllo timeout
            if not hasattr(self, "processing_start_time"):
                self.processing_start_time = {}
            self.processing_start_time[user_id] = current_time
            
            # Copia i dati audio per l'elaborazione
            speech_data = self.audio_data[user_id].copy()
            self.audio_data[user_id] = []  # Resetta i dati audio per questo utente
            
            # Aggiungi alla coda per l'elaborazione asincrona
            self.speech_queue.put((user_id, speech_data))
            print(f"DEBUG: Audio messo in coda per l'elaborazione. Dimensione coda: {self.speech_queue.qsize()}")
    
    async def process_speech(self, user_id, speech_data):
        """Elabora il discorso: salva in file, trascrive, traduce e riproduce"""
        success = False
        try:
            # Salva in un file temporaneo
            temp_path = f"./temp/speech_{user_id}_{int(datetime.now().timestamp())}.wav"
            os.makedirs("./temp", exist_ok=True)
            
            with wave.open(temp_path, 'wb') as f:
                f.setnchannels(self.format['channels'])
                f.setsampwidth(self.format['sample_width'])
                f.setframerate(self.format['sample_rate'])
                f.writeframes(b''.join(speech_data))
            
            print(f"DEBUG: File audio salvato in {temp_path}")
            
            # Ottieni la lingua dell'utente che sta parlando
            source_language = self.user_languages.get(str(user_id), "it")  # Default a italiano
            
            # Determina le altre lingue di destinazione basandosi sugli altri utenti attivi
            target_languages = set()
            for active_id, active in self.active_users.items():
                if active and str(active_id) != str(user_id):  # Solo altri utenti attivi
                    target_lang = self.user_languages.get(str(active_id), "en")
                    if target_lang != source_language:  # Non tradurre nella stessa lingua
                        target_languages.add(target_lang)
            
            if not target_languages:
                target_languages = {"en"}  # Default a inglese se nessun'altra lingua è impostata
            
            print(f"DEBUG: Lingua sorgente: {source_language}, Lingue target: {target_languages}")
            
            user_name = self.ctx.guild.get_member(int(user_id)).display_name
            await self.ctx.send(f"🎤 {user_name} sta parlando in {source_language}. Traduzione in corso...", delete_after=5)
            
            # Invia per la trascrizione e ottieni il codice conversazione
            conversation_code = await self.send_to_webapp(temp_path, source_language)
            if not conversation_code:
                print("DEBUG: Nessun codice conversazione ottenuto, interrompo elaborazione")
                return
                
            print(f"DEBUG: Ottenuto codice conversazione: {conversation_code}")
            
            # Elabora ogni lingua target separatamente
            for target_lang in target_languages:
                print(f"DEBUG: Elaborazione traduzione per lingua: {target_lang}")
                # Attendi che la traduzione sia completata e riproducila
                translated_text = await self.wait_and_play_translation(conversation_code, target_lang)
                if translated_text:
                    print(f"DEBUG: Traduzione completata in {target_lang}: {translated_text[:30]}...")
                    # Trova gli utenti che utilizzano questa lingua
                    for u_id, lang in self.user_languages.items():
                        if lang == target_lang and str(u_id) in self.active_users:
                            member = self.ctx.guild.get_member(int(u_id))
                            if member:
                                await self.ctx.send(f"🔊 **Per {member.display_name}** ({target_lang}): {translated_text}", delete_after=10)
                else:
                    print(f"DEBUG: Nessuna traduzione ottenuta per {target_lang}")
            
            success = True
        except Exception as e:
            print(f"ERRORE durante l'elaborazione del discorso: {e}")
            import traceback
            print(traceback.format_exc())
        finally:
            # IMPORTANTE: Assicurati sempre di resettare lo stato di elaborazione
            # Anche in caso di errore, per permettere future elaborazioni
            self.is_processing[user_id] = False
            print(f"DEBUG: Elaborazione completata per utente {user_id}, success={success}")
    
    async def send_to_webapp(self, audio_file_path, source_language="it"):
        """Invia il file audio alla webapp e restituisce il codice conversazione"""
        print(f"DEBUG: Invio file audio alla webapp: {audio_file_path}, lingua: {source_language}")
        try:
            async with aiohttp.ClientSession() as session:
                with open(audio_file_path, 'rb') as f:
                    form_data = aiohttp.FormData()
                    form_data.add_field('file',
                                    f,
                                    filename=os.path.basename(audio_file_path),
                                    content_type='audio/wav')
                    form_data.add_field('source_language', source_language)
                    
                    # Non specifichiamo target_language qui perché lo gestiremo nelle chiamate successive
                    
                    print(f"DEBUG: Effettuo POST a http://localhost:8000/upload-audio")
                    async with session.post('http://localhost:8000/upload-audio', data=form_data) as response:
                        if response.status != 200:
                            error_text = await response.text()
                            print(f"ERRORE API: Status {response.status}, {error_text}")
                            return None
                            
                        result = await response.json()
                        print(f"DEBUG: Risposta API: {result}")
                        return result['conversation_code']
        except Exception as e:
            print(f"ERRORE durante l'invio del file audio: {e}")
            import traceback
            print(traceback.format_exc())
            return None
    
    async def wait_and_play_translation(self, conversation_code, target_language):
        """Attende che la traduzione sia completata e riproduce l'audio risultante"""
        # Attendi che la traduzione sia completata
        print(f"DEBUG: Attesa traduzione per codice {conversation_code}, lingua: {target_language}")
        try:
            async with aiohttp.ClientSession() as session:
                attempts = 0
                max_attempts = 20  # Limita i tentativi per evitare loop infiniti
                
                while attempts < max_attempts:
                    # Specifica esplicitamente la lingua target nella richiesta
                    url = f"http://localhost:8000/conversation/{conversation_code}?target_language={target_language}"
                    print(f"DEBUG: GET {url}, tentativo {attempts+1}/{max_attempts}")
                    
                    async with session.get(url) as response:
                        if response.status == 200:
                            result = await response.json()
                            print(f"DEBUG: Stato conversazione: {result['status']}")
                            
                            if result['status'] == 'completed':
                                # Ottieni il testo tradotto
                                translated_text = result.get('translated_text')
                                if not translated_text:
                                    print(f"DEBUG: Testo tradotto non disponibile per lingua: {target_language}")
                                    break
                                
                                print(f"DEBUG: Testo tradotto: {translated_text[:30]}...")
                                    
                                # Genera audio nella lingua di destinazione
                                audio_path = f"./temp/translated_{conversation_code}_{target_language}.wav"
                                try:
                                    # Genera l'audio tradotto
                                    data = {
                                        "text": translated_text,
                                        "target_language": target_language
                                    }
                                    
                                    print(f"DEBUG: Richiesta generazione audio")
                                    async with session.post(f"http://localhost:8000/generate-audio", json=data) as audio_response:
                                        if audio_response.status == 200:
                                            audio_result = await audio_response.json()
                                            audio_url = audio_result.get('audio_url')
                                            
                                            print(f"DEBUG: Audio generato, URL: {audio_url}")
                                            
                                            # Scarica il file audio
                                            async with session.get(audio_url) as audio_download:
                                                if audio_download.status == 200:
                                                    with open(audio_path, 'wb') as f:
                                                        content = await audio_download.read()
                                                        f.write(content)
                                                        print(f"DEBUG: File audio scaricato: {audio_path}, dimensione: {len(content)} bytes")
                                                else:
                                                    print(f"ERRORE: Impossibile scaricare il file audio, status: {audio_download.status}")
                                        else:
                                            print(f"ERRORE: Generazione audio fallita, status: {audio_response.status}")
                                            error_text = await audio_response.text()
                                            print(f"ERRORE API: {error_text}")
                                    
                                    # Riproduci l'audio tradotto nel canale vocale
                                    voice_client = self.ctx.voice_client
                                    if voice_client and voice_client.is_connected():
                                        if voice_client.is_playing():
                                            print(f"DEBUG: Interruzione audio precedente")
                                            voice_client.stop()
                                        
                                        print(f"DEBUG: Riproduzione audio: {audio_path}")
                                        source = discord.FFmpegPCMAudio(audio_path)
                                        
                                        # Usa una classe wrapper per gestire eventi di completamento
                                        audio_source = PlaybackSourceTracker(source, self.ctx)
                                        
                                        # Usa un evento per aspettare che la riproduzione finisca
                                        voice_client.play(audio_source, after=lambda e: print(f"Riproduzione completata: {e}"))
                                        
                                        # IMPORTANTE: Non attendiamo qui il completamento della riproduzione
                                        # Ritorniamo il testo tradotto mentre l'audio viene riprodotto in background
                                        return translated_text
                                        
                                except Exception as e:
                                    print(f"ERRORE durante la riproduzione dell'audio tradotto per {target_language}: {e}")
                                    import traceback
                                    print(traceback.format_exc())
                                break
                            elif result['status'] == 'error':
                                print(f"ERRORE nella traduzione per {target_language}: {result.get('error_message')}")
                                break
                        else:
                            print(f"ERRORE: Impossibile ottenere lo stato della conversazione, status: {response.status}")
                        
                        attempts += 1
                        await asyncio.sleep(0.5)
        except Exception as e:
            print(f"ERRORE durante l'attesa della traduzione: {e}")
            import traceback
            print(traceback.format_exc())
            
        return None
    
    async def generate_translated_audio(self, text, output_path, target_language="en"):
        """Genera audio tradotto utilizzando l'API"""
        async with aiohttp.ClientSession() as session:
            data = {
                "text": text,
                "target_language": target_language
            }
            
            async with session.post(f"http://localhost:8000/generate-audio", json=data) as response:
                if response.status == 200:
                    result = await response.json()
                    audio_url = result.get('audio_url')
                    
                    # Scarica il file audio
                    async with session.get(audio_url) as audio_response:
                        if audio_response.status == 200:
                            with open(output_path, 'wb') as f:
                                f.write(await audio_response.read())
                            return output_path
                
                raise Exception(f"Errore durante la generazione dell'audio: {response.status}")

async def send_to_webapp(audio_file_path, source_language="it"):
    """
    Invia il file audio alla webapp e restituisce il codice conversazione
    """
    async with aiohttp.ClientSession() as session:
        with open(audio_file_path, 'rb') as f:
            form_data = aiohttp.FormData()
            form_data.add_field('file',
                              f,
                              filename=os.path.basename(audio_file_path),
                              content_type='audio/wav')
            form_data.add_field('source_language', source_language)
            
            # Modifica l'URL in base all'ambiente
            async with session.post('http://localhost:8000/upload-audio', data=form_data) as response:
                result = await response.json()
                return result['conversation_code']

async def generate_translated_audio(text, output_path, target_language="en"):
    """
    Genera audio tradotto utilizzando l'API
    """
    async with aiohttp.ClientSession() as session:
        data = {
            "text": text,
            "target_language": target_language
        }
        
        async with session.post(f"http://localhost:8000/generate-audio", json=data) as response:
            if response.status == 200:
                result = await response.json()
                audio_url = result.get('audio_url')
                
                # Scarica il file audio
                async with session.get(audio_url) as audio_response:
                    if audio_response.status == 200:
                        with open(output_path, 'wb') as f:
                            f.write(await audio_response.read())
                        return output_path
            
            raise Exception(f"Errore durante la generazione dell'audio: {response.status}")

# Inizializzazione del bot
bot = commands.Bot(command_prefix='!', intents=discord.Intents.all())

if not os.path.exists('./recordings'):
   os.makedirs('./recordings')

if not os.path.exists('./temp'):
   os.makedirs('./temp')

@bot.event
async def on_ready():
   print(f'Bot avviato come {bot.user}')

@bot.command()
async def join(ctx):
    """Fa entrare il bot nel canale vocale"""
    if not ctx.author.voice:
        return await ctx.send("Devi essere in un canale vocale!")
    
    channel = ctx.author.voice.channel
    if ctx.voice_client:
        await ctx.voice_client.move_to(channel)
    else:
        await channel.connect()
    await ctx.send("Mi sono unito al canale vocale")

@bot.command()
async def leave(ctx):
    """Fa uscire il bot dal canale vocale"""
    if ctx.voice_client:
        await ctx.voice_client.disconnect()
        await ctx.send("Ho lasciato il canale vocale")
    else:
        await ctx.send("Non sono in un canale vocale")

@bot.command()
async def start_translator(ctx):
    """Avvia la modalità traduzione in tempo reale"""
    if not ctx.author.voice:
        return await ctx.send("Devi essere in un canale vocale!")
    
    # Connetti al canale vocale se non sei già connesso
    channel = ctx.author.voice.channel
    if ctx.voice_client:
        await ctx.voice_client.move_to(channel)
    else:
        await channel.connect()
    
    # Crea il registro delle variabili globali
    if not hasattr(bot, "active_users"):
        bot.active_users = {}
    if not hasattr(bot, "user_languages"):
        bot.user_languages = {}
    
    # Inizializza anche le variabili globali
    global active_users, user_languages
    active_users = bot.active_users
    user_languages = bot.user_languages
    
    # Aggiungi l'utente alla lista degli utenti attivi
    user_id = str(ctx.author.id)
    bot.active_users[user_id] = True
    active_users[user_id] = True  # Aggiorna anche la variabile globale
    
    # Imposta la lingua predefinita se l'utente non l'ha ancora impostata
    if user_id not in bot.user_languages:
        bot.user_languages[user_id] = "it"  # Default a italiano
        user_languages[user_id] = "it"  # Aggiorna anche la variabile globale
        await ctx.send(f"📝 Ho impostato la tua lingua predefinita a italiano. Usa !set_language per cambiarla.")
    
    # Avvia la registrazione con il nuovo sink
    if hasattr(ctx.voice_client, '_recorder'):
        ctx.voice_client.stop_recording()  # Ferma la registrazione precedente se presente
    
    sink = RealTimeTranslationSink(ctx)
    
    # Trasferisci le variabili globali al sink
    sink.active_users = bot.active_users.copy()
    sink.user_languages = bot.user_languages.copy()
    
    print(f"DEBUG: Avvio registrazione con utenti attivi: {sink.active_users}")
    print(f"DEBUG: Lingue configurate: {sink.user_languages}")
    
    ctx.voice_client.start_recording(sink, None)
    
    # Mostra le impostazioni della sessione
    status_msg = "🚀 **Modalità traduzione in tempo reale attivata!**\n\n"
    status_msg += "**Utenti attivi e loro lingue**:\n"
    
    for u_id, is_active in bot.active_users.items():
        if is_active:
            member = ctx.guild.get_member(int(u_id))
            if member:
                lang = bot.user_languages.get(u_id, "it")
                status_msg += f"- {member.display_name}: {lang}\n"
    
    status_msg += "\nParla normalmente e tradurrò automaticamente quando fai una pausa.\n"
    status_msg += "Usa !add_user @utente per aggiungere altre persone alla conversazione\n"
    status_msg += "Usa !stop_translator per terminare."
    
    await ctx.send(status_msg)

@bot.command()
async def set_language(ctx, lang_code: str):
    """Imposta la tua lingua (es: it, en, fr, es, de)"""
    if not hasattr(bot, "user_languages"):
        bot.user_languages = {}
        global user_languages
        user_languages = {}
        
    supported_languages = ["it", "en", "fr", "es", "de", "zh", "ja", "ru", "ar", "pt"]
    
    if lang_code.lower() in supported_languages:
        user_id = str(ctx.author.id)
        bot.user_languages[user_id] = lang_code.lower()
        user_languages[user_id] = lang_code.lower()  # Aggiorna anche la variabile globale
        
        await ctx.send(f"👍 La tua lingua è stata impostata a {lang_code}")
        
        # Aggiorna anche il sink se è già in esecuzione
        if ctx.voice_client and hasattr(ctx.voice_client, '_recorder'):
            recorder = ctx.voice_client._recorder
            if hasattr(recorder, 'user_languages'):
                recorder.user_languages[user_id] = lang_code.lower()
                print(f"DEBUG: Aggiornata lingua per utente {user_id} a {lang_code} nel sink attivo")
    else:
        langs = ", ".join(supported_languages)
        await ctx.send(f"❌ Lingua non supportata. Usa uno dei seguenti codici: {langs}")

@bot.command()
async def add_user(ctx, member: discord.Member):
    """Aggiunge un utente alla conversazione di traduzione"""
    if not hasattr(bot, "active_users"):
        bot.active_users = {}
        global active_users
        active_users = {}
        
    if not hasattr(bot, "user_languages"):
        bot.user_languages = {}
        global user_languages
        user_languages = {}
        
    user_id = str(member.id)
    bot.active_users[user_id] = True
    active_users[user_id] = True  # Aggiorna anche la variabile globale
    
    if user_id not in bot.user_languages:
        bot.user_languages[user_id] = "it"
        user_languages[user_id] = "it"  # Aggiorna anche la variabile globale
    
    print(f"DEBUG: Aggiunto utente {user_id} ({member.display_name}) agli utenti attivi")
    
    # Aggiorna anche il sink se è già in esecuzione
    if ctx.voice_client and hasattr(ctx.voice_client, '_recorder'):
        recorder = ctx.voice_client._recorder
        if hasattr(recorder, 'active_users'):
            recorder.active_users[user_id] = True
            print(f"DEBUG: Aggiornato active_users nel sink attivo: {recorder.active_users}")
            
        if hasattr(recorder, 'user_languages') and user_id not in recorder.user_languages:
            recorder.user_languages[user_id] = bot.user_languages[user_id]
            print(f"DEBUG: Aggiornato user_languages nel sink attivo: {recorder.user_languages}")
    
    await ctx.send(f"✅ Ho aggiunto {member.display_name} alla conversazione di traduzione.\n"
                  f"Lingua impostata: {bot.user_languages[user_id]}\n"
                  f"Suggerisci a {member.mention} di usare il comando !set_language per cambiare la lingua se necessario.")
    
@bot.command()
async def stop_translator(ctx):
    """Ferma la modalità traduzione in tempo reale"""
    if ctx.voice_client and hasattr(ctx.voice_client, '_recorder'):
        ctx.voice_client.stop_recording()
        
        # Rimuovi tutti gli utenti dalla lista attiva
        if hasattr(bot, "active_users"):
            bot.active_users.clear()
            
        # Aggiorna anche le variabili globali
        global active_users
        active_users = {}
            
        await ctx.send("🛑 Modalità traduzione in tempo reale disattivata.")
    else:
        await ctx.send("Non sto traducendo in questo momento.")

@bot.command()
async def status(ctx):
    """Mostra lo stato attuale della traduzione"""
    # Riferimento alle variabili globali
    global active_users, user_languages
    
    # Controlla prima le variabili del bot
    if hasattr(bot, "active_users") and bot.active_users:
        active_users_dict = bot.active_users
    elif active_users:
        active_users_dict = active_users
    else:
        await ctx.send("Non ci sono utenti attivi nella traduzione in tempo reale.")
        return
    
    status_msg = "📊 **Stato della traduzione in tempo reale**:\n\n"
    status_msg += "**Utenti attivi**:\n"
    
    for user_id, is_active in active_users_dict.items():
        if is_active:
            member = ctx.guild.get_member(int(user_id))
            if member:
                lang = user_languages.get(user_id, "it") if user_languages else "it"
                status_msg += f"- {member.display_name}: {lang}\n"
    
    # Aggiungi anche informazioni sul server di elaborazione
    status_msg += "\n**Server API**:\n"
    status_msg += "- URL: http://localhost:8000\n"
    
    # Aggiungi informazioni sulla registrazione
    if ctx.voice_client and hasattr(ctx.voice_client, '_recorder'):
        recorder = ctx.voice_client._recorder
        status_msg += "\n**Registrazione**:\n"
        status_msg += "- Stato: Attiva\n"
        if hasattr(recorder, 'silence_threshold'):
            status_msg += f"- Soglia di silenzio: {recorder.silence_threshold}\n"
    else:
        status_msg += "\n**Registrazione**:\n"
        status_msg += "- Stato: Inattiva\n"
    
    await ctx.send(status_msg)

@bot.command()
async def help_translator(ctx):
    """Mostra informazioni su come usare il traduttore in tempo reale"""
    help_msg = "🌐 **Guida al traduttore in tempo reale**\n\n"
    help_msg += "**Comandi principali**:\n"
    help_msg += "- `!join` - Fa entrare il bot nel canale vocale\n"
    help_msg += "- `!set_language [codice]` - Imposta la tua lingua (es: it, en, fr, es)\n"
    help_msg += "- `!start_translator` - Avvia la modalità traduzione in tempo reale\n"
    help_msg += "- `!stop_translator` - Ferma la modalità traduzione\n"
    help_msg += "- `!add_user @utente` - Aggiunge un utente alla conversazione\n"
    help_msg += "- `!status` - Mostra gli utenti attivi e le loro lingue\n"
    help_msg += "- `!leave` - Fa uscire il bot dal canale vocale\n"
    help_msg += "- `!set_threshold [valore]` - Regola la sensibilità del microfono\n"
    help_msg += "- `!debug_status` - Informazioni dettagliate per il debug\n\n"
    help_msg += "**Come funziona**:\n"
    help_msg += "1. Entra in un canale vocale e usa `!join`\n"
    help_msg += "2. Imposta la tua lingua con `!set_language`\n"
    help_msg += "3. Avvia il traduttore con `!start_translator`\n"
    help_msg += "4. Parla normalmente, facendo una breve pausa dopo ogni frase\n"
    help_msg += "5. Il bot rileverà automaticamente quando hai finito di parlare e tradurrà"
    
    await ctx.send(help_msg)

@bot.command()
async def set_threshold(ctx, threshold: float):
    """Imposta la soglia di rilevamento del silenzio (valore tra 0.001 e 0.1)"""
    if not ctx.voice_client or not hasattr(ctx.voice_client, '_recorder'):
        return await ctx.send("Il traduttore non è attivo. Avvialo prima con !start_translator")
    
    if threshold < 0.001 or threshold > 0.1:
        return await ctx.send("La soglia deve essere un valore tra 0.001 (molto sensibile) e 0.1 (poco sensibile)")
    
    recorder = ctx.voice_client._recorder
    old_threshold = recorder.silence_threshold
    recorder.silence_threshold = threshold
    
    await ctx.send(f"✅ Soglia di rilevamento del silenzio modificata da {old_threshold} a {threshold}.\n"
                  f"Valori più bassi rendono il bot più sensibile ai suoni deboli.")

@bot.command()
async def debug_status(ctx):
    """Mostra informazioni di debug sullo stato del sistema di traduzione"""
    if not ctx.voice_client or not hasattr(ctx.voice_client, '_recorder'):
        return await ctx.send("Il traduttore non è attivo. Avvialo prima con !start_translator")
    
    recorder = ctx.voice_client._recorder
    
    debug_info = "🔍 **Informazioni di debug**:\n\n"
    
    # Informazioni sugli utenti attivi
    debug_info += "**Utenti attivi nel sink**:\n"
    if hasattr(recorder, 'active_users'):
        for u_id, is_active in recorder.active_users.items():
            member = ctx.guild.get_member(int(u_id))
            name = member.display_name if member else f"Utente {u_id}"
            debug_info += f"- {name}: {'✅' if is_active else '❌'}\n"
    else:
        debug_info += "❌ active_users non inizializzato nel sink\n"
    
    # Informazioni sulle lingue
    debug_info += "\n**Lingue configurate nel sink**:\n"
    if hasattr(recorder, 'user_languages'):
        for u_id, lang in recorder.user_languages.items():
            member = ctx.guild.get_member(int(u_id))
            name = member.display_name if member else f"Utente {u_id}"
            debug_info += f"- {name}: {lang}\n"
    else:
        debug_info += "❌ user_languages non inizializzato nel sink\n"
    
    # Informazioni sui processi di elaborazione
    debug_info += "\n**Processi di elaborazione audio**:\n"
    if hasattr(recorder, 'is_processing'):
        processing_users = []
        for u_id, is_proc in recorder.is_processing.items():
            if is_proc:
                member = ctx.guild.get_member(int(u_id))
                name = member.display_name if member else f"Utente {u_id}"
                processing_users.append(name)
        
        if processing_users:
            debug_info += f"Utenti in elaborazione: {', '.join(processing_users)}\n"
        else:
            debug_info += "Nessun utente in elaborazione\n"
    else:
        debug_info += "❌ is_processing non inizializzato nel sink\n"
    
    # Informazioni sulla coda
    if hasattr(recorder, 'speech_queue'):
        debug_info += f"Dimensione coda di elaborazione: {recorder.speech_queue.qsize()}\n"
    
    # Informazioni sulle soglie
    debug_info += f"\n**Parametri di rilevamento**:\n"
    debug_info += f"- Soglia silenzio: {recorder.silence_threshold}\n"
    debug_info += f"- Durata silenzio: {recorder.silence_duration}s\n"
    debug_info += f"- Durata minima discorso: {recorder.min_speech_duration}s\n"
    
    await ctx.send(debug_info)

bot.run(TOKEN)