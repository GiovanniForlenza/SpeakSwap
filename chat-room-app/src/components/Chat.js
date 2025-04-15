import React, { useState, useEffect, useCallback } from 'react';
import { useSignalRConnection } from './SignalRConnectionProvider';
import { base64ArrayToBlob } from './audioUtils';
import { useLocation } from 'react-router-dom';
import ConnectionStatus from './ConnectionStatus';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import AudioRecorder from './AudioRecorder';

const Chat = () => {
  const { connection, roomUsers, roomName } = useSignalRConnection() || { 
    connection: null, 
    connectionStatus: 'Disconnected',
    roomUsers: [],
    roomName: ''
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
      addLog(`Ricevuto chunk audio ${chunkId}/${totalChunks} da ${user}`);
      
      if (chunkId === 0) {
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
        setMessages(prevMessages => {
          const audioMessages = prevMessages.filter(m => 
            m.type === 'audio' && m.user === user && !m.isComplete);
          
          if (audioMessages.length === 0) {
            addLog(`Nessun messaggio audio incompiuto trovato per ${user}`, "warn");
            return prevMessages;
          }
          
          const lastAudioMessage = audioMessages[audioMessages.length - 1];
          
          return prevMessages.map(msg => {
            if (msg === lastAudioMessage) {
              const newAudioChunks = [...msg.audioChunks, chunkBase64];
              const isComplete = isLastChunk || newAudioChunks.length === msg.totalChunks;
              
              let audioUrl = msg.audioUrl;
              if (isComplete && !msg.audioUrl) {
                addLog(`Creazione blob audio per messaggio di ${user}`, "debug");
                const audioBlob = base64ArrayToBlob(newAudioChunks, 'audio/webm');
                audioUrl = URL.createObjectURL(audioBlob);
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
    connection.on('UserJoined', (user) => {
      if (user !== userName) {
        addLog(`Utente ${user} è entrato nella stanza`);
        setMessages(prevMessages => [...prevMessages, {
          user: 'System',
          text: `${user} è entrato nella stanza`,
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

    // Debug: aggiungi un messaggio locale per verificare che il rendering funzioni
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
  // Rimuovi messages dalla dipendenza per evitare reregistrazioni multiple
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
      
      {/* Debug button */}
      <button onClick={() => {
        addLog("Test button clicked");
        setMessages(prev => [...prev, {
          user: userName,
          text: "Test message " + new Date().toLocaleTimeString(),
          time: new Date(),
          type: "text"
        }]);
      }} style={{
        marginBottom: '10px',
        padding: '5px 10px',
        backgroundColor: '#9c27b0',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      }}>
        Test Message
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
                {user} {user === userName ? '(tu)' : ''}
              </div>
            ))
          ) : (
            <div style={{ color: '#777' }}>Nessun utente connesso</div>
          )}
        </div>
      </div>
      
      <MessageList messages={messages} />
      <AudioRecorder userName={userName} />
      <MessageInput userName={userName} />
      
      {/* Debug status */}
      <div style={{ 
        marginTop: '10px', 
        fontSize: '12px', 
        color: '#777',
        padding: '5px',
        borderTop: '1px solid #eee'
      }}>
        Messaggi: {messages.length} | Utenti: {roomUsers.length}
      </div>
    </div>
  );
};

export default Chat;