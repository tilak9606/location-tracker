import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { generateTokens, verifyRefreshToken } from './auth-middleware.js';

const SALT_ROUNDS = 12;

export const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (existingUser.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const [newUser] = await db.insert(users).values({
      email: email.toLowerCase(),
      passwordHash,
      name: name || null,
    }).returning({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
    });

    const { accessToken, refreshToken } = generateTokens(newUser.id);
    
    await db.update(users)
      .set({ refreshToken })
      .where(eq(users.id, newUser.id));

    res.status(201).json({
      message: 'User registered successfully',
      user: newUser,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      passwordHash: users.passwordHash,
    }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);

    if (user.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user[0].passwordHash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user[0].id);
    
    await db.update(users)
      .set({ refreshToken })
      .where(eq(users.id, user[0].id));

    res.json({
      message: 'Login successful',
      user: {
        id: user[0].id,
        email: user[0].email,
        name: user[0].name,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    
    const user = await db.select({
      id: users.id,
      refreshToken: users.refreshToken,
    }).from(users).where(eq(users.id, decoded.userId)).limit(1);

    if (user.length === 0 || user[0].refreshToken !== refreshToken) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(decoded.userId);
    
    await db.update(users)
      .set({ refreshToken: newRefreshToken })
      .where(eq(users.id, decoded.userId));

    res.json({
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Refresh token expired, please login again' });
    }
    console.error('Refresh error:', error);
    res.status(403).json({ error: 'Invalid refresh token' });
  }
};

export const logout = async (req, res) => {
  try {
    await db.update(users)
      .set({ refreshToken: null })
      .where(eq(users.id, req.user.id));
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.id, req.user.id)).limit(1);

    res.json({ user: user[0] });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};