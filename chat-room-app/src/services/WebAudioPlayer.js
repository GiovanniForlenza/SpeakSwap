class WebAudioPlayer {
  constructor(options = {}) {
    this.options = {
      debug: false,
      onPlayStart: null,
      onPlayEnd: null,
      onLevelUpdate: null, // Callback per l'aggiornamento dei livelli audio
      ...options
    };
    
    this.audioContext = null;
    this.audioQueue = {}; // Coda di riproduzione per utente
    this.isPlaying = {}; // Stato di riproduzione per utente
    this.userGains = {}; // Controlli del volume per utente
    this.analysers = {}; // Analizzatori per livelli audio
    this.levelUpdateIntervals = {}; // Intervalli per aggiornamento livelli
  }
  
  initialize() {
    try {
      // Crea l'AudioContext con ottimizzazione per bassa latenza
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        latencyHint: 'interactive'
      });
      
      if (this.options.debug) console.log("WebAudioPlayer inizializzato con successo, sample rate:", this.audioContext.sampleRate);
      return true;
    } catch (error) {
      console.error("Errore nell'inizializzazione del WebAudioPlayer:", error);
      return false;
    }
  }
  
  async playPCMAudio(userId, audioData) {
    if (!this.audioContext) {
      if (!this.initialize()) return false;
    }
    
    try {
      // Assicurati che l'audioContext sia attivo
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      // Inizializza la coda per questo utente se non esiste
      if (!this.audioQueue[userId]) {
        this.audioQueue[userId] = [];
        this.isPlaying[userId] = false;
      }
      
      // Aggiungi il pacchetto alla coda
      this.audioQueue[userId].push(audioData);
      
      // Se non sta già riproducendo, avvia la riproduzione
      if (!this.isPlaying[userId]) {
        this._playNextInQueue(userId);
      }
      
      return true;
    } catch (error) {
      console.error(`Errore nell'accodamento dell'audio per l'utente ${userId}:`, error);
      return false;
    }
  }
  
  // Metodo per riprodurre il prossimo elemento nella coda
  async _playNextInQueue(userId) {
    if (!this.audioQueue[userId] || this.audioQueue[userId].length === 0) {
      this.isPlaying[userId] = false;
      
      // Ferma il monitoraggio del livello se attivo
      if (this.levelUpdateIntervals[userId]) {
        clearInterval(this.levelUpdateIntervals[userId]);
        this.levelUpdateIntervals[userId] = null;
      }
      
      return;
    }
    
    this.isPlaying[userId] = true;
    const audioData = this.audioQueue[userId].shift();
    
    try {
      // Notifica inizio riproduzione
      if (typeof this.options.onPlayStart === 'function') {
        this.options.onPlayStart(userId);
      }
      
      // Crea il buffer audio
      let audioBuffer;
      try {
        audioBuffer = this.audioContext.createBuffer(
          audioData.channelCount,
          audioData.length,
          audioData.sampleRate
        );
      } catch (bufferError) {
        if (this.options.debug) console.warn("Errore nella creazione del buffer, tentativo alternativo:", bufferError);
        
        // Riprova con parametri diversi
        audioBuffer = this.audioContext.createBuffer(
          1, // Forza mono
          audioData.length,
          this.audioContext.sampleRate // Usa il sampleRate del contesto
        );
      }
      
      // Ottieni il canale e copia i dati
      const channelData = audioBuffer.getChannelData(0);
      
      // Converti da Int16 a Float32
      const int16Data = new Int16Array(audioData.data);
      for (let i = 0; i < int16Data.length; i++) {
        // Converti da int16 [-32768,32767] a float [-1,1]
        channelData[i] = int16Data[i] < 0 ? int16Data[i] / 0x8000 : int16Data[i] / 0x7FFF;
      }
      
      // Crea la source
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Crea/ottieni il gainNode per l'utente
      if (!this.userGains[userId]) {
        this.userGains[userId] = this.audioContext.createGain();
        this.userGains[userId].gain.value = 1.0; // Volume predefinito
      }
      
      // Crea/ottieni l'analyzer per l'utente
      if (!this.analysers[userId] && typeof this.options.onLevelUpdate === 'function') {
        this.analysers[userId] = this.audioContext.createAnalyser();
        this.analysers[userId].fftSize = 256;
        
        // Avvia il monitoraggio del livello
        this._startLevelMonitoring(userId);
      }
      
      // Collega la catena audio: source -> analyser -> gain -> output
      if (this.analysers[userId]) {
        source.connect(this.analysers[userId]);
        this.analysers[userId].connect(this.userGains[userId]);
      } else {
        source.connect(this.userGains[userId]);
      }
      this.userGains[userId].connect(this.audioContext.destination);
      
      // Avvia la riproduzione
      source.start(0);
      
      if (this.options.debug) console.log(`Riproduzione audio per ${userId} avviata, durata: ${audioBuffer.duration.toFixed(2)}s, campioni: ${audioBuffer.length}`);
      
      // Configura l'evento di fine riproduzione
      source.onended = () => {
        if (this.options.debug) console.log(`Riproduzione audio per ${userId} terminata`);
        
        // Riproduci il prossimo nella coda
        this._playNextInQueue(userId);
        
        // Notifica fine riproduzione solo se la coda è vuota
        if (this.audioQueue[userId].length === 0 && typeof this.options.onPlayEnd === 'function') {
          this.options.onPlayEnd(userId);
        }
      };
      
    } catch (error) {
      console.error(`Errore nella riproduzione dell'audio per l'utente ${userId}:`, error);
      
      // Passa al prossimo nella coda in caso di errore
      this._playNextInQueue(userId);
      
      // Notifica comunque la fine per mantenere coerente lo stato
      if (this.audioQueue[userId].length === 0 && typeof this.options.onPlayEnd === 'function') {
        this.options.onPlayEnd(userId);
      }
    }
  }
  
  // Avvia il monitoraggio del livello audio per un utente
  _startLevelMonitoring(userId) {
    if (!this.analysers[userId] || this.levelUpdateIntervals[userId]) return;
    
    this.levelUpdateIntervals[userId] = setInterval(() => {
      if (!this.isPlaying[userId]) return;
      
      const analyser = this.analysers[userId];
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      
      // Calcola il livello medio
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avgLevel = sum / dataArray.length;
      
      // Normalizza il livello da 0 a 100
      const normalizedLevel = Math.min(100, Math.max(0, (avgLevel / 255) * 100));
      
      // Notifica il livello
      if (typeof this.options.onLevelUpdate === 'function') {
        this.options.onLevelUpdate(userId, normalizedLevel);
      }
    }, 100); // Aggiorna 10 volte al secondo
  }
  
  // Imposta il volume per un utente specifico
  setUserVolume(userId, volume) {
    if (!this.userGains[userId]) {
      this.userGains[userId] = this.audioContext.createGain();
    }
    
    // Limita il volume tra 0 e 1
    const safeVolume = Math.max(0, Math.min(1, volume));
    this.userGains[userId].gain.value = safeVolume;
    
    if (this.options.debug) console.log(`Volume per ${userId} impostato a ${safeVolume}`);
    return true;
  }
  
  // Ferma la riproduzione per un utente specifico
  stopUser(userId) {
    // Svuota la coda
    if (this.audioQueue[userId]) {
      this.audioQueue[userId] = [];
    }
    
    // Ferma il monitoraggio del livello
    if (this.levelUpdateIntervals[userId]) {
      clearInterval(this.levelUpdateIntervals[userId]);
      this.levelUpdateIntervals[userId] = null;
    }
    
    this.isPlaying[userId] = false;
    
    if (this.options.debug) console.log(`Riproduzione fermata per l'utente ${userId}`);
    return true;
  }
  
  // Ferma la riproduzione per tutti gli utenti
  stopAll() {
    for (const userId in this.isPlaying) {
      if (this.isPlaying[userId]) {
        this.stopUser(userId);
      }
    }
    
    if (this.options.debug) console.log("Riproduzione fermata per tutti gli utenti");
    return true;
  }
  
  // Rilascia tutte le risorse
  release() {
    this.stopAll();
    
    // Chiudi l'AudioContext
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(err => {
        console.error("Errore nella chiusura dell'AudioContext:", err);
      });
    }
    
    // Reset delle proprietà
    this.audioContext = null;
    this.audioQueue = {};
    this.isPlaying = {};
    this.userGains = {};
    this.analysers = {};
    
    // Ferma tutti gli intervalli di monitoraggio
    for (const userId in this.levelUpdateIntervals) {
      if (this.levelUpdateIntervals[userId]) {
        clearInterval(this.levelUpdateIntervals[userId]);
      }
    }
    this.levelUpdateIntervals = {};
    
    if (this.options.debug) console.log("WebAudioPlayer: risorse rilasciate");
  }
  
  // Metodo per testare la riproduzione
  testAudio() {
    if (!this.audioContext) {
      if (!this.initialize()) return "Errore nell'inizializzazione dell'audio";
    }
    
    try {
      // Genera un breve suono test
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.value = 440; // La 440Hz
      gainNode.gain.value = 0.3;
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.start();
      setTimeout(() => oscillator.stop(), 500);
      
      return "Test audio riprodotto con successo";
    } catch (error) {
      console.error("Errore nel test audio:", error);
      return `Errore nel test audio: ${error.message}`;
    }
  }
}

export default WebAudioPlayer;