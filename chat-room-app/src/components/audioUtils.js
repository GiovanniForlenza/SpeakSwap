// Dimensione massima per ciascun blocco audio in bytes
export const MAX_CHUNK_SIZE = 30 * 1024; // 30KB per chunk

// Funzione migliorata per convertire base64 in Blob
export const base64ToBlob = (base64, mimeType) => {
  try {
    // Verifica input
    if (!base64) {
      console.error('base64ToBlob: Input base64 vuoto o nullo');
      return new Blob([], { type: mimeType || 'audio/wav' });
    }
    
    // Estrai la parte base64 effettiva se c'è un prefisso data URL
    let actualBase64 = base64;
    if (base64.includes('base64,')) {
      actualBase64 = base64.split('base64,')[1];
    }
    
    // Verifica che la stringa base64 sia valida
    if (!actualBase64 || actualBase64.trim() === '') {
      console.error('base64ToBlob: Stringa base64 effettiva vuota dopo elaborazione');
      return new Blob([], { type: mimeType || 'audio/wav' });
    }
    
    // Decodifica base64 in byte
    const byteCharacters = atob(actualBase64);
    const byteArrays = [];

    // Elabora i byte in blocchi per evitare problemi di memoria
    const sliceSize = 512;
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    const blob = new Blob(byteArrays, { type: mimeType || 'audio/wav' });
    console.log(`base64ToBlob: Creato blob di ${blob.size} bytes`);
    return blob;
  } catch (err) {
    console.error('Errore nella conversione base64 a blob:', err);
    
    // Log più dettagliato per debugging
    if (base64) {
      const sampleLength = Math.min(base64.length, 30);
      console.log('Primi caratteri della stringa base64:', base64.substring(0, sampleLength) + '...');
      console.log('Lunghezza stringa base64:', base64.length);
      
      // Verifica la validità del base64
      try {
        const testLength = Math.min(base64.length, 100);
        const testSample = base64.includes('base64,') ? 
                           base64.split('base64,')[1].substring(0, testLength) : 
                           base64.substring(0, testLength);
        atob(testSample);
        console.log('Il campione base64 sembra valido sintatticamente');
      } catch (validationErr) {
        console.error('La stringa base64 non è valida:', validationErr);
      }
    }
    
    return new Blob([], { type: mimeType || 'audio/wav' }); 
  }
};

// Funzione migliorata per convertire un array di base64 in un Blob
export const base64ArrayToBlob = (base64Array, mimeType) => {
  try {
    // Verifica input
    if (!base64Array || !Array.isArray(base64Array) || base64Array.length === 0) {
      console.error('base64ArrayToBlob: Input non valido, vuoto o non è un array');
      return new Blob([], { type: mimeType || 'audio/wav' });
    }
    
    console.log(`base64ArrayToBlob: Elaborazione di ${base64Array.length} chunks`);
    
    const byteArrays = base64Array.map((base64, index) => {
      if (!base64) {
        console.error(`base64ArrayToBlob: Chunk ${index} è vuoto o nullo`);
        return new Uint8Array(0);
      }
      
      let actualBase64 = base64;
      if (base64.includes('base64,')) {
        actualBase64 = base64.split('base64,')[1];
      }
      
      try {
        const byteCharacters = atob(actualBase64);
        const byteNumbers = new Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const result = new Uint8Array(byteNumbers);
        console.log(`base64ArrayToBlob: Chunk ${index} decodificato con successo (${result.length} bytes)`);
        return result;
      } catch (err) {
        console.error(`Errore nella conversione del chunk ${index}:`, err);
        
        // Cerca di identificare problemi comuni nel chunk
        if (actualBase64) {
          const sampleLength = Math.min(actualBase64.length, 20);
          console.log(`Primi ${sampleLength} caratteri del chunk ${index}:`, 
                     actualBase64.substring(0, sampleLength) + '...');
                     
          // Verifica se ci sono caratteri non validi in base64
          const invalidChars = actualBase64.match(/[^A-Za-z0-9+/=]/g);
          if (invalidChars) {
            console.error(`Trovati caratteri non validi nel chunk ${index}:`, 
                         [...new Set(invalidChars)].join(''));
          }
        }
        
        return new Uint8Array(0); 
      }
    });

    // Filtra eventuali chunk vuoti
    const validByteArrays = byteArrays.filter(arr => arr.length > 0);
    
    if (validByteArrays.length === 0) {
      console.error('base64ArrayToBlob: Nessun chunk valido trovato');
      return new Blob([], { type: mimeType || 'audio/wav' });
    }

    const blob = new Blob(validByteArrays, { type: mimeType || 'audio/wav' });
    console.log(`base64ArrayToBlob: Creato blob combinato di ${blob.size} bytes da ${validByteArrays.length} chunks`);
    return blob;
  } catch (err) {
    console.error('Errore globale nella conversione array base64 a blob:', err);
    return new Blob([], { type: mimeType || 'audio/wav' });
  }
};

// Funzione migliorata per convertire Blob in base64
export const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    // Verifica input
    if (!blob || !(blob instanceof Blob)) {
      console.error('blobToBase64: Input non valido o non è un Blob');
      reject(new Error('Input non valido'));
      return;
    }
    
    // Se il blob è vuoto, restituisci una stringa vuota
    if (blob.size === 0) {
      console.warn('blobToBase64: Blob vuoto (0 bytes)');
      resolve('');
      return;
    }
    
    console.log(`blobToBase64: Conversione blob di ${blob.size} bytes`);
    
    const reader = new FileReader();
    
    reader.onloadend = () => {
      try {
        const dataUrl = reader.result;
        if (!dataUrl) {
          console.error('blobToBase64: Risultato della lettura vuoto');
          reject(new Error('Risultato lettura vuoto'));
          return;
        }
        
        const base64Data = dataUrl.split('base64,')[1];
        console.log(`blobToBase64: Conversione completata, lunghezza base64: ${base64Data.length} caratteri`);
        resolve(base64Data);
      } catch (err) {
        console.error('blobToBase64: Errore nell\'estrazione dei dati base64:', err);
        reject(err);
      }
    };
    
    reader.onerror = (event) => {
      console.error('blobToBase64: Errore durante la lettura del blob:', event);
      reject(new Error('Errore lettura file'));
    };
    
    // Aggiungi timeout per evitare attese infinite
    const timeout = setTimeout(() => {
      reader.abort();
      console.error('blobToBase64: Timeout nella lettura del blob');
      reject(new Error('Timeout lettura file'));
    }, 10000); // 10 secondi
    
    reader.onloadend = function() {
      clearTimeout(timeout);
      try {
        const dataUrl = reader.result;
        const base64Data = dataUrl.split('base64,')[1];
        resolve(base64Data);
      } catch (err) {
        console.error('blobToBase64: Errore nell\'estrazione dei dati base64:', err);
        reject(err);
      }
    };
    
    // Inizia la lettura
    reader.readAsDataURL(blob);
  });
};

// Dividi un blob in chunk più piccoli con miglioramenti
export const splitBlobIntoChunks = async (blob, maxChunkSize) => {
  try {
    // Verifica input
    if (!blob || !(blob instanceof Blob)) {
      console.error('splitBlobIntoChunks: Input non valido o non è un Blob');
      return [];
    }
    
    // Se il blob è troppo piccolo, restituiscilo come unico chunk
    if (blob.size <= maxChunkSize) {
      console.log(`splitBlobIntoChunks: Blob di ${blob.size} bytes è abbastanza piccolo da essere un singolo chunk`);
      const singleChunk = await blobToBase64(blob);
      return [singleChunk];
    }
    
    const chunks = [];
    const totalSize = blob.size;
    let start = 0;
    
    console.log(`splitBlobIntoChunks: Dimensione totale dell'audio: ${totalSize} bytes`);
    console.log(`splitBlobIntoChunks: Dimensione massima per chunk: ${maxChunkSize} bytes`);
    
    // Numero di chunks previsti (arrotondato per eccesso)
    const expectedChunks = Math.ceil(totalSize / maxChunkSize);
    console.log(`splitBlobIntoChunks: Previsti circa ${expectedChunks} chunks`);
    
    while (start < totalSize) {
      const end = Math.min(start + maxChunkSize, totalSize);
      const chunk = blob.slice(start, end);
      
      // Verifica che il chunk abbia dati
      if (chunk.size === 0) {
        console.warn(`splitBlobIntoChunks: Chunk vuoto generato per range ${start}-${end}, skipping`);
        start = end;
        continue;
      }
      
      try {
        const base64Chunk = await blobToBase64(chunk);
        
        // Valida il chunk base64 prima di aggiungerlo
        if (!base64Chunk) {
          console.error(`splitBlobIntoChunks: Chunk base64 vuoto generato per range ${start}-${end}`);
        } else {
          console.log(`splitBlobIntoChunks: Chunk ${chunks.length} generato: ${start}-${end}, dimensione base64: ${base64Chunk.length} caratteri`);
          chunks.push(base64Chunk);
        }
      } catch (err) {
        console.error(`splitBlobIntoChunks: Errore nella conversione del chunk ${chunks.length}:`, err);
      }
      
      start = end;
    }
    
    console.log(`splitBlobIntoChunks: Audio diviso in ${chunks.length}/${expectedChunks} chunks`);
    
    // Verifica finale
    if (chunks.length === 0) {
      console.error('splitBlobIntoChunks: Nessun chunk valido generato');
    } else if (chunks.length < expectedChunks) {
      console.warn(`splitBlobIntoChunks: Generati meno chunks del previsto (${chunks.length}/${expectedChunks})`);
    }
    
    return chunks;
  } catch (err) {
    console.error('splitBlobIntoChunks: Errore globale nella suddivisione dell\'audio:', err);
    return [];
  }
};