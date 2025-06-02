import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";

function Login() {
    const { accounts } = useMsal(); // Ottieni i dati dell'utente da Azure
    const [userName, setUserName] = useState("");
    const [roomName, setRoomName] = useState("");
    const [language, setLanguage] = useState("it");
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    // Auto-popola il nome utente con i dati di Azure
    useEffect(() => {
        if (accounts && accounts.length > 0) {
            const azureUser = accounts[0];
            
            const displayName = azureUser.name || azureUser.username?.split('@')[0] || 'Utente';
            setUserName(displayName);
        }
    }, [accounts]);

    const handleLogin = () => {
        if (!userName.trim()) {
            alert("Nome utente non disponibile. Riprova il login.");
            return;
        }
        
        if (!roomName.trim()) {
            alert("Please enter a room name");
            return;
        }

        setIsLoading(true);
        
        // Navigate to chat with parameters
        navigate(`/chat?userName=${encodeURIComponent(userName)}&roomName=${encodeURIComponent(roomName)}&language=${encodeURIComponent(language)}`);
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            backgroundColor: '#f5f5f5'
        }}>
            <div style={{
                width: '300px',
                padding: '20px',
                borderRadius: '8px',
                backgroundColor: 'white',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
            }}>
                <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>SpeakSwap Chat</h2>
                
                {/* Info utente da Azure */}
                <div style={{ 
                    marginBottom: '15px', 
                    padding: '10px', 
                    backgroundColor: '#e8f4fd', 
                    borderRadius: '4px',
                    fontSize: '14px'
                }}>
                    <div><strong>Utente:</strong> {accounts[0]?.name || 'Non disponibile'}</div>
                    <div><strong>Email:</strong> {accounts[0]?.username || 'Non disponibile'}</div>
                </div>
                
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Username per la chat:</label>
                    <input
                        type="text"
                        placeholder="Il tuo nome nella chat"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid #ddd'
                        }}
                    />
                    <small style={{ color: '#666', fontSize: '12px' }}>
                        Puoi modificare il nome che appare nella chat
                    </small>
                </div>
                
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Room Name:</label>
                    <input
                        type="text"
                        placeholder="Enter room name"
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid #ddd'
                        }}
                    />
                </div>
                
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Language:</label>
                    <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid #ddd'
                        }}
                    >
                        <option value="it">Italian</option>
                        <option value="en">English</option>
                        <option value="fr">Français</option>
                        <option value="es">Español</option>
                        <option value="de">Deutsch</option>
                    </select>
                </div>

                <button 
                    onClick={handleLogin}
                    disabled={isLoading}
                    style={{
                        width: '100%',
                        padding: '10px',
                        backgroundColor: isLoading ? '#ccc' : '#2196F3',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isLoading ? 'not-allowed' : 'pointer'
                    }}
                >
                    {isLoading ? 'Connecting...' : 'Join Chat'}
                </button>
            </div>
        </div>
    );
}

export default Login;