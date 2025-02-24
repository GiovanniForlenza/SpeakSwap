import React, { useState, useEffect } from 'react';
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

  // const API_BASE_URL = 'https://speakswapfastapi-ghfje5bgbvenfaec.italynorth-01.azurewebsites.net';
  const API_BASE_URL = 'http://localhost:8000';

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
    if (!conversationCode) {
      setError('Inserisci un codice conversazione');
      return;
    }

    try {
      console.log('Fetching conversation:', conversationCode);
      const response = await fetch(`${API_BASE_URL}/conversation/${conversationCode}`);
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
  
  const playAudio = async (code: string, isTranslated: boolean = false) => {
    try {
      const endpoint = isTranslated ? 'translated-audio' : 'audio';
      const audioUrl = `${API_BASE_URL}/${endpoint}/${code}`;
      const audio = new Audio(audioUrl);
      await audio.play();
    } catch (err) {
      console.error('Error playing audio:', err);
      setError('Errore durante la riproduzione dell\'audio');
    }
  };

  const playTranslatedAudio = async (code: string) => {
    try {
        const audioUrl = `${API_BASE_URL}/translated-audio/${code}`;
        const audio = new Audio(audioUrl);
        await audio.play();
    } catch (err) {
        console.error('Error playing translated audio:', err);
        setError('Errore durante la riproduzione dell\'audio tradotto');
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (conversation && ['processing', 'translating'].includes(conversation.status)) {
      interval = setInterval(fetchConversation, 5000);
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
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
          <h2>Codice conversazione</h2>
          <div className="input-group">
            <input 
              type="text" 
              className="conversation-input"
              value={conversationCode}
              onChange={(e) => setConversationCode(e.target.value)}
              placeholder="Inserisci il codice della conversazione"
            />
            <button 
              onClick={fetchConversation}
              disabled={!conversationCode}
            >
              Recupera
            </button>
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
              
              <button 
                className="play-audio"
                onClick={() => playAudio(conversationCode, false)}
                disabled={!conversation}
              >
                Riproduci Audio Originale
              </button>
              
              {conversation?.translated_text && (
              <button 
                  className="play-audio"
                  onClick={() => playTranslatedAudio(conversationCode)}
              >
                  Riproduci Audio Tradotto
              </button>
              )}
              
              {conversation.has_translated_audio && (
                <button 
                  className="play-audio"
                  onClick={() => playAudio(conversationCode, true)}
                >
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