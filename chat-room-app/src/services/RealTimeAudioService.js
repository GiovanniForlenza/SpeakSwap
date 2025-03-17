class RealTimeAudioService {
  constructor(options = {}) {
    this.options = {
      chunkDuration: 100, // ms, durata di ogni chunk audio
      debug: false,
      onAudioAvailable: null,
      onLevelUpdate: null,
      ...options
    };
    
    this.mediaStream = null;
    this.audioContext = null;
    this.analyzer = null;
    this.processor = null;
    this.isStreaming = false;
    this.levelInterval = null;
    
    this.supportedFormats = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/mpeg'
    ];

    this.selectedFormat = null;

    // Per il monitoraggio delle statistiche
    this.stats = {
      chunks: 0,
      totalBytes: 0,
      avgChunkSize: 0
    };
  }
  
  // Inizializza il servizio e richiede accesso al microfono
  async initialize() {
    try {
      if (this.options.debug) console.log("Inizializzazione servizio audio in tempo reale...");
      
      // Richiedi accesso al microfono con le impostazioni ottimali per voce
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1, // mono per voce
          sampleRate: 22050 // qualità sufficiente per voce
        }
      });
      
      // Inizializza Web Audio API
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        latencyHint: 'interactive', // ottimizza per bassa latenza
        sampleRate: 22050 // qualità sufficiente per voce
      });
      
      // Crea analyser per monitorare i livelli audio
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;
      
      // Collega la sorgente audio all'analyser
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);
      
      // Configura lo stream processor
      await this._setupAudioProcessor();
      
      if (this.options.debug) console.log("Servizio audio in tempo reale inizializzato con successo");
      return true;
      
    } catch (error) {
      console.error("Errore nell'inizializzazione del servizio audio:", error);
      return false;
    }
  }
  
  async _setupAudioProcessor() {
    // Testa tutti i formati supportati e salva i risultati
    const formatSupport = {};
    for (const format of this.supportedFormats) {
      formatSupport[format] = MediaRecorder.isTypeSupported(format);
    }
    
    // Trova il primo formato supportato
    this.selectedFormat = this.supportedFormats.find(format => formatSupport[format]) || '';
    
    if (this.options.debug) {
      console.log('Supporto formati audio:', formatSupport);
      console.log(`Formato audio selezionato: ${this.selectedFormat}`);
    }
    
    // Usa opzioni diverse per diversi formati
    let recorderOptions = {
      mimeType: this.selectedFormat,
      audioBitsPerSecond: 24000 // Default per la voce
    };
    
    // Regola il bitrate in base al formato scelto
    if (this.selectedFormat.includes('opus')) {
      // Opus è efficiente, può usare bitrate più basso
      recorderOptions.audioBitsPerSecond = 16000;
    } else if (this.selectedFormat.includes('mp4') || this.selectedFormat.includes('mpeg')) {
      // Formati meno efficienti potrebbero richiedere bitrate più alto
      recorderOptions.audioBitsPerSecond = 32000;
    }
    
    // Se nessun formato è supportato, usa il MediaRecorder senza opzioni specifiche
    if (!this.selectedFormat) {
      recorderOptions = {};
      console.warn('Nessun formato audio specifico supportato, utilizzo configurazione di default');
    }
    
    // Crea il MediaRecorder
    this.processor = new MediaRecorder(this.mediaStream, recorderOptions);
    
    // Gestisci gli eventi di disponibilità dati
    this.processor.ondataavailable = this._handleAudioChunk.bind(this);
    this.processor.onerror = (event) => {
      console.error("Errore nel MediaRecorder:", event.error);
      this.stopStreaming();
    };
  }
  
  _handleAudioChunk(event) {
    if (!event.data || event.data.size <= 0) return;
    
    // Aggiungi informazioni sul formato
    if (this.options.debug && this.stats.chunks === 0) {
      console.log(`Primo chunk audio: size=${event.data.size} bytes, type=${event.data.type}`);
    }
    
    // Aggiorna le statistiche
    this.stats.chunks++;
    this.stats.totalBytes += event.data.size;
    this.stats.avgChunkSize = this.stats.totalBytes / this.stats.chunks;
    
    if (this.options.debug && this.stats.chunks % 10 === 0) {
      console.log(`Audio stats: ${this.stats.chunks} chunks, avg size ${Math.round(this.stats.avgChunkSize)} bytes`);
    }
    
    // Invia il chunk audio tramite il callback
    if (typeof this.options.onAudioAvailable === 'function') {
      this.options.onAudioAvailable(event.data);
    }
  }
  
  _updateAudioLevel() {
    if (!this.analyser || !this.isStreaming) return;
    
    // Ottieni i dati dall'analyzer
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    
    // Calcola il livello medio
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avgLevel = sum / dataArray.length;
    
    // Normalizza il livello da 0 a 100
    const normalizedLevel = Math.min(100, Math.max(0, (avgLevel / 255) * 100));
    
    // Notifica il livello audio
    if (typeof this.options.onLevelUpdate === 'function') {
      this.options.onLevelUpdate(normalizedLevel);
    }
  }
  
  startStreaming() {
    if (this.isStreaming || !this.processor) return false;
    
    try {
      // Avvia il MediaRecorder con timeslice molto bassi
      this.processor.start(this.options.chunkDuration);
      this.isStreaming = true;
      
      // Inizia il monitoraggio dei livelli audio
      this.levelInterval = setInterval(() => {
        this._updateAudioLevel();
      }, 100); // aggiorna 10 volte al secondo
      
      if (this.options.debug) console.log("Streaming audio avviato");
      return true;
      
    } catch (error) {
      console.error("Errore nell'avvio dello streaming audio:", error);
      return false;
    }
  }
  
  stopStreaming() {
    if (!this.isStreaming || !this.processor) return false;
    
    try {
      // Ferma il MediaRecorder solo se è in stato di registrazione
      if (this.processor.state === 'recording') {
        this.processor.stop();
      }
      
      // Ferma il monitoraggio dei livelli
      if (this.levelInterval) {
        clearInterval(this.levelInterval);
        this.levelInterval = null;
      }
      
      this.isStreaming = false;
      
      if (this.options.debug) console.log("Streaming audio fermato");
      return true;
      
    } catch (error) {
      console.error("Errore nell'arresto dello streaming audio:", error);
      return false;
    }
  }
  
  // Rilascia tutte le risorse
  release() {
    this.stopStreaming();
    
    // Rilascia le tracce del media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    // Chiudi il contesto audio
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(err => console.error("Errore nella chiusura dell'AudioContext:", err));
    }
    
    this.audioContext = null;
    this.analyser = null;
    this.processor = null;
    
    if (this.options.debug) console.log("Risorse audio rilasciate");
  }
  
  // Metodo per il test
  testAudio() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
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
  }
}

export default RealTimeAudioService;