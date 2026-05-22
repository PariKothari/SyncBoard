// frontend/src/components/Whiteboard/index.jsx
import { useEffect, useState, useLayoutEffect, useRef, useCallback } from "react";
import rough from "roughjs";
import "./index.css";

const roughGenerator = rough.generator();

const genId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const DOT_GRID_COLOR = "#e5e7eb";
const DOT_GRID_SPACING = 24;
const EMIT_THROTTLE_MS = 24;
const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 1600;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.08;
const PAN_PADDING = 80;

const TEXT_FONT_FAMILY = "'Inter', 'Segoe UI', sans-serif";
const DEFAULT_FONT_SIZE = 20;

const RESIZABLE_TYPES = new Set(["rect", "line", "circle", "arrow", "pencil"]);
const HANDLE_SIZE = 6;
const HANDLE_HIT = 10;

const getCanvasFont = (size) => `${size}px Inter, sans-serif`;
const getTextLineHeight = (size) => Math.round(size * 1.35);

/** worldX = (clientX - rect.left - pan.x) / zoom — same basis as spec when origin-aligned */
const pointerToWorld = (clientX, clientY, containerEl, panX, panY, zoom) => {
  const rect = containerEl.getBoundingClientRect();
  const screenX = clientX - rect.left;
  const screenY = clientY - rect.top;
  return {
    x: (clientX - rect.left - panX) / zoom,
    y: (clientY - rect.top - panY) / zoom,
    screenX,
    screenY,
  };
};

const worldToScreen = (worldX, worldY, pan, zoom) => ({
  x: worldX * zoom + pan.x,
  y: worldY * zoom + pan.y,
});

const drawDotGrid = (ctx, pan, zoom, canvasWidth, canvasHeight) => {
  const left = Math.floor((-pan.x / zoom) / DOT_GRID_SPACING) * DOT_GRID_SPACING;
  const top = Math.floor((-pan.y / zoom) / DOT_GRID_SPACING) * DOT_GRID_SPACING;
  const right = (-pan.x + canvasWidth) / zoom;
  const bottom = (-pan.y + canvasHeight) / zoom;

  ctx.fillStyle = DOT_GRID_COLOR;
  for (let x = left; x <= right; x += DOT_GRID_SPACING) {
    for (let y = top; y <= bottom; y += DOT_GRID_SPACING) {
      ctx.beginPath();
      ctx.arc(x, y, 1 / zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

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

const getTextBounds = (element, ctx) => {
  const size = element.fontSize ?? DEFAULT_FONT_SIZE;
  const lineHeight = getTextLineHeight(size);
  const lines = element.text.split("\n");
  let maxW = 120;
  if (ctx) {
    ctx.font = getCanvasFont(size);
    maxW = Math.max(...lines.map((line) => ctx.measureText(line).width), 40);
  } else {
    maxW = Math.max(...lines.map((line) => line.length * size * 0.55), 40);
  }
  return {
    x: element.offsetX,
    y: element.offsetY - size * 0.85,
    w: maxW,
    h: lines.length * lineHeight + size * 0.35,
  };
};

const getElementBounds = (element, ctx) => {
  if (element.type === "rect") {
    const x1 = element.offsetX;
    const y1 = element.offsetY;
    const x2 = element.offsetX + element.width;
    const y2 = element.offsetY + element.height;
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
    };
  }
  if (element.type === "line") {
    return {
      x: Math.min(element.offsetX, element.width),
      y: Math.min(element.offsetY, element.height),
      w: Math.abs(element.width - element.offsetX),
      h: Math.abs(element.height - element.offsetY),
    };
  }
  if (element.type === "arrow" || element.type === "circle") {
    return {
      x: Math.min(element.offsetX, element.x2),
      y: Math.min(element.offsetY, element.y2),
      w: Math.abs(element.x2 - element.offsetX),
      h: Math.abs(element.y2 - element.offsetY),
    };
  }
  if (element.type === "pencil" && element.path?.length) {
    const xs = element.path.map((p) => p[0]);
    const ys = element.path.map((p) => p[1]);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  }
  if (element.type === "text") {
    return getTextBounds(element, ctx);
  }
  return { x: 0, y: 0, w: 0, h: 0 };
};

const getCornerHandles = (bounds) => [
  { id: "nw", x: bounds.x, y: bounds.y },
  { id: "ne", x: bounds.x + bounds.w, y: bounds.y },
  { id: "sw", x: bounds.x, y: bounds.y + bounds.h },
  { id: "se", x: bounds.x + bounds.w, y: bounds.y + bounds.h },
];

const hitTestHandle = (worldX, worldY, bounds, zoom) => {
  const hitRadius = HANDLE_HIT / zoom;
  for (const handle of getCornerHandles(bounds)) {
    if (Math.abs(worldX - handle.x) <= hitRadius && Math.abs(worldY - handle.y) <= hitRadius) {
      return handle.id;
    }
  }
  return null;
};

const hitTestElement = (worldX, worldY, element, ctx, zoom) => {
  const bounds = getElementBounds(element, ctx);
  const pad = 8 / zoom;
  return (
    worldX >= bounds.x - pad &&
    worldX <= bounds.x + bounds.w + pad &&
    worldY >= bounds.y - pad &&
    worldY <= bounds.y + bounds.h + pad
  );
};

const applyDrag = (element, dx, dy) => {
  if (element.type === "rect") {
    return { ...element, offsetX: element.offsetX + dx, offsetY: element.offsetY + dy };
  }
  if (element.type === "line") {
    return {
      ...element,
      offsetX: element.offsetX + dx,
      offsetY: element.offsetY + dy,
      width: element.width + dx,
      height: element.height + dy,
    };
  }
  if (element.type === "arrow" || element.type === "circle") {
    return {
      ...element,
      offsetX: element.offsetX + dx,
      offsetY: element.offsetY + dy,
      x2: element.x2 + dx,
      y2: element.y2 + dy,
    };
  }
  if (element.type === "text") {
    return { ...element, offsetX: element.offsetX + dx, offsetY: element.offsetY + dy };
  }
  if (element.type === "pencil") {
    return {
      ...element,
      offsetX: element.offsetX + dx,
      offsetY: element.offsetY + dy,
      path: element.path.map(([px, py]) => [px + dx, py + dy]),
    };
  }
  return element;
};

const applyResize = (element, handle, worldX, worldY) => {
  const bounds = getElementBounds(element);

  if (element.type === "rect") {
    const right = bounds.x + bounds.w;
    const bottom = bounds.y + bounds.h;
    if (handle === "nw") {
      return { ...element, offsetX: worldX, offsetY: worldY, width: right - worldX, height: bottom - worldY };
    }
    if (handle === "ne") {
      return { ...element, offsetY: worldY, width: worldX - bounds.x, height: bottom - worldY };
    }
    if (handle === "sw") {
      return { ...element, offsetX: worldX, width: right - worldX, height: worldY - bounds.y };
    }
    if (handle === "se") {
      return { ...element, width: worldX - bounds.x, height: worldY - bounds.y };
    }
  }

  if (element.type === "line") {
    if (handle === "nw") return { ...element, offsetX: worldX, offsetY: worldY };
    if (handle === "se") return { ...element, width: worldX, height: worldY };
    if (handle === "ne") return { ...element, offsetY: worldY, width: worldX };
    if (handle === "sw") return { ...element, offsetX: worldX, height: worldY };
  }

  if (element.type === "arrow" || element.type === "circle") {
    if (handle === "nw") return { ...element, offsetX: worldX, offsetY: worldY };
    if (handle === "se") return { ...element, x2: worldX, y2: worldY };
    if (handle === "ne") return { ...element, offsetY: worldY, x2: worldX };
    if (handle === "sw") return { ...element, offsetX: worldX, y2: worldY };
  }

  return element;
};

const drawSelectionUI = (ctx, element, zoom) => {
  const bounds = getElementBounds(element, ctx);
  ctx.save();
  ctx.strokeStyle = "#7c3aed";
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([5 / zoom, 4 / zoom]);
  ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.setLineDash([]);

  if (RESIZABLE_TYPES.has(element.type)) {
    getCornerHandles(bounds).forEach((handle) => {
      const half = HANDLE_SIZE / zoom;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#7c3aed";
      ctx.lineWidth = 1.5 / zoom;
      ctx.fillRect(handle.x - half, handle.y - half, half * 2, half * 2);
      ctx.strokeRect(handle.x - half, handle.y - half, half * 2, half * 2);
    });
  }
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
  canvasClearVersion = 0,
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [textInput, setTextInput] = useState(null);
  const [viewport, setViewport] = useState({ panX: 0, panY: 0, zoom: 1 });
  const textAreaRef = useRef(null);
  const transformRef = useRef(null);
  const panRef = useRef(null);
  const spaceHeldRef = useRef(false);
  const canvasContainerRef = useRef(null);
  const [locks, setLocks] = useState({});
  const [lockRejection, setLockRejection] = useState(null);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const lastEmitTime = useRef(0);

  const { panX, panY, zoom } = viewport;
  const isBlocked = isPresentation && !isHost;

  const isLockedByOther = useCallback(
    (elementId) => locks[elementId] && locks[elementId].userId !== user?.userId,
    [locks, user]
  );

  const emitThrottled = useCallback(
    (updatedElements) => {
      if (!socket || !user) return;
      const now = performance.now();
      if (now - lastEmitTime.current >= EMIT_THROTTLE_MS) {
        lastEmitTime.current = now;
        socket.emit("elementUpdated", { roomId: user.roomId, elements: updatedElements });
      }
    },
    [socket, user]
  );

  const broadcastElements = useCallback(
    (updatedElements) => {
      if (socket && user) {
        socket.emit("elementUpdated", { roomId: user.roomId, elements: updatedElements });
      }
    },
    [socket, user]
  );

  const clearSelection = useCallback(() => {
    setSelectedElementId(null);
    setTextInput(null);
    setIsTransforming(false);
    transformRef.current = null;
  }, []);

  const getWorldPoint = useCallback(
    (e) => {
      const container = canvasContainerRef.current;
      if (!container) return { x: 0, y: 0, screenX: 0, screenY: 0 };
      return pointerToWorld(e.clientX, e.clientY, container, panX, panY, zoom);
    },
    [panX, panY, zoom]
  );

  const clampPan = useCallback((panX, panY, zoomLevel) => {
    const canvas = canvasRef.current;
    if (!canvas) return { panX, panY };
    const maxPanX = PAN_PADDING;
    const minPanX = canvas.width - WORLD_WIDTH * zoomLevel - PAN_PADDING;
    const maxPanY = PAN_PADDING;
    const minPanY = canvas.height - WORLD_HEIGHT * zoomLevel - PAN_PADDING;
    return {
      panX: Math.min(maxPanX, Math.max(minPanX, panX)),
      panY: Math.min(maxPanY, Math.max(minPanY, panY)),
    };
  }, [canvasRef]);

  const syncCanvasSize = useCallback(() => {
    const container = canvasContainerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctxRef.current = ctx;
  }, [canvasRef, ctxRef, color]);

  useEffect(() => {
    syncCanvasSize();
    const container = canvasContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => syncCanvasSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [syncCanvasSize]);

  useEffect(() => {
    if (ctxRef.current) ctxRef.current.strokeStyle = color;
  }, [color, ctxRef]);

  useEffect(() => {
    if (!socket) return;

    socket.on("element-lock", ({ elementId, userId, userName }) => {
      setLocks((prev) => ({ ...prev, [elementId]: { userId, userName } }));
    });

    socket.on("element-unlock", ({ elementId }) => {
      setLocks((prev) => {
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

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === "Space") spaceHeldRef.current = true;
    };
    const onKeyUp = (e) => {
      if (e.code === "Space") spaceHeldRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const applyTextFontSizeDelta = useCallback(
    (delta) => {
      if (!selectedElementId) return;
      const selected = elements.find((el) => el.id === selectedElementId);
      if (!selected || selected.type !== "text" || isLockedByOther(selected.id)) return;

      const nextSize = Math.max(8, (selected.fontSize ?? DEFAULT_FONT_SIZE) + delta);
      setFontSize(nextSize);
      setElements((prev) => {
        const next = prev.map((el) =>
          el.id === selectedElementId ? { ...el, fontSize: nextSize } : el
        );
        emitThrottled(next);
        if (socket && user) {
          const updated = next.find((el) => el.id === selectedElementId);
          if (updated) {
            socket.emit("textSaved", { roomId: user.roomId, element: updated });
          }
        }
        return next;
      });
    },
    [selectedElementId, elements, isLockedByOther, emitThrottled, socket, user]
  );

  useEffect(() => {
    if (!selectedElementId) return;

    const handleWindowKeyDown = (e) => {
      const selected = elements.find((el) => el.id === selectedElementId);
      if (!selected || selected.type !== "text") return;
      if (isLockedByOther(selected.id)) return;
      if (textInput && document.activeElement === textAreaRef.current) return;

      if (e.key === "ArrowUp") {
        e.preventDefault();
        applyTextFontSizeDelta(2);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        applyTextFontSizeDelta(-2);
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [selectedElementId, textInput, elements, isLockedByOther, applyTextFontSizeDelta]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!ctx || !canvas) return;

    const roughCanvas = rough.canvas(canvas);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    drawDotGrid(ctx, { x: panX, y: panY }, zoom, canvas.width, canvas.height);

    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    elements.forEach((element) => {
      const lockedByOther = isLockedByOther(element.id);

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
            stroke: lockedByOther ? "#e74c3c" : element.stroke,
            strokeWidth: lockedByOther ? 3 : 5,
            roughness: 0,
          })
        );
      } else if (element.type === "circle") {
        const diameter =
          Math.sqrt(
            Math.pow(element.x2 - element.offsetX, 2) + Math.pow(element.y2 - element.offsetY, 2)
          ) * 2;
        roughCanvas.draw(
          roughGenerator.circle(element.offsetX, element.offsetY, diameter, {
            stroke: element.stroke,
            strokeWidth: 5,
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
          const size = element.fontSize ?? DEFAULT_FONT_SIZE;
          const lineHeight = getTextLineHeight(size);
          ctx.save();
          ctx.font = getCanvasFont(size);
          ctx.fillStyle = lockedByOther ? "#888" : element.stroke;
          element.text.split("\n").forEach((line, i) => {
            ctx.fillText(line, element.offsetX, element.offsetY + i * lineHeight);
          });
          if (lockedByOther) {
            ctx.font = `${12 / zoom}px sans-serif`;
            ctx.fillStyle = "#e74c3c";
            ctx.fillText(
              `🔒 Locked by ${locks[element.id].userName}`,
              element.offsetX,
              element.offsetY - 6 / zoom
            );
          }
          ctx.restore();
        }
      }
    });

    if (selectedElementId && !textInput) {
      const selected = elements.find((el) => el.id === selectedElementId);
      if (selected) {
        drawSelectionUI(ctx, selected, zoom);
      }
    }

    ctx.restore();
  }, [
    elements,
    locks,
    textInput,
    fontSize,
    selectedElementId,
    isLockedByOther,
    panX,
    panY,
    zoom,
    canvasRef,
    ctxRef,
    canvasClearVersion,
  ]);

  const findTopElementAt = useCallback(
    (worldX, worldY) => {
      const ctx = ctxRef.current;
      for (let i = elements.length - 1; i >= 0; i--) {
        if (hitTestElement(worldX, worldY, elements[i], ctx, zoom)) {
          return elements[i];
        }
      }
      return null;
    },
    [elements, ctxRef, zoom]
  );

  const beginTransform = (mode, element, handle, worldX, worldY) => {
    transformRef.current = {
      mode,
      elementId: element.id,
      handle,
      startX: worldX,
      startY: worldY,
      snapshot: JSON.parse(JSON.stringify(element)),
    };
    setIsTransforming(true);
  };

  const tryStartSelectionTransform = (worldX, worldY) => {
    if (!selectedElementId) return false;

    const selected = elements.find((el) => el.id === selectedElementId);
    if (!selected || isLockedByOther(selected.id)) return false;

    const ctx = ctxRef.current;
    const bounds = getElementBounds(selected, ctx);
    const handle =
      selected.type !== "text" && RESIZABLE_TYPES.has(selected.type)
        ? hitTestHandle(worldX, worldY, bounds, zoom)
        : null;

    if (handle) {
      beginTransform("resize", selected, handle, worldX, worldY);
      return true;
    }

    if (hitTestElement(worldX, worldY, selected, ctx, zoom)) {
      beginTransform("drag", selected, null, worldX, worldY);
      return true;
    }

    return false;
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const container = canvasContainerRef.current;
    if (!container) return;

    const isZoomGesture = e.ctrlKey || e.metaKey;

    if (isZoomGesture) {
      const { x: worldX, y: worldY, screenX, screenY } = pointerToWorld(
        e.clientX,
        e.clientY,
        container,
        panX,
        panY,
        zoom
      );
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
      const nextPanX = screenX - worldX * nextZoom;
      const nextPanY = screenY - worldY * nextZoom;
      const clamped = clampPan(nextPanX, nextPanY, nextZoom);
      setViewport({ panX: clamped.panX, panY: clamped.panY, zoom: nextZoom });
      return;
    }

    setViewport((v) => {
      const clamped = clampPan(v.panX - e.deltaX, v.panY - e.deltaY, v.zoom);
      return { ...v, panX: clamped.panX, panY: clamped.panY };
    });
  };

  const handleMouseDown = (e) => {
    if (isBlocked) return;

    const world = getWorldPoint(e);
    const isMiddleClick = e.button === 1;
    const isSpacePan = e.button === 0 && spaceHeldRef.current;

    if (isMiddleClick || isSpacePan) {
      panRef.current = {
        startPanX: panX,
        startPanY: panY,
        startClientX: e.clientX,
        startClientY: e.clientY,
      };
      setIsPanning(true);
      return;
    }

    if (e.button !== 0) return;

    if (tryStartSelectionTransform(world.x, world.y)) {
      return;
    }

    const hit = findTopElementAt(world.x, world.y);

    if (!hit) {
      if (textInput) {
        textAreaRef.current?.blur();
        return;
      }
      clearSelection();
    } else if (hit.type === "text" && !textInput) {
      if (isLockedByOther(hit.id)) {
        setLockRejection({ elementId: hit.id, lockedBy: locks[hit.id].userName });
        setTimeout(() => setLockRejection(null), 2500);
        return;
      }
      setSelectedElementId(hit.id);
      setFontSize(hit.fontSize ?? DEFAULT_FONT_SIZE);
      beginTransform("drag", hit, null, world.x, world.y);
      return;
    } else if (selectedElementId && hit.id !== selectedElementId) {
      setSelectedElementId(null);
    }

    if (tool === "text") return;

    if (tool === "pencil") {
      setElements((prev) => [
        ...prev,
        {
          id: genId(),
          userId: user?.userId,
          type: "pencil",
          offsetX: world.x,
          offsetY: world.y,
          path: [[world.x, world.y]],
          stroke: color,
        },
      ]);
    } else if (tool === "line") {
      setElements((prev) => [
        ...prev,
        {
          id: genId(),
          userId: user?.userId,
          type: "line",
          offsetX: world.x,
          offsetY: world.y,
          width: world.x,
          height: world.y,
          stroke: color,
        },
      ]);
    } else if (tool === "rect") {
      setElements((prev) => [
        ...prev,
        {
          id: genId(),
          userId: user?.userId,
          type: "rect",
          offsetX: world.x,
          offsetY: world.y,
          width: 0,
          height: 0,
          stroke: color,
        },
      ]);
    } else if (tool === "circle") {
      setElements((prev) => [
        ...prev,
        {
          id: genId(),
          userId: user?.userId,
          type: "circle",
          offsetX: world.x,
          offsetY: world.y,
          x2: world.x,
          y2: world.y,
          stroke: color,
        },
      ]);
    } else if (tool === "arrow") {
      setElements((prev) => [
        ...prev,
        {
          id: genId(),
          userId: user?.userId,
          type: "arrow",
          offsetX: world.x,
          offsetY: world.y,
          x2: world.x,
          y2: world.y,
          stroke: color,
        },
      ]);
    } else {
      return;
    }

    setIsDrawing(true);
  };

  const handleTransformMouseMove = (worldX, worldY) => {
    if (!transformRef.current) return;
    const { mode, elementId, handle, startX, startY, snapshot } = transformRef.current;

    let updated;
    if (mode === "drag") {
      updated = applyDrag(snapshot, worldX - startX, worldY - startY);
    } else {
      updated = applyResize(snapshot, handle, worldX, worldY);
    }

    setElements((prev) => {
      const next = prev.map((el) =>
        el.id === elementId ? { ...updated, id: elementId } : el
      );
      emitThrottled(next);
      return next;
    });
  };

  const handleMouseMove = (e) => {
    if (isPanning && panRef.current) {
      const dx = e.clientX - panRef.current.startClientX;
      const dy = e.clientY - panRef.current.startClientY;
      setViewport((v) => {
        const clamped = clampPan(
          panRef.current.startPanX + dx,
          panRef.current.startPanY + dy,
          v.zoom
        );
        return { ...v, panX: clamped.panX, panY: clamped.panY };
      });
      return;
    }

    const world = getWorldPoint(e);

    if (isTransforming) {
      handleTransformMouseMove(world.x, world.y);
      return;
    }

    if (!isDrawing || isBlocked) return;

    let updatedElements = null;

    if (tool === "pencil") {
      setElements((prev) => {
        const next = prev.map((el, i) =>
          i === prev.length - 1 ? { ...el, path: [...el.path, [world.x, world.y]] } : el
        );
        updatedElements = next;
        return next;
      });
    } else if (tool === "line") {
      setElements((prev) => {
        const next = prev.map((el, i) =>
          i === prev.length - 1 ? { ...el, width: world.x, height: world.y } : el
        );
        updatedElements = next;
        return next;
      });
    } else if (tool === "rect") {
      setElements((prev) => {
        const next = prev.map((el, i) =>
          i === prev.length - 1
            ? { ...el, width: world.x - el.offsetX, height: world.y - el.offsetY }
            : el
        );
        updatedElements = next;
        return next;
      });
    } else if (tool === "circle" || tool === "arrow") {
      setElements((prev) => {
        const next = prev.map((el, i) =>
          i === prev.length - 1 ? { ...el, x2: world.x, y2: world.y } : el
        );
        updatedElements = next;
        return next;
      });
    }

    if (updatedElements) {
      emitThrottled(updatedElements);
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      panRef.current = null;
      return;
    }

    if (isTransforming) {
      setIsTransforming(false);
      transformRef.current = null;
      if (!isBlocked) {
        setElements((prev) => {
          broadcastElements(prev);
          return prev;
        });
      }
      return;
    }

    setIsDrawing(false);
    if (isBlocked) return;
    setElements((prev) => {
      broadcastElements(prev);
      return prev;
    });
  };

  const handleCanvasClick = (e) => {
    if (isBlocked || tool !== "text") return;
    const world = getWorldPoint(e);
    setFontSize(DEFAULT_FONT_SIZE);
    setSelectedElementId(null);
    setTextInput({ x: world.x, y: world.y, value: "", editingId: null });
  };

  const handleCanvasDoubleClick = (e) => {
    if (isBlocked) return;
    const world = getWorldPoint(e);
    const hit = findTopElementAt(world.x, world.y);

    if (!hit) return;

    if (isLockedByOther(hit.id)) {
      setLockRejection({ elementId: hit.id, lockedBy: locks[hit.id].userName });
      setTimeout(() => setLockRejection(null), 2500);
      return;
    }

    setIsTransforming(false);
    transformRef.current = null;
    setSelectedElementId(hit.id);

    if (hit.type === "text") {
      if (socket && user) {
        socket.emit("element-lock", {
          roomId: user.roomId,
          elementId: hit.id,
          userId: user.userId,
          userName: user.name,
        });
      }
      setFontSize(hit.fontSize ?? DEFAULT_FONT_SIZE);
      setTextInput({ x: hit.offsetX, y: hit.offsetY, value: hit.text, editingId: hit.id });
    } else {
      setTextInput(null);
    }
  };

  const handleTextAreaKeyDown = (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (textInput?.editingId) {
        applyTextFontSizeDelta(2);
      } else {
        setFontSize((s) => s + 2);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (textInput?.editingId) {
        applyTextFontSizeDelta(-2);
      } else {
        setFontSize((s) => Math.max(8, s - 2));
      }
    }
  };

  const handleTextBlur = () => {
    if (!textInput) return;
    const text = textAreaRef.current?.value || "";

    if (text.trim()) {
      if (textInput.editingId) {
        setElements((prev) => {
          const updated = prev.map((el) =>
            el.id === textInput.editingId ? { ...el, text, fontSize } : el
          );
          if (socket && user) {
            const element = updated.find((el) => el.id === textInput.editingId);
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
          fontSize,
        };
        setElements((prev) => {
          const updated = [...prev, newEl];
          if (socket && user) {
            socket.emit("textSaved", { roomId: user.roomId, element: newEl });
          }
          return updated;
        });
        setSelectedElementId(newEl.id);
      }
    } else if (textInput.editingId) {
      if (socket && user) {
        socket.emit("element-unlock", { roomId: user.roomId, elementId: textInput.editingId });
      }
      setSelectedElementId(null);
    }

    setTextInput(null);
  };

  const getTextareaScreenPosition = () => {
    if (!textInput) return { left: 0, top: 0 };
    const screen = worldToScreen(textInput.x, textInput.y, { x: panX, y: panY }, zoom);
    return { left: screen.x, top: screen.y };
  };

  const textareaPos = getTextareaScreenPosition();

  const getCursor = () => {
    if (isBlocked) return "not-allowed";
    if (isPanning || spaceHeldRef.current) return "grab";
    if (tool === "text") return "text";
    if (selectedElementId && !isDrawing) return "move";
    return "crosshair";
  };

  return (
    <div
      ref={canvasContainerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onClick={handleCanvasClick}
      onDoubleClick={handleCanvasDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
      className="wb-viewport border border-dark border-3"
      style={{ cursor: getCursor() }}
    >
      <canvas ref={canvasRef} className="wb-canvas" />
      <div className="wb-zoom-hint">
        Trackpad: scroll to pan · Ctrl + scroll to zoom · Space + drag to pan
      </div>

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

      {textInput && (
        <textarea
          ref={textAreaRef}
          className="whiteboard-text-input"
          defaultValue={textInput.value}
          onBlur={handleTextBlur}
          onKeyDown={handleTextAreaKeyDown}
          style={{
            position: "absolute",
            left: textareaPos.left,
            top: textareaPos.top,
            minWidth: 160,
            minHeight: 40,
            padding: 0,
            margin: 0,
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            fontSize: `${fontSize}px`,
            fontFamily: TEXT_FONT_FAMILY,
            lineHeight: 1.35,
            color: color,
            zIndex: 10,
            overflow: "hidden",
            boxShadow: "none",
          }}
        />
      )}

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
