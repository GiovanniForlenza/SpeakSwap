require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { 
  joinVoiceChannel, 
  getVoiceConnection, 
  createAudioPlayer, 
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  EndBehaviorType
} = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

if (!fs.existsSync('./recordings')) {
  fs.mkdirSync('./recordings');
}

client.once('ready', () => {
  console.log(`Bot avviato come ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.content === "!join" && message.member.voice.channel) {
    try {
      const connection = joinVoiceChannel({
        channelId: message.member.voice.channel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: false,
      });

      connection.on(VoiceConnectionStatus.Ready, () => {
        console.log('Connessione pronta');
        message.reply(`Mi sono unito al canale: ${message.member.voice.channel.name}`);
      });

      connection.receiver.speaking.on('start', (userId) => {
        console.log(`Inizio registrazione per l'utente ${userId}`);
        
        // Configurazione dell'audio stream con end behavior specifico
        const audioStream = connection.receiver.subscribe(userId, {
          end: {
            behavior: EndBehaviorType.AfterSilence,
            duration: 1000
          }
        });

        const wavFileName = `./recordings/${userId}-${Date.now()}.wav`;
        
        const ffmpeg = spawn(require('ffmpeg-static'), [
          '-f', 's16le',           // Formato di input
          '-ar', '48000',          // Sample rate
          '-ac', '2',              // Canali audio (stereo)
          '-i', 'pipe:0',          // Input da pipe
          '-acodec', 'pcm_s16le',  // Codec audio
          '-f', 'wav',             // Formato output
          wavFileName              // File di output
        ]);

        // Monitoriamo il flusso di dati
        let dataReceived = false;
        audioStream.on('data', (chunk) => {
          dataReceived = true;
          console.log(`Ricevuti dati audio: ${chunk.length} bytes`);
        });

        audioStream.on('end', () => {
          console.log('Stream audio terminato');
          if (!dataReceived) {
            console.log('Warning: Nessun dato audio ricevuto durante la registrazione');
          }
          ffmpeg.stdin.end();
        });

        audioStream.on('error', (error) => {
          console.error('Errore nel flusso audio:', error);
        });

        ffmpeg.stdin.on('error', (error) => {
          console.error('Errore in ffmpeg stdin:', error);
          if (error.code === 'EPIPE') {
            console.log('Broken pipe - probabile chiusura prematura dello stream');
          }
        });

        ffmpeg.stderr.on('data', (data) => {
          console.error(`ffmpeg stderr: ${data.toString()}`);
        });

        ffmpeg.on('close', (code) => {
          if (code !== 0) {
            console.error(`ffmpeg process exited with code ${code}`);
          } else {
            console.log(`Registrazione completata per l'utente ${userId}`);
            // Verifica della dimensione del file
            const stats = fs.statSync(wavFileName);
            console.log(`Dimensione file: ${stats.size} bytes`);
          }
        });

        audioStream.pipe(ffmpeg.stdin);
      });

      connection.receiver.speaking.on('end', (userId) => {
        console.log(`Utente ${userId} ha smesso di parlare`);
      });

    } catch (error) {
      console.error('Errore durante la connessione:', error);
      message.reply('Si è verificato un errore durante la connessione al canale vocale.');
    }
  }

  if (message.content === "!leave") {
    const connection = getVoiceConnection(message.guild.id);
    if (connection) {
      connection.destroy();
      message.reply("Ho lasciato il canale vocale");
    }
  }

  if (message.content === "!play" && message.member.voice.channel) {
    const connection = getVoiceConnection(message.guild.id);
    if (!connection) {
      return message.reply("Il bot non è in un canale vocale!");
    }

    const recordingsDir = path.join(__dirname, 'recordings');
    const files = fs.readdirSync(recordingsDir);
    if (files.length === 0) {
      return message.reply("Non ci sono registrazioni disponibili.");
    }

    const latestFile = files.reduce((latest, file) => {
      const filePath = path.join(recordingsDir, file);
      const stats = fs.statSync(filePath);
      if (!latest || stats.mtime > latest.mtime) {
        return { file, mtime: stats.mtime };
      }
      return latest;
    }, null).file;

    const filePath = path.join(recordingsDir, latestFile);
    const resource = createAudioResource(filePath);
    const player = createAudioPlayer();

    player.play(resource);
    connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => {
      player.stop();
    });

    message.reply(`Sto riproducendo: ${latestFile}`);
  }
});

client.login(process.env.BOT_TOKEN);