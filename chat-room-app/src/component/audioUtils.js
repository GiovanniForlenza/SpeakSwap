// Dimensione massima per ciascun blocco audio in bytes
export const MAX_CHUNK_SIZE = 5 * 1024; // 5KB

// Funzione per convertire base64 in Blob
export const base64ToBlob = (base64, mimeType) => {
  try {
    let actualBase64 = base64;
    if (base64.includes('base64,')) {
      actualBase64 = base64.split('base64,')[1];
    }
    
    const byteCharacters = atob(actualBase64);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: mimeType });
  } catch (err) {
    console.error('Errore nella conversione base64 a blob:', err);
    console.log('Primi 30 caratteri della stringa base64:', base64.substring(0, 30) + '...');
    return new Blob([], { type: mimeType }); 
  }
};

// Funzione per convertire un array di base64 in un Blob
export const base64ArrayToBlob = (base64Array, mimeType) => {
  try {
    const byteArrays = base64Array.map(base64 => {
      
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
        
        return new Uint8Array(byteNumbers);
      } catch (err) {
        console.error('Errore nella conversione di un singolo chunk base64:', err);
        return new Uint8Array(0); 
      }
    });

    return new Blob(byteArrays, { type: mimeType });
  } catch (err) {
    console.error('Errore globale nella conversione array base64 a blob:', err);
    return new Blob([], { type: mimeType });
  }
};

// Funzione per convertire Blob in base64
export const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const dataUrl = reader.result;
        const base64Data = dataUrl.split('base64,')[1];
        resolve(base64Data);
      } catch (err) {
        console.error('Errore nell\'estrazione dei dati base64:', err);
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Dividi un blob in chunk più piccoli
export const splitBlobIntoChunks = async (blob, maxChunkSize) => {
  try {
    const chunks = [];
    const totalSize = blob.size;
    let start = 0;
    
    console.log(`Dimensione totale dell'audio: ${totalSize} bytes`);
    console.log(`Dimensione massima per chunk: ${maxChunkSize} bytes`);
    
    while (start < totalSize) {
      const end = Math.min(start + maxChunkSize, totalSize);
      const chunk = blob.slice(start, end);
      const base64Chunk = await blobToBase64(chunk);
      
      // Valida il chunk base64 prima di aggiungerlo
      if (!base64Chunk) {
        console.error(`Chunk vuoto generato per range ${start}-${end}`);
      } else {
        console.log(`Chunk ${chunks.length} generato: ${start}-${end}, dimensione: ${base64Chunk.length} caratteri`);
        chunks.push(base64Chunk);
      }
      
      start = end;
    }
    
    console.log(`Audio diviso in ${chunks.length} chunks`);
    return chunks;
  } catch (err) {
    console.error('Errore nella suddivisione dell\'audio in chunks:', err);
    return [];
  }
};