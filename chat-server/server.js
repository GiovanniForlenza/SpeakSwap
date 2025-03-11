const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid'); // Manteniamo uuid perché potrebbe essere utile

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

require('dotenv').config();

// Configurazione Azure
const TRANSLATOR_KEY = process.env.TRANSLATOR_KEY;
const TRANSLATOR_ENDPOINT = process.env.TRANSLATOR_ENDPOINT;
const TRANSLATOR_REGION = process.env.TRANSLATOR_REGION;


// Memorizza informazioni sugli utenti
const users = {};
const userRooms = {};

// Funzione per tradurre il testo
async function translateText(text, fromLanguage, toLanguage) {
  try {
    const response = await axios({
      baseURL: TRANSLATOR_ENDPOINT,
      url: '/translate',
      method: 'post',
      headers: {
        'Ocp-Apim-Subscription-Key': TRANSLATOR_KEY,
        'Ocp-Apim-Subscription-Region': TRANSLATOR_REGION,
        'Content-type': 'application/json',
      },
      params: {
        'api-version': '3.0',
        'from': fromLanguage.split('-')[0],
        'to': toLanguage.split('-')[0]
      },
      data: [{
        'text': text
      }],
      responseType: 'json'
    });
    
    return response.data[0].translations[0].text;
  } catch (error) {
    console.error('Errore nella traduzione:', error);
    return text; // Restituisci il testo originale in caso di errore
  }
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Gestisce l'ingresso in una stanza
  socket.on('join', ({ username, roomId, language }) => {
    console.log(`${username} è entrato nella stanza ${roomId} con lingua ${language}`);
    
    socket.join(roomId);
    
    // Memorizza informazioni sull'utente con la lingua
    users[socket.id] = { username, roomId, language };
    userRooms[roomId] = userRooms[roomId] || [];
    userRooms[roomId].push({ id: socket.id, username, language });
    
    // Notifica a tutti gli utenti nella stanza
    socket.emit('message', {
      username: 'Sistema',
      text: `Benvenuto nella stanza ${roomId}, ${username}!`,
      time: new Date(),
      isSelf: true
    });
    
    socket.broadcast.to(roomId).emit('message', {
      username: 'Sistema',
      text: `${username} è entrato nella stanza`,
      time: new Date(),
      isSelf: false
    });
    
    // Invia la lista aggiornata degli utenti con le informazioni sulla lingua
    io.to(roomId).emit('roomUsers', userRooms[roomId].map(user => ({
      id: user.id,
      username: user.username,
      language: user.language,
      isSelf: user.id === socket.id
    })));
    
    // Notifica agli altri utenti che un nuovo utente è entrato
    socket.broadcast.to(roomId).emit('user-joined', {
      userId: socket.id,
      username,
      language
    });
  });

  // Gestisce le richieste di traduzione
  socket.on('translate-text', async ({ text, fromLanguage }) => {
    console.log(`Ricevuta richiesta di traduzione: "${text}" da ${fromLanguage}`);
    
    const user = users[socket.id];
    if (user) {
      const { roomId, username } = user;
      console.log(`Utente ${username} ha detto: "${text}" in ${fromLanguage}`);
      
      // Ottieni la lista delle lingue nella stanza
      const roomLanguages = new Set();
      userRooms[roomId].forEach(user => roomLanguages.add(user.language));
      
      // Traduci il testo in tutte le lingue necessarie
      for (const targetLanguage of roomLanguages) {
        // Salta se è la stessa lingua
        if (targetLanguage === fromLanguage) {
          console.log(`Stessa lingua ${targetLanguage}, nessuna traduzione necessaria`);
          continue;
        }
        
        try {
          console.log(`Traduzione da ${fromLanguage} a ${targetLanguage}`);
          const translatedText = await translateText(text, fromLanguage, targetLanguage);
          console.log(`Testo tradotto: "${translatedText}"`);
          
          // Invia la traduzione a tutti gli utenti con quella lingua
          const targetUsers = userRooms[roomId].filter(u => u.language === targetLanguage);
          console.log(`Invio traduzione a ${targetUsers.length} utenti con lingua ${targetLanguage}`);
          
          targetUsers.forEach(targetUser => {
            console.log(`- Invio a ${targetUser.username} (${targetUser.id})`);
            io.to(targetUser.id).emit('translation', {
              fromUserId: socket.id,
              originalText: text,
              translatedText,
              fromLanguage
            });
          });
        } catch (error) {
          console.error(`Errore traduzione: ${error.message}`);
        }
      }
    }
  });

  // Gestisce l'invio di messaggi di testo
  socket.on('message', ({ text }) => {
    const user = users[socket.id];
    if (user) {
      const { username, roomId } = user;
      console.log(`Messaggio da ${username} nella stanza ${roomId}: ${text}`);
      
      // Crea il messaggio con isSelf = false per tutti
      const message = {
        username,
        text,
        time: new Date(),
        isSelf: false
      };
      
      // Invia a tutti tranne il mittente
      socket.broadcast.to(roomId).emit('message', message);
      
      // Invia al mittente con isSelf = true
      socket.emit('message', {
        ...message,
        isSelf: true
      });
    }
  });

  // Gestisce la disconnessione
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      const { username, roomId } = user;
      console.log(`${username} ha lasciato la stanza ${roomId}`);
      
      // Rimuovi l'utente dalla lista
      if (userRooms[roomId]) {
        userRooms[roomId] = userRooms[roomId].filter(user => user.id !== socket.id);
        
        // Se la stanza è vuota, elimina la stanza
        if (userRooms[roomId].length === 0) {
          delete userRooms[roomId];
        } else {
          // Notifica agli altri utenti
          io.to(roomId).emit('message', {
            username: 'Sistema',
            text: `${username} ha lasciato la stanza`,
            time: new Date(),
            isSelf: false
          });
          
          // Invia lista aggiornata degli utenti
          io.to(roomId).emit('roomUsers', userRooms[roomId].map(user => ({
            id: user.id,
            username: user.username,
            language: user.language,
            isSelf: user.id === socket.id
          })));
        }
      }
      
      delete users[socket.id];
    }
    
    console.log(`User disconnected: ${socket.id}`);
  });

  // Gestisce le richieste per WebRTC
  socket.on('audio-ready', ({ to } = {}) => {
    const user = users[socket.id];
    if (user) {
      console.log(`Utente ${user.username} è pronto per l'audio`);
      
      if (to) {
        // Notifica solo l'utente specifico
        io.to(to).emit('audio-ready', { userId: socket.id });
      } else {
        // Notifica a tutti nella stanza
        const roomId = user.roomId;
        socket.broadcast.to(roomId).emit('audio-ready', { userId: socket.id });
      }
    }
  });

  socket.on('call-request', ({ to, offer }) => {
    console.log(`Richiesta di chiamata da ${socket.id} a ${to}`);
    io.to(to).emit('call-request', {
      from: socket.id,
      offer
    });
  });

  socket.on('call-answer', ({ to, answer }) => {
    console.log(`Risposta alla chiamata da ${socket.id} a ${to}`);
    io.to(to).emit('call-answer', {
      from: socket.id,
      answer
    });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    console.log(`Candidato ICE da ${socket.id} a ${to}`);
    io.to(to).emit('ice-candidate', {
      from: socket.id,
      candidate
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});