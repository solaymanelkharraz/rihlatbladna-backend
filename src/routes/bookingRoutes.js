import express from 'express';
import { 
  createBooking, 
  getAllBookings, 
  updateBookingStatus 
} from '../controllers/bookingController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

router.post('/', restrictTo('traveler'), createBooking);
router.get('/', getAllBookings);
router.put('/:id/status', restrictTo('agency', 'admin'), updateBookingStatus);

export default router;
