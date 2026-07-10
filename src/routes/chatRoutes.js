import express from 'express';
import { 
  getAllChats, 
  initiateChat, 
  sendChatMessage 
} from '../controllers/messageController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

router.get('/', getAllChats);
router.post('/initiate', initiateChat);
router.post('/:threadId/messages', sendChatMessage);

export default router;
