import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { API_ENDPOINTS, apiCall } from '../apiConfig';

// Componente per creare una nuova stanza
const CreateRoom = ({ onBack }) => {
  const { accounts } = useMsal();
  const [userName, setUserName] = useState('');
  const [language, setLanguage] = useState('it');
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  // Auto-popola il nome utente
  useEffect(() => {
    if (accounts && accounts.length > 0) {
      const azureUser = accounts[0];
      const displayName = azureUser.name || azureUser.username?.split('@')[0] || 'Utente';
      setUserName(displayName);
    }
  }, [accounts]);

  const handleCreateRoom = async () => {
    if (!userName.trim()) {
      alert("Nome utente richiesto");
      return;
    }

    setIsCreating(true);
    navigate(`/chat?userName=${encodeURIComponent(userName)}&createRoom=true&language=${encodeURIComponent(language)}`);
  };

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
      <button
        onClick={onBack}
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
          backdropFilter: 'blur(10px)'
        }}
      >
        ← Indietro
      </button>

      <div style={{
        width: '400px',
        padding: '40px',
        borderRadius: '20px',
        backgroundColor: 'white',
        boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <h2 style={{ 
          marginBottom: '20px', 
          color: '#333',
          fontSize: '28px',
          fontWeight: 'bold'
        }}>
          🎯 Crea Nuova Stanza
        </h2>
        
        <div style={{ marginBottom: '25px', textAlign: 'left' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '10px', 
            fontWeight: 'bold',
            color: '#333'
          }}>
            🏷️ Il tuo nome:
          </label>
          <input
            type="text"
            placeholder="Il tuo nome nella chat"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            style={{
              width: '90%',
              padding: '15px',
              borderRadius: '8px',
              border: '2px solid #e0e0e0',
              fontSize: '16px',
              outline: 'none'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '30px', textAlign: 'left' }}>
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
              cursor: 'pointer'
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
          onClick={handleCreateRoom}
          disabled={isCreating || !userName.trim()}
          style={{
            width: '100%',
            padding: '18px',
            backgroundColor: isCreating ? '#ccc' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: isCreating ? 'not-allowed' : 'pointer',
            fontSize: '18px',
            fontWeight: 'bold',
            backgroundImage: isCreating ? 'none' : 'linear-gradient(45deg, #4CAF50, #45a049)'
          }}
        >
          {isCreating ? '⏳ Creando stanza...' : '🚀 Crea Stanza'}
        </button>

        <div style={{ 
          marginTop: '20px', 
          fontSize: '14px', 
          color: '#666',
          backgroundColor: '#f9f9f9',
          padding: '15px',
          borderRadius: '8px'
        }}>
          💡 <strong>Come funziona:</strong><br/>
          Verrà generato un link unico che potrai condividere con chi vuoi invitare nella stanza.
        </div>
      </div>
    </div>
  );
};


const JoinRoom = ({ roomId, onBack }) => {
  const { accounts } = useMsal();
  const [userName, setUserName] = useState('');
  const [language, setLanguage] = useState('it');
  const [isJoining, setIsJoining] = useState(false);
  const [roomExists, setRoomExists] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (accounts && accounts.length > 0) {
      const azureUser = accounts[0];
      const displayName = azureUser.name || azureUser.username?.split('@')[0] || 'Utente';
      setUserName(displayName);
    }
  }, [accounts]);

  useEffect(() => {
    setRoomExists(true);
  }, [roomId]);

  const handleJoinRoom = () => {
    if (!userName.trim()) {
      alert("Nome utente richiesto");
      return;
    }

    setIsJoining(true);
    navigate(`/chat?userName=${encodeURIComponent(userName)}&roomName=${encodeURIComponent(roomId)}&language=${encodeURIComponent(language)}`);
  };

  if (roomExists === false) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{
          padding: '40px',
          backgroundColor: 'white',
          borderRadius: '12px',
          textAlign: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ color: '#f44336', marginBottom: '20px' }}>Stanza non disponibile</h2>
          <p>La stanza <strong>{roomId}</strong> non esiste più o è stata chiusa.</p>
          <button 
            onClick={onBack}
            style={{
              padding: '12px 24px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              marginTop: '20px'
            }}
          >
            Torna alla Home
          </button>
        </div>
      </div>
    );
  }

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
      <button
        onClick={onBack}
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
          fontWeight: 'bold'
        }}
      >
        ← Indietro
      </button>

      <div style={{
        width: '400px',
        padding: '40px',
        borderRadius: '20px',
        backgroundColor: 'white',
        boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <h2 style={{ 
          marginBottom: '20px', 
          color: '#333',
          fontSize: '28px'
        }}>
          🔗 Entra nella Stanza
        </h2>

        <div style={{ 
          marginBottom: '25px', 
          padding: '15px', 
          backgroundColor: '#e8f4fd', 
          borderRadius: '8px'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>🏠 Stanza:</div>
          <div style={{ 
            fontSize: '18px', 
            fontFamily: 'monospace',
            color: '#2196F3',
            backgroundColor: 'white',
            padding: '8px',
            borderRadius: '4px'
          }}>
            {roomId}
          </div>
        </div>
        
        <div style={{ marginBottom: '25px', textAlign: 'left' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '10px', 
            fontWeight: 'bold'
          }}>
            🏷️ Il tuo nome:
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
              fontSize: '16px'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '30px', textAlign: 'left' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '10px', 
            fontWeight: 'bold'
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
              cursor: 'pointer'
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
          onClick={handleJoinRoom}
          disabled={isJoining || !userName.trim()}
          style={{
            width: '100%',
            padding: '18px',
            backgroundColor: isJoining ? '#ccc' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: isJoining ? 'not-allowed' : 'pointer',
            fontSize: '18px',
            fontWeight: 'bold'
          }}
        >
          {isJoining ? '⏳ Entrando...' : '🚀 Entra nella Stanza'}
        </button>
      </div>
    </div>
  );
};

// Componente per lo storico delle conversazioni
const ConversationHistory = ({ onRoomSelect, onNewChat, onCreateRoom, userName }) => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    const loadUserRooms = async () => {
      try {
        setLoading(true);
        setError('');
        
        const data = await apiCall(API_ENDPOINTS.USER_ROOMS(userName));
        console.log('Dati ricevuti:', data);
        setRooms(data.rooms || []);
      } catch (err) {
        console.error('Errore caricamento stanze:', err);
        setError(`Errore di connessione: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    if (userName) {
      loadUserRooms();
    }
  }, [userName]);

  const loadRoomMessages = async (roomName) => {
    try {
      setLoadingMessages(true);
      setError('');
      
      const data = await apiCall(API_ENDPOINTS.CONVERSATION(roomName, userName));
      console.log('Messaggi ricevuti:', data);
      setMessages(data.messages || []);
      setSelectedRoom(roomName);
    } catch (err) {
      console.error('Errore caricamento messaggi:', err);
      setError(`Errore caricamento conversazione: ${err.message}`);
    } finally {
      setLoadingMessages(false);
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
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onCreateRoom}
            style={{
              padding: '10px 20px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            ➕ Crea Stanza
          </button>
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
            🔗 Ho un Link
          </button>
        </div>
      </div>

      {error && (
        <div style={{ 
          color: '#d32f2f', 
          backgroundColor: '#ffebee', 
          padding: '15px', 
          borderRadius: '8px', 
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '20px', minHeight: '400px' }}>
        {/* Lista delle stanze */}
        <div style={{ flex: '1', minWidth: '300px' }}>
          <h3>🏠 Stanze Passate ({rooms.length})</h3>
          
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
              <p style={{ fontSize: '14px', margin: '0', color: '#999' }}>
                Crea una nuova stanza o entra con un link per iniziare
              </p>
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
                      : '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                  onClick={() => loadRoomMessages(room.roomName)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ 
                        margin: '0 0 12px 0', 
                        fontSize: '18px', 
                        fontWeight: 'bold', 
                        color: '#333',
                        fontFamily: 'monospace'
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
                        <span>💬 <strong>{room.messageCount}</strong> messaggi</span>
                        <span>🕒 {room.lastActivity}</span>
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
                💬 Anteprima: <span style={{ color: '#2196F3', fontFamily: 'monospace' }}>{selectedRoom}</span>
              </h3>
              
              {loadingMessages ? (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '40px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '12px',
                  border: '1px solid #e0e0e0'
                }}>
                  <div style={{ fontSize: '16px', color: '#666' }}>⏳ Caricamento messaggi...</div>
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
                            color: '#333'
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
                              borderRadius: '8px'
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
                            marginTop: '6px'
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
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Seleziona una conversazione</div>
                <div style={{ fontSize: '14px' }}>per vedere i messaggi passati</div>
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
    const [currentView, setCurrentView] = useState('history');
    const navigate = useNavigate();
    const location = useLocation();

    // Auto-popola il nome utente con i dati di Azure
    useEffect(() => {
        if (accounts && accounts.length > 0) {
            const azureUser = accounts[0];
            const displayName = azureUser.name || azureUser.username?.split('@')[0] || 'Utente';
            setUserName(displayName);
        }
    }, [accounts]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const roomIdFromUrl = params.get('roomId');
        
        if (roomIdFromUrl) {
            setRoomName(roomIdFromUrl);
            setCurrentView('join');
        }
    }, [location]);

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
        setCurrentView('manual');
    };

    const handleNewChat = () => {
        setRoomName("");
        setCurrentView('manual');
    };

    const handleCreateRoom = () => {
        setCurrentView('create');
    };

    const handleBack = () => {
        setCurrentView('history');
        setRoomName("");
    };

    switch (currentView) {
        case 'create':
            return <CreateRoom onBack={handleBack} />;
            
        case 'join':
            return <JoinRoom roomId={roomName} onBack={handleBack} />;
            
        case 'manual':
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
                    <button
                        onClick={handleBack}
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
                            fontWeight: 'bold'
                        }}
                    >
                        ← Torna allo storico
                    </button>

                    <div style={{
                        width: '400px',
                        padding: '40px',
                        borderRadius: '20px',
                        backgroundColor: 'white',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
                    }}>
                        <h2 style={{ 
                            textAlign: 'center', 
                            marginBottom: '30px', 
                            color: '#333',
                            fontSize: '28px',
                            fontWeight: 'bold'
                        }}>
                            🔗 Inserisci Link Stanza
                        </h2>
                        
                        <div style={{ 
                            marginBottom: '25px', 
                            padding: '20px', 
                            backgroundColor: '#e8f4fd', 
                            borderRadius: '12px',
                            fontSize: '14px'
                        }}>
                            <div style={{ marginBottom: '8px' }}>
                                <strong>👤 Utente:</strong> {accounts[0]?.name || 'Non disponibile'}
                            </div>
                        </div>
                        
                        <div style={{ marginBottom: '30px' }}>
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
                                    width: '90%',
                                    padding: '15px',
                                    borderRadius: '8px',
                                    border: '2px solid #e0e0e0',
                                    fontSize: '16px'
                                }}
                            />
                        </div>
                        
                        <div style={{ marginBottom: '30px' }}>
                            <label style={{ 
                                display: 'block', 
                                marginBottom: '10px', 
                                fontWeight: 'bold',
                                color: '#333'
                            }}>
                                🔗 ID Stanza:
                            </label>
                            <input
                                type="text"
                                placeholder="es: 20250604-1730-4521"
                                value={roomName}
                                onChange={(e) => setRoomName(e.target.value)}
                                style={{
                                    width: '90%',
                                    padding: '15px',
                                    borderRadius: '8px',
                                    border: '2px solid #e0e0e0',
                                    fontSize: '16px',
                                    fontFamily: 'monospace'
                                }}
                            />
                            {roomName && (
                                <small style={{ 
                                    color: '#2196F3', 
                                    fontSize: '12px',
                                    marginTop: '5px',
                                    display: 'block'
                                }}>
                                    ID stanza inserito
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
                                    cursor: 'pointer'
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
                                fontWeight: 'bold'
                            }}
                        >
                            {isLoading ? '⏳ Connecting...' : '🚀 Entra nella Stanza'}
                        </button>
                    </div>
                </div>
            );
            
        default:
            return (
                <ConversationHistory 
                    onRoomSelect={handleRoomSelect}
                    onNewChat={handleNewChat}
                    onCreateRoom={handleCreateRoom}
                    userName={userName}
                />
            );
    }
}

export default Login;