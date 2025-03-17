import React, { useState, useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import './SignalRChat.css';
import MicrophoneButton from './MicrophoneButton'; 

function SignalRChat() {
  // Stati base
  const [username, setUsername] = useState('');
  const [roomName, setRoomName] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [message, setMessage] = useState('');
  const [connectionError, setConnectionError] = useState('');
  
  // Stato per gli utenti connessi
  const [connectedUsers, setConnectedUsers] = useState([]);
  
  // Riferimento alla connessione SignalR
  const connectionRef = useRef(null);
  
  // Funzione per connettersi al server SignalR
  const connectToSignalR = async () => {
    if (!username || !roomName) {
      setMessage('Per favore, inserisci un nome utente e il nome della stanza');
      return;
    }
    
    try {
      setConnectionError('');
      setMessage('Tentativo di connessione...');
      
      // Crea una nuova connessione al server SignalR
      const connection = new signalR.HubConnectionBuilder()
        .withUrl('http://localhost:5051/audiohub')
        .configureLogging(signalR.LogLevel.Information) // Per il debug
        .withAutomaticReconnect([0, 1000, 5000, 10000]) // Strategia di riconnessione più robusta
        .build();
      
      // Configura gli handler per gli eventi
      connection.on('UserJoined', (user) => {
        setMessage(`${user} si è unito alla stanza`);
        // Aggiorna la lista degli utenti quando qualcuno si unisce
        setConnectedUsers(prev => Array.from(new Set([...prev, user])));
      });
      
      connection.on('UserLeft', (user) => {
        setMessage(`${user} ha lasciato la stanza`);
        // Rimuovi l'utente dalla lista
        setConnectedUsers(prev => prev.filter(u => u !== user));
      });
      
      connection.on('UsersInRoom', (users) => {
        // Aggiorna la lista degli utenti nella stanza
        setConnectedUsers(users);
      });
      
      connection.on('ReceiveAudio', (user, base64Audio) => {
        // Aggiungi un indicatore visivo temporaneo
        setMessage(`Ricevendo audio da ${user}...`);
        
        try {
          // Converti la stringa base64 in un Blob
          const byteCharacters = atob(base64Audio);
          const byteNumbers = new Array(byteCharacters.length);
          
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'audio/webm' });
          
          // Crea un URL e riproduci l'audio
          const audioUrl = URL.createObjectURL(blob);
          const audio = new Audio(audioUrl);
          
          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            // Ripristina il messaggio dopo la riproduzione
            setTimeout(() => {
              setMessage('');
            }, 500);
          };
          
          audio.play()
            .then(() => console.log(`Riproduzione audio da ${user}`))
            .catch(err => {
              console.error('Errore nella riproduzione:', err);
              setMessage(`Errore nella riproduzione audio da ${user}: ${err.message}`);
            });
        } catch (error) {
          console.error('Errore nel processare l\'audio:', error);
          setMessage(`Errore nel processare l'audio da ${user}: ${error.message}`);
        }
      });
      
      // Gestisce gli errori di connessione
      connection.onclose(error => {
        console.log('Connessione chiusa:', error);
        setIsConnected(false);
        setConnectionError('Connessione chiusa. Prova a riconnetterti.');
      });
      
      connection.onreconnecting(error => {
        console.log('Tentativo di riconnessione:', error);
        setMessage('Tentativo di riconnessione al server...');
      });
      
      connection.onreconnected(connectionId => {
        console.log('Riconnesso con ID:', connectionId);
        setMessage('Riconnesso al server!');
      });
      
      // Avvia la connessione
      await connection.start();
      console.log('Connessione SignalR stabilita');
      
      // Unisciti alla stanza
      await connection.invoke('JoinRoom', username, roomName);
      
      // Salva la connessione nel riferimento
      connectionRef.current = connection;
      setIsConnected(true);
      setMessage(`Connesso alla stanza ${roomName} come ${username}`);
      
    } catch (error) {
      console.error('Errore durante la connessione:', error);
      setConnectionError(`Errore di connessione: ${error.message}`);
      setMessage('');
    }
  };
  
  // Funzione per inviare l'audio registrato al server
  const handleAudioRecorded = (audioBlob) => {
    if (!connectionRef.current || connectionRef.current.state !== signalR.HubConnectionState.Connected) {
      console.error('Non connesso al server');
      setMessage('Non è possibile inviare audio: connessione al server non attiva');
      return;
    }
    
    try {
      // Converti il Blob in una stringa base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      reader.onloadend = () => {
        try {
          // Estrai la parte base64 dalla stringa data URL
          const base64Audio = reader.result.split(',')[1];
          
          if (!base64Audio) {
            throw new Error('Errore nella conversione dell\'audio in base64');
          }
          
          // Invia l'audio al server
          connectionRef.current.invoke('SendAudio', base64Audio)
            .then(() => console.log('Audio inviato con successo'))
            .catch(err => {
              console.error('Errore nell\'invio dell\'audio:', err);
              setMessage(`Errore nell'invio dell'audio: ${err.message}`);
            });
        } catch (error) {
          console.error('Errore nel processare l\'audio per l\'invio:', error);
          setMessage(`Errore nel processare l'audio per l'invio: ${error.message}`);
        }
      };
      
      reader.onerror = (error) => {
        console.error('Errore nella lettura del blob audio:', error);
        setMessage(`Errore nella lettura dell'audio: ${error.message}`);
      };
    } catch (error) {
      console.error('Errore generale nell\'elaborazione dell\'audio:', error);
      setMessage(`Errore generale nell'elaborazione dell'audio: ${error.message}`);
    }
  };
  
  // Funzione per disconnettersi
  const disconnect = async () => {
    if (connectionRef.current) {
      try {
        await connectionRef.current.stop();
        setIsConnected(false);
        connectionRef.current = null;
        setMessage('Disconnesso dal server');
        setConnectedUsers([]);
      } catch (error) {
        console.error('Errore durante la disconnessione:', error);
        setMessage(`Errore durante la disconnessione: ${error.message}`);
      }
    }
  };
  
  // Pulizia quando il componente viene smontato
  useEffect(() => {
    return () => {
      if (connectionRef.current) {
        connectionRef.current.stop()
          .catch(err => console.error('Errore durante la chiusura della connessione:', err));
      }
    };
  }, []);
  
  return (
    <div className="signalr-chat">
      <h2>Chat Audio in Tempo Reale</h2>
      
      {!isConnected ? (
        <div className="connection-form">
          <div className="form-group">
            <label>Nome utente:</label>
            <input 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              placeholder="Il tuo nome" 
            />
          </div>
          
          <div className="form-group">
            <label>Nome stanza:</label>
            <input 
              type="text" 
              value={roomName} 
              onChange={(e) => setRoomName(e.target.value)} 
              placeholder="Nome della stanza" 
            />
          </div>
          
          <button onClick={connectToSignalR}>Connetti</button>
          
          {connectionError && <div className="error-message">{connectionError}</div>}
        </div>
      ) : (
        <div className="chat-container">
          <div className="chat-header">
            <p>Connesso come: <strong>{username}</strong></p>
            <p>Stanza: <strong>{roomName}</strong></p>
          </div>
          
          <div className="users-list">
            <h3>Utenti nella stanza:</h3>
            <ul>
              {connectedUsers.map((user, index) => (
                <li key={index}>
                  {user} {user === username && '(tu)'}
                </li>
              ))}
            </ul>
          </div>
          
          <div className="audio-controls">
            <MicrophoneButton onAudioRecorded={handleAudioRecorded} />
            
            <button className="disconnect-button" onClick={disconnect}>
              Disconnetti
            </button>
          </div>
        </div>
      )}
      
      {message && <div className="message">{message}</div>}
    </div>
  );
}

export default SignalRChat;