import wave
import discord
from discord.ext import commands
from dotenv import load_dotenv
import os
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

bot = commands.Bot(command_prefix='!', intents=discord.Intents.all())

if not os.path.exists('./recordings'):
   os.makedirs('./recordings')

@bot.event
async def on_ready():
   print(f'Bot avviato come {bot.user}')

@bot.command()
async def join(ctx):
   if not ctx.author.voice:
       return await ctx.send("Devi essere in un canale vocale!")
   
   channel = ctx.author.voice.channel
   if ctx.voice_client:
       await ctx.voice_client.move_to(channel)
   else:
       vc = await channel.connect()
       vc.start_recording(AudioSink(), lambda s: finished_callback(s, ctx))
   await ctx.send("Mi sono unito al canale vocale e sto registrando")

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
       ctx.voice_client.stop_recording()
       await ctx.voice_client.disconnect()
       await ctx.send("Ho lasciato il canale vocale")

bot.run(TOKEN)