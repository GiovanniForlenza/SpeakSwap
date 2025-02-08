import React, { useState, useEffect } from 'react';
// import { NodeJS } from 'node';
import './App.css';

interface Conversation {
  status: string;
  created_at: string;
  translated_text: string | null;
  has_translated_audio: boolean;
  original_file: string;
}

function App() {
  const [conversationCode, setConversationCode] = useState('');
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [error, setError] = useState('');

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'uploaded':
        return 'File caricato, in attesa di elaborazione';
      case 'processing':
        return 'Elaborazione audio in corso...';
      case 'translating':
        return 'Traduzione in corso...';
      case 'completed':
        return 'Traduzione completata!';
      case 'error':
        return 'Si è verificato un errore';
      default:
        return 'Stato sconosciuto';
    }
  };

  const fetchConversation = async () => {
    try {
        console.log('Fetching conversation:', conversationCode);
        const response = await fetch(`http://localhost:8000/conversation/${conversationCode}`);
        console.log('Response status:', response.status);
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (response.status === 404) {
            setError('Conversazione non trovata');
            setConversation(null);
        } else {
            setConversation(data);
            setError('');
        }
    } catch (err) {
        console.error('Error details:', err);
        setError('Errore durante il recupero della conversazione');
        setConversation(null);
    }
};

  // Aggiorna automaticamente lo stato ogni 5 secondi se stiamo processando
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (conversation && ['processing', 'translating'].includes(conversation.status)) {
      interval = setInterval(fetchConversation, 5000);
    }
    return () => clearInterval(interval);
  }, [conversation?.status, conversationCode]);

  return (
    <div className="app-container">
      <h1 className="title">SpeakSwap</h1>
      
      <p className="description">
        SpeakSwap semplifica la traduzione audio: trascina e rilascia i tuoi file
        per una conversione immediata o recupera conversazioni da Discord
        per ottenere una copia della conversazione
      </p>

      <div className="content-area">
        <div className="input-section">
          <h2>codice conversazione</h2>
          <div className="input-group">
            <input 
              type="text" 
              className="conversation-input"
              value={conversationCode}
              onChange={(e) => setConversationCode(e.target.value)}
              placeholder="Inserisci il codice della conversazione"
            />
            <button onClick={fetchConversation}>Recupera</button>
          </div>
          
          {error && <p className="error">{error}</p>}
          
          {conversation && (
            <div className="conversation-details">
              <p className="status">
                <span className="status-indicator"></span>
                {getStatusMessage(conversation.status)}
              </p>
              <p className="file-info">File originale: {conversation.original_file}</p>
              <p className="timestamp">Creato il: {new Date(conversation.created_at).toLocaleString()}</p>
              
              {conversation.translated_text && (
                <div className="translation">
                  <h3>Testo tradotto:</h3>
                  <p>{conversation.translated_text}</p>
                </div>
              )}
              
              {conversation.has_translated_audio && (
                <button className="play-audio">
                  Riproduci Audio Tradotto
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;