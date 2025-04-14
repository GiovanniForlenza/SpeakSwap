import React, { createContext, useState, useEffect, useContext } from 'react';
import { HubConnectionBuilder, LogLevel, HttpTransportType } from '@microsoft/signalr';
import { useLocation } from 'react-router-dom';

// Creazione del context per la connessione SignalR
const SignalRContext = createContext(null);

export const useSignalRConnection = () => useContext(SignalRContext);

export const SignalRConnectionProvider = ({ hubUrl, children }) => {
  const [connection, setConnection] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [roomUsers, setRoomUsers] = useState([]);
  const [reconnectCount, setReconnectCount] = useState(0);
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const userName = queryParams.get("userName");
  const roomName = queryParams.get("roomName");

  useEffect(() => {
    // Eseguire solo nel browser, non durante la fase di build
    if (typeof window === 'undefined') return;

    console.log(`Tentativo di connessione a: ${hubUrl}`);
    
    // Crea la connessione SignalR con configurazione ottimizzata per Azure
    const newConnection = new HubConnectionBuilder()
      .withUrl('https://speakswapserver-gzf6fpbjb0gma3fb.italynorth-01.azurewebsites.net/chatHub', {
          skipNegotiation: true,
          transport: HttpTransportType.WebSockets,
          serverTimeoutInMilliseconds: 100000, // 100 secondi di timeout
          keepAliveIntervalInMilliseconds: 15000 // 15 secondi di keep-alive
      })
      .configureLogging(LogLevel.Information)
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: retryContext => {
          // Incrementa il contatore di riconnessioni
          setReconnectCount(prev => prev + 1);
          
          // Strategia di retry con backoff esponenziale
          if (retryContext.previousRetryCount < 10) {
            const delayMs = Math.min(1000 * Math.pow(1.5, retryContext.previousRetryCount), 30000);
            console.log(`Tentativo di riconnessione ${retryContext.previousRetryCount + 1} tra ${delayMs}ms`);
            return delayMs;
          }
          return null;
        }
      })
      .build();

    setConnection(newConnection);

    // Eventi di connessione
    newConnection.onreconnecting(error => {
      console.warn('Riconnessione in corso...', error);
      setConnectionStatus('Reconnecting');
    });

    newConnection.onreconnected(connectionId => {
      console.log('Riconnesso con ID:', connectionId);
      setConnectionStatus('Connected');
      setReconnectCount(0); // Reset del contatore dopo riconnessione
      
      // Quando riconnesso, rientra automaticamente nella stanza
      if (userName && roomName) {
        joinRoom(newConnection, userName, roomName);
      }
    });
    
    newConnection.onclose(error => {
      console.error('Connessione chiusa:', error);
      setConnectionStatus('Disconnected');
    });
    
    // Eventi stanza
    newConnection.on('UserJoined', (user) => {
      console.log(`Utente ${user} si è unito alla stanza`);
      setRoomUsers(prevUsers => {
        if (!prevUsers.includes(user)) {
          return [...prevUsers, user];
        }
        return prevUsers;
      });
    });

    newConnection.on('UserLeft', (user) => {
      console.log(`Utente ${user} ha lasciato la stanza`);
      setRoomUsers(prevUsers => prevUsers.filter(u => u !== user));
    });

    newConnection.on('UsersInRoom', (users) => {
      console.log('Utenti nella stanza:', users);
      setRoomUsers(users);
    });

    // Tentativo di connessione
    const startConnection = async () => {
      try {
        await newConnection.start();
        console.log('Connessione stabilita!');
        setConnectionStatus('Connected');
        setReconnectCount(0); // Reset del contatore dopo connessione
        
        // Dopo la connessione, entra nella stanza
        if (userName && roomName) {
          await joinRoom(newConnection, userName, roomName);
        }
      } catch (err) {
        console.error('Errore di connessione:', err);
        setConnectionStatus('Error');
        
        // Riprova dopo un ritardo
        setTimeout(startConnection, 5000);
      }
    };

    startConnection();

    // Imposta un ping periodico per mantenere attiva la connessione
    const pingInterval = setInterval(() => {
      if (newConnection && newConnection.state === "Connected") {
        newConnection.invoke("Ping").then(
          result => console.log("Keep-alive ping: ", result),
          err => console.warn("Errore durante il ping keep-alive:", err)
        );
      }
    }, 15000); // Ping ogni 15 secondi

    // Pulizia alla disconnessione
    return () => {
      if (pingInterval) {
        clearInterval(pingInterval);
      }
      if (newConnection) {
        newConnection.stop();
      }
    };
  }, [hubUrl, userName, roomName]);

  // Funzione per entrare in una stanza
  const joinRoom = async (conn, user, room) => {
    try {
      console.log(`Entrando nella stanza ${room} come ${user}...`);
      await conn.invoke('JoinRoom', user, room, 'it');
      console.log(`Entrato nella stanza ${room}`);
    } catch (err) {
      console.error(`Errore nell'entrare nella stanza ${room}:`, err);
      
      // Ritenta dopo un breve ritardo
      setTimeout(() => {
        if (conn.state === 'Connected') {
          joinRoom(conn, user, room);
        }
      }, 2000);
    }
  };

  // Context value
  const contextValue = {
    connection,
    connectionStatus,
    roomUsers,
    roomName,
    reconnectCount
  };

  return (
    <SignalRContext.Provider value={contextValue}>
      {children}
    </SignalRContext.Provider>
  );
};