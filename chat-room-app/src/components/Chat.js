import React, { useState, useEffect, useCallback } from 'react';
import { useSignalRConnection } from './SignalRConnectionProvider';
import { base64ArrayToBlob, base64ToBlob } from './audioUtils';
import { useLocation } from 'react-router-dom';
import ConnectionStatus from './ConnectionStatus';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import AudioRecorder from './AudioRecorder';

const Chat = () => {
  const { connection, roomUsers, roomName, language } = useSignalRConnection() || { 
    connection: null, 
    connectionStatus: 'Disconnected',
    roomUsers: [],
    roomName: '',
    language: 'it'
  };
  const [messages, setMessages] = useState([]);
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const userName = queryParams.get("userName")?.trim();

  // Funzione per salvare log nel localStorage per debugging
  const addLog = useCallback((message, type = 'info') => {
    console.log(`[Chat ${type}] ${message}`);
    const logs = JSON.parse(localStorage.getItem('chatLogs') || '[]');
    logs.push({
      time: new Date().toISOString(),
      message,
      type
    });
    if (logs.length > 100) logs.shift();
    localStorage.setItem('chatLogs', JSON.stringify(logs));
  }, []);

  const handleAudioRecorded = useCallback((audioUrl, base64Chunks) => {
    addLog('Audio registrato localmente');
    
    // Aggiungi il messaggio audio alla lista dei messaggi
    setMessages(prevMessages => [...prevMessages, { 
      user: userName, 
      audioUrl: audioUrl,
      audioChunks: base64Chunks,
      totalChunks: base64Chunks.length,
      receivedChunks: base64Chunks.length,
      isComplete: true,
      time: new Date(),
      type: 'audio',
      id: Date.now(),
    }]);
  }, [userName, addLog]);

  useEffect(() => {
    if (!connection) {
      addLog("No SignalR connection available yet", "warn");
      return;
    }

    addLog("Setting up SignalR event handlers");

    // Registra il gestore per ricevere i messaggi di testo
    connection.on('ReceiveMessage', (user, receivedMessage) => {
      addLog(`Messaggio ricevuto da ${user}: ${receivedMessage}`);
            
      setMessages(prevMessages => {
        const newMessages = [...prevMessages, { 
          user, 
          text: receivedMessage, 
          time: new Date(),
          type: 'text'
        }];
        addLog(`Nuova lunghezza messaggi: ${newMessages.length}`);
        return newMessages;
      });
    });

    // Registra il gestore per ricevere i chunk audio
    connection.on('ReceiveAudioChunk', (user, chunkBase64, chunkId, isLastChunk, totalChunks) => {
      console.log(`[AUDIO DEBUG] Ricevuto chunk audio ${chunkId}/${totalChunks} da ${user} (isLastChunk: ${isLastChunk})`);
      
      // Non aggiungere messaggi audio dai nostri propri messaggi
      if (user === userName) {
        console.log('[AUDIO DEBUG] Ignorando chunk audio dal nostro utente poiché già aggiunto localmente');
        return;
      }
      
      if (chunkId === 0) {
        console.log(`[AUDIO DEBUG] Creazione nuovo messaggio audio per primo chunk (0/${totalChunks})`);
        setMessages(prevMessages => [...prevMessages, { 
          user, 
          audioChunks: [chunkBase64],
          totalChunks: totalChunks,
          receivedChunks: 1,
          isComplete: isLastChunk,
          time: new Date(),
          type: 'audio',
          id: Date.now() 
        }]);
      } else {
        console.log(`[AUDIO DEBUG] Gestione chunk audio ${chunkId}/${totalChunks}`);
        setMessages(prevMessages => {
          // Trova tutti i messaggi audio incompleti per questo utente
          const audioMessages = prevMessages.filter(m => 
            m.type === 'audio' && m.user === user && !m.isComplete);
          
          console.log(`[AUDIO DEBUG] Trovati ${audioMessages.length} messaggi audio incompleti`);
          
          if (audioMessages.length === 0) {
            console.log('[AUDIO DEBUG] ATTENZIONE: Nessun messaggio audio incompiuto trovato', {
              user,
              chunkId,
              totalChunks,
              numMessages: prevMessages.length,
              audioMessages: prevMessages.filter(m => m.type === 'audio')
            });
            return prevMessages;
          }
          
          // Prendi il messaggio audio più recente
          const lastAudioMessage = audioMessages[audioMessages.length - 1];
          console.log(`[AUDIO DEBUG] Aggiornamento messaggio audio con ID ${lastAudioMessage.id}, chunks attuali: ${lastAudioMessage.audioChunks.length}/${lastAudioMessage.totalChunks}`);
          
          return prevMessages.map(msg => {
            if (msg === lastAudioMessage) {
              // Verifica se abbiamo già questo chunk (potrebbe essere un duplicato)
              if (msg.audioChunks.length > chunkId) {
                console.log(`[AUDIO DEBUG] Chunk ${chunkId} già presente nel messaggio, ignorato`);
                return msg;
              }
              
              const newAudioChunks = [...msg.audioChunks, chunkBase64];
              console.log(`[AUDIO DEBUG] Aggiunto chunk ${chunkId}, ora abbiamo ${newAudioChunks.length}/${totalChunks} chunks`);
              
              const isComplete = isLastChunk || newAudioChunks.length === totalChunks;
              
              let audioUrl = msg.audioUrl;
              if (isComplete && !audioUrl) {
                console.log(`[AUDIO DEBUG] Audio completato con ${newAudioChunks.length} chunks, creazione URL`);
                try {
                  const audioBlob = base64ArrayToBlob(newAudioChunks, 'audio/wav');
                  audioUrl = URL.createObjectURL(audioBlob);
                  console.log('[AUDIO DEBUG] URL audio creato con successo');
                } catch (error) {
                  console.error('[AUDIO DEBUG] Errore nella creazione del blob audio:', error);
                }
              }
              
              return {
                ...msg,
                audioChunks: newAudioChunks,
                receivedChunks: msg.receivedChunks + 1,
                isComplete: isComplete,
                audioUrl: audioUrl
              };
            }
            return msg;
          });
        });
      }
    });

    // Aggiunge un messaggio di sistema quando un utente entra o esce
    connection.on('UserJoined', (user, userLang) => {
      if (user !== userName) {
        addLog(`Utente ${user} è entrato nella stanza con lingua: ${userLang}`);
        setMessages(prevMessages => [...prevMessages, {
          user: 'System',
          text: `${user} è entrato nella stanza (${userLang})`,
          time: new Date(),
          type: 'system'
        }]);
      }
    });

    connection.on('UserLeft', (user) => {
      addLog(`Utente ${user} ha lasciato la stanza`);
      setMessages(prevMessages => [...prevMessages, {
        user: 'System',
        text: `${user} ha lasciato la stanza`,
        time: new Date(),
        type: 'system'
      }]);
    });

    connection.on('ReceiveTranslatedAudio', (user, audioBase64, targetLanguage, translatedText) => {
      addLog(`Ricevuto audio tradotto da ${user} in lingua ${targetLanguage}`);
      
      // Crea un blob audio dai dati base64
      try {
        const audioBlob = base64ToBlob(audioBase64, 'audio/wav');
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Messaggio audio tradotto alla lista dei messaggi
        setMessages(prevMessages => [...prevMessages, { 
          user, 
          audioUrl: audioUrl,
          isComplete: true,
          translatedText: translatedText,
          time: new Date(),
          type: 'translatedAudio',
          language: targetLanguage,
          id: Date.now() 
        }]);
      } catch (error) {
        console.error('Errore nella conversione dell\'audio tradotto:', error);
      }
    });

    // Debug: Messaggio locale per verificare che il rendering funzioni
    setTimeout(() => {
      addLog("Aggiunto messaggio di test iniziale");
      setMessages(prev => [...prev, {
        user: "System",
        text: "Connessione alla chat stabilita",
        time: new Date(),
        type: "system"
      }]);
    }, 1000);

    // Gestisce la disconnessione
    return () => {
      addLog("Pulizia event handlers");
      connection.off('ReceiveMessage');
      connection.off('ReceiveAudioChunk');
      connection.off('UserJoined');
      connection.off('UserLeft');
      
      // Revoco gli URL degli oggetti audio
      messages.forEach(msg => {
        if (msg.type === 'audio' && msg.audioUrl) {
          URL.revokeObjectURL(msg.audioUrl);
        }
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, userName, addLog]);

  // Effetto per monitorare i cambiamenti nell'array dei messaggi
  useEffect(() => {
    addLog(`Numero di messaggi: ${messages.length}`);
  }, [messages, addLog]);

  if (!userName || !roomName) {
    return (
      <div className="error-container" style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', color: 'red' }}>
        <h2>Error: Missing user or room information</h2>
        <p>Please return to the login page and enter both your username and room name.</p>
        <a href="/" style={{ display: 'inline-block', marginTop: '10px', padding: '8px 16px', backgroundColor: '#2196F3', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
          Return to Login
        </a>
      </div>
    );
  }

  return (
    <div className="chat-container" style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h1>Chat: {roomName.trim()}</h1>
      <ConnectionStatus />
      <button onClick={() => {
        addLog("return login");
        window.location.href = "/";
      }} style={{
        marginBottom: '10px',
        padding: '5px 10px',
        backgroundColor: '#f44336',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      }}>
        Esci dalla Chat
      </button>
      
      {/* UserList component */}
      <div className="user-list" style={{ 
        marginBottom: '15px', 
        padding: '10px', 
        border: '1px solid #ddd', 
        borderRadius: '4px',
        backgroundColor: '#f9f9f9'
      }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>
          Utenti nella stanza ({roomUsers.length})
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {roomUsers.length > 0 ? (
            roomUsers.map((user, index) => (
              <div key={index} style={{ 
                padding: '4px 10px', 
                borderRadius: '15px', 
                backgroundColor: user === userName ? '#2196F3' : '#e0e0e0',
                color: user === userName ? 'white' : 'black',
                fontSize: '14px'
              }}>
                {user} {user === userName ? `(tu - ${language})` : ''}
              </div>
            ))
          ) : (
            <div style={{ color: '#777' }}>Nessun utente connesso</div>
          )}
        </div>
      </div>
      
      <MessageList messages={messages} />
      <AudioRecorder userName={userName} onAudioRecorded={handleAudioRecorded} />
      <MessageInput userName={userName} />
    </div>
  );
};

export default Chat;