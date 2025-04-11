import React, { createContext, useState, useEffect, useContext } from 'react';
import { HttpTransportType, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
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
  
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  useEffect(() => {
    // Crea la connessione SignalR
    const newConnection = new HubConnectionBuilder()
      .withUrl(hubUrl,{
        skipNegotiation: isLocalhost ? false : true,
        transport: isLocalhost ? undefined : HttpTransportType.WebSockets
      })
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

    // Evento per la riconnessione
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
    
    // Gestione degli eventi relativi alle stanze
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

    // Connessione al server
    newConnection.start()
      .then(() => {
        console.log('Connessione stabilita');
        setConnectionStatus('Connected');
        
        // Dopo la connessione, entra nella stanza se userName e roomName sono disponibili
        if (userName && roomName) {
          joinRoom(newConnection, userName, roomName);
        }
      })
      .catch(err => {
        console.error('Errore di connessione:', err);
        setConnectionStatus('Error');
      });

    // Pulizia alla disconnessione
    return () => {
      if (newConnection) {
        newConnection.stop();
      }
    };
  }, [hubUrl, userName, roomName]);

  // Funzione per entrare in una stanza
  const joinRoom = async (conn, user, room) => {
    try {
      console.log(`Entrando nella stanza ${room} come ${user}...`);
      await conn.invoke('JoinRoom', user, room, 'it'); // Aggiunto 'it' come lingua predefinita
      console.log(`Entrato nella stanza ${room}`);
    } catch (err) {
      console.error(`Errore nell'entrare nella stanza ${room}:`, err);
    }
  };

  // Espone connessione e stato attraverso il context
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