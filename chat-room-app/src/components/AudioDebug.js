import React, { useEffect } from 'react';
import { useChat } from '../context/ChatContext';

function AudioDebug() {
  const { remoteStreams, localStream, audioEnabled, micEnabled } = useChat();
  
  useEffect(() => {
    // Mostra lo stato attuale
    console.log("Stato audio corrente:");
    console.log("- Stream locale:", localStream);
    console.log("- Stream remoti:", Object.keys(remoteStreams).length);
    console.log("- Audio abilitato:", audioEnabled);
    console.log("- Microfono abilitato:", micEnabled);
    
    // Verifica gli elementi audio nel DOM
    const audioElements = document.querySelectorAll('audio');
    console.log("- Elementi audio nel DOM:", audioElements.length);
    
    audioElements.forEach((el, i) => {
      console.log(`  Audio ${i+1}:`, {
        id: el.id,
        muted: el.muted,
        srcObject: el.srcObject ? 'presente' : 'assente',
        autoplay: el.autoplay,
      });
    });
  }, [remoteStreams, localStream, audioEnabled, micEnabled]);
  
  return (
    <div className="audio-debug" style={{ 
      position: 'fixed', 
      bottom: '10px', 
      right: '10px',
      background: 'rgba(0,0,0,0.7)',
      color: 'white',
      padding: '5px 10px',
      borderRadius: '5px',
      fontSize: '12px'
    }}>
      <div>Stream locale: {localStream ? '✅' : '❌'}</div>
      <div>Stream remoti: {Object.keys(remoteStreams).length}</div>
      <div>Audio: {audioEnabled ? '✅' : '❌'}</div>
      <div>Mic: {micEnabled ? '✅' : '❌'}</div>
    </div>
  );
}

export default AudioDebug;