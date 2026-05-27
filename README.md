SyncBoard - Real-Time Collaborative Whiteboard

SyncBoard is a full-stack, real-time collaborative whiteboard application that allows multiple users to draw, write, and brainstorm together on a shared infinite canvas simultaneously. It also features an integrated AI assistant to analyze drawings and provide architectural design feedback.

🚀 Live Demo & Links
- Live Application: https://sync-board-beta.vercel.app/
- GitHub Repository:https://github.com/PariKothari/SyncBoard

---

 🛠️ Tech Stack
- Frontend: React, HTML5 Canvas API, Tailwind CSS
- Backend: Node.js, Express.js
- Real-Time Communication: WebSockets (Socket.io)
- Scaling & Message Broker: Redis
-Database: MongoDB
- AI Integration:Gemini API

---

 ✨ Core Features

 Collaborative Infinite Canvas
- Drawing Tools: Freehand pencil, text injection, and geometric shapes (rectangles, circles).
- History Management: Full undo, redo, and clear canvas functionality.
- Export Options: Users can export their final drawings directly as PNG files.
- Persistence: Canvas states are saved securely to MongoDB, allowing users to return to their work later.

 Real-Time Synchronization & Scaling
- Instant Sync: Built with WebSockets to mirror mouse movements and drawings across all connected user screens with zero noticeable lag.
- Horizontal Scaling: Integrated Redis Pub/Sub to handle multi-server horizontal scaling. This ensures that even if users are connected to different backend servers, their drawing events are synchronized seamlessly without bottlenecking a single server.

 🤖 Gemini AI Assistant
- Extracted canvas data can be sent to the Gemini API to generate instant summaries or structural feedback on software architecture diagrams drawn by users.

---

 🏗️ Architecture Overview

The application utilizes a distributed architecture to handle concurrent user connections efficiently:

1. Client (React): Captures drawing coordinates on the HTML5 Canvas and emits them as lightweight events via WebSockets.
2. Load Balancer / Multiple Servers: Distributes user incoming traffic across instances.
3. Redis Pub/Sub: Acts as the central nervous system. When Server A receives a drawing event, it publishes it to Redis, which immediately broadcasts it to Server B and Server C, syncing all connected users globally.
4. Database (MongoDB): Periodically persists the final state of the canvas boards.

---

💻 Local Setup Instructions

Follow these steps to run the project locally:

 Prerequisites
Make sure you have Node.js, MongoDB, and Redis installed on your local machine.

 1. Clone the repository
```bash
git clone https://github.com/PariKothari/SyncBoard
cd syncboard

example_env:
PORT=5000
MONGO_URI=your_mongodb_connection_string
REDIS_URL=your_redis_connection_url
GEMINI_API_KEY=your_gemini_api_key

dependencies:
# Navigate to the backend directory
cd backend

# Install dependencies
npm install

# Start the backend server
node server.js


# Navigate to the frontend directory
cd ../frontend

# Install dependencies
yarn install

# Start the React development server
yarn dev
