import React, { useState, useEffect } from 'react';
import { useSignalRConnection } from './SignalRConnectionProvider';
import { base64ArrayToBlob } from './audioUtils';
import ConnectionStatus from './ConnectionStatus';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import AudioRecorder from './AudioRecorder';

const Chat = ({ userName = 'User' }) => {
  const { connection } = useSignalRConnection();
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!connection) return;

    // Registra il gestore per ricevere messaggi di testo
    connection.on('ReceiveMessage', (user, receivedMessage) => {
      setMessages(prevMessages => [...prevMessages, { 
        user, 
        text: receivedMessage, 
        time: new Date(),
        type: 'text'
      }]);
    });

    // Registra il gestore per ricevere messaggi audio
    connection.on('ReceiveAudioChunk', (user, chunkBase64, chunkId, isLastChunk, totalChunks) => {
      console.log(`Ricevuto chunk audio ${chunkId}/${totalChunks} da ${user}`);
      
      // Se è il primo chunk, crea un nuovo messaggio audio
      if (chunkId === 0) {
        setMessages(prevMessages => [...prevMessages, { 
          user, 
          audioChunks: [chunkBase64],
          totalChunks: totalChunks,
          receivedChunks: 1,
          isComplete: isLastChunk,
          time: new Date(),
          type: 'audio',
          id: Date.now() // ID univoco per identificare questo messaggio audio
        }]);
      } else {
        // Aggiunge il chunk a un messaggio esistente
        setMessages(prevMessages => {
          // Trova l'ultimo messaggio audio di questo utente che non è completo
          const audioMessages = prevMessages.filter(m => 
            m.type === 'audio' && m.user === user && !m.isComplete);
          
          if (audioMessages.length === 0) return prevMessages;
          
          const lastAudioMessage = audioMessages[audioMessages.length - 1];
          
          // Aggiorna il messaggio con il nuovo chunk
          return prevMessages.map(msg => {
            if (msg === lastAudioMessage) {
              const newAudioChunks = [...msg.audioChunks, chunkBase64];
              const isComplete = isLastChunk || newAudioChunks.length === msg.totalChunks;
              
              // Se il messaggio è completo, crea il blob audio
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

    // Pulizia degli handler e delle risorse
    return () => {
      connection.off('ReceiveMessage');
      connection.off('ReceiveAudioChunk');
      
      // Revoca gli URL degli oggetti per evitare perdite di memoria
      messages.forEach(msg => {
        if (msg.type === 'audio' && msg.audioUrl) {
          URL.revokeObjectURL(msg.audioUrl);
        }
      });
    };
  }, [connection]);

  return (
    <div className="chat-container" style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h1>Chat con SignalR</h1>
      <ConnectionStatus />
      <MessageList messages={messages} />
      <AudioRecorder userName={userName} />
      <MessageInput userName={userName} />
    </div>
  );
};

export default Chat;