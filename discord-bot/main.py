import wave
import discord
from discord.ext import commands
from dotenv import load_dotenv
import os
import aiohttp
from datetime import datetime

load_dotenv()
TOKEN = os.getenv('DISCORD_TOKEN')

class AudioSink(discord.sinks.WaveSink):
    def __init__(self):
        super().__init__()
        self.audio_data = {}
        self.format = {
            'channels': 2,
            'sample_width': 2,
            'sample_rate': 48000,
        }

    def write(self, data, user_id):
        if user_id not in self.audio_data:
            self.audio_data[user_id] = []
        self.audio_data[user_id].append(data)
        print(f"Audio ricevuto da user {user_id}: {len(data)} bytes")

    def cleanup(self):
        print("Pulizia sink completata")

    def finished_callback(self, data):
        with wave.open('output.wav', 'wb') as f:
            f.setnchannels(self.format['channels'])
            f.setsampwidth(self.format['sample_width'])
            f.setframerate(self.format['sample_rate'])
            if isinstance(data, list):
                f.writeframes(b''.join(data))
            else:
                print("Errore: 'data' non è un iterabile")

async def finished_callback(sink, ctx):
    path = f"./recordings/audio_{ctx.author.id}_{int(datetime.now().timestamp())}.wav"
    with wave.open(path, 'wb') as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(48000)
        for data in sink.audio_data.values():
            f.writeframes(b''.join(data))
    await ctx.send(f"Registrazione salvata: {path}")

if not os.path.exists('recordings'):
    os.makedirs('recordings')

async def send_to_webapp(audio_file_path):
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
            
            # async with session.post('https://speakswapfastapi-ghfje5bgbvenfaec.italynorth-01.azurewebsites.net/upload-audio', data=form_data) as response:
            async with session.post('http://localhost:8000/upload-audio', data=form_data) as response:
                result = await response.json()
                return result['conversation_code']

bot = commands.Bot(command_prefix='!', intents=discord.Intents.all())

if not os.path.exists('./recordings'):
   os.makedirs('./recordings')

@bot.event
async def on_ready():
   print(f'Bot avviato come {bot.user}')

# @bot.command()
# async def join(ctx):
#    if not ctx.author.voice:
#        return await ctx.send("Devi essere in un canale vocale!")
   
#    channel = ctx.author.voice.channel
#    if ctx.voice_client:
#        await ctx.voice_client.move_to(channel)
#    else:
#        vc = await channel.connect()
#        vc.start_recording(AudioSink(), lambda s: finished_callback(s, ctx))
#    await ctx.send("Mi sono unito al canale vocale e sto registrando")

class VoiceClient:
    def __init__(self):
        self.recording = False

voice_clients = {}

@bot.command()
async def join(ctx):
    if not ctx.author.voice:
        return await ctx.send("Devi essere in un canale vocale!")
    
    channel = ctx.author.voice.channel
    if ctx.voice_client:
        await ctx.voice_client.move_to(channel)
    else:
        vc = await channel.connect()
        voice_clients[ctx.guild.id] = VoiceClient()
    await ctx.send("Mi sono unito al canale vocale")

@bot.command()
async def start(ctx):
    if not ctx.voice_client:
        return await ctx.send("Non sono in un canale vocale!")
        
    voice_client = voice_clients.get(ctx.guild.id)
    if voice_client.recording:
        return await ctx.send("Sto già registrando!")
        
    ctx.voice_client.start_recording(AudioSink(), lambda s: finished_callback(s, ctx))
    voice_client.recording = True
    await ctx.send("Inizio registrazione...")

@bot.command()
async def stop(ctx):
    if not ctx.voice_client:
        return await ctx.send("Non sono in un canale vocale!")
        
    voice_client = voice_clients.get(ctx.guild.id)
    if not voice_client.recording:
        return await ctx.send("Non sto registrando!")
        
    ctx.voice_client.stop_recording()
    voice_client.recording = False
    await ctx.send("Registrazione fermata")

@bot.command()
async def play(ctx):
    files = sorted(os.listdir('./recordings'), reverse=True)
    if not files:
        await ctx.send("Nessuna registrazione trovata")
        return
        
    latest = f"./recordings/{files[0]}"
    voice = ctx.voice_client
    if voice:
        source = discord.FFmpegPCMAudio(latest)
        voice.play(source)
        await ctx.send(f"Riproduco {files[0]}")


@bot.command()
async def leave(ctx):
   if ctx.voice_client:
       voice_client = voice_clients.get(ctx.guild.id)
       if voice_client.recording:
           ctx.voice_client.stop_recording()
           voice_client.recording = False
       await ctx.voice_client.disconnect()
       voice_clients.pop(ctx.guild.id, None)
       await ctx.send("Ho lasciato il canale vocale")

@bot.command()
async def translate(ctx):
    try:
        # Ottieni l'ultimo file registrato dalla cartella recordings
        files = sorted(os.listdir('./recordings'), reverse=True)
        if not files:
            await ctx.send("Nessuna registrazione trovata da tradurre")
            return
            
        latest_recording = f"./recordings/{files[0]}"
        
        # Invia il file alla webapp e ottieni il codice
        conversation_code = await send_to_webapp(latest_recording)
        
        # Invia il codice all'utente in privato
        await ctx.author.send(f"Il codice della tua conversazione è: {conversation_code}")
        # Invia anche un messaggio nel canale
        await ctx.send("Ti ho inviato il codice della conversazione in privato!")
        
    except Exception as e:
        print(f"Errore durante l'invio del file: {e}")
        await ctx.author.send("Si è verificato un errore durante l'elaborazione della richiesta.")
        # Log dell'errore più dettagliato
        print(f"Dettagli errore: {str(e)}")
        
@bot.command()
async def play_translated(ctx, code: str):
    try:
        os.makedirs("translated_audio", exist_ok=True)
        
        async with aiohttp.ClientSession() as session:
            async with session.get(f"http://localhost:8000/translated-audio/{code}") as response:
                if response.status == 200:
                    api_audio_path = f"/workspaces/SpeakSwap/api/translated_audio/{code}.wav"
                    
                    voice = ctx.voice_client
                    if voice:
                        source = discord.FFmpegPCMAudio(api_audio_path)
                        voice.play(source)
                        await ctx.send(f"Riproduco audio tradotto per la conversazione {code}")
                else:
                    await ctx.send(f"Errore durante il recupero dell'audio tradotto: Status {response.status}")
    except Exception as e:
        await ctx.send(f"Errore: {str(e)}")
        print(f"Errore dettagliato: {e}") 

bot.run(TOKEN)