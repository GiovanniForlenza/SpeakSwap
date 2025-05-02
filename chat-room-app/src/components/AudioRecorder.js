import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSignalRConnection } from './SignalRConnectionProvider';
import { MAX_CHUNK_SIZE, splitBlobIntoChunks } from './audioUtils';

const AudioRecorder = ({ userName, onAudioRecorded }) => {
  const { connection, language } = useSignalRConnection();
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  // Funzione per convertire WebM a WAV
  const convertWebMToWav = async (webmBlob) => {
    try {
      console.log(`AudioRecorder: Conversione da ${webmBlob.type} a WAV`);
      
      // Crea un elemento audio per la conversione
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000 // Imposta esplicitamente a 16kHz
      });
      
      // Converti il blob in un ArrayBuffer
      const arrayBuffer = await webmBlob.arrayBuffer();
      
      // Decodifica l'audio
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Prepara per la conversione in WAV
      const numberOfChannels = 1; // Mono
      const sampleRate = 16000;    // 16kHz
      const bitsPerSample = 16;    // 16 bit
      
      // Crea un buffer per il formato WAV
      const wavBuffer = createWavBuffer(audioBuffer, {
        sampleRate: sampleRate,
        numberOfChannels: numberOfChannels,
        bitsPerSample: bitsPerSample
      });
      
      // Crea un nuovo blob WAV
      const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
      
      console.log(`AudioRecorder: Conversione completata. Dimensione WebM: ${webmBlob.size} bytes, WAV: ${wavBlob.size} bytes`);
      return wavBlob;
    } catch (err) {
      console.error('AudioRecorder: Errore nella conversione a WAV:', err);
      return webmBlob; // Fallback all'originale
    }
  };

  // Funzione per creare un buffer WAV con header corretto
  const createWavBuffer = (audioBuffer, options = {}) => {
    const numChannels = options.numberOfChannels || audioBuffer.numberOfChannels;
    const sampleRate = options.sampleRate || audioBuffer.sampleRate;
    const bitsPerSample = options.bitsPerSample || 16;
    const bytesPerSample = bitsPerSample / 8;
    
    // Se necessario, ricampiona l'audio
    let audioData;
    
    if (audioBuffer.sampleRate !== sampleRate) {
      audioData = resampleAudio(audioBuffer, sampleRate, numChannels);
    } else {
      // Estrai i dati
      audioData = [];
      for (let channel = 0; channel < numChannels; channel++) {
        if (channel < audioBuffer.numberOfChannels) {
          audioData.push(audioBuffer.getChannelData(channel));
        } else {
          // Se richiediamo più canali di quelli disponibili, aggiungi silenzio
          audioData.push(new Float32Array(audioBuffer.length).fill(0));
        }
      }
    }
    
    // Calcola la lunghezza dei dati audio (in byte)
    const dataLength = audioData[0].length * numChannels * bytesPerSample;
    
    // Crea il buffer per il file WAV (header + data)
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);
    
    // Scrivi l'header WAV
    // "RIFF" chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    
    // "fmt " sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Lunghezza sub-chunk
    view.setUint16(20, 1, true);  // AudioFormat (1 = PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // ByteRate
    view.setUint16(32, numChannels * bytesPerSample, true); // BlockAlign
    view.setUint16(34, bitsPerSample, true);
    
    // "data" sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);
    
    // Scrivi i dati audio (interleaved)
    let offset = 44;
    if (bitsPerSample === 16) {
      for (let i = 0; i < audioData[0].length; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
          const sample = Math.max(-1, Math.min(1, audioData[channel][i]));
          const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
          view.setInt16(offset, value, true);
          offset += 2;
        }
      }
    } else if (bitsPerSample === 32) {
      for (let i = 0; i < audioData[0].length; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
          const sample = Math.max(-1, Math.min(1, audioData[channel][i]));
          view.setFloat32(offset, sample, true);
          offset += 4;
        }
      }
    } else if (bitsPerSample === 8) {
      for (let i = 0; i < audioData[0].length; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
          const sample = Math.max(-1, Math.min(1, audioData[channel][i]));
          const value = (sample + 1) * 128; // 8 bit è unsigned [0, 255]
          view.setUint8(offset, value);
          offset += 1;
        }
      }
    }
    
    return buffer;
  };

  // Funzione per ricampionare l'audio alla frequenza target
  const resampleAudio = (audioBuffer, targetSampleRate, numChannels) => {
    const originalSampleRate = audioBuffer.sampleRate;
    const ratio = targetSampleRate / originalSampleRate;
    const newLength = Math.round(audioBuffer.length * ratio);
    
    const result = [];
    
    for (let channel = 0; channel < numChannels; channel++) {
      const data = new Float32Array(newLength);
      
      // Estrai i dati del canale se disponibile
      const originalData = channel < audioBuffer.numberOfChannels 
        ? audioBuffer.getChannelData(channel) 
        : new Float32Array(audioBuffer.length).fill(0);
      
      // Ricampionamento lineare semplice
      for (let i = 0; i < newLength; i++) {
        const position = i / ratio;
        const index = Math.floor(position);
        const alpha = position - index;
        
        if (index + 1 < originalData.length) {
          data[i] = (1 - alpha) * originalData[index] + alpha * originalData[index + 1];
        } else {
          data[i] = originalData[index];
        }
      }
      
      result.push(data);
    }
    
    return result;
  };

  // Funzione per scrivere una stringa in un DataView
  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // Timer for recording
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

  // Cleanup on unmount
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

  // Start recording
  const startRecording = useCallback(async () => {
    try {
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

      const options = [
        { mimeType: 'audio/wav', audioBitsPerSecond: 256000 },
        { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 },
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

      mediaRecorder.start(1000);
      setIsRecording(true);
      console.log('AudioRecorder: Recording started');
    } catch (err) {
      console.error('AudioRecorder: Error accessing microphone:', err);
      setErrorMessage(`Unable to access microphone: ${err.message}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop recording
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

  // Handle recording stopped
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

    // Converti in WAV se necessario
    let audioBlob = recordedBlob;
    if (recordedBlob.type.includes('webm')) {
      try {
        audioBlob = await convertWebMToWav(recordedBlob);
        console.log(`AudioRecorder: Convertito da ${recordedBlob.type} a WAV, nuova dimensione: ${audioBlob.size} bytes`);
      } catch (err) {
        console.error('AudioRecorder: Errore nella conversione a WAV:', err);
        // Continua con il blob originale
      }
    }

    const audioUrl = URL.createObjectURL(audioBlob);
    setAudioURL(audioUrl);

    const currentConnectionState = connection?.state;
    console.log(`AudioRecorder: Connection state immediately before sending: ${currentConnectionState}`);

    // Tenta di riconnettersi se necessario
    if (!connection) {
      console.error('AudioRecorder: No connection object available');
      setErrorMessage('Connection unavailable. Please try again.');
      setIsSending(false);
      return;
    }

    if (connection.state !== 'Connected') {
      console.log(`AudioRecorder: Connection not Connected (${connection.state}), attempting to reconnect...`);
      try {
        await connection.start();
        console.log('AudioRecorder: Connection reestablished!');
      } catch (reconnectErr) {
        console.error('AudioRecorder: Failed to reconnect:', reconnectErr);
        setErrorMessage('Connection unavailable. Please try again.');
        setIsSending(false);
        return;
      }
    }

    if (connection.state === 'Connected') {
      setIsSending(true);

      try {
        const base64Chunks = await splitBlobIntoChunks(audioBlob, MAX_CHUNK_SIZE);
        console.log(`AudioRecorder: Audio split into ${base64Chunks.length} chunks`);

        if (base64Chunks.length === 0) {
          throw new Error('No valid audio chunks generated');
        }

        if (onAudioRecorded) {
          onAudioRecorded(audioUrl, base64Chunks);
        }

        for (let i = 0; i < base64Chunks.length; i++) {
          const isLastChunk = i === base64Chunks.length - 1;
          console.log(`AudioRecorder: Sending chunk ${i}/${base64Chunks.length - 1}, isLastChunk=${isLastChunk}`);
          
          try {
            await connection.invoke(
              'SendAudioChunk',
              userName,
              base64Chunks[i],
              i,
              isLastChunk,
              base64Chunks.length,
              language
            );
            console.log(`AudioRecorder: Chunk ${i + 1}/${base64Chunks.length} sent successfully`);
          } catch (chunkErr) {
            console.error(`AudioRecorder: Error sending chunk ${i}:`, chunkErr);
            
            // Attempt reconnection if needed
            if (!connection || connection.state !== 'Connected') {
              console.log('AudioRecorder: Connection not in Connected state, attempting to reconnect...');
              try {
                // Se non c'è connessione o non è connesso, prova a riconnetterti
                if (connection) {
                  await connection.start();
                  console.log('AudioRecorder: Connection reestablished!');
                } else {
                  throw new Error('No connection object available');
                }
              } catch (err) {
                console.error('AudioRecorder: Failed to reconnect:', err);
                setErrorMessage('Connection unavailable. Please try again.');
                setIsSending(false);
                return;
              }
            } else {
              setErrorMessage(`Error sending audio. Please try again.`);
              break;
            }
          }
          
          // Short pause between chunks to avoid overloading
          if (i < base64Chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        console.log('AudioRecorder: Audio sent successfully');
      } catch (err) {
        console.error('AudioRecorder: Error sending audio:', err);
        setErrorMessage('Error sending audio. Please try again.');
      } finally {
        setIsSending(false);
      }
    } else {
      console.error('AudioRecorder: Connection unavailable');
      setErrorMessage('Connection unavailable. Please try again.');
      setIsSending(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, language, onAudioRecorded, recordingTime, userName]);

  // Format recording time
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
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              cursor: 'pointer',
            }}
            disabled={isSending}
            aria-label="Start recording"
          >
            {isSending ? 'Sending...' : 'Record Audio'}
          </button>
        )}
      </div>

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