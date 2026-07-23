import express from 'express';
import { register, login, getMe, updateProfile, getAllUsers, deleteUser, verifyAgency } from '../controllers/authController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Private routes
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);

// Admin routes
router.get('/users', protect, restrictTo('admin'), getAllUsers);
router.delete('/users/:id', protect, restrictTo('admin'), deleteUser);
router.put('/verify-agency/:id', protect, restrictTo('admin'), verifyAgency);

export default router;
