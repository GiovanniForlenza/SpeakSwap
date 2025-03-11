// src/components/TranslationControls.js
import React from 'react';
import { useChat } from '../context/ChatContext';

function TranslationControls() {
  const { 
    isTranslating, 
    startTranslation, 
    stopTranslation,
    userLanguage,
    translations,
    users
  } = useChat();
  
  // Ottieni il nome utente da visualizzare
  const getUsernameById = (userId) => {
    const user = users.find(u => u.id === userId);
    return user ? user.username : 'Utente sconosciuto';
  };
  
  // Ottieni il nome della lingua
  const getLanguageName = (langCode) => {
    const languages = {
      'it-IT': 'Italiano',
      'en-US': 'Inglese',
      'fr-FR': 'Francese',
      'de-DE': 'Tedesco',
      'es-ES': 'Spagnolo',
      'zh-CN': 'Cinese',
      'ja-JP': 'Giapponese',
      'ru-RU': 'Russo'
    };
    
    return languages[langCode] || langCode;
  };
  
  return (
    <div className="translation-controls">
      <div className="translation-status">
        <h4>Traduzione in tempo reale ({getLanguageName(userLanguage)})</h4>
        {isTranslating ? (
          <button 
            className="translation-button stop"
            onClick={stopTranslation}
          >
            ⏹️ Ferma traduzione
          </button>
        ) : (
          <button 
            className="translation-button start"
            onClick={startTranslation}
          >
            🎤 Avvia traduzione
          </button>
        )}
      </div>
      
      {Object.entries(translations).length > 0 && (
        <div className="recent-translations">
          <h4>Traduzioni recenti</h4>
          <ul>
            {Object.entries(translations).map(([userId, translation]) => (
              <li key={userId}>
                <div className="translation-header">
                  <strong>{getUsernameById(userId)}</strong> 
                  <span>({getLanguageName(translation.fromLanguage)})</span>
                </div>
                <div className="translation-body">
                  <div className="original-text">{translation.originalText}</div>
                  <div className="translated-text">{translation.translatedText}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default TranslationControls;