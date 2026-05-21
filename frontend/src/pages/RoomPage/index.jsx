// frontend/src/pages/RoomPage/index.jsx
import { useState, useRef, useEffect, useCallback } from "react";
import "./index.css";
import WhiteBoard from "../../components/Whiteboard";

const RoomPage = ({ socket, user }) => {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);

  const [tool, setTool] = useState("pencil");
  const [color, setColor] = useState("#000000");
  const [elements, setElements] = useState([]);

  // Per-user undo/redo stacks (Feature 5)
  const [myUndoStack, setMyUndoStack] = useState([]); // deleted elements I can redo

  // Presentation mode (Feature 4)
  const [roomMode, setRoomMode] = useState("COLLABORATION");

  const isPresentation = roomMode === "PRESENTATION";
  const isHost = user?.host === true;

  // ── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    socket.on("canvasState", (incomingElements) => {
      setElements(incomingElements);
    });

    socket.on("textSaved", (element) => {
      setElements(prev => {
        const idx = prev.findIndex(e => e.id === element.id);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = element;
          return updated;
        }
        return [...prev, element];
      });
    });

    socket.on("elementDeleted", (elementId) => {
      setElements(prev => prev.filter(e => e.id !== elementId));
    });

    socket.on("elementRestored", (element) => {
      setElements(prev => [...prev, element]);
    });

    socket.on("roomMode", (mode) => {
      setRoomMode(mode);
    });

    return () => {
      socket.off("canvasState");
      socket.off("textSaved");
      socket.off("elementDeleted");
      socket.off("elementRestored");
      socket.off("roomMode");
    };
  }, [socket]);

  // ── Clear canvas ──────────────────────────────────────────────────────────
  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    ctxRef.current.clearRect(0, 0, canvas.width, canvas.height);
    setElements([]);
    if (socket && user) {
      socket.emit("elementUpdated", { roomId: user.roomId, elements: [] });
    }
  };

  // ── Feature 5: Per-user Undo (Ctrl+Z) ────────────────────────────────────
  const handleUndo = useCallback(() => {
    if (!user) return;
    setElements(prev => {
      // Find last element belonging to this user
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].userId === user.userId) {
          const removed = prev[i];
          const updated = prev.filter((_, idx) => idx !== i);
          // Push to redo stack
          setMyUndoStack(s => [...s, removed]);
          // Broadcast deletion
          if (socket) {
            socket.emit("elementDeleted", { roomId: user.roomId, elementId: removed.id });
          }
          return updated;
        }
      }
      return prev;
    });
  }, [user, socket]);

  // ── Feature 5: Per-user Redo (Ctrl+Y) ────────────────────────────────────
  const handleRedo = useCallback(() => {
    if (!user || myUndoStack.length === 0) return;
    const element = myUndoStack[myUndoStack.length - 1];
    setMyUndoStack(s => s.slice(0, -1));
    setElements(prev => [...prev, element]);
    if (socket) {
      socket.emit("elementRestored", { roomId: user.roomId, element });
    }
  }, [user, socket, myUndoStack]);

  // ── Keyboard listeners ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  // ── Feature 4: Toggle presentation mode (host only) ──────────────────────
  const handleModeToggle = () => {
    if (!socket || !user) return;
    const newMode = roomMode === "COLLABORATION" ? "PRESENTATION" : "COLLABORATION";
    socket.emit("roomModeChange", { roomId: user.roomId, mode: newMode });
  };

  const myElementCount = elements.filter(e => e.userId === user?.userId).length;

  return (
    <div className="container-fluid vh-100 d-flex flex-column overflow-hidden bg-light px-4">

      {/* Header */}
      <h2 className="text-center py-3 my-0 fw-semibold fs-4">
        White Board Sharing App{" "}
        <span className="text-primary fs-5">[Room: {user?.roomId ?? "—"}]</span>
        {isPresentation && (
          <span className="ms-3 badge bg-danger fs-6">🎥 Presentation Mode</span>
        )}
      </h2>

      {/* Tool Bar — hidden for attendees in presentation mode */}
      {!isPresentation && (
        <div className="d-flex align-items-center justify-content-between border p-3 rounded shadow-sm bg-white mb-3 flex-wrap gap-2">

          {/* Tool Selection */}
          <div className="d-flex align-items-center gap-3 flex-wrap">
            {["pencil", "line", "rect", "arrow", "text"].map((t) => (
              <div key={t} className="form-check d-flex align-items-center gap-1 mb-0">
                <input
                  type="radio"
                  name="tool"
                  id={t}
                  checked={tool === t}
                  value={t}
                  className="form-check-input m-0"
                  onChange={(e) => setTool(e.target.value)}
                />
                <label htmlFor={t} className="form-check-label ms-1 m-0 text-capitalize">{t}</label>
              </div>
            ))}
          </div>

          {/* Color Picker */}
          <div className="d-flex align-items-center">
            <label htmlFor="color" className="fw-bold m-0">Color:</label>
            <input
              type="color"
              id="color"
              className="form-control-color ms-2"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>

          {/* Undo / Redo */}
          <div className="d-flex gap-2">
            <button
              className="btn btn-primary"
              disabled={myElementCount === 0}
              onClick={handleUndo}
              title="Ctrl+Z"
            >
              ↩ Undo
            </button>
            <button
              className="btn btn-outline-primary"
              disabled={myUndoStack.length === 0}
              onClick={handleRedo}
              title="Ctrl+Y"
            >
              ↪ Redo
            </button>
          </div>

          {/* Clear + Presentation toggle */}
          <div className="d-flex gap-2 align-items-center">
            <button className="btn btn-danger" onClick={handleClearCanvas}>Clear</button>

            {/* Feature 4: Only the host sees this toggle */}
            {isHost && (
              <div className="d-flex align-items-center gap-2 ms-2 border rounded px-3 py-1 bg-light">
                <span className="fw-semibold small">
                  {roomMode === "COLLABORATION" ? "🤝 Collab" : "🎥 Present"}
                </span>
                <div className="form-check form-switch mb-0">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    role="switch"
                    id="modeSwitch"
                    checked={roomMode === "PRESENTATION"}
                    onChange={handleModeToggle}
                  />
                  <label className="form-check-label" htmlFor="modeSwitch">
                    Presentation
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Canvas area */}
      <div className="flex-grow-1 w-100 mb-4 canvas-box bg-white border rounded shadow-sm overflow-hidden position-relative">
        <WhiteBoard
          canvasRef={canvasRef}
          ctxRef={ctxRef}
          elements={elements}
          setElements={setElements}
          color={color}
          tool={tool}
          socket={socket}
          user={user}
          isPresentation={isPresentation}
        />
      </div>

    </div>
  );
};

export default RoomPage;