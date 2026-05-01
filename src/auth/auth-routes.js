import express from 'express';
import { register, login, refresh, logout, getMe } from './auth-controller.js';
import { authenticateToken } from './auth-middleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', authenticateToken, logout);
router.get('/me', authenticateToken, getMe);

export default router;