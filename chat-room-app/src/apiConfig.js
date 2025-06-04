const getApiBaseUrl = () => {
  // In locale
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:8081';
  }
  
  // Con variabile d'ambiente specifica
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // In automatico in base all hostname
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8081';
  }
  
  // Per Azure Static Web Apps
  if (hostname.includes('azurestaticapps.net')) {
    return 'https://speakswapserver-gzf6fpbjb0gma3fb.italynorth-01.azurewebsites.net';
  }
  
  // URL di produzione del backend
  return 'https://speakswapserver-gzf6fpbjb0gma3fb.italynorth-01.azurewebsites.net';
};

export const API_BASE_URL = getApiBaseUrl();

export const API_ENDPOINTS = {
  USER_ROOMS: (userName) => `${API_BASE_URL}/api/UserHistory/rooms/${encodeURIComponent(userName)}`,
  CONVERSATION: (roomName, userName) => `${API_BASE_URL}/api/UserHistory/conversation/${encodeURIComponent(roomName)}/${encodeURIComponent(userName)}`,
  TEST: () => `${API_BASE_URL}/api/UserHistory/test`
};

// Helper per le chiamate API
export const apiCall = async (url, options = {}) => {
  const defaultOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    mode: 'cors'
  };
  
  const finalOptions = { ...defaultOptions, ...options };
  
  console.log(`API Call: ${url}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Hostname: ${window.location.hostname}`);
  
  const response = await fetch(url, finalOptions);
  
  console.log(`Response: ${response.status} ${response.statusText}`);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
};