import React, { createContext, useState, useEffect, useContext } from 'react';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';

// Creazione del context per la connessione SignalR
const SignalRContext = createContext(null);

export const useSignalRConnection = () => useContext(SignalRContext);

export const SignalRConnectionProvider = ({ hubUrl, children }) => {
  const [connection, setConnection] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');

  useEffect(() => {
    // Crea la connessione SignalR
    const newConnection = new HubConnectionBuilder()
      .withUrl(hubUrl)
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

    newConnection.onreconnecting(error => {
      console.warn('Riconnessione in corso...', error);
      setConnectionStatus('Reconnecting');
    });

    newConnection.onreconnected(connectionId => {
      console.log('Riconnesso con ID:', connectionId);
      setConnectionStatus('Connected');
    });
    
    newConnection.onclose(error => {
      console.error('Connessione chiusa:', error);
      setConnectionStatus('Disconnected');
    });
    
    newConnection.start()
      .then(() => {
        console.log('Connessione stabilita');
        setConnectionStatus('Connected');
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
  }, [hubUrl]);

  // Espone connessione e stato attraverso il context
  const contextValue = {
    connection,
    connectionStatus,
  };

  return (
    <SignalRContext.Provider value={contextValue}>
      {children}
    </SignalRContext.Provider>
  );
};