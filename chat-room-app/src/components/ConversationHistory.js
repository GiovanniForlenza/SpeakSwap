import React, { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';

const ConversationHistory = ({ onRoomSelect, onNewChat }) => {
  const { accounts } = useMsal();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const userName = accounts[0]?.name || accounts[0]?.username?.split('@')[0] || 'Utente';

  // Carica le stanze dell'utente
  useEffect(() => {
    const loadUserRooms = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/UserHistory/rooms/${encodeURIComponent(userName)}`);
        
        if (!response.ok) {
          throw new Error('Errore nel caricamento dello storico');
        }
        
        const data = await response.json();
        setRooms(data.rooms || []);
      } catch (err) {
        console.error('Errore nel caricamento delle stanze:', err);
        setError('Impossibile caricare lo storico delle conversazioni');
      } finally {
        setLoading(false);
      }
    };

    if (userName) {
      loadUserRooms();
    }
  }, [userName]);

  // Carica i messaggi di una stanza specifica
  const loadRoomMessages = async (roomName) => {
    try {
      setLoadingMessages(true);
      const response = await fetch(`/api/UserHistory/conversation/${encodeURIComponent(roomName)}/${encodeURIComponent(userName)}`);
      
      if (!response.ok) {
        throw new Error('Errore nel caricamento della conversazione');
      }
      
      const data = await response.json();
      setMessages(data.messages || []);
      setSelectedRoom(roomName);
    } catch (err) {
      console.error('Errore nel caricamento dei messaggi:', err);
      setError('Impossibile caricare la conversazione');
    } finally {
      setLoadingMessages(false);
    }
  };

  const joinExistingRoom = (roomName) => {
    if (onRoomSelect) {
      onRoomSelect(roomName);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '18px', color: '#666' }}>Caricamento storico...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Le tue conversazioni</h2>
        <button
          onClick={onNewChat}
          style={{
            padding: '10px 20px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          Nuova Chat
        </button>
      </div>

      {error && (
        <div style={{ 
          color: 'red', 
          backgroundColor: '#ffebee', 
          padding: '10px', 
          borderRadius: '4px', 
          marginBottom: '20px' 
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '20px' }}>
        {/* Lista delle stanze */}
        <div style={{ flex: '1', minWidth: '300px' }}>
          <h3>Stanze ({rooms.length})</h3>
          
          {rooms.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px', 
              backgroundColor: '#f5f5f5', 
              borderRadius: '8px',
              color: '#666'
            }}>
              <p>Nessuna conversazione trovata</p>
              <p style={{ fontSize: '14px' }}>Inizia una nuova chat per vedere lo storico qui</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {rooms.map((room, index) => (
                <div
                  key={index}
                  style={{
                    padding: '16px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    backgroundColor: selectedRoom === room.roomName ? '#e3f2fd' : 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => loadRoomMessages(room.roomName)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold' }}>
                        {room.roomName}
                      </h4>
                      <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                        {room.messageCount} messaggi • Ultima attività: {room.lastActivity}
                      </div>
                      <div style={{ fontSize: '12px', color: '#999' }}>
                        {room.daysAgo === 0 ? 'Oggi' : 
                         room.daysAgo === 1 ? 'Ieri' : 
                         `${room.daysAgo} giorni fa`}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        joinExistingRoom(room.roomName);
                      }}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Riprendi
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Anteprima messaggi */}
        {selectedRoom && (
          <div style={{ flex: '1', minWidth: '400px' }}>
            <h3>Anteprima: {selectedRoom}</h3>
            
            {loadingMessages ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                Caricamento messaggi...
              </div>
            ) : (
              <div style={{
                height: '400px',
                overflowY: 'auto',
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '16px',
                backgroundColor: '#fafafa'
              }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#666' }}>
                    Nessun messaggio trovato
                  </div>
                ) : (
                  messages.slice(-20).map((msg, index) => (
                    <div key={index} style={{ marginBottom: '12px', fontSize: '14px' }}>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        marginBottom: '4px'
                      }}>
                        <span style={{ fontWeight: 'bold', color: '#333' }}>
                          {msg.userName}
                        </span>
                        <span style={{ fontSize: '12px', color: '#999' }}>
                          {new Date(msg.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ color: '#555', lineHeight: '1.4' }}>
                        {msg.messageType === 'audio_transcription' ? (
                          <em style={{ color: '#666' }}>🎤 {msg.message}</em>
                        ) : (
                          msg.message
                        )}
                      </div>
                      {msg.language !== 'it' && (
                        <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                          Lingua: {msg.language}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationHistory;