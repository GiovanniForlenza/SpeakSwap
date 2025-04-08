import React, { useState, useRef } from 'react';
import { useSignalRConnection } from './SignalRConnectionProvider';
import { MAX_CHUNK_SIZE, blobToBase64, splitBlobIntoChunks } from './audioUtils';

const AudioRecorder = ({ userName }) => {
  const { connection } = useSignalRConnection();
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [isSending, setIsSending] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      audioChunksRef.current = [];
      
      const options = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 32000 // Riduzione della qualità per file più piccoli
      };
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        try {
          // Combina i chunk in un unico blob
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          console.log(`Dimensione audio registrato: ${audioBlob.size} bytes`);
          
          // Crea URL per anteprima locale
          const audioUrl = URL.createObjectURL(audioBlob);
          setAudioURL(audioUrl);
          
          // Invia l'audio al server in chunks
          if (connection && connection.state === 'Connected') {
            setIsSending(true);
            
            try {
              // Dividi il blob in chunks più piccoli
              const base64Chunks = await splitBlobIntoChunks(audioBlob, MAX_CHUNK_SIZE);
              console.log(`Audio diviso in ${base64Chunks.length} chunks`);
              
              // Invia ogni chunk separatamente
              for (let i = 0; i < base64Chunks.length; i++) {
                try {
                  const isLastChunk = i === base64Chunks.length - 1;
                  await connection.invoke(
                    'SendAudioChunk', 
                    userName, 
                    base64Chunks[i], 
                    i, // chunk ID
                    isLastChunk,
                    base64Chunks.length // numero totale di chunks
                  );
                  console.log(`Chunk ${i+1}/${base64Chunks.length} inviato con successo`);
                } catch (chunkErr) {
                  console.error(`Errore nell'invio del chunk ${i}:`, chunkErr);
                  
                  // Attendi un po' e riconnettiti se necessario
                  if (connection.state !== 'Connected') {
                    try {
                      await connection.start();
                      console.log('Riconnessione riuscita durante invio chunk');
                      i--; // Riprova lo stesso chunk
                      continue;
                    } catch (reconnectErr) {
                      console.error('Errore durante la riconnessione:', reconnectErr);
                      break;
                    }
                  }
                }
                
                // Breve pausa tra l'invio dei chunks per evitare sovraccarichi
                if (i < base64Chunks.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
              }
              
              console.log('Audio inviato con successo');
            } catch (err) {
              console.error('Errore nell\'invio dell\'audio:', err);
            } finally {
              setIsSending(false);
            }
          }
        } catch (err) {
          console.error('Errore generale nell\'elaborazione dell\'audio:', err);
          setIsSending(false);
        }
      };
      
      mediaRecorder.start(1000); // Raccoglie dati ogni 1 secondo
      setIsRecording(true);
    } catch (err) {
      console.error('Errore nell\'accesso al microfono:', err);
      alert('Impossibile accedere al microfono: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      // Ferma tutti i tracciamenti audio per evitare che il microfono resti attivo
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
      {!isRecording ? (
        <button 
          onClick={startRecording} 
          disabled={isSending}
          style={{ 
            padding: '8px 16px',
            backgroundColor: isSending ? '#ccc' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isSending ? 'not-allowed' : 'pointer'
          }}
        >
          Registra Audio
        </button>
      ) : (
        <button 
          onClick={stopRecording} 
          style={{ 
            padding: '8px 16px',
            backgroundColor: '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          Ferma Registrazione
        </button>
      )}
      
      {isRecording && (
        <span style={{ color: 'red', display: 'inline-flex', alignItems: 'center' }}>
          <span style={{ 
            display: 'inline-block', 
            width: '12px', 
            height: '12px', 
            backgroundColor: 'red', 
            borderRadius: '50%', 
            marginRight: '8px',
            animation: 'pulse 1.5s infinite'
          }}></span>
          Registrazione in corso...
        </span>
      )}
      
      {isSending && (
        <span style={{ color: 'blue', display: 'inline-flex', alignItems: 'center' }}>
          <span style={{ 
            display: 'inline-block', 
            width: '12px', 
            height: '12px', 
            backgroundColor: 'blue', 
            borderRadius: '50%', 
            marginRight: '8px',
            animation: 'pulse 1.5s infinite'
          }}></span>
          Invio audio in corso...
        </span>
      )}
      
      {audioURL && !isRecording && !isSending && (
        <audio src={audioURL} controls />
      )}
      
      <style>
        {`
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
          }
        `}
      </style>
    </div>
  );
};

export default AudioRecorder;