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
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const userName = queryParams.get("userName");
  const roomName = queryParams.get("roomName");

  useEffect(() => {
    // Eseguire solo nel browser, non durante la fase di build
    if (typeof window === 'undefined') return;

    console.log(`Tentativo di connessione a: ${hubUrl}`);
    
    const isLocalhost = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    
      const connectionOptions = isLocalhost ? {} : {
      skipNegotiation: true,
      transport: HttpTransportType.WebSockets
    };

    // Crea la connessione SignalR
    const newConnection = new HubConnectionBuilder()
      .withUrl(hubUrl, connectionOptions)
      .configureLogging(LogLevel.Information)
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: retryContext => {
          if (retryContext.previousRetryCount < 10) {
            return Math.min(1000 * Math.pow(2, retryContext.previousRetryCount), 30000);
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

    let pingInterval = null;
    if (!isLocalhost) {
      pingInterval = setInterval(() => {
        if (newConnection && newConnection.state === 'Connected') {
          newConnection.invoke('Ping').catch(err => {
            console.warn('Errore durante il ping keep-alive:', err);
          });
        }
      }, 15000); // Ping ogni 15 secondi
    }


    // Pulizia
    return () => {
      if(pingInterval) {
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
    }
  };

  // Context value
  const contextValue = {
    connection,
    connectionStatus,
    roomUsers,
    roomName
  };

  return (
    <SignalRContext.Provider value={contextValue}>
      {children}
    </SignalRContext.Provider>
  );
};