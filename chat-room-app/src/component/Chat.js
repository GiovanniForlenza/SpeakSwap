import React, { useState, useEffect } from 'react';
import { useSignalRConnection } from './SignalRConnectionProvider';
import { base64ArrayToBlob } from './audioUtils';
import { useLocation } from 'react-router-dom';
import ConnectionStatus from './ConnectionStatus';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import AudioRecorder from './AudioRecorder';

const Chat = () => {
  const { connection, connectionStatus } = useSignalRConnection() || { connection: null, connectionStatus: 'Disconnected' };
  const [messages, setMessages] = useState([]);
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const userName = queryParams.get("userName");
  const roomName = queryParams.get("roomName");

  useEffect(() => {
    if (!connection) {
      console.log("No SignalR connection available yet");
      return;
    }

    console.log("Setting up SignalR event handlers");

    // Register handler for receiving text messages
    connection.on('ReceiveMessage', (user, receivedMessage) => {
      setMessages(prevMessages => [...prevMessages, { 
        user, 
        text: receivedMessage, 
        time: new Date(),
        type: 'text'
      }]);
    });

    // Register handler for receiving audio messages
    connection.on('ReceiveAudioChunk', (user, chunkBase64, chunkId, isLastChunk, totalChunks) => {
      console.log(`Received audio chunk ${chunkId}/${totalChunks} from ${user}`);
      
      // If it's the first chunk, create a new audio message
      if (chunkId === 0) {
        setMessages(prevMessages => [...prevMessages, { 
          user, 
          audioChunks: [chunkBase64],
          totalChunks: totalChunks,
          receivedChunks: 1,
          isComplete: isLastChunk,
          time: new Date(),
          type: 'audio',
          id: Date.now() // Unique ID to identify this audio message
        }]);
      } else {
        // Add the chunk to an existing message
        setMessages(prevMessages => {
          // Find the last incomplete audio message from this user
          const audioMessages = prevMessages.filter(m => 
            m.type === 'audio' && m.user === user && !m.isComplete);
          
          if (audioMessages.length === 0) return prevMessages;
          
          const lastAudioMessage = audioMessages[audioMessages.length - 1];
          
          // Update message with the new chunk
          return prevMessages.map(msg => {
            if (msg === lastAudioMessage) {
              const newAudioChunks = [...msg.audioChunks, chunkBase64];
              const isComplete = isLastChunk || newAudioChunks.length === msg.totalChunks;
              
              // If the message is complete, create the audio blob
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

    // Cleanup handlers and resources
    return () => {
      connection.off('ReceiveMessage');
      connection.off('ReceiveAudioChunk');
      
      // Revoke object URLs to prevent memory leaks
      messages.forEach(msg => {
        if (msg.type === 'audio' && msg.audioUrl) {
          URL.revokeObjectURL(msg.audioUrl);
        }
      });
    };
  }, [connection, messages]);

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
      <h1>Chat with SignalR</h1>
      <ConnectionStatus />
      <MessageList messages={messages} />
      <AudioRecorder userName={userName} />
      <MessageInput userName={userName} />
    </div>
  );
};

export default Chat;