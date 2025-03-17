class WebAudioRecorder {
  constructor(options = {}) {
    this.options = {
      debug: false,
      bufferSize: 4096, // Dimensione del buffer (deve essere potenza di 2)
      silenceThreshold: 0.01, // Soglia per il rilevamento del silenzio
      silenceTimeout: 1000, // ms di silenzio prima di considerare terminata la registrazione
      onAudioAvailable: null, // Callback quando l'audio è disponibile
      onLevelUpdate: null, // Callback per aggiornare l'indicatore di livello
      ...options
    };
    
    this.audioContext = null;
    this.stream = null;
    this.processor = null;
    this.analyser = null;
    this.isRecording = false;
    this.isActive = false; // True quando stiamo effettivamente registrando voce
    
    this.audioChunks = []; // Buffer per i chunks audio
    this.silenceStart = null; // Timestamp di inizio silenzio
    this.levelCheckInterval = null;
  }
  
  async initialize() {
    try {
      // Richiedi accesso al microfono
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // Crea il contesto audio
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Crea l'analyzer per il rilevamento dei livelli
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      
      // Crea la source dal microfono
      const source = this.audioContext.createMediaStreamSource(this.stream);
      
      // Collega source -> analyser
      source.connect(this.analyser);
      
      // Crea lo script processor per elaborare l'audio
      this.processor = this.audioContext.createScriptProcessor(
        this.options.bufferSize, 1, 1 // bufferSize, inputChannels, outputChannels
      );
      
      // Collega il processor
      source.connect(this.processor);
      
      // Connetti a destination ma con volume zero (necessario per far funzionare il processor)
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = 0;
      this.processor.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      // Gestisci l'elaborazione audio
      this.processor.onaudioprocess = this._handleAudioProcess.bind(this);
      
      if (this.options.debug) console.log("WebAudioRecorder inizializzato con successo");
      return true;
      
    } catch (error) {
      console.error("Errore nell'inizializzazione del WebAudioRecorder:", error);
      return false;
    }
  }
  
  _handleAudioProcess(event) {
    if (!this.isRecording) return;
    
    // Ottieni i dati audio
    const input = event.inputBuffer.getChannelData(0);
    
    // Calcola il livello audio per determinare se c'è silenzio
    let sum = 0;
    for (let i = 0; i < input.length; i++) {
      sum += Math.abs(input[i]);
    }
    const average = sum / input.length;
    
    // Aggiorna il livello audio se c'è un callback
    if (typeof this.options.onLevelUpdate === 'function') {
      const normalizedLevel = Math.min(100, average * 100 / this.options.silenceThreshold);
      this.options.onLevelUpdate(normalizedLevel);
    }
    
    // Verifica se siamo sopra la soglia di silenzio
    const isSpeaking = average > this.options.silenceThreshold;
    
    if (isSpeaking) {
      // Se iniziamo a parlare dopo un periodo di silenzio
      if (!this.isActive) {
        this.isActive = true;
        this.silenceStart = null;
        if (this.options.debug) console.log("Voce rilevata, inizio registrazione");
      }
      
      // Aggiungi il buffer audio solo se stiamo registrando attivamente
      if (this.isActive) {
        // Copia i dati perché il buffer viene riutilizzato
        const buffer = new Float32Array(input.length);
        buffer.set(input);
        this.audioChunks.push(buffer);
      }
    } else {
      // Stiamo registrando ed è iniziato il silenzio
      if (this.isActive && !this.silenceStart) {
        this.silenceStart = Date.now();
      }
      
      // Se il silenzio continua oltre la soglia, fermati e invia l'audio
      if (this.isActive && this.silenceStart && 
          (Date.now() - this.silenceStart > this.options.silenceTimeout)) {
        if (this.options.debug) console.log("Silenzio rilevato, fine registrazione");
        
        // Invia l'audio raccolto finora
        this._sendRecordedAudio();
        
        // Resetta lo stato
        this.isActive = false;
      }
    }
  }
  
  _sendRecordedAudio() {
    if (this.audioChunks.length === 0) return;
    
    try {
      // Calcola la lunghezza totale
      let totalLength = 0;
      for (const chunk of this.audioChunks) {
        totalLength += chunk.length;
      }
      
      // Crea un unico buffer contenente tutti i chunk
      const mergedBuffer = new Float32Array(totalLength);
      let offset = 0;
      
      for (const chunk of this.audioChunks) {
        mergedBuffer.set(chunk, offset);
        offset += chunk.length;
      }
      
      // Converti da Float32Array a Int16Array per ridurre dimensioni
      const pcmBuffer = new Int16Array(mergedBuffer.length);
      for (let i = 0; i < mergedBuffer.length; i++) {
        // Scala da [-1.0, 1.0] a [-32768, 32767]
        const s = Math.max(-1, Math.min(1, mergedBuffer[i]));
        pcmBuffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      // Crea un oggetto con metadati
      const audioData = {
        sampleRate: this.audioContext.sampleRate,
        channelCount: 1,
        length: pcmBuffer.length,
        data: pcmBuffer.buffer
      };
      
      // Invia l'audio tramite callback
      if (typeof this.options.onAudioAvailable === 'function') {
        this.options.onAudioAvailable(audioData);
      }
      
      // Ripulisci il buffer
      this.audioChunks = [];
      
    } catch (error) {
      console.error("Errore nell'invio dell'audio registrato:", error);
      this.audioChunks = [];
    }
  }
  
  startRecording() {
    if (this.isRecording) return false;
    
    try {
      // Riattiva l'audioContext se è in stato sospeso
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      
      // Resetta lo stato
      this.isRecording = true;
      this.isActive = false;
      this.silenceStart = null;
      this.audioChunks = [];
      
      // Avvia il controllo periodico del livello
      this.levelCheckInterval = setInterval(() => {
        this._updateLevel();
      }, 100);
      
      if (this.options.debug) console.log("WebAudioRecorder: registrazione avviata");
      return true;
      
    } catch (error) {
      console.error("Errore nell'avvio della registrazione:", error);
      return false;
    }
  }
  
  _updateLevel() {
    if (!this.analyser || !this.isRecording) return;
    
    // Ottieni i dati
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    
    // Calcola il livello medio
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    
    // Normalizza il livello
    const normalizedLevel = Math.min(100, Math.max(0, (average / 255) * 100));
    
    // Aggiorna il livello
    if (typeof this.options.onLevelUpdate === 'function') {
      this.options.onLevelUpdate(normalizedLevel);
    }
  }
  
  stopRecording() {
    if (!this.isRecording) return false;
    
    try {
      // Invia eventuali audio accumulati
      if (this.isActive && this.audioChunks.length > 0) {
        this._sendRecordedAudio();
      }
      
      // Azzera lo stato
      this.isRecording = false;
      this.isActive = false;
      this.silenceStart = null;
      
      // Ferma il controllo del livello
      if (this.levelCheckInterval) {
        clearInterval(this.levelCheckInterval);
        this.levelCheckInterval = null;
      }
      
      if (this.options.debug) console.log("WebAudioRecorder: registrazione fermata");
      return true;
      
    } catch (error) {
      console.error("Errore nell'arresto della registrazione:", error);
      return false;
    }
  }
  
  release() {
    this.stopRecording();
    
    // Disconnetti e rilascia il processor
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    
    // Rilascia l'analyzer
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    
    // Rilascia le tracce audio
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    // Chiudi il contesto audio
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(err => {
        console.error("Errore nella chiusura dell'AudioContext:", err);
      });
    }
    
    this.audioContext = null;
    
    if (this.options.debug) console.log("WebAudioRecorder: risorse rilasciate");
  }
}

export default WebAudioRecorder;