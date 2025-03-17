import React, { useState, useRef, useEffect } from 'react';
import './MicrophoneButton.css';

function MicrophoneButton({ onLiveAudioAvailable }) {
    const [isRecording, setIsRecording] = useState(false);
    const [hasPermission, setHasPermission] = useState(false);
    const [error, setError] = useState(null);
    const [debugInfo, setDebugInfo] = useState('');
    const [chunkCount, setChunkCount] = useState(0);
    
    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null);
    const audioChunksRef = useRef([]); // Buffer per accumulare chunks audio
    const timerRef = useRef(null);
    const accumulateTimeoutRef = useRef(null); // Timer per inviare l'audio accumulato

    // Rilascia tutte le risorse
    const resetRecordingSystem = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        
        if (accumulateTimeoutRef.current) {
            clearTimeout(accumulateTimeoutRef.current);
            accumulateTimeoutRef.current = null;
        }
        
        setChunkCount(0);
    }

    // Invia l'audio accumulato al server
    const sendAccumulatedAudio = () => {
        if (audioChunksRef.current.length === 0 || !onLiveAudioAvailable) {
            return;
        }
        
        try {
            // Crea un blob con tutti i chunk accumulati
            // const audioBlob = new Blob(audioChunksRef.current, { 
            //     type: mediaRecorderRef.current ? mediaRecorderRef.current.mimeType : 'audio/webm' 
            // });
            
            const audioBlob = new Blob(audioChunksRef.current, { 
                type: 'audio/webm' 
            });
         
            // Verifica che il blob abbia una dimensione significativa
            if (audioBlob.size <= 10) {
                console.log('Audio blob troppo piccolo, ignoro:', audioBlob.size, 'bytes');
                setDebugInfo(prev => `${prev}\nBlob troppo piccolo: ${audioBlob.size} bytes, ignorato`);
                audioChunksRef.current = []; // Pulisci il buffer
                return;
            }
            
            console.log('Elaborazione blob audio accumulato:', audioBlob.size, 'bytes');
            setDebugInfo(prev => `${prev}\nElaborazione blob audio: ${audioBlob.size} bytes`);
            
            // Invia il blob al callback
            onLiveAudioAvailable(audioBlob);
            setDebugInfo(prev => `${prev}\nAudio inviato: ${audioBlob.size} bytes`);
            
            // Pulisci il buffer dopo l'invio
            audioChunksRef.current = [];
        } catch (error) {
            console.error('Errore nell\'invio dell\'audio accumulato:', error);
            setDebugInfo(prev => `${prev}\nERRORE invio audio: ${error.message}`);
        }
    };

    const getMicrophoneAccess = async () => {
        try {
            setError(null);
            setDebugInfo('Richiedendo accesso al microfono...');

            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            console.log('Richiedendo accesso al microfono...');
            
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            console.log('Accesso al microfono concesso!', stream);
            setDebugInfo(prev => prev + '\nAccesso al microfono concesso! Configurando MediaRecorder...');
            
            streamRef.current = stream;
            setHasPermission(true);

            // Prova prima con opus, poi fallback a codecs standard
            let mimeType = 'audio/webm';
            
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
                console.log('Usando formato audio/webm;codecs=opus');
                setDebugInfo(prev => prev + '\nUsando formato audio/webm;codecs=opus');
            } else {
                console.log('Formato opus non supportato, usando audio/webm');
                setDebugInfo(prev => prev + '\nFormato opus non supportato, usando audio/webm');
            }
            
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: mimeType,
                audioBitsPerSecond: 128000 
            });
            
            console.log('MediaRecorder creato:', mediaRecorder);
            setDebugInfo(prev => prev + '\nMediaRecorder creato, stato: ' + mediaRecorder.state);
            
            mediaRecorderRef.current = mediaRecorder;
            
            // Configurazione degli eventi di MediaRecorder
            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    console.log(`Chunk audio disponibile: ${event.data.size} bytes`);
                    setChunkCount(prev => prev + 1);
                    
                    // Aggiungi il chunk al buffer
                    audioChunksRef.current.push(event.data);
                    setDebugInfo(prev => `${prev}\nChunk ricevuto: ${event.data.size} bytes, totale: ${audioChunksRef.current.length} chunks`);
                    
                    // Programma l'invio dell'audio accumulato
                    if (accumulateTimeoutRef.current) {
                        clearTimeout(accumulateTimeoutRef.current);
                    }
                    
                    accumulateTimeoutRef.current = setTimeout(() => {
                        sendAccumulatedAudio();
                    }, 300); // Invia l'audio accumulato dopo 300ms di silenzio
                } else {
                    console.log('Chunk audio vuoto o mancante');
                    setDebugInfo(prev => `${prev}\nChunk vuoto ricevuto`);
                }
            };
            
            mediaRecorder.onerror = (event) => {
                console.error('Errore nel MediaRecorder:', event.error);
                setError(`Errore nella registrazione: ${event.error?.message || 'Errore sconosciuto'}`);
                setDebugInfo(prev => `${prev}\nErrore MediaRecorder: ${event.error?.message}`);
                stopRecording();
            };
            
            // Il mediaRecorder è pronto, avvia lo streaming
            setDebugInfo(prev => prev + '\nMediaRecorder pronto, avvio streaming...');
            startRecording();

        } catch (err) {
            console.error('Errore nell\'accesso al microfono:', err);
            setError(`Errore nell'accesso al microfono: ${err.message}`);
            setDebugInfo(prev => `${prev}\nERRORE: ${err.message}`);
        }
    };

    const startRecording = () => {
        try {
            if (!mediaRecorderRef.current) {
                console.error('MediaRecorder non inizializzato');
                setDebugInfo('ERROR: MediaRecorder non inizializzato');
                return;
            }
            
            console.log('Avvio streaming audio...');
            setDebugInfo(prev => `${prev}\nAvvio streaming audio...`);
            
            // Prima imposta lo stato di registrazione
            setIsRecording(true);
            
            // Pulisci il buffer
            audioChunksRef.current = [];
            
            // Avvia il recorder con timeslice più lungo per raccogliere abbastanza audio
            mediaRecorderRef.current.start(2000); 
            setDebugInfo(prev => `${prev}\nMediaRecorder.start(500) chiamato, stato: ${mediaRecorderRef.current.state}`);
            setChunkCount(0);

            timerRef.current = setInterval(() => {
                // Invia periodicamente i chunk audio accumulati
                if (audioChunksRef.current.length > 0 && isRecording) {
                    setDebugInfo(prev => `${prev}\n audio chunks length ${audioChunksRef.current.length}`);
                    sendAccumulatedAudio();
                }
              }, 2000);
            
        } catch (err) {
            console.error('Error starting recording:', err);
            setError(`Error starting recording: ${err.message}`);
            setDebugInfo(prev => `${prev}\nERRORE nell'avvio: ${err.message}`);
        }
    };

    const stopRecording = () => {
        try {
            if (mediaRecorderRef.current && isRecording) {
                console.log('Arresto streaming audio...');
                setDebugInfo(prev => `${prev}\nArresto streaming audio...`);
                
                // Ferma la registrazione solo se è attiva
                if (mediaRecorderRef.current.state === 'recording') {
                    mediaRecorderRef.current.stop();
                    setDebugInfo(prev => `${prev}\nMediaRecorder.stop() chiamato`);
                } else {
                    console.log(`MediaRecorder in stato ${mediaRecorderRef.current.state}, non in recording`);
                    setDebugInfo(prev => `${prev}\nMediaRecorder già fermo (${mediaRecorderRef.current.state})`);
                }
                
                // Invia eventuali audio rimanenti
                if (audioChunksRef.current.length > 0) {
                    sendAccumulatedAudio();
                }
                
                // Imposta lo stato isRecording a false dopo l'invio dell'ultimo audio
                setIsRecording(false);
                
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
                
                // Cancella eventuali timer in sospeso
                if (accumulateTimeoutRef.current) {
                    clearTimeout(accumulateTimeoutRef.current);
                    accumulateTimeoutRef.current = null;
                }
            }
        } catch (err) {
            console.error('Error stopping recording:', err);
            setError(`Error stopping recording: ${err.message}`);
            setDebugInfo(prev => `${prev}\nERRORE nell'arresto: ${err.message}`);
            setIsRecording(false);
        }
    };

    const handleMicrophoneClick = () => {
        if (!hasPermission) {
            getMicrophoneAccess();
        } else {
            if (isRecording) {
                stopRecording();
            } else {
                // Se abbiamo già il permesso ma non stiamo registrando, avvia una nuova registrazione
                if (mediaRecorderRef.current) {
                    startRecording();
                } else {
                    // Se il mediaRecorder non esiste, richiedi accesso al microfono
                    getMicrophoneAccess();
                }
            }
        }
    };

    // Cleanup quando il componente viene smontato
    useEffect(() => {
        return () => {
            resetRecordingSystem();
        };
    }, []);

    // Effetto per verificare che isRecording venga correttamente impostato
    useEffect(() => {
        console.log(`isRecording cambiato a: ${isRecording}`);
        setDebugInfo(prev => `${prev}\nisRecording = ${isRecording}`);
    }, [isRecording]);

    // Test manuale per verifica dei callback
    const testCallback = () => {
        if (onLiveAudioAvailable) {
            // Crea un blob di dimensioni più significative per il test
            const testData = new Uint8Array(100);
            for (let i = 0; i < testData.length; i++) {
                testData[i] = Math.floor(Math.random() * 256);
            }
            const testBlob = new Blob([testData], { type: 'audio/webm' });
            
            onLiveAudioAvailable(testBlob);
            setDebugInfo(prev => `${prev}\nTest callback eseguito`);
        } else {
            setDebugInfo(prev => `${prev}\nCallback non disponibile!`);
        }
    };

    return (
        <div className="microphone-container">
            <button
                className={`microphone-button ${isRecording ? 'recording' : ''}`}
                onClick={handleMicrophoneClick}
                aria-label={isRecording ? 'Stop streaming' : 'Start streaming'}
            >
                <i className={`microphone-icon ${isRecording ? 'recording' : ''}`}></i>
                {isRecording ? 'Disattiva Microfono' : 'Attiva Microfono'}
            </button>

            {error && <div className="error-message">{error}</div>}

            {isRecording && (
                <div className="recording-indicator">
                    <span className="recording-text">🔴 Microfono attivo - Streaming in tempo reale - Chunks: {chunkCount}</span>
                </div>
            )}
            
            <div className="debug-info">
                <button onClick={testCallback} className="test-button">Test Callback</button>
                <pre>{debugInfo}</pre>
            </div>
        </div>
    );
}

MicrophoneButton.defaultProps = {
    onLiveAudioAvailable: null
};

export default MicrophoneButton;