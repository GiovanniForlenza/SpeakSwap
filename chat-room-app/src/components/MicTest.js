import React, { useState } from 'react';

function MicTest() {
  const [status, setStatus] = useState('Non testato');
  const [error, setError] = useState(null);
  
  const testMicrophone = async () => {
    try {
      setStatus('Richiesta permessi...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStatus('Microfono accessibile!');
      
      // Ferma lo stream dopo il test
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      setStatus('Errore');
      setError(err.message);
      console.error('Errore accesso microfono:', err);
    }
  };
  
  return (
    <div className="mic-test">
      <h3>Test Microfono</h3>
      <p>Stato: {status}</p>
      {error && <p style={{ color: 'red' }}>Errore: {error}</p>}
      <button onClick={testMicrophone}>Testa Microfono</button>
    </div>
  );
}

export default MicTest;