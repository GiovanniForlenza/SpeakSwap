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
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './component/Login';
import Chat from './component/Chat';
import { SignalRConnectionProvider } from './component/SignalRConnectionProvider';

function App() {
  return (
    <Router>
      <div className="app">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route 
            path="/chat" 
            element={
              <SignalRConnectionProvider hubUrl="http://localhost:5051/chatHub">
                <Chat />
              </SignalRConnectionProvider>
            } 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;