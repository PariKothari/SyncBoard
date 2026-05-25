// frontend/src/App.jsx
import './App.css'
import Forms from './components/Forms'
import { Route, Routes } from 'react-router-dom'
import RoomPage from './pages/RoomPage'
import io from "socket.io-client"
import { useState, useEffect } from 'react'

const server = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
const connectionOptions = {
  "force new connection": true,
  reconnectionAttempts: "Infinity",
  timeout: 10000,
  transports: ["websocket"],
};

const socket = io(server, connectionOptions);

const App = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    socket.on("userIsJoined", (data) => {
      if (data.success) {
        console.log("userJoined");
      } else {
        console.log("userJoined error");
      }
    });
  }, []);

  const uuid = () => {
    var S4 = () => (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
    return S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4();
  };

  return (
    <div className="container">
      <Routes>
        <Route path="/" element={<Forms uuid={uuid} socket={socket} setUser={setUser} />} />
        
        <Route path="/:roomId" element={<RoomPage socket={socket} user={user} />} />
      </Routes>
    </div>
  );
};

export default App;