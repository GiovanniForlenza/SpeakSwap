import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './HomePage.css';

function HomePage() {
  const [username, setUsername] = useState('');
  const [roomName, setRoomName] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Verifica se ci sono informazioni salvate nella sessione
  useEffect(() => {
    const savedUsername = localStorage.getItem('audioChat_username');
    const savedRoomName = localStorage.getItem('audioChat_roomName');
    
    if (savedUsername) {
      setUsername(savedUsername);
    }
    
    if (savedRoomName) {
      setRoomName(savedRoomName);
    }
  }, []);

  const handleJoinRoom = (e) => {
    e.preventDefault();
    
    if (!username) {
      setError('Per favore, inserisci un nome utente');
      return;
    }
    
    if (!roomName) {
      setError('Per favore, inserisci il nome della stanza');
      return;
    }
    
    // Salva le informazioni nella sessione
    localStorage.setItem('audioChat_username', username);
    localStorage.setItem('audioChat_roomName', roomName);
    
    // Naviga alla stanza
    navigate(`/room/${roomName}?username=${encodeURIComponent(username)}`);
  };

  return (
    <div className="home-container">
      <div className="welcome-box">
        <h2>Benvenuto alla Chat Audio</h2>
        <p>Inserisci i tuoi dati per entrare in una stanza di chat audio</p>
        
        <form onSubmit={handleJoinRoom} className="join-form">
          <div className="form-group">
            <label htmlFor="username">Nome utente:</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Inserisci il tuo nome"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="roomName">Nome stanza:</label>
            <input
              type="text"
              id="roomName"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Inserisci il nome della stanza"
              required
            />
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          <button type="submit" className="join-button">
            Entra nella stanza
          </button>
        </form>
      </div>
    </div>
  );
}

export default HomePage;