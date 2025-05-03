import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSignalRConnection } from './SignalRConnectionProvider';
import { splitBlobIntoChunks } from './audioUtils';

// Ridotto per maggiore affidabilità
const MAX_CHUNK_SIZE = 2 * 1024; // 2KB per chunk

const AudioRecorder = ({ userName, onAudioRecorded }) => {
  const { connection, connectionStatus, language } = useSignalRConnection();
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [connectionReady, setConnectionReady] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const connectionRef = useRef(null); // ref per memorizzare la connessione

  // Monitoraggio della connessione
  useEffect(() => {
    if (connection && connectionStatus === 'Connected') {
      console.log("SignalR connection ready:", connectionStatus);
      setConnectionReady(true);
      connectionRef.current = connection;
    } else {
      console.log("SignalR connection not ready:", connectionStatus);
      setConnectionReady(false);
    }
  }, [connection, connectionStatus]);

  // Timer per la registrazione
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  // Pulizia quando il componente viene smontato
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioURL) {
        URL.revokeObjectURL(audioURL);
      }
    };
  }, [audioURL]);

  // Avvia la registrazione
  const startRecording = useCallback(async () => {
    try {
      // Log delle informazioni sul browser
      console.log(`AudioRecorder: Navigator info:`, {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        vendor: navigator.vendor
      });
      
      // Verifica i formati supportati
      let supportedTypes = [];
      ['audio/wav', 'audio/webm', 'audio/webm;codecs=opus', 'audio/ogg'].forEach(type => {
        supportedTypes.push({
          type,
          supported: MediaRecorder.isTypeSupported(type)
        });
      });
      console.log('AudioRecorder: Supported types:', supportedTypes);

      setErrorMessage('');
      setRecordingTime(0);
      setAudioURL('');
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });

      streamRef.current = stream;

      // Ridotte le opzioni per semplificare
      const options = [
        { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 16000 },
        { mimeType: 'audio/webm', audioBitsPerSecond: 16000 },
        { mimeType: 'audio/ogg', audioBitsPerSecond: 16000 }
      ];

      let mediaRecorder;
      for (const option of options) {
        try {
          mediaRecorder = new MediaRecorder(stream, option);
          console.log(`AudioRecorder: Created with mimeType: ${mediaRecorder.mimeType}`);
          break;
        } catch (err) {
          console.warn(`AudioRecorder: Failed with mimeType ${option.mimeType}`, err);
        }
      }

      if (!mediaRecorder) {
        mediaRecorder = new MediaRecorder(stream);
        console.log(`AudioRecorder: Created with default mimeType: ${mediaRecorder.mimeType}`);
      }

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log(`AudioRecorder: Received audio chunk of ${event.data.size} bytes`);
        }
      };

      mediaRecorder.onstop = async () => {
        try {
          await handleRecordingStopped();
        } catch (err) {
          console.error('AudioRecorder: Error handling recording stop:', err);
          setErrorMessage('Error processing audio. Please try again.');
          setIsSending(false);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('AudioRecorder: Error during recording:', event);
        setErrorMessage('Recording error. Please try again.');
        stopRecording();
      };

      // Registra dati ogni 500ms invece che 1000ms
      mediaRecorder.start(500);
      setIsRecording(true);
      console.log('AudioRecorder: Recording started');
    } catch (err) {
      console.error('AudioRecorder: Error accessing microphone:', err);
      setErrorMessage(`Unable to access microphone: ${err.message}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ferma la registrazione
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      console.log('AudioRecorder: Stop recording requested');
      mediaRecorderRef.current.stop();

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      setIsRecording(false);
    }
  }, [isRecording]);

  // Verifica lo stato della connessione con tentativi
  const ensureConnection = useCallback(async (maxAttempts = 3) => {
    console.log(`AudioRecorder: Verifica connessione (stato: ${connectionStatus})`);
    
    // Usa la referenza alla connessione invece di usare direttamente connection
    const currentConnection = connectionRef.current;
    
    if (!currentConnection) {
      console.error('AudioRecorder: No connection object available');
      return false;
    }
    
    if (currentConnection.state === 'Connected') {
      return true;
    }
    
    // Tentativi di riconnessione
    let attempts = 0;
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`AudioRecorder: Tentativo di riconnessione ${attempts}/${maxAttempts}`);
      
      try {
        await currentConnection.start();
        console.log('AudioRecorder: Connection reestablished!');
        return true;
      } catch (err) {
        console.error(`AudioRecorder: Failed to reconnect (attempt ${attempts}/${maxAttempts}):`, err);
        
        // Pausa prima del prossimo tentativo
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    return false;
  }, [connectionStatus]);

  // Gestisce la registrazione fermata
  const handleRecordingStopped = useCallback(async () => {
    console.log(`AudioRecorder: Processing ${audioChunksRef.current.length} audio chunks`);

    if (audioChunksRef.current.length === 0) {
      console.warn('AudioRecorder: Recording too short, ignored');
      setIsSending(false);
      return;
    }

    const recordedBlob = new Blob(audioChunksRef.current, {
      type: mediaRecorderRef.current?.mimeType || 'audio/webm',
    });

    console.log(`AudioRecorder: Recorded audio size: ${recordedBlob.size} bytes, type: ${recordedBlob.type}`);

    if (recordedBlob.size < 100) {
      console.warn('AudioRecorder: Audio too small, ignored');
      setErrorMessage('Recording too short or empty. Please try again.');
      setIsSending(false);
      return;
    }

    // Utilizziamo direttamente il blob registrato senza conversione
    // Il server gestirà la conversione se necessario
    const audioBlob = recordedBlob;
    const audioUrl = URL.createObjectURL(audioBlob);
    setAudioURL(audioUrl);

    // Verifica lo stato della connessione prima di iniziare
    const isConnected = await ensureConnection(3);
    if (!isConnected) {
      setErrorMessage('Cannot establish connection to the server. Please reload the page and try again.');
      setIsSending(false);
      return;
    }

    setIsSending(true);

    try {
      // Dividi l'audio in chunk più piccoli
      const base64Chunks = await splitBlobIntoChunks(audioBlob, MAX_CHUNK_SIZE);
      console.log(`AudioRecorder: Audio split into ${base64Chunks.length} chunks`);

      if (base64Chunks.length === 0) {
        throw new Error('No valid audio chunks generated');
      }

      // Invia il messaggio locale anche se l'invio al server fallisce
      if (onAudioRecorded) {
        onAudioRecorded(audioUrl, base64Chunks);
      }

      // Usa la referenza alla connessione
      const conn = connectionRef.current;
      if (!conn) {
        throw new Error("Connection object lost");
      }

      // Invia i chunk con retry
      let successCount = 0;
      for (let i = 0; i < base64Chunks.length; i++) {
        const isLastChunk = i === base64Chunks.length - 1;
        console.log(`AudioRecorder: Sending chunk ${i}/${base64Chunks.length - 1}, isLastChunk=${isLastChunk}`);
        
        // Implementa retry per ogni chunk
        let chunkSuccess = false;
        let chunkAttempts = 0;
        const maxChunkAttempts = 3;
        
        while (!chunkSuccess && chunkAttempts < maxChunkAttempts) {
          chunkAttempts++;
          
          try {
            // Verifica che la connessione sia ancora valida prima di ogni invio
            if (conn.state !== 'Connected') {
              console.log(`AudioRecorder: Connection not Connected before chunk ${i}, trying to reconnect...`);
              const reconnected = await ensureConnection(2);
              if (!reconnected) {
                throw new Error(`Failed to reconnect for chunk ${i}`);
              }
            }
            
            // Invia il chunk
            await conn.invoke(
              'SendAudioChunk',
              userName,
              base64Chunks[i],
              i,
              isLastChunk,
              base64Chunks.length,
              language
            );
            
            console.log(`AudioRecorder: Chunk ${i + 1}/${base64Chunks.length} sent successfully (attempt ${chunkAttempts})`);
            chunkSuccess = true;
            successCount++;
          } catch (chunkErr) {
            console.error(`AudioRecorder: Error sending chunk ${i} (attempt ${chunkAttempts}/${maxChunkAttempts}):`, chunkErr);
            
            if (chunkAttempts >= maxChunkAttempts) {
              console.error(`AudioRecorder: Failed to send chunk ${i} after ${maxChunkAttempts} attempts`);
              break;
            }
            
            // Pausa prima di riprovare
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        // Se questo chunk ha fallito dopo tutti i tentativi, interrompi l'invio
        if (!chunkSuccess) {
          setErrorMessage(`Error sending audio segment ${i+1}/${base64Chunks.length}. Please try again.`);
          break;
        }
        
        // Pausa tra chunks per evitare di sovraccaricare il server
        if (i < base64Chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      if (successCount === base64Chunks.length) {
        console.log('AudioRecorder: All audio chunks sent successfully');
      } else {
        console.log(`AudioRecorder: Sent ${successCount}/${base64Chunks.length} chunks successfully`);
        if (!errorMessage) {
          setErrorMessage(`Sent ${successCount}/${base64Chunks.length} audio segments. Recording may be incomplete.`);
        }
      }
    } catch (err) {
      console.error('AudioRecorder: Error sending audio:', err);
      setErrorMessage('Error sending audio. Please try again.');
    } finally {
      setIsSending(false);
    }
  }, [ensureConnection, errorMessage, language, onAudioRecorded, userName]);

  // Formatta il tempo di registrazione
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="audio-recorder" style={{ marginBottom: '15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
        {isRecording ? (
          <>
            <button
              onClick={stopRecording}
              style={{
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 16px',
                cursor: 'pointer',
                marginRight: '10px',
              }}
              disabled={isSending}
              aria-label="Stop recording"
            >
              Stop Recording ({formatTime(recordingTime)})
            </button>
            <div
              style={{
                width: '10px',
                height: '10px',
                backgroundColor: '#f44336',
                borderRadius: '50%',
                animation: 'pulse 1s infinite',
              }}
            />
          </>
        ) : (
          <button
            onClick={startRecording}
            style={{
              backgroundColor: connectionReady ? '#4CAF50' : '#cccccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              cursor: connectionReady ? 'pointer' : 'not-allowed',
            }}
            disabled={isSending || !connectionReady}
            aria-label="Start recording"
            title={!connectionReady ? 'Waiting for connection...' : ''}
          >
            {isSending ? 'Sending...' : 'Record Audio'}
          </button>
        )}
      </div>

      {/* Indicatore di stato connessione */}
      {!connectionReady && !isRecording && (
        <div style={{ 
          color: '#ff9800', 
          fontSize: '12px', 
          marginBottom: '10px',
          display: 'flex',
          alignItems: 'center'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            backgroundColor: '#ff9800',
            borderRadius: '50%',
            marginRight: '5px',
            animation: 'pulse 1s infinite'
          }}></div>
          Connection to server not ready. Please wait...
        </div>
      )}

      {audioURL && !isRecording && (
        <div style={{ marginTop: '10px' }}>
          <audio src={audioURL} controls style={{ width: '100%' }} />
        </div>
      )}

      {errorMessage && (
        <div style={{ color: 'red', marginTop: '5px' }}>
          {errorMessage}
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
          100% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default AudioRecorder;