import express from 'express';
import { 
  getAllAgencies, 
  getAgencyById, 
  toggleFollowAgency, 
  postStory,
  getMyStories,
  deleteStory,
  incrementStoryViews
} from '../controllers/agencyController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// Specific routes before parameterized routes
router.get('/stories/my', protect, restrictTo('agency', 'admin'), getMyStories);
router.delete('/stories/:id', protect, restrictTo('agency', 'admin'), deleteStory);
router.post('/:agencyId/story/view', incrementStoryViews);

// Public routes
router.get('/', getAllAgencies);
router.get('/:id', getAgencyById);

// Protected routes
router.post('/:id/follow', protect, restrictTo('traveler', 'agency'), toggleFollowAgency);
router.post('/story', protect, restrictTo('agency', 'admin'), postStory);

export default router;
