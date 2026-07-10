import express from 'express';
import { 
  getAllPosts, 
  createPost, 
  toggleLikePost, 
  addCommentToPost, 
  deletePost 
} from '../controllers/postController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.get('/', getAllPosts);

// Protected routes
router.post('/', protect, restrictTo('agency'), createPost);
router.delete('/:id', protect, restrictTo('agency', 'admin'), deletePost);

// Interaction routes (any logged in user)
router.post('/:id/like', protect, toggleLikePost);
router.post('/:id/comment', protect, addCommentToPost);

export default router;
