// import React from 'react';
// import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
// import HomePage from './components/HomePage';
// import RoomPage from './components/RoomPage';

// function App() {
//   return (
//     <Router>
//       <div className="app">
//         <Routes>
//           <Route path="/room/:roomName" element={<RoomPage />} />
//           <Route path="/" element={<HomePage />} />
//         </Routes>
//       </div>
//     </Router>
//   );
// }

// export default App;


import React from 'react';
import { SignalRConnectionProvider } from './component/SignalRConnectionProvider';
import Chat from './component/Chat';

function App() {
  const hubUrl = 'http://localhost:5051/chatHub';
  const userName = 'Utente';

  return (
    <SignalRConnectionProvider hubUrl={hubUrl}>
      <div className="App">
        <header style ={{ textAlign: 'center', padding: '10px', backgroundColor: '#f0f2f5', marginBottom: '20px' }}>
          <h1>Application Chat and Voce</h1>
        </header>

        <main>
          <Chat userName={userName} />
        </main>
        <footer style ={{ textAlign: 'center', padding: '10px', color: '#666', marginTop: '20px' }}>
          <p>© 2025 Chat Application</p>
        </footer>
      </div>
    </SignalRConnectionProvider>
  );
}

export default App;