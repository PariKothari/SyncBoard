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
const roomLocks   = {}; // roomId -> { elementId: { userId, userName } }
const roomModes   = {}; // roomId -> "COLLABORATION" | "PRESENTATION"
const roomHosts   = {}; // roomId -> userId
const roomUsers   = {}; // roomId -> { [userId]: { userId, name } }

app.get("/", (req, res) => {
  res.send("this is realtime whiteboard sharing app");
});

io.on("connection", (socket) => {

  // ── User joins room ───────────────────────────────────────────────────────
  socket.on("userJoined", (data) => {
    const { name, userId, roomId, host } = data;
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userId = userId;
    socket.data.name = name;

    if (host && !roomHosts[roomId]) {
      roomHosts[roomId] = userId;
    }
    if (!roomUsers[roomId]) roomUsers[roomId] = {};
    roomUsers[roomId][userId] = { userId, name };

    socket.emit("userIsJoined", { success: true });

    if (roomElements[roomId]) {
      socket.emit("canvasState", roomElements[roomId]);
    }
    socket.emit("roomMode", roomModes[roomId] || "COLLABORATION");

    const roster = Object.values(roomUsers[roomId]);
    socket.emit("allUsers", roster);
    socket.to(roomId).emit("userJoined", { userId, name });
    socket.to(roomId).emit("allUsers", roster);

    // Replay active locks to the new joiner
    if (roomLocks[roomId]) {
      Object.entries(roomLocks[roomId]).forEach(([elementId, lockInfo]) => {
        socket.emit("element-lock", { elementId, ...lockInfo });
      });
    }
  });

  socket.on("disconnect", () => {
    const { roomId, userId, name } = socket.data;
    if (!roomId || !userId) return;
    if (roomUsers[roomId]) {
      delete roomUsers[roomId][userId];
      const roster = Object.values(roomUsers[roomId]);
      io.to(roomId).emit("userLeft", { userId, name });
      io.to(roomId).emit("allUsers", roster);
    }
  });

  // ── Clear canvas (instant broadcast to entire room) ─────────────────────
  socket.on("clearCanvas", (data) => {
    const { roomId } = data;
    roomElements[roomId] = [];
    if (roomLocks[roomId]) roomLocks[roomId] = {};
    io.to(roomId).emit("canvasCleared");
    io.to(roomId).emit("canvasState", []);
  });

  // ── Drawing elements (live preview + final) ───────────────────────────────
  socket.on("elementUpdated", (data) => {
    const { roomId, elements } = data;
    roomElements[roomId] = elements;
    if (Array.isArray(elements) && elements.length === 0) {
      io.to(roomId).emit("canvasCleared");
    }
    socket.to(roomId).emit("canvasState", elements);
  });

  // ── Text element saved ────────────────────────────────────────────────────
  socket.on("textSaved", (data) => {
    const { roomId, element } = data;
    if (!roomElements[roomId]) roomElements[roomId] = [];
    const idx = roomElements[roomId].findIndex(e => e.id === element.id);
    if (idx !== -1) {
      roomElements[roomId][idx] = element;
    } else {
      roomElements[roomId].push(element);
    }
    socket.to(roomId).emit("textSaved", element);
  });

  // ── Element locking — with rejection if already locked ────────────────────
  socket.on("element-lock", (data) => {
    const { roomId, elementId, userId, userName } = data;
    if (!roomLocks[roomId]) roomLocks[roomId] = {};

    const existingLock = roomLocks[roomId][elementId];

    // Reject if locked by a DIFFERENT user
    if (existingLock && existingLock.userId !== userId) {
      socket.emit("element-lock-rejected", {
        elementId,
        lockedBy: existingLock.userName,
      });
      return;
    }

    // Grant the lock
    roomLocks[roomId][elementId] = { userId, userName };
    socket.to(roomId).emit("element-lock", { elementId, userId, userName });
    socket.emit("element-lock-granted", { elementId });
  });

  socket.on("element-unlock", (data) => {
    const { roomId, elementId } = data;
    if (roomLocks[roomId]) delete roomLocks[roomId][elementId];
    // Broadcast to everyone so all UIs clear the lock badge
    io.to(roomId).emit("element-unlock", { elementId });
  });

  // ── Presentation mode ─────────────────────────────────────────────────────
  socket.on("roomModeChange", (data) => {
    const { roomId, mode } = data;
    roomModes[roomId] = mode;
    io.to(roomId).emit("roomMode", mode);
  });

  // ── Undo / Redo ───────────────────────────────────────────────────────────
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