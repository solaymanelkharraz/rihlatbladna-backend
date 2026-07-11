import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    // Get token from header
    token = req.headers.authorization.split(' ')[1];

    let decoded;
    try {
      // Verify token signature & expiration
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_super_secret_key_change_me_in_production');
    } catch (jwtError) {
      console.error('JWT Verification Failed:', jwtError.message);
      return res.status(401).json({ success: false, message: 'Not authorized, token expired or invalid' });
    }

    try {
      // Get user from DB (excluding password)
      const [rows] = await pool.query('SELECT id, name, email, role, location, avatar_url, cover_url, is_verified, bio, rating, followers_count FROM users WHERE id = ?', [decoded.id]);

      if (rows.length === 0) {
        return res.status(401).json({ success: false, message: 'Not authorized, user account no longer exists' });
      }

      req.user = rows[0];
      return next();
    } catch (dbError) {
      console.error('Database Error in Auth Middleware:', dbError);
      return res.status(503).json({ 
        success: false, 
        message: 'Database service momentarily unavailable due to network timeout. Please try again.' 
      });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
  }
};

export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action'
      });
    }
    next();
  };
};
