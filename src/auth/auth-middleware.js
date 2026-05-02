import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';

export const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
  );

  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = verifyAccessToken(token);
    const user = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
    }).from(users).where(eq(users.id, decoded.userId)).limit(1);

    if (user.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
};

export const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = verifyAccessToken(token);
    const user = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
    }).from(users).where(eq(users.id, decoded.userId)).limit(1);

    if (user.length === 0) {
      return next(new Error('User not found'));
    }

    socket.userId = user[0].id;
    socket.user = user[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new Error('Token expired'));
    }
    next(new Error('Invalid token'));
  }
};