import express from 'express';
import { topUpWallet } from '../controllers/walletController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// Private routes
router.post('/topup', protect, restrictTo('agency', 'admin'), topUpWallet);

export default router;
