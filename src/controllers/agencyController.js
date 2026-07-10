import pool from '../config/db.js';
import { mapUserResponse } from './authController.js';
import { mapTourResponse } from './tourController.js';
import { mapPostResponse } from './postController.js'; // We will define this helper shortly

/**
 * Fetch all agencies
 * @route GET /api/agencies
 * @access Public
 */
export const getAllAgencies = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE role = 'agency' ORDER BY followers_count DESC");
    
    const agencies = await Promise.all(rows.map(async (row) => {
      return await mapUserResponse(row);
    }));

    return res.status(200).json(agencies);
  } catch (error) {
    console.error('Error fetching agencies:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching agencies' });
  }
};

/**
 * Fetch agency details by ID (including tours and posts)
 * @route GET /api/agencies/:id
 * @access Public
 */
export const getAgencyById = async (req, res) => {
  const { id } = req.params;

  try {
    const [agencyRows] = await pool.query("SELECT * FROM users WHERE id = ? AND role = 'agency'", [id]);
    if (agencyRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Agency not found' });
    }

    const agency = await mapUserResponse(agencyRows[0]);

    // Fetch tours
    const [tourRows] = await pool.query(`
      SELECT t.*, u.name as agency_name, u.avatar_url as agency_avatar 
      FROM tours t
      JOIN users u ON t.agency_id = u.id
      WHERE t.agency_id = ? AND t.status = 'Active'
      ORDER BY t.created_at DESC
    `, [id]);
    const tours = tourRows.map(mapTourResponse);

    // Fetch posts
    const [postRows] = await pool.query(`
      SELECT p.*, u.name as agency_name, u.avatar_url as agency_avatar 
      FROM posts p
      JOIN users u ON p.agency_id = u.id
      WHERE p.agency_id = ?
      ORDER BY p.created_at DESC
    `, [id]);
    const posts = await Promise.all(postRows.map(async (row) => {
      return await mapPostResponse(row);
    }));

    return res.status(200).json({
      success: true,
      agency,
      tours,
      posts
    });
  } catch (error) {
    console.error('Error fetching agency profile:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching agency profile' });
  }
};

/**
 * Toggle follow/unfollow an agency
 * @route POST /api/agencies/:id/follow
 * @access Private (Traveler only)
 */
export const toggleFollowAgency = async (req, res) => {
  const agencyId = req.params.id;
  const followerId = req.user.id;

  if (parseInt(agencyId) === parseInt(followerId)) {
    return res.status(400).json({ success: false, message: 'You cannot follow yourself' });
  }

  try {
    // Check if agency exists
    const [agencyRows] = await pool.query("SELECT id, followers_count FROM users WHERE id = ? AND role = 'agency'", [agencyId]);
    if (agencyRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Agency not found' });
    }

    // Check if already following
    const [existing] = await pool.query("SELECT * FROM user_follows WHERE follower_id = ? AND agency_id = ?", [followerId, agencyId]);

    let following = false;
    if (existing.length > 0) {
      // Unfollow
      await pool.query("DELETE FROM user_follows WHERE follower_id = ? AND agency_id = ?", [followerId, agencyId]);
      await pool.query("UPDATE users SET followers_count = GREATEST(0, followers_count - 1) WHERE id = ?", [agencyId]);
      following = false;
    } else {
      // Follow
      await pool.query("INSERT INTO user_follows (follower_id, agency_id) VALUES (?, ?)", [followerId, agencyId]);
      await pool.query("UPDATE users SET followers_count = followers_count + 1 WHERE id = ?", [agencyId]);
      following = true;
    }

    // Fetch updated follower count & follow status list for user
    const [followRows] = await pool.query('SELECT agency_id FROM user_follows WHERE follower_id = ?', [followerId]);
    const followingAgencies = followRows.map(row => row.agency_id);

    return res.status(200).json({
      success: true,
      following,
      followingAgencies
    });
  } catch (error) {
    console.error('Error toggling follow status:', error);
    return res.status(500).json({ success: false, message: 'Server error toggling follow status' });
  }
};

/**
 * Upload a 24-hour Story
 * @route POST /api/agencies/story
 * @access Private (Agency only)
 */
export const postStory = async (req, res) => {
  const { storyImage } = req.body;
  const agencyId = req.user.id;

  try {
    if (!storyImage) {
      return res.status(400).json({ success: false, message: 'Please provide a story cover image URL' });
    }

    await pool.query(
      "UPDATE users SET story_image_url = ?, story_created_at = NOW() WHERE id = ?",
      [storyImage, agencyId]
    );

    // Fetch updated user profile
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [agencyId]);
    const userResponse = await mapUserResponse(rows[0]);

    return res.status(200).json({
      success: true,
      message: 'Story published successfully',
      user: userResponse
    });
  } catch (error) {
    console.error('Error posting story:', error);
    return res.status(500).json({ success: false, message: 'Server error posting story' });
  }
};
