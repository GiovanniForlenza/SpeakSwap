import React, { useState } from 'react';
import { useChat } from '../context/ChatContext';

function MessageInput() {
  const [message, setMessage] = useState('');
  const { sendMessage } = useChat();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim()) {
      sendMessage(message);
      setMessage('');
    }
  };

  return (
    <form className="message-input" onSubmit={handleSubmit}>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Scrivi un messaggio..."
      />
      <button type="submit">Invia</button>
    </form>
  );
}

export default MessageInput;