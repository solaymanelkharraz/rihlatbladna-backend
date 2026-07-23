import express from 'express';
import { 
  getAllTours, 
  getTourById, 
  createTour, 
  updateTour, 
  deleteTour, 
  toggleWishlist,
  toggleBoostTour
} from '../controllers/tourController.js';
import { protect, restrictTo, requireVerification } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.get('/', getAllTours);
router.get('/:id', getTourById);

// Protected routes
router.post('/', protect, restrictTo('agency'), requireVerification, createTour);
router.put('/:id', protect, restrictTo('agency', 'admin'), requireVerification, updateTour);
router.put('/:id/boost', protect, restrictTo('agency', 'admin'), requireVerification, toggleBoostTour);
router.delete('/:id', protect, restrictTo('agency', 'admin'), deleteTour);

// Traveler routes
router.post('/:id/wishlist', protect, restrictTo('traveler'), toggleWishlist);

export default router;
