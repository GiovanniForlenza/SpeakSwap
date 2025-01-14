const { Client, Intents } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
require('dotenv').config(); // Carica il token dal file .env

// Crea il bot
const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_VOICE_STATES,
    Intents.FLAGS.GUILD_MESSAGES,
  ],
});

// Eventi
client.once('ready', () => {
  console.log(`Bot connesso come ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.content === "!join" && message.member.voice.channel) {
    // Unisci il bot al canale vocale
    const connection = joinVoiceChannel({
      channelId: message.member.voice.channel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });

    message.reply(`Sono entrato nel canale vocale: ${message.member.voice.channel.name}`);
  }

  if (message.content === "!leave" && message.guild.me.voice.channel) {
    // Lascia il canale vocale
    const connection = getVoiceConnection(message.guild.id);
    if (connection) connection.destroy();

    message.reply("Ho lasciato il canale vocale.");
  }
});

// Avvia il bot
client.login(process.env.BOT_TOKEN);