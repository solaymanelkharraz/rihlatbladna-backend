import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

// Helper to generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'your_jwt_super_secret_key_change_me_in_production', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// Helper to map DB user to CamelCase frontend structure
export const mapUserResponse = async (dbUser) => {
  const userId = dbUser.id;

  // Fetch saved tours (wishlist)
  let savedTours = [];
  try {
    const [wishlistRows] = await pool.query('SELECT tour_id FROM user_wishlist WHERE user_id = ?', [userId]);
    savedTours = wishlistRows.map(row => row.tour_id);
  } catch (err) {
    console.error('Error fetching user wishlist:', err);
  }

  // Fetch following agencies
  let followingAgencies = [];
  try {
    const [followRows] = await pool.query('SELECT agency_id FROM user_follows WHERE follower_id = ?', [userId]);
    followingAgencies = followRows.map(row => row.agency_id);
  } catch (err) {
    console.error('Error fetching user follows:', err);
  }

  return {
    id: dbUser.id,
    name: dbUser.name,
    email: dbUser.email,
    role: dbUser.role,
    location: dbUser.location || '',
    avatar: dbUser.avatar_url || '/MorP.jpg',
    cover: dbUser.cover_url || '',
    isVerified: !!dbUser.is_verified,
    bio: dbUser.bio || '',
    rating: parseFloat(dbUser.rating || 5.0),
    followersCount: parseInt(dbUser.followers_count || 0, 10),
    storyImage: dbUser.story_image_url || null,
    storyCreatedAt: dbUser.story_created_at || null,
    storyViewsCount: parseInt(dbUser.story_views_count || 0, 10),
    savedTours,
    followingAgencies
  };
};

/**
 * Register User
 * @route POST /api/auth/register
 * @access Public
 */
export const register = async (req, res) => {
  const { name, email, password, role, location } = req.body;

  try {
    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }

    // Check if user exists
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Email is already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Default location and avatar
    const defaultLocation = location || (role === 'agency' ? 'Marrakech, Morocco' : 'Tangier, Morocco');
    const defaultAvatar = '/MorP.jpg';
    const defaultCover = role === 'agency' ? '/morocco1.jpg' : '';

    // Insert user
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password, role, location, avatar_url, cover_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, email, hashedPassword, role, defaultLocation, defaultAvatar, defaultCover]
    );

    const newUserId = result.insertId;

    // Fetch new user details
    const [newUserRows] = await pool.query('SELECT * FROM users WHERE id = ?', [newUserId]);
    const userResponse = await mapUserResponse(newUserRows[0]);

    // Generate token
    const token = generateToken(newUserId);

    return res.status(201).json({
      success: true,
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('Registration Error:', error);
    return res.status(500).json({ success: false, message: 'Server registration error' });
  }
};

/**
 * Login User
 * @route POST /api/auth/login
 * @access Public
 */
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    // Find user
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = rows[0];

    // Check password
    // Supporting both hashed password and plain-text (if any existed before, though seeding uses bcrypt hashes)
    let isMatch = false;
    if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      isMatch = (password === user.password);
    }

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const userResponse = await mapUserResponse(user);
    const token = generateToken(user.id);

    return res.status(200).json({
      success: true,
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ success: false, message: 'Server login error' });
  }
};

/**
 * Get Current User Details
 * @route GET /api/auth/me
 * @access Private
 */
export const getMe = async (req, res) => {
  try {
    // req.user is loaded in authMiddleware
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userResponse = await mapUserResponse(rows[0]);
    return res.status(200).json({
      success: true,
      user: userResponse
    });
  } catch (error) {
    console.error('GetMe Error:', error);
    return res.status(500).json({ success: false, message: 'Server profile fetch error' });
  }
};

/**
 * Update User Profile
 * @route PUT /api/auth/profile
 * @access Private
 */
export const updateProfile = async (req, res) => {
  const { name, location, bio } = req.body;
  const avatar = req.body.avatar !== undefined ? req.body.avatar : req.body.avatarUrl;
  const cover = req.body.cover !== undefined ? req.body.cover : req.body.coverUrl;

  try {
    const userId = req.user.id;

    // Build update query dynamically
    const fields = [];
    const values = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (location !== undefined) { fields.push('location = ?'); values.push(location); }
    if (avatar !== undefined) { fields.push('avatar_url = ?'); values.push(avatar); }
    if (cover !== undefined) { fields.push('cover_url = ?'); values.push(cover); }
    if (bio !== undefined) { fields.push('bio = ?'); values.push(bio); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(userId);

    await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    // Fetch updated user
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    const userResponse = await mapUserResponse(rows[0]);

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: userResponse
    });
  } catch (error) {
    console.error('UpdateProfile Error:', error);
    return res.status(500).json({ success: false, message: 'Server profile update error' });
  }
};

/**
 * Get All Users
 * @route GET /api/auth/users
 * @access Private (Admin only)
 */
export const getAllUsers = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    const users = await Promise.all(rows.map(mapUserResponse));
    return res.status(200).json(users);
  } catch (error) {
    console.error('GetAllUsers Error:', error);
    return res.status(500).json({ success: false, message: 'Server users fetch error' });
  }
};

/**
 * Delete User
 * @route DELETE /api/auth/users/:id
 * @access Private (Admin only)
 */
export const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    return res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('DeleteUser Error:', error);
    return res.status(500).json({ success: false, message: 'Server user delete error' });
  }
};
