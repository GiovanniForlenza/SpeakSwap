import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { HubConnectionBuilder, LogLevel, HttpTransportType } from '@microsoft/signalr';
import { useLocation, useNavigate } from 'react-router-dom';

const SignalRContext = createContext(null);

export const useSignalRConnection = () => useContext(SignalRContext);

export const SignalRConnectionProvider = ({ hubUrl, children }) => {
  const [connection, setConnection] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [roomUsers, setRoomUsers] = useState([]);
  const [reconnectCount, setReconnectCount] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const userName = queryParams.get("userName");
  const roomName = queryParams.get("roomName");
  const language = queryParams.get("language") || 'it';

  const joinRoom = useCallback(async (conn, user, room, lang) => {
    if (!conn || conn.state !== 'Connected') {
      console.error("Impossibile entrare nella stanza: connessione non attiva");
      return false;
    }
    
    try {
      const trimmedUser = user?.trim();
      const trimmedRoom = room?.trim();
      
      if (!trimmedUser || !trimmedRoom) {
        console.error("Nome utente o stanza non validi");
        return false;
      }
      
      console.log(`Entrando nella stanza ${room} come ${user} con lingua ${lang}...`);
      await conn.invoke('JoinRoom', user, room, lang);
      console.log(`Entrato nella stanza ${room}`);
      return true;
    } catch (err) {
      console.error(`Errore nell'entrare nella stanza ${room}:`, err);
      return false;
    }
  }, []);

  useEffect(() => {
    // Eseguire solo nel browser, non durante la fase di build
    if (typeof window === 'undefined') return;

    // Salva log per il debugging
    const addLog = (message, type = 'info') => {
      console.log(`[SignalR ${type}] ${message}`);
      const logs = JSON.parse(localStorage.getItem('signalRLogs') || '[]');
      logs.push({
        time: new Date().toISOString(),
        message,
        type
      });
      if (logs.length > 100) logs.shift();
      localStorage.setItem('signalRLogs', JSON.stringify(logs));
    };

    let hubConnection = null;
    let pingInterval = null;
    
    // Funzione separata per creare la connessione
    const createConnection = () => {
      addLog(`Creazione nuova connessione a: ${hubUrl}`);
      
      return new HubConnectionBuilder()
        .withUrl(hubUrl, {
            skipNegotiation: false, // Cambiato: consenti negoziazione per Azure SignalR
            transport: HttpTransportType.WebSockets,
            serverTimeoutInMilliseconds: 100000, // 100 secondi di timeout
            keepAliveIntervalInMilliseconds: 15000 // 15 secondi di keep-alive
        })
        .configureLogging(LogLevel.Information)
        .withAutomaticReconnect({
          nextRetryDelayInMilliseconds: retryContext => {
            // Incrementa il contatore di tentativi
            setReconnectCount(prev => prev + 1);
            
            if (retryContext.previousRetryCount < 10) {
              const delayMs = Math.min(1000 * Math.pow(1.5, retryContext.previousRetryCount), 30000);
              addLog(`Tentativo di riconnessione ${retryContext.previousRetryCount + 1} tra ${delayMs}ms`);
              return delayMs;
            }
            return null;
          }
        })
        .build();
    };

    // Funzione per avviare la connessione
    const startConnection = async () => {
      try {
        if (hubConnection && hubConnection.state === "Connected") {
          addLog("Connessione già attiva");
          return;
        }

        if (!hubConnection) {
          hubConnection = createConnection();
          
          // Eventi di connessione
          hubConnection.onreconnecting(error => {
            addLog(`Riconnessione in corso: ${error?.message || 'Errore sconosciuto'}`, 'warn');
            setConnectionStatus('Reconnecting');
          });

          hubConnection.onreconnected(connectionId => {
            addLog(`Riconnesso con ID: ${connectionId || 'ID non disponibile'}`);
            setConnectionStatus('Connected');
            setReconnectCount(0); // Reset del contatore di riconnessioni
            
            // Quando riconnesso, rientra automaticamente nella stanza
            if (userName && roomName) {
              joinRoom(hubConnection, userName, roomName, language);
            }
          });
          
          hubConnection.onclose(error => {
            addLog(`Connessione chiusa: ${error?.message || 'Nessun errore specificato'}`, 'error');
            setConnectionStatus('Disconnected');
          });
          
          // Eventi stanza
          hubConnection.on('JoinedRoom', (roomJoined, actualUserName) => {
            addLog(`Sei entrato nella stanza: ${roomJoined} con nome: ${actualUserName}`);

            if (actualUserName !== userName) {
              addLog(`Il nome utente è stato cambiato in: ${actualUserName}`, 'warn');
              const newUrl = new URL(window.location);
              newUrl.searchParams.set('userName', actualUserName);
              window.history.replaceState({}, '', newUrl);
            }
          });
          
          hubConnection.on('UserJoined', (user) => {
            addLog(`Utente ${user} si è unito alla stanza`);
            setRoomUsers(prevUsers => {
              if (!prevUsers.includes(user)) {
                return [...prevUsers, user];
              }
              return prevUsers;
            });
          });

          hubConnection.on('UserLeft', (user) => {
            addLog(`Utente ${user} ha lasciato la stanza`);
            setRoomUsers(prevUsers => prevUsers.filter(u => u !== user));
          });

          hubConnection.on('UsersInRoom', (users) => {
            addLog(`Utenti nella stanza: ${users.join(', ')}`);
            setRoomUsers(users);
          });
          
          hubConnection.on('Reconnect', () => {
            addLog('Il server ha richiesto una riconnessione', 'warn');
            
            // Riavvia la connessione
            hubConnection.stop().then(() => {
              setTimeout(() => {
                startConnection();
              }, 1000);
            });
          });
        }

        addLog('Avvio connessione...');
        await hubConnection.start();
        addLog('Connessione stabilita!');
        setConnectionStatus('Connected');
        setReconnectCount(0);
        setConnection(hubConnection);
        
        // Dopo la connessione, entra nella stanza
        if (userName && roomName) {
          const joined = await joinRoom(hubConnection, userName, roomName, language);
          if (!joined) {
            addLog('Impossibile entrare nella stanza, riprovo...', 'warn');
            setTimeout(() => joinRoom(hubConnection, userName, roomName, language), 2000);
          }
        }
      } catch (err) {
        addLog(`Errore di connessione: ${err.message}`, 'error');
        setConnectionStatus('Error');
        
        // Riprova dopo un ritardo
        addLog('Riprovo la connessione tra 5 secondi...');
        setTimeout(startConnection, 5000);
      }
    };

    // Avvia la connessione
    startConnection();

    // Imposta il ping periodico
    pingInterval = setInterval(() => {
      if (hubConnection && hubConnection.state === 'Connected') {
        addLog('Invio ping keep-alive...', 'debug');
        hubConnection.invoke('Ping')
          .then(response => addLog(`Risposta ping: ${response}`, 'debug'))
          .catch(err => {
            addLog(`Errore ping keep-alive: ${err.message}`, 'warn');
            
            // Se il ping fallisce, potrebbe essere un problema di connessione
            if (hubConnection.state !== 'Connected') {
              hubConnection.stop().then(() => {
                addLog('Riavvio connessione dopo ping fallito');
                setTimeout(startConnection, 1000);
              });
            }
          });
      } else {
        addLog(`Skip ping: stato connessione = ${hubConnection?.state}`, 'debug');
      }
    }, 20000); // Ping ogni 20 secondi

    // Pulizia
    return () => {
      addLog('Cleanup provider SignalR');
      if (pingInterval) {
        clearInterval(pingInterval);
        addLog('Intervallo ping fermato');
      }
      if (hubConnection) {
        hubConnection.stop();
        addLog('Connessione fermata');
      }
    };
  }, [hubUrl, userName, roomName, joinRoom, navigate, language]);

  // Context value
  const contextValue = {
    connection,
    connectionStatus,
    roomUsers,
    roomName,
    language,
    reconnectCount
  };

  return (
    <SignalRContext.Provider value={contextValue}>
      {children}
    </SignalRContext.Provider>
  );
};