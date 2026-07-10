import express from 'express';
import { 
  getAllAgencies, 
  getAgencyById, 
  toggleFollowAgency, 
  postStory 
} from '../controllers/agencyController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.get('/', getAllAgencies);
router.get('/:id', getAgencyById);

// Protected routes
router.post('/:id/follow', protect, restrictTo('traveler'), toggleFollowAgency);
router.post('/story', protect, restrictTo('agency'), postStory);

export default router;
