import discord
from discord.ext import commands
from discord.ui import Button, View
from dotenv import load_dotenv
import wave
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

   def cleanup(self):
       print("Pulizia sink completata")

class RecordingView(View):
   def __init__(self):
       super().__init__(timeout=None)
       self.update_buttons(False)

   def update_buttons(self, is_recording):
       self.clear_items()
       if not is_recording:
           record_button = Button(
               label="🔴 Registra", 
               custom_id="record", 
               style=discord.ButtonStyle.green
           )
           record_button.callback = self.record_callback
           self.add_item(record_button)
       else:
           stop_button = Button(
               label="⏹️ Stop", 
               custom_id="stop", 
               style=discord.ButtonStyle.red
           )
           stop_button.callback = self.stop_callback
           self.add_item(stop_button)

   async def record_callback(self, interaction):
       await interaction.response.defer()
       ctx = await bot.get_context(interaction.message)
       await record(ctx)

   async def stop_callback(self, interaction):
       await interaction.response.defer()
       ctx = await bot.get_context(interaction.message)
       await stop(ctx)

class VoiceClient:
   def __init__(self):
       self.recording = False
       self.panel_message = None

voice_clients = {}

async def finished_callback(sink, ctx):
   path = f"./recordings/audio_{ctx.author.id}_{int(datetime.now().timestamp())}.wav"
   with wave.open(path, 'wb') as f:
       f.setnchannels(2)
       f.setsampwidth(2)
       f.setframerate(48000)
       for data in sink.audio_data.values():
           f.writeframes(b''.join(data))
   await ctx.send(f"Registrazione salvata: {path}")

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
       await channel.connect()
       voice_clients[ctx.guild.id] = VoiceClient()
   await ctx.send("Mi sono unito al canale vocale")

@bot.command()
async def panel(ctx):
   embed = discord.Embed(
       title="Controllo Registrazione",
       description="🎙️ Stato: In attesa",
       color=discord.Color.blue()
   )
   view = RecordingView()
   message = await ctx.send(embed=embed, view=view)
   voice_clients[ctx.guild.id].panel_message = message

@bot.command()
async def record(ctx):
   if not ctx.voice_client:
       return await ctx.send("Non sono in un canale vocale!")
       
   voice_client = voice_clients.get(ctx.guild.id)
   if voice_client.recording:
       return await ctx.send("Sto già registrando!")
       
   ctx.voice_client.start_recording(AudioSink(), lambda s: finished_callback(s, ctx))
   voice_client.recording = True
   
   if voice_client.panel_message:
       embed = discord.Embed(
           title="Controllo Registrazione",
           description="🎙️ Stato: Registrazione in corso",
           color=discord.Color.green()
       )
       view = RecordingView()
       view.update_buttons(True)
       await voice_client.panel_message.edit(embed=embed, view=view)
   else:
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
   
   if voice_client.panel_message:
       embed = discord.Embed(
           title="Controllo Registrazione",
           description="🎙️ Stato: In attesa",
           color=discord.Color.blue()
       )
       view = RecordingView()
       view.update_buttons(False)
       await voice_client.panel_message.edit(embed=embed, view=view)
   else:
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
       if voice_client.panel_message:
           await voice_client.panel_message.delete()
       await ctx.voice_client.disconnect()
       voice_clients.pop(ctx.guild.id, None)
       await ctx.send("Ho lasciato il canale vocale")

bot.run(TOKEN)