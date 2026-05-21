// frontend/src/components/Whiteboard/index.jsx
import { useEffect, useState, useLayoutEffect, useRef } from "react";
import rough from "roughjs";
import "./index.css";

const roughGenerator = rough.generator();

// ── Utility: generate a simple unique ID ─────────────────────────────────────
const genId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ── Draw a single arrowhead at (x2,y2) pointing from (x1,y1) ────────────────
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
}) => {
  const [isDrawing, setIsDrawing] = useState(false);

  // Text tool state
  const [textInput, setTextInput] = useState(null); // { x, y, editingId? }
  const textAreaRef = useRef(null);

  // Element locks: { elementId: { userId, userName } }
  const [locks, setLocks] = useState({});

  // ── Canvas setup ────────────────────────────────────────────────────────────
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

  // ── Socket listeners ────────────────────────────────────────────────────────
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

    return () => {
      socket.off("element-lock");
      socket.off("element-unlock");
    };
  }, [socket]);

  // Auto-focus textarea when it appears
  useEffect(() => {
    if (textInput && textAreaRef.current) {
      textAreaRef.current.focus();
    }
  }, [textInput]);

  // ── Render canvas ───────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!ctx) return;
    const roughCanvas = rough.canvas(canvas);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    elements.forEach((element) => {
      const isLocked = locks[element.id] && locks[element.id].userId !== user?.userId;

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
            stroke: element.stroke,
            strokeWidth: 5,
            roughness: 0,
          })
        );
      } else if (element.type === "arrow") {
        // Draw the shaft as a rough line
        roughCanvas.draw(
          roughGenerator.line(element.offsetX, element.offsetY, element.x2, element.y2, {
            stroke: element.stroke,
            strokeWidth: 3,
            roughness: 0,
          })
        );
        // Draw the arrowhead manually
        drawArrowhead(ctx, element.offsetX, element.offsetY, element.x2, element.y2, element.stroke);
      } else if (element.type === "text") {
        // Only render committed text here (the live textarea handles the in-progress edit)
        if (!textInput || textInput.editingId !== element.id) {
          ctx.save();
          ctx.font = "18px sans-serif";
          ctx.fillStyle = isLocked ? "#888" : element.stroke;
          const lines = element.text.split("\n");
          lines.forEach((line, i) => {
            ctx.fillText(line, element.offsetX, element.offsetY + i * 22);
          });
          // Lock badge
          if (isLocked) {
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

  // ── Broadcast helper ─────────────────────────────────────────────────────────
  const broadcastElements = (updatedElements) => {
    if (socket && user) {
      socket.emit("elementUpdated", { roomId: user.roomId, elements: updatedElements });
    }
  };

  // ── Mouse handlers ───────────────────────────────────────────────────────────
  const handleMouseDown = (e) => {
    if (isPresentation) return;
    if (tool === "text") return; // text tool handled via onClick
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
    if (!isDrawing || isPresentation) return;
    const { offsetX, offsetY } = e.nativeEvent;

    if (tool === "pencil") {
      setElements(prev => prev.map((el, i) =>
        i === prev.length - 1
          ? { ...el, path: [...el.path, [offsetX, offsetY]] }
          : el
      ));
    } else if (tool === "line") {
      setElements(prev => prev.map((el, i) =>
        i === prev.length - 1
          ? { ...el, width: offsetX, height: offsetY }
          : el
      ));
    } else if (tool === "rect") {
      setElements(prev => prev.map((el, i) =>
        i === prev.length - 1
          ? { ...el, width: offsetX - el.offsetX, height: offsetY - el.offsetY }
          : el
      ));
    } else if (tool === "arrow") {
      setElements(prev => prev.map((el, i) =>
        i === prev.length - 1
          ? { ...el, x2: offsetX, y2: offsetY }
          : el
      ));
    }
  };

  const handleMouseUp = (e) => {
    setIsDrawing(false);
    if (isPresentation) return;
    // Broadcast the final state on mouse up (not on every move)
    setElements(prev => {
      broadcastElements(prev);
      return prev;
    });
  };

  // ── Text tool: click to place new textarea ────────────────────────────────
  const handleCanvasClick = (e) => {
    if (isPresentation || tool !== "text") return;
    const { offsetX, offsetY } = e.nativeEvent;
    // Don't open a new one if we just double-clicked (let dblclick handler run first)
    setTextInput({ x: offsetX, y: offsetY, value: "", editingId: null });
  };

  // ── Text tool: double-click to re-edit existing text element ─────────────
  const handleCanvasDoubleClick = (e) => {
    if (isPresentation) return;
    const { offsetX, offsetY } = e.nativeEvent;
    // Find the closest text element
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
      // Check if locked by someone else
      if (locks[hit.id] && locks[hit.id].userId !== user?.userId) return;
      // Emit lock
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

  // ── Text tool: commit text on blur ────────────────────────────────────────
  const handleTextBlur = () => {
    if (!textInput) return;
    const text = textAreaRef.current?.value || "";

    if (text.trim()) {
      if (textInput.editingId) {
        // Update existing element
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
        // Unlock
        if (socket && user) {
          socket.emit("element-unlock", { roomId: user.roomId, elementId: textInput.editingId });
        }
      } else {
        // New text element
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
      // Blur with empty text — just unlock
      if (socket && user) {
        socket.emit("element-unlock", { roomId: user.roomId, elementId: textInput.editingId });
      }
    }

    setTextInput(null);
  };

  // ── Get canvas bounding rect for textarea absolute positioning ────────────
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
      style={{ cursor: isPresentation ? "default" : tool === "text" ? "text" : "crosshair" }}
    >
      <canvas ref={canvasRef} />

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
    </div>
  );
};

export default WhiteBoard;