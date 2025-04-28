/* eslint-disable no-unused-vars */
import React, { useState, useRef } from 'react';
import { useSignalRConnection } from './SignalRConnectionProvider';
import { MAX_CHUNK_SIZE, splitBlobIntoChunks } from './audioUtils';

const AudioRecorder = ({ userName, onAudioRecorded }) => {
  const { connection, language } = useSignalRConnection();
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
        audioBitsPerSecond: 32000 
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
              
              // Aggiungi il messaggio audio nella chat dell'utente corrente
              if (onAudioRecorded) {
                onAudioRecorded(audioUrl, base64Chunks);
              }
              
              // Genera un ID sessione audio per questo messaggio
              const audioSessionId = Date.now().toString();
              console.log(`ID Sessione Audio: ${audioSessionId}`);
              
              // Invia ogni chunk separatamente
              for (let i = 0; i < base64Chunks.length; i++) {
                try {
                  const isLastChunk = i === base64Chunks.length - 1;
                  console.log(`Invio chunk ${i}/${base64Chunks.length-1}, isLastChunk=${isLastChunk}`);
                  
                  await connection.invoke(
                    'SendAudioChunk', 
                    userName, 
                    base64Chunks[i], 
                    i, // chunk ID
                    isLastChunk,
                    base64Chunks.length, 
                    language
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
}

export default AudioRecorder;