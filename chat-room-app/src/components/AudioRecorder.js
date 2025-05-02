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

      const options = [
        { mimeType: 'audio/wav', audioBitsPerSecond: 256000 },
        { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 },
        { mimeType: 'audio/webm', audioBitsPerSecond: 32000 },
        { mimeType: 'audio/ogg', audioBitsPerSecond: 32000 }
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

    // Utilizziamo direttamente il blob registrato senza conversione
    // Il server gestirà la conversione se necessario
    const audioBlob = recordedBlob;
    const audioUrl = URL.createObjectURL(audioBlob);
    setAudioURL(audioUrl);

    const currentConnectionState = connection?.state;
    console.log(`AudioRecorder: Connection state before sending: ${currentConnectionState}`);

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
            await new Promise(resolve => setTimeout(resolve, 300)); // Aumentato a 300ms
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
  }, [connection, language, onAudioRecorded, userName]);

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