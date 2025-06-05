import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const [shareableLink, setShareableLink] = useState('');
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [roomCreated, setRoomCreated] = useState(false);
  const hasInitialized = useRef(false); 
  const roomCreationAttempted = useRef(false);
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const userName = queryParams.get("userName")?.trim();
  const createRoom = queryParams.get("createRoom") === 'true';

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

  // Gestione creazione stanza se richiesta
  useEffect(() => {
    if (!createRoom || !connection || !userName || roomCreationAttempted.current) {
      return;
    }
    if (connection.state === 'Connected' && !isCreatingRoom && !roomCreated) {
      roomCreationAttempted.current = true;
      setIsCreatingRoom(true);
      
      const handleCreateRoom = async () => {
        try {
          // addLog("Creazione nuova stanza richiesta");
          
          const roomId = await connection.invoke('CreateRoom', userName, language);
          // addLog(`Stanza creata con ID: ${roomId}`);
          
          setRoomCreated(true);
          
          // Genera il link condivisibile
          const currentDomain = window.location.origin;
          const shareLink = `${currentDomain}/?roomId=${roomId}`;
          setShareableLink(shareLink);
          setShowLinkModal(true);
          
          // Aggiorna l'URL senza trigger di re-render
          const newUrl = `${window.location.pathname}?userName=${encodeURIComponent(userName)}&roomName=${encodeURIComponent(roomId)}&language=${encodeURIComponent(language)}`;
          window.history.replaceState({}, '', newUrl);
          
        } catch (error) {
          console.error('Errore nella creazione della stanza:', error);
          // addLog(`Errore creazione stanza: ${error.message}`, 'error');
          roomCreationAttempted.current = false; // Reset in caso di errore
        } finally {
          setIsCreatingRoom(false);
        }
      };

      handleCreateRoom();
    }
  }, [createRoom, connection, userName, language, roomCreated, isCreatingRoom]);


  const handleAudioRecorded = useCallback((audioUrl, base64Chunks) => {
    addLog('Audio registrato localmente');
    
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

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Link copiato negli appunti!');
    } catch (err) {
      console.error('Errore nella copia:', err);
      // Fallback per browser che non supportano clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('Link copiato negli appunti!');
    }
  };

  const shareViaWhatsApp = (link) => {
    const message = `Ciao! Ti invito nella mia stanza chat SpeakSwap. Clicca qui per unirti: ${link}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const shareViaEmail = (link) => {
    const subject = "Invito alla chat SpeakSwap";
    const body = `Ciao!\n\nTi invito nella mia stanza chat SpeakSwap per conversare con traduzione automatica.\n\nClicca su questo link per unirti:\n${link}\n`;
    const mailUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailUrl);
  };

  useEffect(() => {
    if (!connection) {
      addLog("No SignalR connection available yet", "warn");
      return;
    }

    // Evita di configurare gli handler multipli
    if (hasInitialized.current) {
      return;
    }

    hasInitialized.current = true;
    addLog("Setting up SignalR event handlers");

    setMessages([{
      user: "System",
      text: "Connessione alla chat stabilita",
      time: new Date(),
      type: "system"
    }]);

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
          const audioMessages = prevMessages.filter(m => 
            m.type === 'audio' && m.user === user && !m.isComplete);
          
          if (audioMessages.length === 0) {
            console.log('[AUDIO DEBUG] ATTENZIONE: Nessun messaggio audio incompiuto trovato');
            return prevMessages;
          }
          
          const lastAudioMessage = audioMessages[audioMessages.length - 1];
          
          return prevMessages.map(msg => {
            if (msg === lastAudioMessage) {
              if (msg.audioChunks.length > chunkId) {
                console.log(`[AUDIO DEBUG] Chunk ${chunkId} già presente nel messaggio, ignorato`);
                return msg;
              }
              
              const newAudioChunks = [...msg.audioChunks, chunkBase64];
              const isComplete = isLastChunk || newAudioChunks.length === totalChunks;
              
              let audioUrl = msg.audioUrl;
              if (isComplete && !audioUrl) {
                try {
                  const audioBlob = base64ArrayToBlob(newAudioChunks, 'audio/wav');
                  audioUrl = URL.createObjectURL(audioBlob);
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

    connection.on('JoinedRoom', (roomJoined, actualUserName) => {
      const originalUserName = new URLSearchParams(location.search).get("userName");
      
      if (actualUserName !== originalUserName) {
        setMessages(prevMessages => [...prevMessages, {
          user: 'System',
          text: `Il tuo nome è stato cambiato in "${actualUserName}" per evitare duplicati`,
          time: new Date(),
          type: 'system'
        }]);
      }
    });

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
      
      try {
        const audioBlob = base64ToBlob(audioBase64, 'audio/wav');
        const audioUrl = URL.createObjectURL(audioBlob);
        
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

    // Gestisci la notifica di stanza distrutta
    connection.on('RoomDestroyed', (destroyedRoomName) => {
      if (destroyedRoomName === roomName) {
        setMessages(prevMessages => [...prevMessages, {
          user: 'System',
          text: `🗑️ La stanza è stata chiusa perché vuota. La conversazione è terminata.`,
          time: new Date(),
          type: 'system'
        }]);
      }
    });

    // Gestisce la disconnessione
    return () => {
      addLog("Pulizia event handlers");
      connection.off('ReceiveMessage');
      connection.off('ReceiveAudioChunk');
      connection.off('UserJoined');
      connection.off('UserLeft');
      connection.off('RoomCreated');
      connection.off('RoomDestroyed');
      
      // Revoco gli URL degli oggetti audio
      messages.forEach(msg => {
        if (msg.type === 'audio' && msg.audioUrl) {
          URL.revokeObjectURL(msg.audioUrl);
        }
      });
    };
  }, [connection, userName, addLog, roomName, language, location.search, messages]);

  if (!userName || (!roomName && !createRoom)) {
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
      <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        💬 Chat: {roomName || 'Nuova Stanza'}
        {roomName && (
          <span style={{ 
            fontSize: '14px', 
            fontFamily: 'monospace', 
            backgroundColor: '#f0f0f0', 
            padding: '4px 8px', 
            borderRadius: '4px',
            color: '#666'
          }}>
            {roomName}
          </span>
        )}
      </h1>
      
      <ConnectionStatus />
      
      {/* Pulsanti di controllo */}
      <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button onClick={() => {
          addLog("return login");
          window.location.href = "/";
        }} style={{
          padding: '8px 16px',
          backgroundColor: '#f44336',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px'
        }}>
          🏠 Esci dalla Chat
        </button>
        
        {/* Pulsante per condividere link (solo se abbiamo un roomName) */}
        {roomName && (
          <button onClick={() => {
            const currentDomain = window.location.origin;
            const shareLink = `${currentDomain}/?roomId=${roomName}`;
            setShareableLink(shareLink);
            setShowLinkModal(true);
          }} style={{
            padding: '8px 16px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}>
            🔗 Condividi Stanza
          </button>
        )}

        {/*
        {roomName && (
          <div style={{
            padding: '8px 12px',
            backgroundColor: '#2196F3',
            color: 'white',
            borderRadius: '4px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            🔒 Stanza Privata
          </div>
        )} */}
      </div>
      
      {/* UserList component */}
      <div className="user-list" style={{ 
        marginBottom: '15px', 
        padding: '15px', 
        border: '1px solid #ddd', 
        borderRadius: '8px',
        backgroundColor: '#f9f9f9'
      }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          👥 Utenti nella stanza ({roomUsers.length})
          {roomUsers.length === 1 && roomName && (
            <span style={{ fontSize: '12px', color: '#666', fontWeight: 'normal' }}>
              - Condividi il link per invitare altri
            </span>
          )}
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {roomUsers.length > 0 ? (
            roomUsers.map((user, index) => (
              <div key={index} style={{ 
                padding: '6px 12px', 
                borderRadius: '20px', 
                backgroundColor: user === userName ? '#2196F3' : '#e0e0e0',
                color: user === userName ? 'white' : 'black',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                {user === userName ? '👑' : '👤'} {user} 
                {user === userName && ` (tu - ${language})`}
              </div>
            ))
          ) : (
            <div style={{ color: '#777', fontSize: '14px' }}>
              {isCreatingRoom ? (
                <span>⏳ Creando stanza...</span>
              ) : (
                <span>📭 Nessun utente connesso</span>
              )}
            </div>
          )}
        </div>
        
        {/* Avviso stanza temporanea */}
        {roomName && roomUsers.length > 0 && (
          <div style={{
            marginTop: '10px',
            padding: '8px 12px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffeaa7',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#856404'
          }}>
            ⚠️ <strong>Stanza temporanea:</strong> Quando tutti escono, la stanza viene eliminata definitivamente.
          </div>
        )}
      </div>
      
      <MessageList messages={messages} />
      <AudioRecorder userName={userName} onAudioRecorded={handleAudioRecorded} />
      <MessageInput userName={userName} />

      {/* Modal per condividere link */}
      {showLinkModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '12px',
            maxWidth: '500px',
            width: '90%',
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ marginTop: 0, color: '#333', fontSize: '24px' }}>🎉 Stanza Creata!</h3>
            <p style={{ color: '#666', marginBottom: '20px', fontSize: '16px' }}>
              Condividi questo link per invitare altre persone:
            </p>
            
            <div style={{
              backgroundColor: '#f5f5f5',
              padding: '15px',
              borderRadius: '8px',
              marginBottom: '20px',
              border: '1px solid #ddd'
            }}>
              <div style={{ 
                fontFamily: 'monospace', 
                fontSize: '14px', 
                wordBreak: 'break-all',
                color: '#333',
                lineHeight: '1.4'
              }}>
                {shareableLink}
              </div>
            </div>

            <div style={{ 
              display: 'flex', 
              gap: '10px', 
              justifyContent: 'center', 
              marginBottom: '20px',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={() => copyToClipboard(shareableLink)}
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                📋 Copia Link
              </button>
              
              <button
                onClick={() => shareViaWhatsApp(shareableLink)}
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#25D366',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                📱 WhatsApp
              </button>
              
              <button
                onClick={() => shareViaEmail(shareableLink)}
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#EA4335',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                📧 Email
              </button>
            </div>

            {/* <div style={{
              padding: '15px',
              backgroundColor: '#e8f4fd',
              borderRadius: '8px',
              marginBottom: '20px',
              fontSize: '14px',
              color: '#555'
            }}>
              💡 <strong>Ricorda:</strong> La stanza si chiuderà automaticamente quando tutti escono. 
              Il link funzionerà solo finché almeno una persona rimane connessa.
            </div> */}

            <button
              onClick={() => setShowLinkModal(false)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#757575',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ✕ Chiudi
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;