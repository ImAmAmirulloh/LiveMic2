const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = new Server(server);

  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Broadcaster joins a specific room
    socket.on('join-as-broadcaster', (roomId) => {
      socket.join(roomId);
      console.log(`Broadcaster joined room: ${roomId}`);
      // Notify others in the room that a broadcaster joined
      socket.broadcast.to(roomId).emit('broadcaster-joined', socket.id);
    });

    // Listener joins a room
    socket.on('join-as-listener', (roomId) => {
      socket.join(roomId);
      console.log(`Listener joined room: ${roomId}`);
      // Notify the room (specifically the broadcaster) that a listener joined
      socket.to(roomId).emit('listener-joined', socket.id);
    });

    // WebRTC Signaling
    socket.on('offer', (id, message) => {
      socket.to(id).emit('offer', socket.id, message);
    });

    socket.on('answer', (id, message) => {
      socket.to(id).emit('answer', socket.id, message);
    });

    socket.on('candidate', (id, message) => {
      socket.to(id).emit('candidate', socket.id, message);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      // We don't know which room they were in easily without tracking,
      // but broadcasting to everyone that a peer disconnected is fine for a small app.
      socket.broadcast.emit('peer-disconnected', socket.id);
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
