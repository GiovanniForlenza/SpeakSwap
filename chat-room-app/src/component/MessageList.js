import React, { useEffect, useRef } from 'react';
import { useSignalRConnection } from './SignalRConnectionProvider';
import { base64ArrayToBlob } from './audioUtils';

const MessageList = ({ messages }) => {
  const messagesEndRef = useRef(null);
  
  // Auto-scroll ai nuovi messaggi
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div style={{ height: '300px', overflowY: 'scroll', border: '1px solid #ccc', marginBottom: '10px', padding: '10px' }}>
      {messages.map((msg, index) => (
        <div key={index} style={{ marginBottom: '15px' }}>
          <div>
            <span style={{ fontWeight: 'bold' }}>{msg.user}:</span>
            <span style={{ fontSize: '0.8em', color: '#888', marginLeft: '8px' }}>
              {msg.time?.toLocaleTimeString()}
            </span>
          </div>
          
          {msg.type === 'text' ? (
            <div>{msg.text}</div>
          ) : (
            <div>
              {msg.isComplete ? (
                <audio src={msg.audioUrl} controls style={{ marginTop: '5px' }} />
              ) : (
                <div style={{ marginTop: '5px' }}>
                  Ricezione audio... {msg.receivedChunks}/{msg.totalChunks}
                  <div style={{ 
                    height: '4px', 
                    backgroundColor: '#e0e0e0', 
                    borderRadius: '2px',
                    overflow: 'hidden',
                    marginTop: '4px'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${(msg.receivedChunks / msg.totalChunks) * 100}%`,
                      backgroundColor: '#4CAF50',
                      borderRadius: '2px'
                    }}></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;