// backend/server.js
const express = require("express");
const app = express();

const server = require("http").createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: { origin: "*" }
});

// Per-room state
const roomElements = {}; // roomId -> elements[]
const roomLocks = {};    // roomId -> { elementId: { userId, userName } }
const roomModes = {};    // roomId -> "COLLABORATION" | "PRESENTATION"

app.get("/", (req, res) => {
  res.send("this is realtime whiteboard sharing app");
});

io.on("connection", (socket) => {

  // ── Existing handler (untouched) ──────────────────────────────────────────
  socket.on("userJoined", (data) => {
    const { Name, userId, roomId, host, presenter } = data;
    socket.join(roomId);
    socket.emit("userIsJoined", { success: true });

    // Send current canvas state to the new joiner
    if (roomElements[roomId]) {
      socket.emit("canvasState", roomElements[roomId]);
    }
    // Send current room mode
    socket.emit("roomMode", roomModes[roomId] || "COLLABORATION");
  });

  // ── Feature 1 & 3: Broadcast drawing elements ────────────────────────────
  socket.on("elementUpdated", (data) => {
    const { roomId, elements } = data;
    roomElements[roomId] = elements;
    socket.to(roomId).emit("canvasState", elements);
  });

  // ── Feature 2: Text element saved ────────────────────────────────────────
  socket.on("textSaved", (data) => {
    const { roomId, element } = data;
    if (!roomElements[roomId]) roomElements[roomId] = [];
    // Upsert: replace if same id exists, else push
    const idx = roomElements[roomId].findIndex(e => e.id === element.id);
    if (idx !== -1) {
      roomElements[roomId][idx] = element;
    } else {
      roomElements[roomId].push(element);
    }
    socket.to(roomId).emit("textSaved", element);
  });

  // ── Feature 2: Element locking ────────────────────────────────────────────
  socket.on("element-lock", (data) => {
    const { roomId, elementId, userId, userName } = data;
    if (!roomLocks[roomId]) roomLocks[roomId] = {};
    roomLocks[roomId][elementId] = { userId, userName };
    socket.to(roomId).emit("element-lock", { elementId, userId, userName });
  });

  socket.on("element-unlock", (data) => {
    const { roomId, elementId } = data;
    if (roomLocks[roomId]) delete roomLocks[roomId][elementId];
    socket.to(roomId).emit("element-unlock", { elementId });
  });

  // ── Feature 4: Presentation mode ─────────────────────────────────────────
  socket.on("roomModeChange", (data) => {
    const { roomId, mode } = data;
    roomModes[roomId] = mode;
    // Broadcast to everyone in the room INCLUDING the host
    io.to(roomId).emit("roomMode", mode);
  });

  // ── Feature 5: Undo/Redo broadcast ───────────────────────────────────────
  socket.on("elementDeleted", (data) => {
    const { roomId, elementId } = data;
    if (roomElements[roomId]) {
      roomElements[roomId] = roomElements[roomId].filter(e => e.id !== elementId);
    }
    socket.to(roomId).emit("elementDeleted", elementId);
  });

  socket.on("elementRestored", (data) => {
    const { roomId, element } = data;
    if (!roomElements[roomId]) roomElements[roomId] = [];
    roomElements[roomId].push(element);
    socket.to(roomId).emit("elementRestored", element);
  });

});

const port = process.env.PORT || 5000;
server.listen(port, () => console.log("server is running on http://localhost:5000"));