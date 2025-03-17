class WebAudioPlayer {
  constructor(options = {}) {
    this.options = {
      debug: false,
      onPlayStart: null,
      onPlayEnd: null,
      ...options
    };
    
    this.audioContext = null;
  }
  
  initialize() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (this.options.debug) console.log("WebAudioPlayer inizializzato con successo");
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
      
      // Notifica inizio riproduzione
      if (typeof this.options.onPlayStart === 'function') {
        this.options.onPlayStart(userId);
      }
      
      // Crea il buffer audio
      const audioBuffer = this.audioContext.createBuffer(
        audioData.channelCount,
        audioData.length,
        audioData.sampleRate
      );
      
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
      
      // Collega all'output
      source.connect(this.audioContext.destination);
      
      // Avvia la riproduzione
      source.start(0);
      
      // Configura l'evento di fine riproduzione
      source.onended = () => {
        if (typeof this.options.onPlayEnd === 'function') {
          this.options.onPlayEnd(userId);
        }
      };
      
      return true;
    } catch (error) {
      console.error(`Errore nella riproduzione dell'audio per l'utente ${userId}:`, error);
      
      // Notifica comunque la fine per mantenere coerente lo stato
      if (typeof this.options.onPlayEnd === 'function') {
        this.options.onPlayEnd(userId);
      }
      
      return false;
    }
  }
  
  release() {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(err => {
        console.error("Errore nella chiusura dell'AudioContext:", err);
      });
    }
    
    this.audioContext = null;
    
    if (this.options.debug) console.log("WebAudioPlayer: risorse rilasciate");
  }
}

export default WebAudioPlayer;