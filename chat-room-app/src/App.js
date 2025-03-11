import React, { useState, useRef, useEffect} from 'react';
import { ChatProvider, useChat } from './context/ChatContext';
import './App.css';
import AudioControls from './components/AudioControls';
import AudioRenderer from './components/AudioRenderer';
import AudioDebug from './components/AudioDebug';
import MicTest from './components/MicTest';
import TranslationControls from './components/TranslationControls';


function LoginForm({ onLogin }) {
  const [micAccess, setMicAccess] = useState(false);
  const [micError, setMicError] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState('it-IT'); // Default italiano
  
  // Lista delle lingue supportate
  const supportedLanguages = [
    { code: 'it-IT', name: 'Italiano' },
    { code: 'en-US', name: 'English (US)' },
    { code: 'fr-FR', name: 'Français' },
    { code: 'de-DE', name: 'Deutsch' },
    { code: 'es-ES', name: 'Español' },
    { code: 'zh-CN', name: '中文 (简体)' },
    { code: 'ja-JP', name: '日本語' },
    { code: 'ru-RU', name: 'Русский' }
  ];
  
  const requestMicAccess = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicAccess(true);
      
      // Restituisci lo stream per poterlo usare successivamente
      return stream;
    } catch (err) {
      setMicError(err.message);
      console.error('Errore accesso microfono:', err);
      return null;
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    const username = e.target.username.value;
    const roomId = e.target.roomId.value;
    
    if (username && roomId) {
      let stream = null;
      if (!micAccess) {
        stream = await requestMicAccess();
        if (!stream) {
          alert("Non è possibile accedere alla chat audio senza permessi per il microfono.");
          return;
        }
      }
      
      onLogin(username, roomId, selectedLanguage, stream);
    }
  };
  
  return (
    <div className="login-container">
      <h2>Accedi alla Chat Room</h2>
      
      {micError && (
        <div className="error-message">
          Errore microfono: {micError}
        </div>
      )}
      
      {!micAccess && (
        <div className="mic-request">
          <p>Per usare la chat audio, è necessario concedere l'accesso al microfono.</p>
          <button 
            onClick={requestMicAccess}
            className="mic-button"
          >
            Concedi accesso al microfono
          </button>
        </div>
      )}
      
      {micAccess && (
        <div className="mic-status success">
          ✅ Accesso al microfono concesso
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <input 
          type="text" 
          name="username" 
          placeholder="Il tuo nome" 
          required 
        />
        <input 
          type="text" 
          name="roomId" 
          placeholder="ID Stanza" 
          required 
        />
        
        <div className="form-group">
          <label htmlFor="language">Seleziona la tua lingua:</label>
          <select 
            id="language" 
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            required
          >
            {supportedLanguages.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>
        
        <button type="submit">Entra</button>
      </form>
    </div>
  );
}

function ChatRoom({ username, roomId, onLogout }) {
  const { messages, users, sendMessage, remoteStreams } = useChat();
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef(null);
  
  // Funzione per far scorrere la chat automaticamente
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  // Effetto che fa scorrere quando cambiano i messaggi
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim()) {
      console.log("Invio messaggio dalla UI:", message);
      sendMessage(message);
      setMessage('');
    }
  };

  // Debugging
  useEffect(() => {
    console.log("Stato attuale:");
    console.log("- Utenti:", users);
    console.log("- Messaggi:", messages);
    console.log("- Stream remoti:", Object.keys(remoteStreams));
  }, [users, messages, remoteStreams]);
  
  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>Stanza: {roomId}</h2>
        <div className="header-controls">
          <AudioControls />
          <button onClick={onLogout} className="logout-button">Esci</button>
        </div>
      </div>
      
      <div className="chat-users">
        <h3>Utenti Online ({users.length})</h3>
        <ul>
          {users.map((user, index) => (
            <li key={index}>
              {user.username} {user.isSelf && '(Tu)'} 
              {user.language && <span className="user-language">({user.language})</span>}
            </li>
          ))}
        </ul>
        
        {/* Aggiungi i controlli di traduzione */}
        <TranslationControls />
      </div>
      
      <div className="chat-content">
        <div className="messages-container">
          {messages.map((message, index) => (
            <div 
              key={index} 
              className={`message ${message.isSelf ? 'self' : ''}`}
            >
              <div className="message-username">{message.username}</div>
              <div className="message-text">{message.text}</div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        
        <form className="message-input" onSubmit={handleSubmit}>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Scrivi un messaggio..."
          />
          <button type="submit">Invia</button>
        </form>
      </div>
      
      <AudioDebug />
    </div>
  );
}

// Componente principale con gestione dello stato
function AppContent() {
  const [user, setUser] = useState(null);
  const [room, setRoom] = useState('');
  const { joinRoom } = useChat();
  
  const handleLogin = (username, roomId, stream) => {
    joinRoom(username, roomId, stream);
    setUser(username);
    setRoom(roomId);
  };
  
  const handleLogout = () => {
    setUser(null);
    setRoom('');
    // Il socket si disconnetterà automaticamente quando il componente viene smontato
  };
  
  return (
    <div className="app">
      {!user ? (
        <LoginForm onLogin={handleLogin} />
      ) : (
        <ChatRoom 
          username={user} 
          roomId={room} 
          onLogout={handleLogout} 
        />
      )}
    </div>
  );
}

// Componente principale che fornisce il context
function App() {
  return (
    <ChatProvider>
      <AppContent />
    </ChatProvider>
  );
}

export default App;