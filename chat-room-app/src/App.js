import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './components/Login';
import Chat from './components/Chat';
import { SignalRConnectionProvider } from './components/SignalRConnectionProvider';

function App() {
  const hubUrl =
    process.env.NODE_ENV === 'production'
      ? 'speakswapserver-gzf6fpbjb0gma3fb.italynorth-01.azurewebsites.net/chatHub'
      : 'http://localhost:5051/chatHub';
      
  return (
    <Router>
      <div className="app">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route 
            path="/chat" 
            element={
              <SignalRConnectionProvider hubUrl={hubUrl}>
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