import { useState } from "react";
import { useNavigate } from "react-router-dom";

const CreateRoomForm = ({ uuid, socket, setUser }) => {
    const [roomId, setRoomId] = useState(uuid());
    const [name, setName] = useState("");
    const [copied, setCopied] = useState(false);
    const navigate = useNavigate();

    const handleCopy = () => {
        navigator.clipboard.writeText(roomId);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };

    const handleCreateRoom = (e) => {
        e.preventDefault();

        if (!name.trim()) {
            alert("Please enter your name to create a room.");
            return;
        }

        const roomData = {
            name: name.trim(),
            roomId,
            userId: uuid(),
            host: true,
            presenter: true
        };

        setUser(roomData);

        if (socket) {
            socket.emit("userJoined", roomData);
        }

        console.log(roomData);

        // THE ULTIMATE BYPASS FIX: 
        // Bypasses React Router 7's startTransition bug completely
        setTimeout(() => {
            navigate(`/${roomId}`);
        }, 0);
    };

    return (
        <form className="w-100" onSubmit={handleCreateRoom}>
            <div className="mb-3 text-start">
                <label className="form-label small fw-bold text-uppercase text-muted">Your Name</label>
                <input 
                    type="text"
                    className="form-control py-2 px-3 saas-input"
                    placeholder="e.g. John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                />
            </div>
            
            <div className="mb-4 text-start">
                <label className="form-label small fw-bold text-uppercase text-muted">Room Code</label>
                <div className="input-group d-flex align-items-center border rounded-3 overflow-hidden p-1 bg-light">
                    <input 
                        type="text"
                        value={roomId}
                        className="form-control border-0 bg-transparent text-muted small pe-0 font-monospace"
                        disabled
                        placeholder="Generate room code"
                        style={{ fontSize: "11px" }}
                    />
                    <div className="d-flex gap-1 pe-1">
                        <button 
                            className="btn btn-outline-secondary btn-sm rounded-2 fw-semibold" 
                            onClick={() => setRoomId(uuid())} 
                            type="button"
                            style={{ fontSize: "11px", padding: "4px 8px" }}
                        >
                            Generate
                        </button>
                        <button 
                            className={`btn ${copied ? 'btn-success' : 'btn-outline-primary'} btn-sm rounded-2 fw-semibold`} 
                            onClick={handleCopy}
                            type="button"
                            style={{ fontSize: "11px", padding: "4px 10px", minWidth: "62px" }}
                        >
                            {copied ? "Copied!" : "Copy"}
                        </button>
                    </div>
                </div>
            </div>

            <button 
                type="submit" 
                className="btn btn-primary w-100 py-2.5 rounded-3 fw-bold saas-submit-btn" 
            >
                Create Workspace
            </button>
        </form>
    );
};

export default CreateRoomForm;