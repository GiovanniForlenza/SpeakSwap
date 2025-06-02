import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import {MsalProvider, useIsAuthenticated, useMsal} from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig } from './authConfig';

import Login from './components/Login';
import Chat from './components/Chat';
import { SignalRConnectionProvider } from './components/SignalRConnectionProvider';

// Initialize MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

const getHubUrl = () => {
  // const localUrl = 'http://localhost:8081/chatHub';
  const localUrl = 'http://localhost:5051/chatHub';
  const productionUrl = 'https://speakswapserver-gzf6fpbjb0gma3fb.italynorth-01.azurewebsites.net/chatHub';

  if (typeof window !== 'undefined') {
    return (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? localUrl
      : productionUrl;
  }
  return productionUrl;
};

const UserInfo = () => {
  const { instance, accounts } = useMsal();
  
  const handleLogout = () => {
    instance.logoutPopup().catch(error => {
      console.error('Logout failed:', error);
    });
  }

  return (
    <div style={{ 
      position: 'absolute', 
      top: '10px', 
      right: '10px', 
      background: '#f5f5f5', 
      padding: '10px', 
      borderRadius: '8px',
      fontSize: '14px'
    }}>
      <div style={{ marginBottom: '8px' }}>
        <strong>Benvenuto:</strong> {accounts[0]?.name || 'Utente'}
      </div>
      <div style={{ marginBottom: '8px' }}>
        <strong>Email:</strong> {accounts[0]?.username || 'N/A'}
      </div>
      <button 
        onClick={handleLogout}
        style={{
          padding: '6px 12px',
          backgroundColor: '#f44336',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px'
        }}
      >
        Logout
      </button>
    </div>
  );
};


const AuthenticatedContent = () => { 
  const isAuthenticated = useIsAuthenticated();

  // Se l'utente non è autenticato, mostra il login
  if (!isAuthenticated) {
    return <AzureLoginPage />; 
  }
  
  // Se l'utente è autenticato, mostra il contenuto + UserInfo
  return (
    <div style={{ position: 'relative' }}>
      <UserInfo /> 
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
  );
};

// Componente per la pagina di login
const AzureLoginPage = () => {
  const handleLogin = () => {
    msalInstance.loginPopup().catch(error => { 
      console.error('Login failed:', error);
    });
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      flexDirection: 'column'
    }}>
      <h2>Accesso richiesto</h2>
      <p>Devi effettuare l'accesso per utilizzare SpeakSwap</p>
      <button 
        onClick={handleLogin}
        style={{
          padding: '12px 24px',
          backgroundColor: '#0078d4',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '16px'
        }}
      >
        Accedi con Azure
      </button>
    </div>
  );
};

function App() {
  return (
    <MsalProvider instance={msalInstance}>
      <Router>
        <div className="app">
          <AuthenticatedContent />
        </div>
      </Router>
    </MsalProvider>
  );
}

export default App;