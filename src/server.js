import dotenv from 'dotenv';
dotenv.config();

import http from 'node:http';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';

import { kafkaProducer, kafkaClient } from './kafka-client.js';
import { authenticateSocket } from './auth/auth-middleware.js';
import authRoutes from './auth/auth-routes.js';
import { removeSession, cleanupStaleSessions } from './location/location-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8000;
const LOCATION_TOPIC = process.env.KAFKA_TOPIC || 'location-updates';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:8000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:8000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const activeUsers = new Map();

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);

app.get('/health', (req, res) => {
  res.json({
    healthy: true,
    timestamp: new Date().toISOString(),
    activeUsers: activeUsers.size
  });
});

app.get('/api/users/online', async (req, res) => {
  try {
    const onlineUsers = Array.from(activeUsers.entries()).map(([userId, data]) => ({
      userId,
      email: data.email,
      name: data.name,
      latitude: data.latitude,
      longitude: data.longitude,
      lastSeen: data.lastSeen,
    }));
    res.json({ users: onlineUsers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get online users' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

async function startServer() {
  try {
    await kafkaProducer.connect();
    console.log('Kafka Producer connected');

    // Setup Socket.IO with auth
    io.use(authenticateSocket);

    io.on('connection', (socket) => {
      console.log(`[Socket:${socket.id}] User connected: ${socket.user.email} (${socket.userId})`);

      activeUsers.set(socket.userId, {
        socketId: socket.id,
        email: socket.user.email,
        name: socket.user.name,
        latitude: null,
        longitude: null,
        lastSeen: Date.now(),
      });

      socket.broadcast.emit('server:user:online', {
        userId: socket.userId,
        email: socket.user.email,
        name: socket.user.name,
      });

      const otherUsers = Array.from(activeUsers.entries())
        .filter(([id]) => id !== socket.userId)
        .map(([id, data]) => ({
          userId: id,
          email: data.email,
          name: data.name,
          latitude: data.latitude,
          longitude: data.longitude,
        }));

      socket.emit('server:users:initial', otherUsers);

      socket.on('client:location:update', async (locationData) => {
        try {
          const { latitude, longitude, accuracy } = locationData;

          if (typeof latitude !== 'number' || typeof longitude !== 'number') {
            console.warn(`[Socket:${socket.id}] Invalid location data`);
            socket.emit('server:error', { message: 'Invalid location data' });
            return;
          }

          if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            socket.emit('server:error', { message: 'Invalid coordinates' });
            return;
          }

          const userData = activeUsers.get(socket.userId);
          if (userData) {
            userData.latitude = latitude;
            userData.longitude = longitude;
            userData.lastSeen = Date.now();
          }

          console.log(`[Socket:${socket.id}] Location update: ${latitude}, ${longitude}`);

          await kafkaProducer.send({
            topic: LOCATION_TOPIC,
            messages: [
              {
                key: socket.userId,
                value: JSON.stringify({
                  userId: socket.userId,
                  email: socket.user.email,
                  name: socket.user.name,
                  latitude,
                  longitude,
                  accuracy: accuracy || null,
                  timestamp: Date.now(),
                  socketId: socket.id,
                }),
              },
            ],
          });

          console.log(`[Kafka] Published location for user: ${socket.userId}`);
        } catch (error) {
          console.error(`[Socket:${socket.id}] Error handling location:`, error);
          socket.emit('server:error', { message: 'Failed to process location' });
        }
      });

      socket.on('disconnect', async (reason) => {
        console.log(`[Socket:${socket.id}] Disconnected: ${reason}`);

        activeUsers.delete(socket.userId);
        await removeSession(socket.id);

        io.emit('server:user:offline', { userId: socket.userId });
      });

      socket.on('error', (error) => {
        console.error(`[Socket:${socket.id}] Error:`, error);
      });
    });

    const socketConsumer = kafkaClient.consumer({
      groupId: `socket-server-${PORT}`,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await socketConsumer.connect();
    console.log('Socket Kafka Consumer connected');

    await socketConsumer.subscribe({
      topic: LOCATION_TOPIC,
      fromBeginning: false,
    });

    await socketConsumer.run({
      eachMessage: async ({ topic, partition, message, heartbeat }) => {
        try {
          const data = JSON.parse(message.value.toString());
          console.log(`[Socket-Consumer] Broadcasting location for: ${data.userId}`);

          io.emit('server:location:update', {
            userId: data.userId,
            email: data.email,
            name: data.name,
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: data.accuracy,
            timestamp: data.timestamp,
          });

          await heartbeat();
        } catch (error) {
          console.error('[Socket-Consumer] Error:', error);
          await heartbeat();
        }
      },
    });

    setInterval(async () => {
      try {
        const staleUsers = await cleanupStaleSessions();
        if (staleUsers.length > 0) {
          console.log(`[Cleanup] Removed ${staleUsers.length} stale sessions`);
          staleUsers.forEach(({ user_id }) => {
            activeUsers.delete(user_id);
            io.emit('server:user:offline', { userId: user_id });
          });
        }
      } catch (error) {
        console.error('[Cleanup] Error:', error);
      }
    }, 30000);

    server.listen(PORT, () => {
      console.log(`
        Live Location Tracker Server Running
        Port:        ${PORT}
        Environment: ${process.env.NODE_ENV || 'development'}
        Kafka:       ${process.env.KAFKA_BROKER}
        Database:    Connected
        WebSocket:   Ready
      `);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

process.on('SIGINT', async () => {
  console.log('\nShutting down server...');
  await kafkaProducer.disconnect();
  process.exit(0);
});