import React, { useEffect, useRef } from 'react';
import { useChat } from '../context/ChatContext';

function AudioRenderer() {
  const { remoteStreams } = useChat();
  const audioRefs = useRef({});
  
  // Aggiorna gli elementi audio quando cambiano gli stream remoti
  useEffect(() => {
    Object.entries(remoteStreams).forEach(([userId, stream]) => {
      if (audioRefs.current[userId] && stream) {
        audioRefs.current[userId].srcObject = stream;
      }
    });
  }, [remoteStreams]);
  
  return (
    <div style={{ display: 'none' }}>
      {Object.keys(remoteStreams).map(userId => (
        <audio
          key={userId}
          ref={el => { audioRefs.current[userId] = el; }}
          autoPlay
        />
      ))}
    </div>
  );
}

export default AudioRenderer;