// frontend/src/components/Whiteboard/index.jsx
import { useEffect, useState, useLayoutEffect, useRef, useCallback } from "react";
import rough from "roughjs";
import "./index.css";

const roughGenerator = rough.generator();

const genId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const drawArrowhead = (ctx, x1, y1, x2, y2, color) => {
  const headLen = 18;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const WhiteBoard = ({
  canvasRef,
  ctxRef,
  elements,
  setElements,
  tool,
  color,
  socket,
  user,
  isPresentation,
  isHost,
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [textInput, setTextInput] = useState(null);
  const textAreaRef = useRef(null);
  const [locks, setLocks] = useState({});
  const [lockRejection, setLockRejection] = useState(null);

  // Throttle ref for live-drag broadcasts
  const lastBroadcastRef = useRef(0);
  const THROTTLE_MS = 16;

  // ── Canvas setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.height = window.innerHeight * 2;
    canvas.width = window.innerWidth * 2;
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctxRef.current = ctx;
  }, []);

  useEffect(() => {
    if (ctxRef.current) ctxRef.current.strokeStyle = color;
  }, [color]);

  // ── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    socket.on("element-lock", ({ elementId, userId, userName }) => {
      setLocks(prev => ({ ...prev, [elementId]: { userId, userName } }));
    });

    socket.on("element-unlock", ({ elementId }) => {
      setLocks(prev => {
        const next = { ...prev };
        delete next[elementId];
        return next;
      });
    });

    socket.on("element-lock-rejected", ({ elementId, lockedBy }) => {
      setLockRejection({ elementId, lockedBy });
      setTimeout(() => setLockRejection(null), 2500);
    });

    return () => {
      socket.off("element-lock");
      socket.off("element-unlock");
      socket.off("element-lock-rejected");
    };
  }, [socket]);

  useEffect(() => {
    if (textInput && textAreaRef.current) {
      textAreaRef.current.focus();
    }
  }, [textInput]);

  // ── Render canvas ─────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!ctx) return;
    const roughCanvas = rough.canvas(canvas);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    elements.forEach((element) => {
      const isLockedByOther = locks[element.id] && locks[element.id].userId !== user?.userId;

      if (element.type === "pencil") {
        roughCanvas.linearPath(element.path, {
          stroke: element.stroke,
          strokeWidth: 5,
          roughness: 0,
        });
      } else if (element.type === "line") {
        roughCanvas.draw(
          roughGenerator.line(element.offsetX, element.offsetY, element.width, element.height, {
            stroke: element.stroke,
            strokeWidth: 5,
            roughness: 0,
          })
        );
      } else if (element.type === "rect") {
        roughCanvas.draw(
          roughGenerator.rectangle(element.offsetX, element.offsetY, element.width, element.height, {
            stroke: isLockedByOther ? "#e74c3c" : element.stroke,
            strokeWidth: isLockedByOther ? 3 : 5,
            roughness: 0,
          })
        );
      } else if (element.type === "arrow") {
        roughCanvas.draw(
          roughGenerator.line(element.offsetX, element.offsetY, element.x2, element.y2, {
            stroke: element.stroke,
            strokeWidth: 3,
            roughness: 0,
          })
        );
        drawArrowhead(ctx, element.offsetX, element.offsetY, element.x2, element.y2, element.stroke);
      } else if (element.type === "text") {
        if (!textInput || textInput.editingId !== element.id) {
          ctx.save();
          ctx.font = "18px sans-serif";
          ctx.fillStyle = isLockedByOther ? "#888" : element.stroke;
          const lines = element.text.split("\n");
          lines.forEach((line, i) => {
            ctx.fillText(line, element.offsetX, element.offsetY + i * 22);
          });
          if (isLockedByOther) {
            ctx.font = "12px sans-serif";
            ctx.fillStyle = "#e74c3c";
            ctx.fillText(
              `🔒 Locked by ${locks[element.id].userName}`,
              element.offsetX,
              element.offsetY - 6
            );
          }
          ctx.restore();
        }
      }
    });
  }, [elements, locks, textInput]);

  // ── Broadcast helpers ─────────────────────────────────────────────────────
  const broadcastElements = useCallback((updatedElements) => {
    if (socket && user) {
      socket.emit("elementUpdated", { roomId: user.roomId, elements: updatedElements });
    }
  }, [socket, user]);

  const broadcastLive = useCallback((updatedElements) => {
    const now = Date.now();
    if (now - lastBroadcastRef.current < THROTTLE_MS) return;
    lastBroadcastRef.current = now;
    if (socket && user) {
      socket.emit("elementUpdated", { roomId: user.roomId, elements: updatedElements });
    }
  }, [socket, user]);

  // Only attendees are blocked during presentation mode; host can always draw
  const isBlocked = isPresentation && !isHost;

  // ── Mouse handlers ────────────────────────────────────────────────────────
  const handleMouseDown = (e) => {
    if (isBlocked) return;
    if (tool === "text") return;
    const { offsetX, offsetY } = e.nativeEvent;

    if (tool === "pencil") {
      setElements(prev => [...prev, {
        id: genId(), userId: user?.userId,
        type: "pencil", offsetX, offsetY,
        path: [[offsetX, offsetY]], stroke: color,
      }]);
    } else if (tool === "line") {
      setElements(prev => [...prev, {
        id: genId(), userId: user?.userId,
        type: "line", offsetX, offsetY,
        width: offsetX, height: offsetY, stroke: color,
      }]);
    } else if (tool === "rect") {
      setElements(prev => [...prev, {
        id: genId(), userId: user?.userId,
        type: "rect", offsetX, offsetY,
        width: 0, height: 0, stroke: color,
      }]);
    } else if (tool === "arrow") {
      setElements(prev => [...prev, {
        id: genId(), userId: user?.userId,
        type: "arrow", offsetX, offsetY,
        x2: offsetX, y2: offsetY, stroke: color,
      }]);
    }

    setIsDrawing(true);
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || isBlocked) return;
    const { offsetX, offsetY } = e.nativeEvent;
    let updatedElements = null;

    if (tool === "pencil") {
      setElements(prev => {
        const next = prev.map((el, i) =>
          i === prev.length - 1
            ? { ...el, path: [...el.path, [offsetX, offsetY]] }
            : el
        );
        updatedElements = next;
        return next;
      });
    } else if (tool === "line") {
      setElements(prev => {
        const next = prev.map((el, i) =>
          i === prev.length - 1
            ? { ...el, width: offsetX, height: offsetY }
            : el
        );
        updatedElements = next;
        return next;
      });
    } else if (tool === "rect") {
      setElements(prev => {
        const next = prev.map((el, i) =>
          i === prev.length - 1
            ? { ...el, width: offsetX - el.offsetX, height: offsetY - el.offsetY }
            : el
        );
        updatedElements = next;
        return next;
      });
    } else if (tool === "arrow") {
      setElements(prev => {
        const next = prev.map((el, i) =>
          i === prev.length - 1
            ? { ...el, x2: offsetX, y2: offsetY }
            : el
        );
        updatedElements = next;
        return next;
      });
    }

    // Throttled live broadcast so other users see the shape stretching in real-time
    if (updatedElements) {
      broadcastLive(updatedElements);
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    if (isBlocked) return;
    // Final authoritative broadcast, no throttle
    setElements(prev => {
      broadcastElements(prev);
      return prev;
    });
  };

  // ── Text tool handlers ────────────────────────────────────────────────────
  const handleCanvasClick = (e) => {
    if (isBlocked || tool !== "text") return;
    const { offsetX, offsetY } = e.nativeEvent;
    setTextInput({ x: offsetX, y: offsetY, value: "", editingId: null });
  };

  const handleCanvasDoubleClick = (e) => {
    if (isBlocked) return;
    const { offsetX, offsetY } = e.nativeEvent;
    const hit = elements.find(el => {
      if (el.type !== "text") return false;
      return (
        offsetX >= el.offsetX &&
        offsetX <= el.offsetX + 200 &&
        offsetY >= el.offsetY - 22 &&
        offsetY <= el.offsetY + (el.text.split("\n").length) * 22
      );
    });
    if (hit) {
      if (locks[hit.id] && locks[hit.id].userId !== user?.userId) {
        setLockRejection({ elementId: hit.id, lockedBy: locks[hit.id].userName });
        setTimeout(() => setLockRejection(null), 2500);
        return;
      }
      if (socket && user) {
        socket.emit("element-lock", {
          roomId: user.roomId,
          elementId: hit.id,
          userId: user.userId,
          userName: user.name,
        });
      }
      setTextInput({ x: hit.offsetX, y: hit.offsetY, value: hit.text, editingId: hit.id });
    }
  };

  const handleTextBlur = () => {
    if (!textInput) return;
    const text = textAreaRef.current?.value || "";

    if (text.trim()) {
      if (textInput.editingId) {
        setElements(prev => {
          const updated = prev.map(el =>
            el.id === textInput.editingId ? { ...el, text } : el
          );
          if (socket && user) {
            const element = updated.find(el => el.id === textInput.editingId);
            socket.emit("textSaved", { roomId: user.roomId, element });
          }
          return updated;
        });
        if (socket && user) {
          socket.emit("element-unlock", { roomId: user.roomId, elementId: textInput.editingId });
        }
      } else {
        const newEl = {
          id: genId(),
          userId: user?.userId,
          type: "text",
          offsetX: textInput.x,
          offsetY: textInput.y,
          text,
          stroke: color,
        };
        setElements(prev => {
          const updated = [...prev, newEl];
          if (socket && user) {
            socket.emit("textSaved", { roomId: user.roomId, element: newEl });
          }
          return updated;
        });
      }
    } else if (textInput.editingId) {
      if (socket && user) {
        socket.emit("element-unlock", { roomId: user.roomId, elementId: textInput.editingId });
      }
    }

    setTextInput(null);
  };

  const canvasContainerRef = useRef(null);

  return (
    <div
      ref={canvasContainerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleCanvasClick}
      onDoubleClick={handleCanvasDoubleClick}
      className="border border-dark border-3 h-100 w-100 overflow-hidden position-relative"
      style={{
        cursor: isBlocked ? "not-allowed" : tool === "text" ? "text" : "crosshair",
      }}
    >
      <canvas ref={canvasRef} />

      {/* Lock rejection toast */}
      {lockRejection && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#e74c3c",
            color: "#fff",
            padding: "6px 14px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            zIndex: 30,
            pointerEvents: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          🔒 Locked by {lockRejection.lockedBy}
        </div>
      )}

      {/* Floating textarea for text tool */}
      {textInput && (
        <textarea
          ref={textAreaRef}
          defaultValue={textInput.value}
          onBlur={handleTextBlur}
          style={{
            position: "absolute",
            left: textInput.x,
            top: textInput.y - 4,
            minWidth: 160,
            minHeight: 40,
            background: "rgba(255,255,220,0.95)",
            border: "2px dashed #7c3aed",
            borderRadius: 4,
            padding: "4px 6px",
            fontSize: 18,
            fontFamily: "sans-serif",
            color: color,
            resize: "both",
            zIndex: 10,
            outline: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        />
      )}

      {/* View-only notice for attendees in presentation mode */}
      {isPresentation && !isHost && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
            padding: "5px 14px",
            borderRadius: 20,
            fontSize: 12,
            pointerEvents: "none",
            zIndex: 20,
          }}
        >
          🎥 View only — presentation in progress
        </div>
      )}
    </div>
  );
};

export default WhiteBoard;