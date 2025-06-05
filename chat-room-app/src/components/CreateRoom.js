import React, { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';

const CreateRoom = ({ onBack }) => {
  const { accounts } = useMsal();
  const [userName, setUserName] = useState('');
  const [language, setLanguage] = useState('it');
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  // Auto-popola il nome utente
  React.useEffect(() => {
    if (accounts && accounts.length > 0) {
      const azureUser = accounts[0];
      const displayName = azureUser.name || azureUser.username?.split('@')[0] || 'Utente';
      setUserName(displayName);
    }
  }, [accounts]);

  const handleCreateRoom = async () => {
    if (!userName.trim()) {
      alert("Nome utente richiesto");
      return;
    }

    setIsCreating(true);
    
    navigate(`/chat?userName=${encodeURIComponent(userName)}&createRoom=true&language=${encodeURIComponent(language)}`);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      backgroundColor: '#f5f5f5',
      backgroundImage: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      {/* Bottone indietro */}
      <button
        onClick={onBack}
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          padding: '12px 20px',
          backgroundColor: 'rgba(255,255,255,0.2)',
          color: 'white',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 'bold',
          backdropFilter: 'blur(10px)'
        }}
      >
        ← Indietro
      </button>

      <div style={{
        width: '400px',
        padding: '40px',
        borderRadius: '20px',
        backgroundColor: 'white',
        boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <h2 style={{ 
          marginBottom: '20px', 
          color: '#333',
          fontSize: '28px',
          fontWeight: 'bold'
        }}>
          🎯 Crea Nuova Stanza
        </h2>

        <div style={{ 
          marginBottom: '25px', 
          padding: '20px', 
          backgroundColor: '#e8f4fd', 
          borderRadius: '12px',
          fontSize: '14px'
        }}>
          <p style={{ margin: '0', color: '#555' }}>
            🔒 <strong>Stanza privata:</strong> Solo chi ha il link può accedere
          </p>
          <p style={{ margin: '8px 0 0 0', color: '#555' }}>
            🗑️ <strong>Temporanea:</strong> Si distrugge quando resta vuota
          </p>
        </div>
        
        <div style={{ marginBottom: '25px', textAlign: 'left' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '10px', 
            fontWeight: 'bold',
            color: '#333'
          }}>
            🏷️ Il tuo nome:
          </label>
          <input
            type="text"
            placeholder="Il tuo nome nella chat"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            style={{
              width: '100%',
              padding: '15px',
              borderRadius: '8px',
              border: '2px solid #e0e0e0',
              fontSize: '16px',
              outline: 'none'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '30px', textAlign: 'left' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '10px', 
            fontWeight: 'bold',
            color: '#333'
          }}>
            🌐 Lingua:
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{
              width: '100%',
              padding: '15px',
              borderRadius: '8px',
              border: '2px solid #e0e0e0',
              fontSize: '16px',
              backgroundColor: 'white',
              cursor: 'pointer'
            }}
          >
            <option value="it">🇮🇹 Italian</option>
            <option value="en">🇺🇸 English</option>
            <option value="fr">🇫🇷 Français</option>
            <option value="es">🇪🇸 Español</option>
            <option value="de">🇩🇪 Deutsch</option>
          </select>
        </div>

        <button 
          onClick={handleCreateRoom}
          disabled={isCreating || !userName.trim()}
          style={{
            width: '100%',
            padding: '18px',
            backgroundColor: isCreating ? '#ccc' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: isCreating ? 'not-allowed' : 'pointer',
            fontSize: '18px',
            fontWeight: 'bold',
            backgroundImage: isCreating ? 'none' : 'linear-gradient(45deg, #4CAF50, #45a049)'
          }}
        >
          {isCreating ? '⏳ Creando stanza...' : '🚀 Crea Stanza'}
        </button>

        <div style={{ 
          marginTop: '20px', 
          fontSize: '14px', 
          color: '#666',
          backgroundColor: '#f9f9f9',
          padding: '15px',
          borderRadius: '8px'
        }}>
          💡 <strong>Come funziona:</strong><br/>
          Verrà generato un link unico che potrai condividere con chi vuoi invitare nella stanza.
        </div>
      </div>
    </div>
  );
};

export default CreateRoom;