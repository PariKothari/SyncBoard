// frontend/src/pages/RoomPage/index.jsx
import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./index.css";
import WhiteBoard from "../../components/Whiteboard";

// ── Lightweight Markdown-to-Plain Text Formatter ──────────────────────────
const formatAiResponse = (text) => {
  if (!text) return "";
  return text
    // Replace markdown bold tags (**text**) with the clean text inside them
    .replace(/\*\*(.*?)\*\*/g, "$1")
    // Remove markdown header hashes at the beginning of lines (e.g. "### Title" -> "Title")
    .replace(/^#+\s*(.*?)$/gm, "$1")
    // Convert bullet point asterisks to clean standard dots (•)
    .replace(/^\s*\*\s+/gm, "•  ")
    // Clean up any remaining loose asterisks
    .replace(/\*/g, "")
    // Normalize excessive consecutive line breaks to keep spacing neat
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const RoomPage = ({ socket, user }) => {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const { roomId } = useParams();
  const navigate = useNavigate();

  // Active users roster state hook
  const [activeUsers, setActiveUsers] = useState([]);

  // Handle local session caching to preserve ownership properties across refreshes
  const [currentUser, setCurrentUser] = useState(() => {
    if (user) {
      const sessionKey = `syncboard_user_${user.roomId}`;
      sessionStorage.setItem(sessionKey, JSON.stringify(user));
      return user;
    }

    const sessionKey = `syncboard_user_${roomId}`;
    const cached = sessionStorage.getItem(sessionKey);
    let cachedUser = null;
    if (cached) {
      try {
        cachedUser = JSON.parse(cached);
      } catch (e) {
        // Parse error fallback
      }
    }

    // Prompts users for their name if they do not already have one
    let name = cachedUser?.name || "";
    if (!name) {
      name = prompt("Enter your name to join the workspace:");
      if (!name || !name.trim()) {
        name = `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
      } else {
        name = name.trim();
      }
    }

    const genUuid = () => {
      const S4 = () => (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
      return S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4();
    };

    const guestUserObj = {
      name: name,
      roomId: roomId,
      userId: cachedUser?.userId || genUuid(),
      host: cachedUser?.host ?? false,
      presenter: cachedUser?.presenter ?? false,
    };

    sessionStorage.setItem(sessionKey, JSON.stringify(guestUserObj));
    return guestUserObj;
  });

  const [tool, setTool] = useState("pencil");
  const [color, setColor] = useState("#000000");
  const [elements, setElements] = useState([]);
  const [myUndoStack, setMyUndoStack] = useState([]);
  const [roomMode, setRoomMode] = useState("COLLABORATION");
  const [canvasClearVersion, setCanvasClearVersion] = useState(0);

  // SaaS AI Panel States
  const [aiOutput, setAiOutput] = useState("");
  const [panelMode, setPanelMode] = useState("");

  const isPresentation = roomMode === "PRESENTATION";
  const isHost = currentUser?.host === true;

  const forceCanvasRedraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (canvas && ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    setCanvasClearVersion((v) => v + 1);
  }, []);

  const applyCanvasClear = useCallback(() => {
    setElements([]);
    setMyUndoStack([]);
    forceCanvasRedraw();
  }, [forceCanvasRedraw]);

  useEffect(() => {
    if (user) {
      setCurrentUser(user);
      const sessionKey = `syncboard_user_${user.roomId}`;
      sessionStorage.setItem(sessionKey, JSON.stringify(user));
    }
  }, [user]);

  useEffect(() => {
    if (!socket || !currentUser?.roomId || !currentUser?.userId || !currentUser?.name) return;

    const onCanvasState = (incomingElements) => {
      const next = Array.isArray(incomingElements) ? incomingElements : [];
      setElements(next);
      if (next.length === 0) forceCanvasRedraw();
    };

    const onCanvasCleared = () => applyCanvasClear();

    const onTextSaved = (element) => {
      setElements((prev) => {
        const idx = prev.findIndex((e) => e.id === element.id);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = element;
          return updated;
        }
        return [...prev, element];
      });
    };

    const onElementDeleted = (elementId) => {
      setElements((prev) => prev.filter((e) => e.id !== elementId));
    };

    const onElementRestored = (element) => {
      setElements((prev) => [...prev, element]);
    };

    const onRoomMode = (mode) => setRoomMode(mode);

    // Active roster update listener
    const onRoomUsers = (usersList) => {
      setActiveUsers(usersList);
    };

    const emitJoinRoom = () => {
      // Announce identity through newly added join-room channel
      socket.emit("join-room", {
        roomId: currentUser.roomId,
        username: currentUser.name
      });

      // Backward compatibility emission
      socket.emit("userJoined", {
        name: currentUser.name,
        userId: currentUser.userId,
        roomId: currentUser.roomId,
        host: currentUser.host ?? false,
        presenter: currentUser.presenter ?? false,
      });
    };

    socket.on("canvasState", onCanvasState);
    socket.on("load-canvas", onCanvasState);
    socket.on("canvasCleared", onCanvasCleared);
    socket.on("textSaved", onTextSaved);
    socket.on("elementDeleted", onElementDeleted);
    socket.on("elementRestored", onElementRestored);
    socket.on("roomMode", onRoomMode);
    socket.on("room-users", onRoomUsers);

    if (socket.connected) emitJoinRoom();
    else socket.on("connect", emitJoinRoom);

    return () => {
      socket.off("connect", emitJoinRoom);
      socket.off("canvasState", onCanvasState);
      socket.off("load-canvas", onCanvasState);
      socket.off("canvasCleared", onCanvasCleared);
      socket.off("textSaved", onTextSaved);
      socket.off("elementDeleted", onElementDeleted);
      socket.off("elementRestored", onElementRestored);
      socket.off("roomMode", onRoomMode);
      socket.off("room-users", onRoomUsers);
    };
  }, [socket, currentUser, applyCanvasClear, forceCanvasRedraw]);

  const handleClearCanvas = () => {
    applyCanvasClear();
    if (socket && currentUser) {
      socket.emit("clearCanvas", { roomId: currentUser.roomId });
      socket.emit("elementUpdated", { roomId: currentUser.roomId, elements: [] });
    }
  };

  // Safe separate updates without nesting callback loops
  const handleUndo = useCallback(() => {
    if (!currentUser) return;

    const lastUserElementIdx = elements.reduce((acc, el, idx) => {
      if (el.userId === currentUser.userId) return idx;
      return acc;
    }, -1);

    if (lastUserElementIdx === -1) return;

    const removed = elements[lastUserElementIdx];

    setElements((prev) => prev.filter((_, idx) => idx !== lastUserElementIdx));
    setMyUndoStack((prev) => [...prev, removed]);

    if (socket) {
      socket.emit("elementDeleted", { roomId: currentUser.roomId, elementId: removed.id });
    }
  }, [currentUser, socket, elements]);

  // Safe separate updates with correct closure dependencies
  const handleRedo = useCallback(() => {
    if (!currentUser || myUndoStack.length === 0) return;

    const element = myUndoStack[myUndoStack.length - 1];

    setMyUndoStack((prev) => prev.slice(0, -1));
    setElements((prev) => [...prev, element]);

    if (socket) {
      socket.emit("elementRestored", { roomId: currentUser.roomId, element });
    }
  }, [currentUser, socket, myUndoStack]);

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

  const handleModeToggle = () => {
    if (!socket || !currentUser) return;
    const newMode = roomMode === "COLLABORATION" ? "PRESENTATION" : "COLLABORATION";
    socket.emit("roomModeChange", { roomId: currentUser.roomId, mode: newMode });
  };

  const handleLeaveWhiteboard = () => {
    if (socket) {
      socket.emit("leave-room");
      socket.disconnect();
    }
    navigate("/");
  };

  const handleAiAction = async (mode) => {
    const title = mode === "summarize" ? "Board Summary" : "Stack Analysis";
    setPanelMode(title);
    setAiOutput("Thinking... Contacting SyncBoard AI Assistant...");

    const textElements = elements
      .filter((el) => el.type === "text" && el.text && el.text.trim().length > 0)
      .map((el) => el.text);

    if (textElements.length === 0) {
      setAiOutput(
        "❌ No text found on the canvas to analyze!\n\nPlease use the 'Text' tool and double-click the board to write some text content before invoking AI Services."
      );
      return;
    }

    try {
      const response = await fetch("http://localhost:5000/api/ai/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          textElements,
          mode,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setAiOutput(formatAiResponse(data.result));
      } else {
        setAiOutput(`❌ Error: ${data.error || "Failed to parse AI assistance response."}`);
      }
    } catch (err) {
      console.error("AI service fetch error:", err);
      setAiOutput(
        "❌ Server Error: Could not connect to the backend AI API. Please verify that your backend server is running on http://localhost:5000 and that GEMINI_API_KEY is loaded."
      );
    }
  };

  const myElementCount = elements.filter((e) => e.userId === currentUser?.userId).length;
  const showToolbar = isHost || !isPresentation;

  const exportCanvas = () => {
    const canvas = canvasRef.current || document.querySelector("canvas");
    if (!canvas) return;

    const scratchCanvas = document.createElement("canvas");
    scratchCanvas.width = canvas.width;
    scratchCanvas.height = canvas.height;

    const scratchCtx = scratchCanvas.getContext("2d");
    if (!scratchCtx) return;

    scratchCtx.fillStyle = "#ffffff";
    scratchCtx.fillRect(0, 0, scratchCanvas.width, scratchCanvas.height);
    scratchCtx.drawImage(canvas, 0, 0);

    const dataURI = scratchCanvas.toDataURL("image/png");
    const anchor = document.createElement("a");
    anchor.href = dataURI;
    anchor.download = "whiteboard-export.png";
    anchor.click();
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#f8f9fa',
        backgroundImage: 'radial-gradient(#e9ecef 1px, transparent 1px)',
        backgroundSize: '16px 16px',
        margin: 0,
        padding: 0
      }}
    >
      <style>{`
        html, body {
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none !important;
        }
        .hide-scrollbar {
          -ms-overflow-style: none !important;
          scrollbar-width: none !important;
        }
        .small-scrollbar::-webkit-scrollbar {
          width: 5px !important;
          height: 5px !important;
        }
        .small-scrollbar::-webkit-scrollbar-track {
          background: #f1f3f5 !important;
          border-radius: 10px !important;
        }
        .small-scrollbar::-webkit-scrollbar-thumb {
          background: #ced4da !important;
          border-radius: 10px !important;
        }
        .small-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #adb5bd !important;
        }
      `}</style>

      <WhiteBoard
        canvasRef={canvasRef}
        ctxRef={ctxRef}
        elements={elements}
        setElements={setElements}
        color={color}
        tool={tool}
        socket={socket}
        user={currentUser}
        isPresentation={isPresentation}
        isHost={isHost}
        canvasClearVersion={canvasClearVersion}
      />

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '60px',
          background: '#ffffff',
          borderBottom: '1px solid #dee2e6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 20px',
          zIndex: 1001
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '20px',
              fontWeight: '800',
              background: 'linear-gradient(45deg, #1c7ed6, #7048e8)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontFamily: "'Inter', sans-serif"
            }}
          >
             SyncBoard
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: '600',
              color: '#868e96',
              backgroundColor: '#f1f3f5',
              padding: '4px 10px',
              borderRadius: '12px',
              marginLeft: '12px',
              fontFamily: "'Inter', sans-serif"
            }}
          >
            Room: {currentUser?.roomId ?? "—"}
          </span>
        </div>

        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 1002
          }}
        >
          {isHost ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#f1f3f5',
                borderRadius: '20px',
                padding: '3px',
                border: '1px solid #dee2e6'
              }}
            >
              <button
                type="button"
                onClick={() => {
                  if (roomMode !== "COLLABORATION") handleModeToggle();
                }}
                style={{
                  border: 'none',
                  background: roomMode === "COLLABORATION" ? '#ffffff' : 'transparent',
                  color: roomMode === "COLLABORATION" ? '#1c7ed6' : '#495057',
                  padding: '6px 14px',
                  borderRadius: '18px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: roomMode === "COLLABORATION" ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                }}
              >
                Collaboration
              </button>
              <button
                type="button"
                onClick={() => {
                  if (roomMode !== "PRESENTATION") handleModeToggle();
                }}
                style={{
                  border: 'none',
                  background: roomMode === "PRESENTATION" ? '#ffffff' : 'transparent',
                  color: roomMode === "PRESENTATION" ? '#fa5252' : '#495057',
                  padding: '6px 14px',
                  borderRadius: '18px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: roomMode === "PRESENTATION" ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                }}
              >
                Presentation
              </button>
            </div>
          ) : (
            <div
              style={{
                fontSize: '12px',
                fontWeight: '600',
                color: roomMode === "COLLABORATION" ? '#1c7ed6' : '#fa5252',
                backgroundColor: roomMode === "COLLABORATION" ? '#e7f5ff' : '#ffe3e3',
                padding: '6px 14px',
                borderRadius: '18px',
                border: `1px solid ${roomMode === "COLLABORATION" ? '#a5d8ff' : '#ffc9c9'}`,
                fontFamily: "'Inter', sans-serif"
              }}
            >
              {roomMode === "COLLABORATION" ? "Collab Mode" : "View Only"}
            </div>
          )}

          {isPresentation && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: '700',
                color: '#fa5252',
                backgroundColor: '#ffe3e3',
                padding: '4px 10px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontFamily: "'Inter', sans-serif"
              }}
            >
              <span>🎥</span> Presentation Active
            </span>
          )}
        </div>

        <div style={{ width: '150px' }} />
      </div>

      {showToolbar && (
        <div
          className="small-scrollbar"
          style={{
            position: 'absolute',
            left: '20px',
            top: '80px',
            width: '135px',
            maxHeight: 'calc(100vh - 110px)',
            overflowY: 'auto',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '10px',
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #dee2e6',
            boxShadow: '0 8px 24px rgba(0,0,0,0.05)'
          }}
        >
          <span style={{ fontSize: '9px', fontWeight: '700', color: '#adb5bd', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Tools</span>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {["pencil", "line", "rect", "circle", "arrow", "text"].map((t) => (
              <label
                key={t}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 6px',
                  borderRadius: '6px',
                  border: tool === t ? '1px solid #7048e8' : '1px solid transparent',
                  background: tool === t ? '#f1f0fe' : 'transparent',
                  color: tool === t ? '#7048e8' : '#495057',
                  cursor: 'pointer',
                  fontSize: '11.5px',
                  fontWeight: tool === t ? '600' : '500',
                  margin: 0,
                  userSelect: 'none',
                  transition: 'all 0.1s ease'
                }}
              >
                <input
                  type="radio"
                  name="tool-selection"
                  checked={tool === t}
                  onChange={() => setTool(t)}
                  style={{
                    accentColor: '#7048e8',
                    cursor: 'pointer',
                    margin: 0,
                    transform: 'scale(0.95)'
                  }}
                />
                <span>
                  {t === "pencil" && "Pencil"}
                  {t === "line" && "Line"}
                  {t === "rect" && "Rectangle"}
                  {t === "circle" && "Circle"}
                  {t === "arrow" && "Arrow"}
                  {t === "text" && "Text"}
                </span>
              </label>
            ))}
          </div>

          <div style={{ width: '100%', height: '1px', backgroundColor: '#e9ecef', margin: '1px 0' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', fontWeight: '700', color: '#adb5bd', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Color</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{
                width: '28px',
                height: '28px',
                border: '1px solid #dee2e6',
                borderRadius: '50%',
                padding: 0,
                cursor: 'pointer',
                outline: 'none',
                background: 'transparent'
              }}
              title="Stroke Color"
            />
          </div>

          <div style={{ width: '100%', height: '1px', backgroundColor: '#e9ecef', margin: '1px 0' }} />

          <span style={{ fontSize: '9px', fontWeight: '700', color: '#adb5bd', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Actions</span>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <button
              type="button"
              disabled={myElementCount === 0}
              onClick={handleUndo}
              style={{
                padding: '5px 6px',
                borderRadius: '6px',
                border: '1px solid #dee2e6',
                background: myElementCount === 0 ? '#f8f9fa' : '#ffffff',
                color: myElementCount === 0 ? '#adb5bd' : '#495057',
                cursor: myElementCount === 0 ? 'not-allowed' : 'pointer',
                fontSize: '11px',
                fontWeight: '600',
                textAlign: 'center',
                transition: 'all 0.1s ease'
              }}
            >
              Undo
            </button>

            <button
              type="button"
              disabled={myUndoStack.length === 0}
              onClick={handleRedo}
              style={{
                padding: '5px 6px',
                borderRadius: '6px',
                border: '1px solid #dee2e6',
                background: myUndoStack.length === 0 ? '#f8f9fa' : '#ffffff',
                color: myUndoStack.length === 0 ? '#adb5bd' : '#495057',
                cursor: myUndoStack.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: '11px',
                fontWeight: '600',
                textAlign: 'center',
                transition: 'all 0.1s ease'
              }}
            >
              Redo
            </button>

            <button
              type="button"
              onClick={handleClearCanvas}
              style={{
                padding: '5px 6px',
                borderRadius: '6px',
                border: '1px solid #ffe3e3',
                background: '#fff5f5',
                color: '#e03131',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: '600',
                textAlign: 'center',
                transition: 'all 0.1s ease'
              }}
            >
              Clear
            </button>

            <button
              type="button"
              onClick={exportCanvas}
              style={{
                padding: '5px 6px',
                borderRadius: '6px',
                border: '1px solid #dee2e6',
                background: '#ffffff',
                color: '#2b8a3e',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: '600',
                textAlign: 'center',
                transition: 'all 0.1s ease'
              }}
            >
              Export
            </button>

            <button
              type="button"
              onClick={handleLeaveWhiteboard}
              style={{
                padding: '5px 6px',
                borderRadius: '6px',
                border: '1px solid #ffe3e3',
                background: '#fff5f5',
                color: '#e03131',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: '600',
                textAlign: 'center',
                transition: 'all 0.1s ease'
              }}
            >
              Leave Board
            </button>
          </div>

          <div style={{ width: '100%', height: '1px', backgroundColor: '#e9ecef', margin: '1px 0' }} />

          <span style={{ fontSize: '9px', fontWeight: '700', color: '#adb5bd', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>AI Services</span>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <button
              type="button"
              onClick={() => handleAiAction("summarize")}
              style={{
                padding: '5px 6px',
                borderRadius: '6px',
                border: '1px solid #dee2e6',
                background: '#ffffff',
                color: '#495057',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: '600',
                textAlign: 'center',
                transition: 'all 0.1s ease'
              }}
            >
              Summary
            </button>

            <button
              type="button"
              onClick={() => handleAiAction("analyze")}
              style={{
                padding: '5px 6px',
                borderRadius: '6px',
                border: '1px solid #dee2e6',
                background: '#ffffff',
                color: '#495057',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: '600',
                textAlign: 'center',
                transition: 'all 0.1s ease'
              }}
            >
              Analyze
            </button>
          </div>
        </div>
      )}

      {/* Roster sidebar panel display */}
      <div
        className="small-scrollbar"
        style={{
          position: 'absolute',
          right: '20px',
          top: '80px',
          width: '220px',
          maxHeight: '260px',
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #dee2e6',
          boxShadow: '0 8px 24px rgba(0,0,0,0.05)',
          padding: '12px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto'
        }}
      >
        <span
          style={{
            fontSize: '9px',
            fontWeight: '700',
            color: '#adb5bd',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px',
            display: 'block'
          }}
        >
          🟢 Online Users ({activeUsers.length})
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {activeUsers.map((username, index) => (
            <div
              key={index}
              style={{
                fontSize: '12px',
                fontWeight: '500',
                color: '#495057',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
              title={username}
            >
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#40c057',
                  flexShrink: 0
                }}
              />
              <span>
                {username} {username === currentUser.name && "(You)"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {aiOutput && (
        <div
          style={{
            position: 'absolute',
            right: '260px', // Adjusted position from '120px' to prevent collision with roster panel
            top: '80px',
            bottom: '40px',
            width: '340px',
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #dee2e6',
            boxShadow: '0 8px 24px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 1000
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 15px',
              borderBottom: '1px solid #dee2e6',
              background: '#f8f9fa',
              flexShrink: 0
            }}
          >
            <span
              style={{
                fontWeight: '700',
                fontSize: '12px',
                color: '#495057',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontFamily: "'Inter', sans-serif"
              }}
            >
              {panelMode || "AI Assist"}
            </span>
            <button
              type="button"
              onClick={() => {
                if (typeof setAiOutput === 'function') {
                  setAiOutput("");
                }
              }}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#fa5252',
                fontWeight: '600'
              }}
            >
              ❌ Close
            </button>
          </div>

          <div
            className="small-scrollbar"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '18px',
              fontSize: '14.5px',
              lineHeight: '1.65',
              color: '#212529',
              whiteSpace: 'pre-wrap',
              fontFamily: "'Inter', 'Segoe UI', sans-serif"
            }}
          >
            {aiOutput}
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomPage;