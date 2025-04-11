import React, { useState, useEffect } from 'react';
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
  const userName = queryParams.get("userName");

  useEffect(() => {
    if (!connection) {
      console.log("No SignalR connection available yet");
      return;
    }

    console.log("Setting up SignalR event handlers");

    // registra il gestore per ricevere i messaggi di testo
    connection.on('ReceiveMessage', (user, receivedMessage) => {
      setMessages(prevMessages => [...prevMessages, { 
        user, 
        text: receivedMessage, 
        time: new Date(),
        type: 'text'
      }]);
    });

    // registra il gestore per ricevere i chunk audio
    connection.on('ReceiveAudioChunk', (user, chunkBase64, chunkId, isLastChunk, totalChunks) => {
      console.log(`Received audio chunk ${chunkId}/${totalChunks} from ${user}`);
      
      // Controlla se il messaggio audio è il primo chunk
      // Se è il primo chunk, crea un nuovo messaggio audio
      // Se è l'ultimo chunk, crea un messaggio audio completo
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
        // aggiungi il chunk audio al messaggio esistente
        setMessages(prevMessages => {
          // trova l'ultimo messaggio audio dell'utente
          const audioMessages = prevMessages.filter(m => 
            m.type === 'audio' && m.user === user && !m.isComplete);
          
          if (audioMessages.length === 0) return prevMessages;
          
          const lastAudioMessage = audioMessages[audioMessages.length - 1];
          
          // aggiorna il messaggio audio esistente con il nuovo chunk
          return prevMessages.map(msg => {
            if (msg === lastAudioMessage) {
              const newAudioChunks = [...msg.audioChunks, chunkBase64];
              const isComplete = isLastChunk || newAudioChunks.length === msg.totalChunks;
              
              // se il messaggio è completo e non ha ancora un URL audio lo crea
              let audioUrl = msg.audioUrl;
              if (isComplete && !msg.audioUrl) {
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
        setMessages(prevMessages => [...prevMessages, {
          user: 'System',
          text: `${user} è entrato nella stanza`,
          time: new Date(),
          type: 'system'
        }]);
      }
    });

    connection.on('UserLeft', (user) => {
      setMessages(prevMessages => [...prevMessages, {
        user: 'System',
        text: `${user} ha lasciato la stanza`,
        time: new Date(),
        type: 'system'
      }]);
    });

    // Gestisce la disconnessione
    return () => {
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
  }, [connection, messages, userName]);

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
      <h1>Chat: {roomName}</h1>
      <ConnectionStatus />
      
      {/* UserList component */}
      <div className="user-list" style={{ 
        marginBottom: '15px', 
        padding: '10px', 
        border: '1px solid #ddd', 
        borderRadius: '4px',
        backgroundColor: '#f9f9f9'
      }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Utenti nella stanza ({roomUsers.length})</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {roomUsers.map((user, index) => (
            <div key={index} style={{ 
              padding: '4px 10px', 
              borderRadius: '15px', 
              backgroundColor: user === userName ? '#2196F3' : '#e0e0e0',
              color: user === userName ? 'white' : 'black',
              fontSize: '14px'
            }}>
              {user} {user === userName ? '(tu)' : ''}
            </div>
          ))}
        </div>
      </div>
      
      <MessageList messages={messages} />
      <AudioRecorder userName={userName} />
      <MessageInput userName={userName} />
    </div>
  );
};

export default Chat;