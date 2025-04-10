import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

function Login() {
    const [userName, setUserName] = useState("");
    const [roomName, setRoomName] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = () => {
        if (!userName.trim()) {
            alert("Please enter a username");
            return;
        }
        
        if (!roomName.trim()) {
            alert("Please enter a room name");
            return;
        }

        setIsLoading(true);
        
        // Navigate to chat with parameters
        navigate(`/chat?userName=${encodeURIComponent(userName)}&roomName=${encodeURIComponent(roomName)}`);
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
                <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>SignalR Chat Login</h2>
                
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Username:</label>
                    <input
                        type="text"
                        placeholder="Enter your username"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid #ddd'
                        }}
                    />
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