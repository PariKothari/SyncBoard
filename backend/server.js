// backend/server.js
// Force IPv4 prioritisation to bypass Windows local DNS/SSL handshake blocks (alert 80)
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");

// 1. Disable command buffering globally immediately upon importing mongoose
mongoose.set("bufferCommands", false);

const app = express();

const server = require("http").createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: { origin: "*" }
});

// Import the isolated AI routes and DB models
const aiRoutes = require("./ai");
const Room = require("./Room");

// Establish database connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("🚀 MongoDB Connected Successfully!");
  })
  .catch((err) => {
    console.error("⚠️ Database connection error: Whiteboard falling back to resilient in-memory mode.");
  });

// Helper utility to check if the database connection is open and active
const isDbConnected = () => mongoose.connection.readyState === 1;

// Enable JSON parsing middleware
app.use(express.json());

// Enable CORS for browser HTTP requests from frontend
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Mount the AI API endpoint under /api/ai
app.use("/api/ai", aiRoutes);

// Per-room state (lightning-fast local in-memory fallback)
const roomElements = {}; // roomId -> elements[]
const roomLocks   = {}; // roomId -> { elementId: { userId, userName } }
const roomModes   = {}; // roomId -> "COLLABORATION" | "PRESENTATION"
const roomHosts   = {}; // roomId -> userId
const roomUsers   = {}; // roomId -> { [userId]: { userId, name } }

app.get("/", (req, res) => {
  res.send("this is realtime whiteboard sharing app");
});

io.on("connection", (socket) => {

  // ── Unified Handler for Room Joins ────────────────────────────────────────
  const handleUserJoin = async (socket, data) => {
    const { name, userId, roomId, host } = data;
    if (!roomId) return;

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

    let fetchedElements = [];

    // Safely attempt database loading only if mongoose is connected
    if (isDbConnected()) {
      try {
        let room = await Room.findOne({ roomId });
        if (!room) {
          room = await Room.create({ roomId, elements: [] });
        }
        roomElements[roomId] = room.elements;
        fetchedElements = room.elements;
      } catch (err) {
        console.error("Database read error, falling back to local memory:", err.message);
        fetchedElements = roomElements[roomId] || [];
      }
    } else {
      // Gracefully fall back to local server memory when database is offline
      fetchedElements = roomElements[roomId] || [];
    }

    // Emit standard state to keep your existing frontend handler working
    socket.emit("canvasState", fetchedElements);
    // Emit back to only the joining client
    socket.emit("load-canvas", fetchedElements);

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
  };

  // Bind both potential connection events to ensure resilient handshakes
  socket.on("userJoined", (data) => handleUserJoin(socket, data));
  socket.on("joinRoom", (data) => handleUserJoin(socket, data));

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

  // ── Clear canvas (cleared elements persisted to DB if online) ───────────
  socket.on("clearCanvas", async (data) => {
    const { roomId } = data;
    roomElements[roomId] = [];
    if (roomLocks[roomId]) roomLocks[roomId] = {};

    if (isDbConnected()) {
      try {
        await Room.updateOne({ roomId }, { $set: { elements: [] } }, { upsert: true });
      } catch (err) {
        console.error("Database clear error:", err.message);
      }
    }

    io.to(roomId).emit("canvasCleared");
    io.to(roomId).emit("canvasState", []);
  });

  // ── Drawing elements (updated to memory and safely queued to DB) ───────
  socket.on("elementUpdated", async (data) => {
    const { roomId, elements } = data;
    roomElements[roomId] = elements;

    if (isDbConnected()) {
      try {
        await Room.updateOne({ roomId }, { $set: { elements } }, { upsert: true });
      } catch (err) {
        console.error("Database update error:", err.message);
      }
    }

    if (Array.isArray(elements) && elements.length === 0) {
      io.to(roomId).emit("canvasCleared");
    }
    socket.to(roomId).emit("canvasState", elements);
  });

  // ── Text element saved ────────────────────────────────────────────────────
  socket.on("textSaved", async (data) => {
    const { roomId, element } = data;
    if (!roomElements[roomId]) roomElements[roomId] = [];
    const idx = roomElements[roomId].findIndex(e => e.id === element.id);
    if (idx !== -1) {
      roomElements[roomId][idx] = element;
    } else {
      roomElements[roomId].push(element);
    }

    if (isDbConnected()) {
      try {
        await Room.updateOne({ roomId }, { $set: { elements: roomElements[roomId] } }, { upsert: true });
      } catch (err) {
        console.error("Database text-saving error:", err.message);
      }
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
  socket.on("elementDeleted", async (data) => {
    const { roomId, elementId } = data;
    if (roomElements[roomId]) {
      roomElements[roomId] = roomElements[roomId].filter(e => e.id !== elementId);
    }

    if (isDbConnected()) {
      try {
        await Room.updateOne({ roomId }, { $set: { elements: roomElements[roomId] || [] } }, { upsert: true });
      } catch (err) {
        console.error("Database undo sync error:", err.message);
      }
    }

    socket.to(roomId).emit("elementDeleted", elementId);
  });

  socket.on("elementRestored", async (data) => {
    const { roomId, element } = data;
    if (!roomElements[roomId]) roomElements[roomId] = [];
    roomElements[roomId].push(element);

    if (isDbConnected()) {
      try {
        await Room.updateOne({ roomId }, { $set: { elements: roomElements[roomId] } }, { upsert: true });
      } catch (err) {
        console.error("Database redo sync error:", err.message);
      }
    }

    socket.to(roomId).emit("elementRestored", element);
  });

});

const port = process.env.PORT || 5000;
server.listen(port, () => console.log("server is running on http://localhost:5000"));