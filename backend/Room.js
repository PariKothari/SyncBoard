// backend/Room.js
const mongoose = require("mongoose");

const RoomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  elements: {
    type: Array,
    default: [],
  },
}, { bufferCommands: false }); // Explicitly disable query buffering on this schema

module.exports = mongoose.model("Room", RoomSchema);