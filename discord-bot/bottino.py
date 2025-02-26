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

class RealTimeTranslationSink(discord.sinks.WaveSink):
    def __init__(self, ctx):
        super().__init__()
        self.audio_data = {}
        self.last_speech = {}
        self.silence_threshold = 0.015  # Soglia di rilevamento del silenzio
        self.silence_duration = 0.5  # Durata del silenzio per considerare finito il discorso (secondi)
        self.min_speech_duration = 0.5  # Durata minima per considerare un input valido (secondi)
        self.format = {
            'channels': 2,
            'sample_width': 2,
            'sample_rate': 48000,
        }
        self.is_processing = {}
        self.ctx = ctx
        self.speech_start_time = {}
        self.last_user_speaking = None
        
        self.speech_queue = queue.Queue()
        
        self.processing_task = None
        asyncio.create_task(self.start_processing_loop())
    
    async def start_processing_loop(self):
        """Avvia il loop asincrono per elaborare l'audio"""
        while True:
            try:
               
                if not self.speech_queue.empty():
                    user_id, speech_data = self.speech_queue.get()
                    if user_id and speech_data:
                        await self.process_speech(user_id, speech_data)
                    self.speech_queue.task_done()
                
                
                await asyncio.sleep(0.1)
            except Exception as e:
                print(f"Errore nel loop di elaborazione: {e}")
    
    def write(self, data, user_id):
        """Chiamato quando viene ricevuto nuovo audio"""
        if not hasattr(self, "audio_data") or not hasattr(self, "last_speech"):
            self.audio_data = {}
            self.last_speech = {}
            self.is_processing = {}
            self.speech_start_time = {}
        
        
        if not hasattr(self, "active_users") or user_id not in self.active_users:
            return
        
        
        if user_id not in self.audio_data:
            self.audio_data[user_id] = []
            self.last_speech[user_id] = time.time()
            self.is_processing[user_id] = False
            self.speech_start_time[user_id] = time.time()
        
        
        audio_array = np.frombuffer(data, dtype=np.int16)
        volume = np.abs(audio_array).mean() / 32768.0  
        
        if volume > self.silence_threshold:
            self.last_speech[user_id] = time.time()
            if not self.audio_data[user_id]:
                self.speech_start_time[user_id] = time.time()
            self.last_user_speaking = user_id
        
        self.audio_data[user_id].append(data)
        
        
        current_time = time.time()
        speech_duration = current_time - self.speech_start_time.get(user_id, current_time)
        
        if (current_time - self.last_speech[user_id] > self.silence_duration and 
            len(self.audio_data[user_id]) > 0 and 
            not self.is_processing.get(user_id, False) and
            speech_duration > self.min_speech_duration):
            
            self.is_processing[user_id] = True
            
            # Copia i dati audio per l'elaborazione
            speech_data = self.audio_data[user_id].copy()
            self.audio_data[user_id] = []  # Resetta i dati audio per questo utente
            
            # Aggiungi alla coda per l'elaborazione asincrona
            self.speech_queue.put((user_id, speech_data))
    
    async def process_speech(self, user_id, speech_data):
        """Elabora il discorso: salva in file, trascrive, traduce e riproduce"""
        try:
            # Salva in un file temporaneo
            temp_path = f"./temp/speech_{user_id}_{int(datetime.now().timestamp())}.wav"
            os.makedirs("./temp", exist_ok=True)
            
            with wave.open(temp_path, 'wb') as f:
                f.setnchannels(self.format['channels'])
                f.setsampwidth(self.format['sample_width'])
                f.setframerate(self.format['sample_rate'])
                f.writeframes(b''.join(speech_data))
            
            # Ottieni la lingua dell'utente
            source_language = getattr(self, "user_languages", {}).get(user_id, "it")  # Default a italiano
            
            # Determina le altre lingue di destinazione
            target_languages = set()
            for u_id, lang in getattr(self, "user_languages", {}).items():
                if lang != source_language and u_id in getattr(self, "active_users", {}):
                    target_languages.add(lang)
            
            if not target_languages:
                target_languages = {"en"}  # Default a inglese se nessun'altra lingua è impostata
            
            # Invia per la traduzione
            conversation_code = await self.send_to_webapp(temp_path, source_language)
            
            # Attendi che la traduzione sia completata e riproducila per ogni lingua target
            for target_lang in target_languages:
                await self.wait_and_play_translation(conversation_code, target_lang)
                
        except Exception as e:
            print(f"Errore durante l'elaborazione del discorso: {e}")
        finally:
            self.is_processing[user_id] = False
    
    async def send_to_webapp(self, audio_file_path, source_language="it"):
        """Invia il file audio alla webapp e restituisce il codice conversazione"""
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
    
    async def wait_and_play_translation(self, conversation_code, target_language):
        """Attende che la traduzione sia completata e riproduce l'audio risultante"""
        # Attendi che la traduzione sia completata
        async with aiohttp.ClientSession() as session:
            attempts = 0
            max_attempts = 20  # Limita i tentativi per evitare loop infiniti
            
            while attempts < max_attempts:
                async with session.get(f"http://localhost:8000/conversation/{conversation_code}") as response:
                    if response.status == 200:
                        result = await response.json()
                        if result['status'] == 'completed':
                            # Ottieni il testo tradotto
                            translated_text = result.get('translated_text')
                            if not translated_text:
                                print("Testo tradotto non disponibile")
                                break
                                
                            # Genera audio nella lingua di destinazione
                            audio_path = f"./temp/translated_{conversation_code}_{target_language}.wav"
                            try:
                                await self.generate_translated_audio(translated_text, audio_path, target_language)
                                
                                # Riproduci l'audio tradotto nel canale vocale
                                voice_client = self.ctx.voice_client
                                if voice_client and voice_client.is_connected():
                                    if voice_client.is_playing():
                                        voice_client.stop()
                                    
                                    source = discord.FFmpegPCMAudio(audio_path)
                                    voice_client.play(source)
                                    
                                    # Notifica nel canale di testo (opzionale)
                                    user_name = self.ctx.guild.get_member(int(self.last_user_speaking)).display_name
                                    await self.ctx.send(f"🔊 **{user_name}**: {translated_text}", delete_after=10)
                            except Exception as e:
                                print(f"Errore durante la riproduzione dell'audio tradotto: {e}")
                            break
                        elif result['status'] == 'error':
                            print(f"Errore nella traduzione: {result.get('error_message')}")
                            break
                    
                    attempts += 1
                    await asyncio.sleep(0.5)
    
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
    
    # Aggiungi l'utente alla lista degli utenti attivi
    bot.active_users[ctx.author.id] = True
    
    # Imposta la lingua predefinita se l'utente non l'ha ancora impostata
    if ctx.author.id not in bot.user_languages:
        bot.user_languages[ctx.author.id] = "it"  # Default a italiano
        await ctx.send(f"📝 Ho impostato la tua lingua predefinita a italiano. Usa !set_language per cambiarla.")
    
    # Avvia la registrazione con il nuovo sink
    if hasattr(ctx.voice_client, '_recorder'):
        ctx.voice_client.stop_recording()  # Ferma la registrazione precedente se presente
    
    sink = RealTimeTranslationSink(ctx)
    
    # Trasferisci le variabili globali al sink
    sink.active_users = bot.active_users
    sink.user_languages = bot.user_languages
    
    ctx.voice_client.start_recording(sink, None)
    
    await ctx.send("🚀 **Modalità traduzione in tempo reale attivata!**\n"
                  "Parla normalmente e tradurrò automaticamente quando fai una pausa.\n"
                  "Usa !add_user @utente per aggiungere altre persone alla conversazione\n"
                  "Usa !stop_translator per terminare.")

@bot.command()
async def set_language(ctx, lang_code: str):
    """Imposta la tua lingua (es: it, en, fr, es, de)"""
    if not hasattr(bot, "user_languages"):
        bot.user_languages = {}
        
    supported_languages = ["it", "en", "fr", "es", "de", "zh", "ja", "ru", "ar", "pt"]
    
    if lang_code.lower() in supported_languages:
        bot.user_languages[ctx.author.id] = lang_code.lower()
        await ctx.send(f"👍 La tua lingua è stata impostata a {lang_code}")
    else:
        langs = ", ".join(supported_languages)
        await ctx.send(f"❌ Lingua non supportata. Usa uno dei seguenti codici: {langs}")

@bot.command()
async def add_user(ctx, member: discord.Member):
    """Aggiunge un utente alla conversazione di traduzione"""
    if not hasattr(bot, "active_users"):
        bot.active_users = {}
    if not hasattr(bot, "user_languages"):
        bot.user_languages = {}
        
    bot.active_users[member.id] = True
    
    if member.id not in bot.user_languages:
        bot.user_languages[member.id] = "it"  
    
    await ctx.send(f"✅ Ho aggiunto {member.display_name} alla conversazione di traduzione.\n"
                  f"Lingua impostata: {bot.user_languages[member.id]}")

@bot.command()
async def stop_translator(ctx):
    """Ferma la modalità traduzione in tempo reale"""
    if ctx.voice_client and hasattr(ctx.voice_client, '_recorder'):
        ctx.voice_client.stop_recording()
        
        # Rimuovi tutti gli utenti dalla lista attiva
        if hasattr(bot, "active_users"):
            bot.active_users.clear()
            
        await ctx.send("🛑 Modalità traduzione in tempo reale disattivata.")
    else:
        await ctx.send("Non sto traducendo in questo momento.")

@bot.command()
async def status(ctx):
    """Mostra lo stato attuale della traduzione"""
    if not active_users:
        await ctx.send("Non ci sono utenti attivi nella traduzione in tempo reale.")
        return
    
    status_msg = "📊 **Stato della traduzione in tempo reale**:\n\n"
    status_msg += "**Utenti attivi**:\n"
    
    for user_id in active_users:
        member = ctx.guild.get_member(user_id)
        if member:
            lang = user_languages.get(user_id, "it")
            status_msg += f"- {member.display_name}: {lang}\n"
    
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
    help_msg += "- `!leave` - Fa uscire il bot dal canale vocale\n\n"
    help_msg += "**Come funziona**:\n"
    help_msg += "1. Entra in un canale vocale e usa `!join`\n"
    help_msg += "2. Imposta la tua lingua con `!set_language`\n"
    help_msg += "3. Avvia il traduttore con `!start_translator`\n"
    help_msg += "4. Parla normalmente, facendo una breve pausa dopo ogni frase\n"
    help_msg += "5. Il bot rileverà automaticamente quando hai finito di parlare e tradurrà"
    
    await ctx.send(help_msg)

bot.run(TOKEN)