import express from 'express';
import { 
  getAllTours, 
  getTourById, 
  createTour, 
  updateTour, 
  deleteTour, 
  toggleWishlist 
} from '../controllers/tourController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.get('/', getAllTours);
router.get('/:id', getTourById);

// Protected routes
router.post('/', protect, restrictTo('agency'), createTour);
router.put('/:id', protect, restrictTo('agency', 'admin'), updateTour);
router.delete('/:id', protect, restrictTo('agency', 'admin'), deleteTour);

// Traveler routes
router.post('/:id/wishlist', protect, restrictTo('traveler'), toggleWishlist);

export default router;
