import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './components/Login';
import Chat from './components/Chat';
import { SignalRConnectionProvider } from './components/SignalRConnectionProvider';

function App() {
  // Determina l'URL dell'hub in base all'ambiente
  const getHubUrl = () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:5051/chatHub';
    } else {
      // URL del server Azure
      return 'https://speakswapserver-gzf6fpbjb0gma3fb.italynorth-01.azurewebsites.net/chatHub';
    }
  };

  return (
    <Router>
      <div className="app">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route 
            path="/chat" 
            element={
              <SignalRConnectionProvider hubUrl={getHubUrl()}>
                <Chat />
              </SignalRConnectionProvider>
            } 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;