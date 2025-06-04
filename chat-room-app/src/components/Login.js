import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";

// Componente per lo storico delle conversazioni
const ConversationHistory = ({ onRoomSelect, onNewChat, userName }) => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Carica le stanze dell'utente
  useEffect(() => {
    const loadUserRooms = async () => {
      try {
        setLoading(true);
        setError('');
        
        // URL ASSOLUTO del backend
        const apiUrl = `http://localhost:8081/api/UserHistory/rooms/${encodeURIComponent(userName)}`;
        console.log('🔗 Chiamando API:', apiUrl);
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          // Aggiungi questa opzione per CORS
          mode: 'cors'
        });
        
        console.log('📡 Risposta:', response.status, response.statusText);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ Dati ricevuti:', data);
        setRooms(data.rooms || []);
      } catch (err) {
        console.error('❌ Errore caricamento stanze:', err);
        setError(`Errore di connessione: ${err.message}`);
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
      setError('');
      
      // URL ASSOLUTO del backend
      const apiUrl = `http://localhost:8081/api/UserHistory/conversation/${encodeURIComponent(roomName)}/${encodeURIComponent(userName)}`;
      console.log('🔗 Chiamando API conversazione:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors'
      });
      
      console.log('📡 Risposta conversazione:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('✅ Messaggi ricevuti:', data);
      setMessages(data.messages || []);
      setSelectedRoom(roomName);
    } catch (err) {
      console.error('❌ Errore caricamento messaggi:', err);
      setError(`Errore caricamento conversazione: ${err.message}`);
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
        <div style={{ fontSize: '18px', color: '#666' }}>⏳ Caricamento storico...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>📚 Le tue conversazioni ({userName})</h2>
        <button
          onClick={onNewChat}
          style={{
            padding: '10px 20px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold'
          }}
        >
          ➕ Nuova Chat
        </button>
      </div>

      {error && (
        <div style={{ 
          color: '#d32f2f', 
          backgroundColor: '#ffebee', 
          padding: '15px', 
          borderRadius: '8px', 
          marginBottom: '20px',
          border: '1px solid #f8bbd9'
        }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '20px', minHeight: '400px' }}>
        {/* Lista delle stanze */}
        <div style={{ flex: '1', minWidth: '300px' }}>
          <h3>🏠 Stanze ({rooms.length})</h3>
          
          {rooms.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px', 
              backgroundColor: '#f5f5f5', 
              borderRadius: '12px',
              color: '#666',
              border: '2px dashed #ddd'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '15px' }}>💬</div>
              <p style={{ fontSize: '16px', margin: '0 0 10px 0' }}>Nessuna conversazione trovata</p>
              <p style={{ fontSize: '14px', margin: '0', color: '#999' }}>Inizia una nuova chat per vedere lo storico qui</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {rooms.map((room, index) => (
                <div
                  key={index}
                  style={{
                    padding: '20px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '12px',
                    backgroundColor: selectedRoom === room.roomName ? '#e3f2fd' : 'white',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: selectedRoom === room.roomName 
                      ? '0 4px 12px rgba(33,150,243,0.3)' 
                      : '0 2px 8px rgba(0,0,0,0.1)',
                    ':hover': {
                      boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
                    }
                  }}
                  onClick={() => loadRoomMessages(room.roomName)}
                  onMouseEnter={(e) => {
                    if (selectedRoom !== room.roomName) {
                      e.target.style.backgroundColor = '#f8f9fa';
                      e.target.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedRoom !== room.roomName) {
                      e.target.style.backgroundColor = 'white';
                      e.target.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ 
                        margin: '0 0 12px 0', 
                        fontSize: '18px', 
                        fontWeight: 'bold', 
                        color: '#333',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        🏠 {room.roomName}
                      </h4>
                      <div style={{ 
                        fontSize: '14px', 
                        color: '#666', 
                        marginBottom: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '15px'
                      }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          💬 <strong>{room.messageCount}</strong> messaggi
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          🕒 {room.lastActivity}
                        </span>
                      </div>
                      <div style={{ 
                        fontSize: '13px', 
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}>
                        {room.daysAgo === 0 ? (
                          <span style={{ color: '#4caf50' }}>🟢 Oggi</span>
                        ) : room.daysAgo === 1 ? (
                          <span style={{ color: '#ff9800' }}>🟡 Ieri</span>
                        ) : (
                          <span style={{ color: '#757575' }}>🔴 {room.daysAgo} giorni fa</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        joinExistingRoom(room.roomName);
                      }}
                      style={{
                        padding: '10px 18px',
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.backgroundColor = '#45a049';
                        e.target.style.transform = 'scale(1.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.backgroundColor = '#4CAF50';
                        e.target.style.transform = 'scale(1)';
                      }}
                    >
                      ▶️ Riprendi
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Anteprima messaggi */}
        <div style={{ flex: '1', minWidth: '400px' }}>
          {selectedRoom ? (
            <>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
                💬 Anteprima: <span style={{ color: '#2196F3' }}>{selectedRoom}</span>
              </h3>
              
              {loadingMessages ? (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '40px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '12px',
                  border: '1px solid #e0e0e0'
                }}>
                  <div style={{ fontSize: '18px', color: '#666', marginBottom: '10px' }}>⏳</div>
                  <div style={{ fontSize: '16px', color: '#666' }}>Caricamento messaggi...</div>
                </div>
              ) : (
                <div style={{
                  height: '450px',
                  overflowY: 'auto',
                  border: '1px solid #e0e0e0',
                  borderRadius: '12px',
                  padding: '20px',
                  backgroundColor: '#fafafa'
                }}>
                  {messages.length === 0 ? (
                    <div style={{ 
                      textAlign: 'center', 
                      color: '#666',
                      padding: '40px 0'
                    }}>
                      <div style={{ fontSize: '48px', marginBottom: '15px' }}>📭</div>
                      <div>Nessun messaggio trovato</div>
                    </div>
                  ) : (
                    messages.slice(-20).map((msg, index) => (
                      <div key={index} style={{ 
                        marginBottom: '18px', 
                        fontSize: '14px',
                        backgroundColor: 'white',
                        padding: '15px',
                        borderRadius: '12px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        border: '1px solid #f0f0f0'
                      }}>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '8px'
                        }}>
                          <span style={{ 
                            fontWeight: 'bold', 
                            color: '#333',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            👤 {msg.userName}
                          </span>
                          <span style={{ 
                            fontSize: '12px', 
                            color: '#999',
                            backgroundColor: '#f5f5f5',
                            padding: '4px 8px',
                            borderRadius: '6px'
                          }}>
                            🕒 {new Date(msg.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ 
                          color: '#555', 
                          lineHeight: '1.5',
                          padding: '8px 0'
                        }}>
                          {msg.messageType === 'audio_transcription' ? (
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '8px',
                              fontStyle: 'italic',
                              color: '#666',
                              backgroundColor: '#f0f8ff',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1px solid #e1f5fe'
                            }}>
                              🎤 {msg.message}
                            </div>
                          ) : (
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'flex-start', 
                              gap: '8px' 
                            }}>
                              <span style={{ color: '#2196F3', fontSize: '16px' }}>💬</span>
                              <span>{msg.message}</span>
                            </div>
                          )}
                        </div>
                        {msg.language !== 'it' && (
                          <div style={{ 
                            fontSize: '12px', 
                            color: '#888', 
                            marginTop: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            🌐 Lingua: <strong>{msg.language.toUpperCase()}</strong>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '450px',
              border: '2px dashed #ddd',
              borderRadius: '12px',
              color: '#999',
              fontSize: '16px',
              backgroundColor: '#fafafa'
            }}>
              <div style={{ fontSize: '64px', marginBottom: '20px' }}>👈</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Seleziona una stanza</div>
                <div style={{ fontSize: '14px' }}>per vedere l'anteprima dei messaggi</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Componente principale Login
function Login() {
    const { accounts } = useMsal();
    const [userName, setUserName] = useState("");
    const [roomName, setRoomName] = useState("");
    const [language, setLanguage] = useState("it");
    const [isLoading, setIsLoading] = useState(false);
    const [showHistory, setShowHistory] = useState(true);
    const navigate = useNavigate();

    // Auto-popola il nome utente con i dati di Azure
    useEffect(() => {
        if (accounts && accounts.length > 0) {
            const azureUser = accounts[0];
            const displayName = azureUser.name || azureUser.username?.split('@')[0] || 'Utente';
            setUserName(displayName);
        }
    }, [accounts]);

    const handleLogin = () => {
        if (!userName.trim()) {
            alert("Nome utente non disponibile. Riprova il login.");
            return;
        }
        
        if (!roomName.trim()) {
            alert("Please enter a room name");
            return;
        }

        setIsLoading(true);
        navigate(`/chat?userName=${encodeURIComponent(userName)}&roomName=${encodeURIComponent(roomName)}&language=${encodeURIComponent(language)}`);
    };

    const handleRoomSelect = (selectedRoomName) => {
        setRoomName(selectedRoomName);
        setShowHistory(false);
    };

    const handleNewChat = () => {
        setRoomName("");
        setShowHistory(false);
    };

    // Mostra lo storico se l'utente ha scelto di vederlo
    if (showHistory) {
        return (
            <ConversationHistory 
                onRoomSelect={handleRoomSelect}
                onNewChat={handleNewChat}
                userName={userName}
            />
        );
    }

    // Form per nuova chat o stanza selezionata
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            backgroundColor: '#f5f5f5',
            backgroundImage: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}>
            {/* Bottone per tornare allo storico */}
            <button
                onClick={() => setShowHistory(true)}
                style={{
                    position: 'absolute',
                    top: '20px',
                    left: '20px',
                    padding: '12px 20px',
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    backdropFilter: 'blur(10px)',
                    transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                    e.target.style.backgroundColor = 'rgba(255,255,255,0.3)';
                }}
                onMouseLeave={(e) => {
                    e.target.style.backgroundColor = 'rgba(255,255,255,0.2)';
                }}
            >
                ← Torna allo storico
            </button>

            <div style={{
                width: '400px',
                padding: '40px',
                borderRadius: '20px',
                backgroundColor: 'white',
                boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
                backdropFilter: 'blur(10px)'
            }}>
                <h2 style={{ 
                    textAlign: 'center', 
                    marginBottom: '30px', 
                    color: '#333',
                    fontSize: '28px',
                    fontWeight: 'bold'
                }}>
                    🎯 SpeakSwap Chat
                </h2>
                
                {/* Info utente da Azure */}
                <div style={{ 
                    marginBottom: '25px', 
                    padding: '20px', 
                    backgroundColor: '#e8f4fd', 
                    borderRadius: '12px',
                    fontSize: '14px',
                    border: '1px solid #bbdefb'
                }}>
                    <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong>👤 Utente:</strong> 
                        <span>{accounts[0]?.name || 'Non disponibile'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong>📧 Email:</strong> 
                        <span style={{ fontSize: '12px' }}>{accounts[0]?.username || 'Non disponibile'}</span>
                    </div>
                </div>
                
                <div style={{ marginBottom: '25px' }}>
                    <label style={{ 
                        display: 'block', 
                        marginBottom: '10px', 
                        fontWeight: 'bold',
                        color: '#333'
                    }}>
                        🏷️ Username per la chat:
                    </label>
                    <input
                        type="text"
                        placeholder="Il tuo nome nella chat"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '15px',
                            borderRadius: '8px',
                            border: '2px solid #e0e0e0',
                            fontSize: '16px',
                            transition: 'border-color 0.3s ease',
                            outline: 'none'
                        }}
                        onFocus={(e) => {
                            e.target.style.borderColor = '#2196F3';
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = '#e0e0e0';
                        }}
                    />
                    <small style={{ color: '#666', fontSize: '12px', marginTop: '5px', display: 'block' }}>
                        Puoi modificare il nome che appare nella chat
                    </small>
                </div>
                
                <div style={{ marginBottom: '25px' }}>
                    <label style={{ 
                        display: 'block', 
                        marginBottom: '10px', 
                        fontWeight: 'bold',
                        color: '#333'
                    }}>
                        🏠 Nome Stanza:
                    </label>
                    <input
                        type="text"
                        placeholder="Enter room name"
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '15px',
                            borderRadius: '8px',
                            border: '2px solid #e0e0e0',
                            fontSize: '16px',
                            transition: 'border-color 0.3s ease',
                            outline: 'none'
                        }}
                        onFocus={(e) => {
                            e.target.style.borderColor = '#2196F3';
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = '#e0e0e0';
                        }}
                    />
                    {roomName && (
                        <small style={{ 
                            color: '#2196F3', 
                            fontSize: '12px',
                            marginTop: '5px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            ✅ Stanza selezionata dallo storico
                        </small>
                    )}
                </div>
                
                <div style={{ marginBottom: '30px' }}>
                    <label style={{ 
                        display: 'block', 
                        marginBottom: '10px', 
                        fontWeight: 'bold',
                        color: '#333'
                    }}>
                        🌐 Lingua:
                    </label>
                    <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '15px',
                            borderRadius: '8px',
                            border: '2px solid #e0e0e0',
                            fontSize: '16px',
                            backgroundColor: 'white',
                            cursor: 'pointer',
                            outline: 'none'
                        }}
                    >
                        <option value="it">🇮🇹 Italian</option>
                        <option value="en">🇺🇸 English</option>
                        <option value="fr">🇫🇷 Français</option>
                        <option value="es">🇪🇸 Español</option>
                        <option value="de">🇩🇪 Deutsch</option>
                    </select>
                </div>

                <button 
                    onClick={handleLogin}
                    disabled={isLoading}
                    style={{
                        width: '100%',
                        padding: '18px',
                        backgroundColor: isLoading ? '#ccc' : '#2196F3',
                        color: 'white',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        fontSize: '18px',
                        fontWeight: 'bold',
                        transition: 'all 0.3s ease',
                        backgroundImage: isLoading ? 'none' : 'linear-gradient(45deg, #2196F3, #21CBF3)'
                    }}
                    onMouseEnter={(e) => {
                        if (!isLoading) {
                            e.target.style.transform = 'translateY(-2px)';
                            e.target.style.boxShadow = '0 8px 25px rgba(33,150,243,0.3)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!isLoading) {
                            e.target.style.transform = 'translateY(0)';
                            e.target.style.boxShadow = 'none';
                        }
                    }}
                >
                    {isLoading ? '⏳ Connecting...' : 
                     roomName ? '🔄 Riprendi Chat' : '🚀 Join Chat'}
                </button>
            </div>
        </div>
    );
}

export default Login;