import React from 'react';
import { useChat } from '../context/ChatContext';

function AudioControls() {
  const { audioEnabled, micEnabled, toggleAudio, toggleMic } = useChat();
  
  return (
    <div className="audio-controls">
      <button 
        className={`control-button ${audioEnabled ? 'active' : ''}`} 
        onClick={toggleAudio}
        title={audioEnabled ? "Disattiva audio" : "Attiva audio"}
      >
        {audioEnabled ? '🔊' : '🔇'}
      </button>
      
      <button 
        className={`control-button ${micEnabled ? 'active' : ''}`} 
        onClick={toggleMic}
        title={micEnabled ? "Disattiva microfono" : "Attiva microfono"}
      >
        {micEnabled ? '🎙️' : '🚫'}
      </button>
    </div>
  );
}

export default AudioControls;