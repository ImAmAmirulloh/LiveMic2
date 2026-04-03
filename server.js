/**
 * Live Mic - Signaling Server
 * Server untuk WebRTC signaling dan room management
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configure CORS untuk production
const io = new Server(server, {
    cors: {
        origin: '*', // Allow semua origin untuk development
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());

// Serve static files (frontend)
app.use(express.static(path.join(__dirname)));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ===== Room Management =====
const rooms = new Map();
// Format: rooms.set(roomCode, {
//     speaker: { socketId, userId, name },
//     listeners: Map(socketId -> { name, joinedAt })
// })

// ===== Health Check =====
app.get('/api', (req, res) => {
    res.json({
        status: 'ok',
        name: 'Live Mic Signaling Server',
        version: '1.0.0',
        rooms: rooms.size,
        totalUsers: Array.from(rooms.values()).reduce((acc, room) => {
            return acc + 1 + (room.listeners ? room.listeners.size : 0);
        }, 0)
    });
});

app.get('/api/room/:code', (req, res) => {
    const roomCode = req.params.code.toUpperCase();
    const room = rooms.get(roomCode);

    if (!room) {
        return res.json({ exists: false });
    }

    res.json({
        exists: true,
        hasSpeaker: !!room.speaker,
        listenerCount: room.listeners ? room.listeners.size : 0,
        listeners: room.listeners ? Array.from(room.listeners.values()).map(l => l.name) : []
    });
});

// ===== Socket.IO Signaling =====
io.on('connection', (socket) => {
    console.log(`[+] User connected: ${socket.id}`);

    let currentRoom = null;
    let userName = null;
    let userType = null; // 'speaker' or 'listener'

    // ===== Speaker: Create Room =====
    socket.on('create-room', (data, callback) => {
        const { roomCode, name } = data;

        if (!roomCode || !name) {
            return callback({ success: false, error: 'Room code and name required' });
        }

        const code = roomCode.toUpperCase();

        // Check if room already exists
        if (rooms.has(code)) {
            const existingRoom = rooms.get(code);
            if (existingRoom.speaker) {
                return callback({ success: false, error: 'Room already exists' });
            }
        }

        // Create new room
        const room = {
            speaker: { socketId: socket.id, name },
            listeners: new Map(),
            createdAt: Date.now()
        };

        rooms.set(code, room);
        currentRoom = code;
        userName = name;
        userType = 'speaker';

        console.log(`[Room] Created: ${code} by ${name}`);

        callback({ success: true, roomCode: code });
    });

    // ===== Speaker: Go Live =====
    socket.on('go-live', (callback) => {
        if (!currentRoom || userType !== 'speaker') {
            return callback({ success: false, error: 'Not a speaker in a room' });
        }

        const room = rooms.get(currentRoom);
        if (!room) {
            return callback({ success: false, error: 'Room not found' });
        }

        // Notify all listeners that speaker is live
        room.listeners.forEach((listener, listenerSocketId) => {
            io.to(listenerSocketId).emit('speaker-live');
        });

        console.log(`[Live] ${currentRoom} is now LIVE`);
        callback({ success: true });
    });

    // ===== Speaker: End Live =====
    socket.on('end-live', (callback) => {
        if (!currentRoom || userType !== 'speaker') {
            return callback({ success: false, error: 'Not a speaker' });
        }

        const room = rooms.get(currentRoom);
        if (room) {
            room.listeners.forEach((listener, listenerSocketId) => {
                io.to(listenerSocketId).emit('speaker-ended');
            });
        }

        console.log(`[Live] ${currentRoom} ended`);
        callback({ success: true });
    });

    // ===== Speaker: Get Listener List =====
    socket.on('get-listeners', (callback) => {
        if (!currentRoom || userType !== 'speaker') {
            return callback({ success: false, error: 'Not a speaker' });
        }

        const room = rooms.get(currentRoom);
        if (!room) {
            return callback({ success: false, error: 'Room not found' });
        }

        const listeners = Array.from(room.listeners.entries()).map(([socketId, data]) => ({
            id: socketId,
            name: data.name,
            joinedAt: data.joinedAt
        }));

        callback({ success: true, listeners });
    });

    // ===== Listener: Join Room =====
    socket.on('join-room', (data, callback) => {
        const { roomCode, name } = data;

        if (!roomCode || !name) {
            return callback({ success: false, error: 'Room code and name required' });
        }

        const code = roomCode.toUpperCase();
        const room = rooms.get(code);

        if (!room) {
            return callback({ success: false, error: 'Room not found' });
        }

        if (!room.speaker) {
            return callback({ success: false, error: 'No speaker in this room' });
        }

        // Add listener to room
        room.listeners.set(socket.id, {
            name,
            joinedAt: Date.now()
        });

        currentRoom = code;
        userName = name;
        userType = 'listener';

        // Notify speaker about new listener
        io.to(room.speaker.socketId).emit('listener-joined', {
            socketId: socket.id,
            name,
            joinedAt: Date.now()
        });

        // Update listener count for everyone in room
        io.to(room.speaker.socketId).emit('listener-count', {
            count: room.listeners.size
        });

        console.log(`[Join] ${name} joined room ${code}`);

        // Send current listener list to the new listener
        const listenerList = Array.from(room.listeners.entries()).map(([id, data]) => ({
            id,
            name: data.name,
            joinedAt: data.joinedAt
        }));

        callback({
            success: true,
            roomCode: code,
            speakerName: room.speaker.name,
            listeners: listenerList
        });
    });

    // ===== WebRTC Signaling: Offer (Listener -> Speaker) =====
    socket.on('offer', (data, callback) => {
        const { offer, to } = data;

        if (!currentRoom) {
            return callback({ success: false, error: 'Not in a room' });
        }

        const room = rooms.get(currentRoom);
        if (!room || !room.speaker) {
            return callback({ success: false, error: 'No speaker in room' });
        }

        // Forward offer to speaker
        io.to(room.speaker.socketId).emit('offer', {
            offer,
            from: socket.id,
            fromName: userName
        });

        callback({ success: true });
    });

    // ===== WebRTC Signaling: Answer (Speaker -> Listener) =====
    socket.on('answer', (data, callback) => {
        const { answer, to } = data;

        // Send answer directly to the listener who requested it
        if (to) {
            io.to(to).emit('answer', {
                answer,
                from: socket.id
            });
        }

        callback({ success: true });
    });

    // ===== WebRTC Signaling: ICE Candidate =====
    socket.on('ice-candidate', (data, callback) => {
        const { candidate, to, type } = data;

        if (!currentRoom) return;

        const room = rooms.get(currentRoom);
        if (!room) return;

        if (type === 'listener') {
            // Listener sending ICE to speaker
            if (room.speaker) {
                io.to(room.speaker.socketId).emit('ice-candidate', {
                    candidate,
                    from: socket.id
                });
            }
        } else {
            // Speaker sending ICE to specific listener
            if (to) {
                io.to(to).emit('ice-candidate', {
                    candidate,
                    from: socket.id
                });
            }
        }

        callback?.({ success: true });
    });

    // ===== Disconnect Handler =====
    socket.on('disconnect', () => {
        console.log(`[-] User disconnected: ${socket.id}`);

        if (!currentRoom) return;

        const room = rooms.get(currentRoom);
        if (!room) return;

        if (userType === 'speaker') {
            // Speaker left - notify all listeners and delete room
            console.log(`[Room] Speaker left room ${currentRoom}`);

            room.listeners.forEach((listener, listenerSocketId) => {
                io.to(listenerSocketId).emit('speaker-ended');
            });

            rooms.delete(currentRoom);
        } else if (userType === 'listener') {
            // Listener left - notify speaker
            room.listeners.delete(socket.id);

            if (room.speaker) {
                io.to(room.speaker.socketId).emit('listener-left', {
                    socketId: socket.id,
                    name: userName
                });

                io.to(room.speaker.socketId).emit('listener-count', {
                    count: room.listeners.size
                });
            }

            // Clean up empty rooms
            if (!room.speaker && room.listeners.size === 0) {
                rooms.delete(currentRoom);
            }
        }
    });
});

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════╗
║     Live Mic Signaling Server Started      ║
╠════════════════════════════════════════════╣
║  Status:  Running                          ║
║  Port:    ${PORT}                             ║
║  Health:  http://localhost:${PORT}/          ║
╚════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received, shutting down...');
    io.emit('server-shutdown');
    server.close(() => {
        console.log('[Server] Shutdown complete');
        process.exit(0);
    });
});
