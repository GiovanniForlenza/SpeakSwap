import React, { useState } from 'react';
import { useSignalRConnection } from './SignalRConnectionProvider';

const MessageInput = ({ userName }) => {
  const { connection, connectionStatus, language } = useSignalRConnection();
  const [message, setMessage] = useState('');

  const sendMessage = async () => {
    if (connection && message) {
      try {
        // Verifica lo stato della connessione
        const connectionState = connection.state;
        
        if (connectionState !== 'Connected') {
          console.log('Tentativo di riconnessione prima dell\'invio...');
          try {
            await connection.start();
            console.log('Riconnessione riuscita');
          } catch (reconnectErr) {
            console.error('Errore durante la riconnessione:', reconnectErr);
            alert('Impossibile connettersi al server. Riprova più tardi.');
            return;
          }
        }
        
        await connection.invoke('SendMessage', userName, message, language);
        setMessage('');
      } catch (err) {
        console.error('Errore nell\'invio del messaggio:', err);
        alert('Errore nell\'invio del messaggio: ' + err.message);
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  return (
    <div style={{ display: 'flex' }}>
      <input
        type="text"
        value={message}
        onChange={e => setMessage(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="Scrivi un messaggio..."
        style={{ flexGrow: 1, marginRight: '10px', padding: '8px' }}
      />
      <button 
        onClick={sendMessage} 
        disabled={!connection || !message || connectionStatus !== 'Connected'} 
        style={{ 
          padding: '8px 16px',
          backgroundColor: (!connection || !message || connectionStatus !== 'Connected') ? '#ccc' : '#2196F3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: (!connection || !message || connectionStatus !== 'Connected') ? 'not-allowed' : 'pointer'
        }}
      >
        Invia
      </button>
    </div>
  );
};

export default MessageInput;