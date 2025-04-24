import React, { useEffect, useRef } from 'react';

const MessageList = ({ messages }) => {
  const messagesEndRef = useRef(null);
  
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    
    if (messages.length > 0) {
      console.log("Messaggi disponibili:", messages.length, messages);
    }
  }, [messages]);

  return (
    <div style={{ height: '300px', overflowY: 'scroll', border: '1px solid #ccc', marginBottom: '10px', padding: '10px' }}>
      {messages && messages.length > 0 ? (
        messages.map((msg, index) => (
          <div key={index} style={{ 
            marginBottom: '15px',
            backgroundColor: msg.type === 'system' ? '#f5f5f5' : 'transparent',
            padding: msg.type === 'system' ? '5px 10px' : '0',
            borderRadius: '4px'
          }}>
            {msg.type !== 'system' && (
              <div>
                <span style={{ fontWeight: 'bold' }}>{msg.user}:</span>
                <span style={{ fontSize: '0.8em', color: '#888', marginLeft: '8px' }}>
                  {msg.time?.toLocaleTimeString()}
                </span>
              </div>
            )}
            
            {msg.type === 'text' && (
              <div>{msg.text}</div>
            )}
            
            {msg.type === 'system' && (
              <div style={{ 
                fontSize: '0.9em', 
                color: '#666',
                fontStyle: 'italic',
                display: 'flex',
                alignItems: 'center'
              }}>
                <span style={{ 
                  display: 'inline-block', 
                  width: '8px', 
                  height: '8px', 
                  backgroundColor: '#2196F3', 
                  borderRadius: '50%', 
                  marginRight: '8px' 
                }}></span>
                {msg.text}
                <span style={{ 
                  fontSize: '0.8em', 
                  color: '#999', 
                  marginLeft: 'auto' 
                }}>
                  {msg.time?.toLocaleTimeString()}
                </span>
              </div>
            )}
            
            {msg.type === 'audio' && (
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

            {msg.type === 'translatedAudio' && (
              <div>
                <audio src={msg.audioUrl} controls style={{ marginTop: '5px' }} />
                {msg.translatedText && (
                  <div style={{ 
                    fontSize: '0.9em', 
                    fontStyle: 'italic', 
                    color: '#555', 
                    marginTop: '4px',
                    padding: '4px 8px',
                    backgroundColor: '#f8f8f8',
                    borderRadius: '4px'
                  }}>
                    "{msg.translatedText}"
                  </div>
                )}
              </div>
            )}
            
          </div>
        ))
      ) : (
        <div style={{ textAlign: 'center', color: '#777', padding: '20px 0' }}>
          Nessun messaggio nella stanza
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;