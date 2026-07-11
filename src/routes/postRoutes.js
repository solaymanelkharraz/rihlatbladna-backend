import express from 'express';
import { 
  getAllPosts, 
  createPost, 
  toggleLikePost, 
  addCommentToPost, 
  deletePost,
  updatePost,
  deleteComment
} from '../controllers/postController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.get('/', getAllPosts);

// Protected routes
router.post('/', protect, restrictTo('agency'), createPost);
router.put('/:id', protect, restrictTo('agency', 'admin'), updatePost);
router.delete('/:id', protect, restrictTo('agency', 'admin'), deletePost);

// Interaction routes (any logged in user)
router.post('/:id/like', protect, toggleLikePost);
router.post('/:id/comment', protect, addCommentToPost);
router.delete('/:postId/comments/:commentId', protect, deleteComment);

export default router;
