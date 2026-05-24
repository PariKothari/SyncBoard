import { useState } from "react";
import { useNavigate } from "react-router-dom";

const JoinRoomForm = ({ uuid, socket, setUser }) => {
    const [roomId, setRoomId] = useState("");
    const [name, setName] = useState("");
    const navigate = useNavigate();

    const handleRoomJoin = (e) => {
        e.preventDefault();

        if (!name.trim()) {
            alert("Please enter your name.");
            return;
        }
        if (!roomId.trim()) {
            alert("Please enter a valid room code.");
            return;
        }

        const roomData = {
            name: name.trim(),
            roomId: roomId.trim(),
            userId: uuid(),
            host: false,
            presenter: false,
        };

        setUser(roomData);
        navigate(`/${roomId.trim()}`);
        socket.emit("userJoined", roomData);
    };

    return (
        <form className="w-100" onSubmit={handleRoomJoin}>
            <div className="mb-3 text-start">
                <label className="form-label small fw-bold text-uppercase text-muted">Your Name</label>
                <input 
                    type="text"
                    className="form-control py-2 px-3 saas-input"
                    placeholder="e.g. Jane Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                />
            </div>
            
            <div className="mb-4 text-start">
                <label className="form-label small fw-bold text-uppercase text-muted">Room Code</label>
                <input 
                    type="text"
                    className="form-control py-2 px-3 saas-input font-monospace"
                    placeholder="Enter 36-character room code"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    required
                    style={{ fontSize: "13px" }}
                />
            </div>

            <button 
                type="submit" 
                className="btn btn-primary w-100 py-2.5 rounded-3 fw-bold saas-submit-btn" 
            >
                Join Workspace
            </button>
        </form>
    );
};

export default JoinRoomForm;