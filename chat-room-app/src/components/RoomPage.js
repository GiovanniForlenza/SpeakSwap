import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import * as signalR from '@microsoft/signalr';
import WebAudioRecorder from '../services/WebAudioRecorder';
import WebAudioPlayer from '../services/WebAudioPlayer';
import './RoomPage.css';

function RoomPage() {
  const { roomName } = useParams();
  const [searchParams] = useSearchParams();
  const username = searchParams.get('username') || localStorage.getItem('audioChat_username');
  const navigate = useNavigate();
  const language = searchParams.get('language') || localStorage.getItem('audioChat_language') || 'it';
  
  // Stati
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [message, setMessage] = useState('');
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [speakingUsers, setSpeakingUsers] = useState({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [, setDebugInfo] = useState('');
  const [, setAudioStats] = useState({
    sent: 0,
    received: 0,
    lastSentSize: 0,
    lastReceivedSize: 0
  });
  
  // Riferimenti
  const connectionRef = useRef(null);
  const recorderRef = useRef(null);
  const playerRef = useRef(null);
  const hasConnectedRef = useRef(false);
  
  // Inizializza il servizio audio e la connessione
  useEffect(() => {
    if (!username || !roomName) {
      navigate('/');
      return;
    }
    
    if (!hasConnectedRef.current) {
      hasConnectedRef.current = true;
      initializeAudioServices();
      connectToSignalR();
    }
    
    return () => {
      releaseResources();
    };
  }, [username, roomName, navigate]);
  
  // Inizializza i servizi audio
  const initializeAudioServices = async () => {
    try {
      setDebugInfo('Inizializzazione servizi audio...');
      
      // Inizializza il registratore
      const recorder = new WebAudioRecorder({
        debug: true,
        silenceThreshold: 0.01, // Regola questa soglia in base ai test
        silenceTimeout: 800, // ms di silenzio prima di inviare
        onAudioAvailable: handleAudioAvailable,
        onLevelUpdate: handleAudioLevelUpdate
      });
      
      // Inizializza il player
      const player = new WebAudioPlayer({
        debug: true,
        onPlayStart: (userId) => {
          setSpeakingUsers(prev => ({ ...prev, [userId]: true }));
        },
        onPlayEnd: (userId) => {
          setSpeakingUsers(prev => {
            const newState = {...prev};
            delete newState[userId];
            return newState;
          });
        }
      });
      
      // Inizializza entrambi
      const recorderInitResult = await recorder.initialize();
      const playerInitResult = player.initialize();
      
      if (recorderInitResult && playerInitResult) {
        recorderRef.current = recorder;
        playerRef.current = player;
        setDebugInfo(prev => `${prev}\nServizi audio inizializzati con successo`);
      } else {
        setDebugInfo(prev => `${prev}\nErrore nell'inizializzazione dei servizi audio`);
        setConnectionError('Impossibile inizializzare l\'audio. Controlla le autorizzazioni del browser.');
      }
    } catch (error) {
      console.error('Errore nell\'inizializzazione dei servizi audio:', error);
      setDebugInfo(prev => `${prev}\nErrore servizi audio: ${error.message}`);
      setConnectionError(`Errore audio: ${error.message}`);
    }
  };

  // Handler per i dati audio generati
  const handleAudioAvailable = useCallback(async (audioData) => {
    if (!connectionRef.current || connectionRef.current.state !== signalR.HubConnectionState.Connected) {
      return;
    }
    
    try {
      // Converti i dati in formato trasmissibile
      const base64Data = arrayBufferToBase64(audioData.data);
      
      // Crea un oggetto con metadati e dati
      const audioPacket = {
        sampleRate: audioData.sampleRate,
        channelCount: audioData.channelCount,
        length: audioData.length,
        data: base64Data
      };
      
      // Converti in JSON
      const jsonData = JSON.stringify(audioPacket);
      
      // Aggiorna statistiche
      setAudioStats(prev => ({
        ...prev,
        sent: prev.sent + 1,
        lastSentSize: jsonData.length
      }));
      
      // Invia tramite SignalR
      await connectionRef.current.invoke('SendPCMAudio', jsonData);
      
    } catch (error) {
      console.error('Errore nell\'invio dell\'audio:', error);
    }
  }, []);

  // Utilità per convertire ArrayBuffer in Base64
  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  // Utilità per convertire Base64 in ArrayBuffer
  const base64ToArrayBuffer = (base64) => {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // Aggiorna l'indicatore del livello del microfono
  const handleAudioLevelUpdate = useCallback((level) => {
    setMicLevel(level);
  }, []);

  // Connessione a SignalR
  const connectToSignalR = async () => {
    try {
      setConnectionError('');
      setMessage('Connessione al server...');
      setDebugInfo(prev => `${prev}\nConnessione a SignalR...`);
      
      // Configura la connessione
      const connection = new signalR.HubConnectionBuilder()
        .withUrl('http://localhost:5051/audiohub')
        .configureLogging(signalR.LogLevel.Information)
        .withAutomaticReconnect([0, 1000, 3000, 5000, 10000]) // Strategia di riconnessione robusta
        .build();
      
      // Eventi utente
      connection.on('UserJoined', (user) => {
        setMessage(`${user} si è unito alla stanza`);
        setConnectedUsers(prev => {
          if (!prev.includes(user)) return [...prev, user];
          return prev;
        });
      });
      
      connection.on('UserLeft', (user) => {
        setMessage(`${user} ha lasciato la stanza`);
        setConnectedUsers(prev => prev.filter(u => u !== user));
        setSpeakingUsers(prev => {
          const newState = {...prev};
          delete newState[user];
          return newState;
        });
      });
      
      connection.on('UsersInRoom', (users) => {
        setConnectedUsers([...new Set(users)]);
      });
      
      // Gestione ricezione audio PCM
      connection.on('ReceivePCMAudio', (user, jsonData) => {
        try {
          console.log(`Audio PCM ricevuto da ${user}, lunghezza: ${jsonData.length}`);
          
          // Aggiorna statistiche
          setAudioStats(prev => ({
            ...prev,
            received: prev.received + 1,
            lastReceivedSize: jsonData.length
          }));
          
          // Converti il JSON in oggetto
          const audioPacket = JSON.parse(jsonData);
          
          // Ricostruisci il buffer audio
          const audioData = {
            sampleRate: audioPacket.sampleRate,
            channelCount: audioPacket.channelCount,
            length: audioPacket.length,
            data: base64ToArrayBuffer(audioPacket.data)
          };
          
          // Riproduci l'audio
          if (playerRef.current) {
            playerRef.current.playPCMAudio(user, audioData);
          }
          
        } catch (error) {
          console.error('Errore nell\'elaborazione dell\'audio PCM:', error);
          setDebugInfo(prev => `${prev}\nErrore PCM: ${error.message}`);
        }
      });

      connection.on('ReceiveTranslatedAudio', (senderUsername, language, translatedText, audioBase64) => {
        try {
          console.log(`Audio tradotto ricevuto da ${senderUsername} in ${language}: "${translatedText}"`);
          
          // Converti base64 in ArrayBuffer
          const byteCharacters = atob(audioBase64);
          const byteArray = new Uint8Array(byteCharacters.length);
          
          for (let i = 0; i < byteCharacters.length; i++) {
            byteArray[i] = byteCharacters.charCodeAt(i);
          }
          
          // Usa il WebAudioPlayer per riprodurre l'audio tradotto
          if (playerRef.current) {
            // Crea dati audio conformi al formato atteso da playPCMAudio
            const audioData = {
              sampleRate: 16000, // Valore predefinito per Azure Speech
              channelCount: 1,
              length: byteArray.length,
              data: byteArray.buffer
            };
            
            // Riproduci l'audio
            playerRef.current.playPCMAudio(senderUsername, audioData);
          }
          
          // Aggiorna le statistiche
          setAudioStats(prev => ({
            ...prev,
            received: prev.received + 1,
            lastReceivedSize: audioBase64.length
          }));
          
        } catch (error) {
          console.error('Errore nella riproduzione dell\'audio tradotto:', error);
          setDebugInfo(prev => `${prev}\nErrore audio tradotto: ${error.message}`);
        }
      });

      // Gestione degli stati di connessione
      connection.onclose(error => {
        console.log('Connessione chiusa:', error);
        setIsConnected(false);
        setMessage('Connessione persa. Tentativo di riconnessione...');
      });
      
      connection.onreconnecting(error => {
        console.log('Tentativo di riconnessione:', error);
        setMessage('Tentativo di riconnessione...');
      });
      
      connection.onreconnected(connectionId => {
        console.log('Riconnesso con ID:', connectionId);
        setMessage('Riconnesso al server!');
        
        // Rientra nella stanza dopo la riconnessione
        connection.invoke('JoinRoom', username, roomName, language)
          .catch(err => {
            console.error('Errore nel rientrare nella stanza:', err);
          });
      });
      
      // Avvia la connessione
      await connection.start();
      
      // Unisciti alla stanza
      await connection.invoke('JoinRoom', username, roomName, language);
      
      // Salva il riferimento
      connectionRef.current = connection;
      setIsConnected(true);
      setMessage(`Connesso alla stanza ${roomName} come ${username}`);
      setDebugInfo(prev => `${prev}\nConnesso a SignalR`);
      
      // Heartbeat per mantenere attiva la connessione
      const heartbeat = setInterval(async () => {
        if (connection.state === signalR.HubConnectionState.Connected) {
          try {
            await connection.invoke('Ping');
          } catch (error) {
            console.error('Heartbeat fallito:', error);
          }
        }
      }, 30000);
      
      return () => clearInterval(heartbeat);
      
    } catch (error) {
      console.error('Errore nella connessione a SignalR:', error);
      setConnectionError(`Errore di connessione: ${error.message}`);
      setDebugInfo(prev => `${prev}\nErrore SignalR: ${error.message}`);
      
      // Tentativo di riconnessione dopo 5 secondi
      setTimeout(() => {
        if (!connectionRef.current) connectToSignalR();
      }, 5000);
    }
  };

  // Toggle dello streaming audio
  const toggleMicrophone = () => {
    if (!recorderRef.current) {
      setMessage('Servizio audio non inizializzato');
      return;
    }
    
    if (isStreaming) {
      recorderRef.current.stopRecording();
      setIsStreaming(false);
      setMessage('Microfono disattivato');
    } else {
      const result = recorderRef.current.startRecording();
      if (result) {
        setIsStreaming(true);
        setMessage('Microfono attivato - Parlare per registrare');
      } else {
        setMessage('Impossibile attivare il microfono');
      }
    }
  };

  // Test connessione audio
  const testAudio = () => {
    if (!playerRef.current) {
      setMessage('Servizio audio non inizializzato');
      return;
    }
    
    try {
      // Genera un breve suono di test utilizzando l'AudioContext
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.value = 440; // La 440Hz
      gainNode.gain.value = 0.3;
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
        ctx.close();
      }, 500);
      
      setMessage('Test audio eseguito');
    } catch (error) {
      setMessage(`Test audio fallito: ${error.message}`);
    }
  };

  // Rilascia tutte le risorse
  const releaseResources = () => {
    // Ferma la registrazione e rilascia le risorse
    if (recorderRef.current) {
      recorderRef.current.release();
      recorderRef.current = null;
    }
    
    // Rilascia il player audio
    if (playerRef.current) {
      playerRef.current.release();
      playerRef.current = null;
    }
    
    // Disconnetti da SignalR
    if (connectionRef.current) {
      connectionRef.current.stop()
        .catch(err => console.error('Errore nella chiusura della connessione:', err));
      connectionRef.current = null;
    }
    
    // Reset stato
    hasConnectedRef.current = false;
  };

  // Torna alla home
  const leaveRoom = () => {
    releaseResources();
    navigate('/');
  };

  return (
    <div className="room-container">
      <div className="room-header">
        <h2>Stanza: {roomName}</h2>
        <p>Connesso come: <strong>{username}</strong></p>
        {isConnected ? (
          <span className="connection-status connected">Connesso</span>
        ) : (
          <span className="connection-status disconnected">Disconnesso</span>
        )}
      </div>
      
      <div className="room-content">
        <div className="users-panel">
          <h3>Utenti nella stanza:</h3>
          {connectedUsers.length > 0 ? (
            <ul className="users-list">
              {connectedUsers.map((user, index) => (
                <li 
                  key={index} 
                  className={`user-item ${speakingUsers[user] ? 'speaking' : ''} ${user === username ? 'current-user' : ''}`}
                >
                  {user} {user === username && '(tu)'} {speakingUsers[user] && '🔊'}
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-users">Nessun altro utente nella stanza</p>
          )}
        </div>
        
        <div className="controls-panel">
          <div className="microphone-container">
            <button
              className={`microphone-button ${isStreaming ? 'recording' : ''}`}
              onClick={toggleMicrophone}
              aria-label={isStreaming ? 'Disattiva microfono' : 'Attiva microfono'}
            >
              <i className={`microphone-icon ${isStreaming ? 'recording' : ''}`}></i>
              {isStreaming ? 'Disattiva Microfono' : 'Attiva Microfono'}
            </button>
            
            {isStreaming && (
              <div className="mic-level-indicator">
                <div className="level-bar" style={{ width: `${micLevel}%` }}></div>
              </div>
            )}
          </div>
          
          <div className="action-buttons">
            <button onClick={testAudio} className="test-button">
              Test Audio
            </button>
            
            {/* <button onClick={() => setMessage(checkAudioCapabilities())} className="test-button">
              Test Compatibilità Audio
            </button> */}
            
            <button onClick={leaveRoom} className="leave-button">
              Lascia Stanza
            </button>
          </div>
          
          {message && <div className="message">{message}</div>}
          {connectionError && <div className="error-message">{connectionError}</div>}
        </div>
      </div>
    </div>
  );
}

export default RoomPage;