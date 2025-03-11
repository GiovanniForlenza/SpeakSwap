import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import io from 'socket.io-client';
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk';

const ChatContext = createContext();

export const useChat = () => useContext(ChatContext);

export const ChatProvider = ({ children }) => {
  // Stati esistenti
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [localStream, setLocalStream] = useState(null);
  const [, setLocalStreamStarted] = useState(false); // Aggiunto stato mancante
  const [remoteStreams, setRemoteStreams] = useState({});
  
  // Nuovi stati per la traduzione
  const [userLanguage, setUserLanguage] = useState('it-IT');
  const [translations, setTranslations] = useState({});
  const [isTranslating, setIsTranslating] = useState(false);
  
  // Riferimenti per i servizi Azure
  const speechRecognizer = useRef(null);
  const speechSynthesizer = useRef({});
  const peerConnections = useRef({});
  
  // Chiavi e regione Azure (in produzione dovresti ottenere queste da un server sicuro)
  const SPEECH_KEY = '';
  const SPEECH_REGION = '';
  
  // Inizializza la connessione Socket.IO
  useEffect(() => {
    const newSocket = io('http://localhost:3001', { 
      transports: ['websocket'],
      autoConnect: false 
    });
    
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Registra gli eventi di base del socket
  useEffect(() => {
    if (!socket) return;
    
    // Registra i listener sul socket
    const messageListener = (message) => {
      setMessages((prevMessages) => [...prevMessages, message]);
    };
    
    const usersListener = (roomUsers) => {
      setUsers(roomUsers);
    };

    socket.on('message', messageListener);
    socket.on('roomUsers', usersListener);
  
    return () => {
      socket.off('message', messageListener);
      socket.off('roomUsers', usersListener);
    };
  }, [socket]);

  // Gestisci le traduzioni
  useEffect(() => {
    if (!socket) return;
    
    // Gestisci le traduzioni in arrivo
    const translationListener = ({ fromUserId, originalText, translatedText, fromLanguage }) => {
      // Aggiorna lo stato delle traduzioni
      setTranslations(prev => ({
        ...prev,
        [fromUserId]: {
          originalText,
          translatedText,
          fromLanguage
        }
      }));
      
      // Riproduci il testo tradotto
      if (audioEnabled) {
        console.log(`Richiesta riproduzione audio: "${translatedText}" in ${userLanguage}`);
        speakTranslatedText(translatedText, userLanguage);
      }
    };
    
    socket.on('translation', translationListener);

    return () => {
      socket.off('translation', translationListener);
    };
  }, [socket, userLanguage, audioEnabled]);

  // Inizializza Speech Services
  const initSpeechServices = (language) => {
    try {
      // Configura il riconoscimento vocale
      const speechConfig = speechsdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
      speechConfig.speechRecognitionLanguage = language;
      
      // Crea il riconoscitore vocale
      const audioConfig = speechsdk.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = new speechsdk.SpeechRecognizer(speechConfig, audioConfig);
      
      recognizer.recognized = (s, e) => {
        if (e.result.reason === speechsdk.ResultReason.RecognizedSpeech) {
          const text = e.result.text;
          if (text.trim()) {
            console.log(`Testo riconosciuto: ${text}`);
            // Invia il testo al server per la traduzione
            if (socket) {
              socket.emit('translate-text', {
                text,
                fromLanguage: language,
              });
            }
          }
        }
      };
      
      speechRecognizer.current = recognizer;
      
      // Inizializza i sintetizzatori per ogni lingua supportata
      const languages = ['it-IT', 'en-US', 'fr-FR', 'de-DE', 'es-ES', 'zh-CN', 'ja-JP', 'ru-RU'];
      
      languages.forEach(lang => {
        try {
          console.log(`Inizializzazione sintetizzatore per ${lang}`);
          const synthConfig = speechsdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
          synthConfig.speechSynthesisLanguage = lang;
          synthConfig.speechSynthesisVoiceName = getVoiceNameForLanguage(lang); // vedi funzione sotto
          
          speechSynthesizer.current[lang] = new speechsdk.SpeechSynthesizer(synthConfig);
          console.log(`Sintetizzatore per ${lang} inizializzato`);
        } catch (e) {
          console.error(`Errore inizializzazione sintetizzatore per ${lang}:`, e);
        }
      });
      
      // Funzione helper per ottenere voci migliori per ogni lingua
      const getVoiceNameForLanguage = (lang) => {
        // Voci neuronali che offrono una qualità migliore
        const voiceMap = {
          'it-IT': 'it-IT-IsabellaNeural',
          'en-US': 'en-US-AriaNeural',
          'fr-FR': 'fr-FR-DeniseNeural',
          'de-DE': 'de-DE-KatjaNeural',
          'es-ES': 'es-ES-ElviraNeural',
          'zh-CN': 'zh-CN-XiaoxiaoNeural',
          'ja-JP': 'ja-JP-NanamiNeural',
          'ru-RU': 'ru-RU-SvetlanaNeural'
        };
        
        return voiceMap[lang] || '';
      };
      
      console.log("Servizi Azure Speech inizializzati con successo");
      return true;
    }catch (error) {
      console.error("Errore nell'inizializzazione dei servizi Azure Speech:", error);
      return false;
    }
  };
  
  // Funzione per iniziare a tradurre
  const startTranslation = () => {
    if (speechRecognizer.current) {
      speechRecognizer.current.startContinuousRecognitionAsync(
        () => {
          console.log("Riconoscimento vocale avviato");
          setIsTranslating(true);
        },
        (error) => {
          console.error("Errore nell'avvio del riconoscimento vocale:", error);
        }
      );
    }
  };
  
  // Funzione per fermare la traduzione
  const stopTranslation = () => {
    if (speechRecognizer.current) {
      speechRecognizer.current.stopContinuousRecognitionAsync(
        () => {
          console.log("Riconoscimento vocale fermato");
          setIsTranslating(false);
        },
        (error) => {
          console.error("Errore nell'arresto del riconoscimento vocale:", error);
        }
      );
    }
  };
  
  // Funzione per riprodurre il testo tradotto
  const speakTranslatedText = (text, language) => {
    console.log(`Riproduzione traduzione: "${text}" in lingua ${language}`);
    
    // Importante: assicurati di usare il sintetizzatore per la lingua DELL'UTENTE TARGET
    const synthesizer = speechSynthesizer.current[language];
    if (synthesizer) {
      synthesizer.speakTextAsync(
        text,
        result => {
          if (result.reason === speechsdk.ResultReason.SynthesizingAudioCompleted) {
            console.log(`Sintesi vocale completata per la lingua: ${language}`);
          } else {
            console.error(`Errore nella sintesi vocale: ${result.errorDetails}`);
          }
        },
        error => {
          console.error(`Errore nella sintesi vocale: ${error}`);
        }
      );
    } else {
      console.error(`Nessun sintetizzatore disponibile per la lingua: ${language}`);
      // Fallback con Web Speech API
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language;
        window.speechSynthesis.speak(utterance);
        console.log(`Fallback: sintesi vocale browser per lingua ${language}`);
      } catch (e) {
        console.error("Anche il fallback ha fallito:", e);
      }
    }
  };
  
  // Modifica la funzione joinRoom per includere la lingua
  const joinRoom = (username, roomId, language, providedStream = null) => {
    if (socket && username && roomId) {
      setUserLanguage(language);
      
      socket.connect();
      socket.emit('join', { 
        username, 
        roomId,
        language 
      });
      
      // Inizializza i servizi Azure Speech
      initSpeechServices(language);
      
      // Usa lo stream fornito o inizializza un nuovo stream
      if (providedStream) {
        setLocalStream(providedStream);
      } else {
        startLocalStream();
      }
    }
  };

  // Funzione per inviare un messaggio
  const sendMessage = (text) => {
    if (socket) {
      console.log("Invio messaggio:", text);
      socket.emit('message', { text });
    } else {
      console.error("Socket non disponibile per l'invio del messaggio");
    }
  };

  // Funzione per inizializzare il flusso audio locale
  const startLocalStream = async () => {
    try {
      console.log("Tentativo di accesso al microfono...");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: false 
      });
      
      console.log("Microfono accessibile:", stream);
      setLocalStream(stream);
      setLocalStreamStarted(true);
      
      // Notifica al server che abbiamo accesso all'audio
      if (socket && socket.connected) {
        socket.emit('audio-ready');
        console.log("Notifica audio-ready inviata");
      }
    } catch (error) {
      console.error('Errore nell\'accesso al microfono:', error);
      alert("Non è stato possibile accedere al microfono. Verifica le autorizzazioni del browser.");
    }
  };

  // Attiva/disattiva l'audio dagli altri
  const toggleAudio = () => {
    setAudioEnabled(prev => !prev);
    
    // Gestisci gli elementi audio HTML direttamente
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(audio => {
      audio.muted = audioEnabled;
    });
    
    console.log(`Audio ${!audioEnabled ? 'attivato' : 'disattivato'}`);
  };

  // Attiva/disattiva il tuo microfono
  const toggleMic = () => {
    setMicEnabled(prev => !prev);
    
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !micEnabled;
        console.log(`Microfono ${!micEnabled ? 'attivato' : 'disattivato'}`, track);
      });
    }
  };

  // Gestisci le connessioni WebRTC
  useEffect(() => {
    if (!socket || !localStream) return;
    
    console.log("Configurazione degli handler WebRTC...");
    
    // Handler per quando un nuovo utente è pronto per l'audio
    const handleAudioReady = ({ userId }) => {
      console.log(`Utente ${userId} pronto per l'audio`);
      initiateCall(userId);
    };
    
    // Handler per le richieste di chiamata
    const handleCallRequest = async ({ from, offer }) => {
      console.log(`Richiesta di chiamata da ${from}`, offer);
      try {
        // Crea una nuova connessione peer
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        });
        
        peerConnections.current[from] = pc;
        
        // Aggiungi lo stream locale
        localStream.getTracks().forEach(track => {
          console.log("Aggiunta traccia locale alla connessione", track);
          pc.addTrack(track, localStream);
        });
        
        // Gestisci i candidati ICE
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log("Invio candidato ICE a", from);
            socket.emit('ice-candidate', {
              to: from,
              candidate: event.candidate
            });
          }
        };
        
        // Gestisci lo stato della connessione
        pc.oniceconnectionstatechange = () => {
          console.log("Stato connessione ICE:", pc.iceConnectionState);
        };
        
        // Gestisci i track in arrivo
        pc.ontrack = (event) => {
          console.log("Traccia remota ricevuta", event.streams[0]);
          const remoteStream = event.streams[0];
          
          setRemoteStreams(prev => {
            // Evita duplicazioni
            if (prev[from] && prev[from].id === remoteStream.id) {
              return prev;
            }
            return {...prev, [from]: remoteStream};
          });
          
          // Crea o aggiorna l'elemento audio
          const audioEl = document.getElementById(`audio-${from}`) || document.createElement('audio');
          audioEl.id = `audio-${from}`;
          audioEl.srcObject = remoteStream;
          audioEl.autoplay = true;
          audioEl.muted = !audioEnabled;
          
          // Aggiungi al DOM se necessario
          if (!document.getElementById(`audio-${from}`)) {
            audioEl.style.display = 'none';
            document.body.appendChild(audioEl);
          }
        };
        
        // Imposta l'offerta remota
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        
        // Crea una risposta
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        // Invia la risposta
        console.log("Invio risposta a", from);
        socket.emit('call-answer', {
          to: from,
          answer: pc.localDescription
        });
      } catch (error) {
        console.error('Errore nella gestione della chiamata:', error);
      }
    };
    
    // Handler per le risposte alle chiamate
    const handleCallAnswer = async ({ from, answer }) => {
      console.log(`Risposta alla chiamata da ${from}`, answer);
      try {
        const pc = peerConnections.current[from];
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          console.log("Risposta remota impostata correttamente");
        } else {
          console.error("Nessuna connessione peer trovata per", from);
        }
      } catch (error) {
        console.error('Errore nella gestione della risposta:', error);
      }
    };
    
    // Handler per i candidati ICE
    const handleIceCandidate = async ({ from, candidate }) => {
      console.log(`Candidato ICE ricevuto da ${from}`);
      try {
        const pc = peerConnections.current[from];
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          console.log("Candidato ICE aggiunto correttamente");
        } else {
          console.error("Nessuna connessione peer trovata per", from);
        }
      } catch (error) {
        console.error('Errore nell\'aggiunta del candidato ICE:', error);
      }
    };
    
    // Gestisci l'arrivo di un nuovo utente
    const handleUserJoined = ({ userId }) => {
      console.log(`Nuovo utente ${userId} è entrato nella stanza`);
      // Notifica che siamo pronti per l'audio
      socket.emit('audio-ready', { to: userId });
    };
    
    // Funzione per iniziare una chiamata
    const initiateCall = async (userId) => {
      console.log(`Inizializzazione chiamata a ${userId}...`);
      try {
        // Crea una nuova connessione peer
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        });
        
        peerConnections.current[userId] = pc;
        
        // Aggiungi lo stream locale
        localStream.getTracks().forEach(track => {
          console.log("Aggiunta traccia locale alla connessione", track);
          pc.addTrack(track, localStream);
        });
        
        // Gestisci i candidati ICE
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log("Invio candidato ICE a", userId);
            socket.emit('ice-candidate', {
              to: userId,
              candidate: event.candidate
            });
          }
        };
        
        // Gestisci lo stato della connessione
        pc.oniceconnectionstatechange = () => {
          console.log("Stato connessione ICE:", pc.iceConnectionState);
        };
        
        // Gestisci i track in arrivo
        pc.ontrack = (event) => {
          console.log("Traccia remota ricevuta", event.streams[0]);
          const remoteStream = event.streams[0];
          
          setRemoteStreams(prev => {
            // Evita duplicazioni
            if (prev[userId] && prev[userId].id === remoteStream.id) {
              return prev;
            }
            return {...prev, [userId]: remoteStream};
          });
          
          // Crea o aggiorna l'elemento audio
          const audioEl = document.getElementById(`audio-${userId}`) || document.createElement('audio');
          audioEl.id = `audio-${userId}`;
          audioEl.srcObject = remoteStream;
          audioEl.autoplay = true;
          audioEl.muted = !audioEnabled;
          
          // Aggiungi al DOM se necessario
          if (!document.getElementById(`audio-${userId}`)) {
            audioEl.style.display = 'none';
            document.body.appendChild(audioEl);
          }
        };
        
        // Crea un'offerta
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        // Invia l'offerta
        console.log("Invio offerta a", userId);
        socket.emit('call-request', {
          to: userId,
          offer: pc.localDescription
        });
      } catch (error) {
        console.error('Errore nell\'iniziare la chiamata:', error);
      }
    };
    
    // Registra i listener
    socket.on('audio-ready', handleAudioReady);
    socket.on('call-request', handleCallRequest);
    socket.on('call-answer', handleCallAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('user-joined', handleUserJoined);
    
    // Notifica che siamo pronti per l'audio
    socket.emit('audio-ready');
    console.log("Notifica audio-ready broadcast inviata");
    
    // Pulisci i listener
    return () => {
      socket.off('audio-ready', handleAudioReady);
      socket.off('call-request', handleCallRequest);
      socket.off('call-answer', handleCallAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('user-joined', handleUserJoined);
      
      // Chiudi tutte le connessioni peer
      Object.values(peerConnections.current).forEach(pc => {
        if (pc) pc.close();
      });
      
      // Rimuovi tutti gli elementi audio
      Object.keys(remoteStreams).forEach(userId => {
        const audioEl = document.getElementById(`audio-${userId}`);
        if (audioEl) audioEl.remove();
      });
    };
  }, [socket, localStream, audioEnabled, remoteStreams]);

  // Esponi il context
  return (
    <ChatContext.Provider 
      value={{ 
        socket, 
        messages, 
        users, 
        joinRoom,
        sendMessage,
        audioEnabled,
        micEnabled,
        toggleAudio,
        toggleMic,
        remoteStreams,
        userLanguage,
        isTranslating,
        startTranslation,
        stopTranslation,
        translations
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};