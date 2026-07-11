import pool from '../config/db.js';

// Helper to map DB post object to CamelCase frontend structure
export const mapPostResponse = async (dbPost) => {
  const postId = dbPost.id;

  // Fetch likes
  let likes = [];
  try {
    const [likeRows] = await pool.query('SELECT user_id FROM post_likes WHERE post_id = ?', [postId]);
    likes = likeRows.map(row => row.user_id);
  } catch (err) {
    console.error('Error fetching post likes:', err);
  }

  // Fetch comments
  let comments = [];
  try {
    const [commentRows] = await pool.query(`
      SELECT c.*, u.name as user_name, u.avatar_url as user_avatar 
      FROM post_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `, [postId]);

    comments = commentRows.map(row => ({
      id: row.id,
      userName: row.user_name,
      avatar: row.user_avatar || `https://i.pravatar.cc/150?u=${encodeURIComponent(row.user_name)}`,
      text: row.text,
      createdAt: row.created_at
    }));
  } catch (err) {
    console.error('Error fetching post comments:', err);
  }

  // Calculate relative time string or just format it
  const timeDiffString = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    let interval = seconds / 31536000;

    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return "just now";
  };

  return {
    id: dbPost.id,
    agencyId: dbPost.agency_id,
    agencyName: dbPost.agency_name || 'Atlas Nomads Travel',
    avatar: dbPost.agency_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150',
    time: timeDiffString(dbPost.created_at),
    location: dbPost.location || 'Morocco',
    image: dbPost.image_url,
    content: dbPost.content,
    likes,
    comments,
    hasOffer: !!dbPost.has_offer,
    offerLink: dbPost.offer_link_id ? `/tour/${dbPost.offer_link_id}` : null,
    offerLinkId: dbPost.offer_link_id
  };
};

/**
 * Fetch all posts
 * @route GET /api/posts
 * @access Public
 */
export const getAllPosts = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, u.name as agency_name, u.avatar_url as agency_avatar 
      FROM posts p
      JOIN users u ON p.agency_id = u.id
      ORDER BY p.created_at DESC
    `);

    const posts = await Promise.all(rows.map(async (row) => {
      return await mapPostResponse(row);
    }));

    return res.status(200).json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching community posts' });
  }
};

/**
 * Create a new community post
 * @route POST /api/posts
 * @access Private (Agency only)
 */
export const createPost = async (req, res) => {
  const { content, image, offerLinkId } = req.body;
  const agencyId = req.user.id;
  const location = req.user.location || 'Morocco';

  try {
    if (!content) {
      return res.status(400).json({ success: false, message: 'Post content cannot be empty' });
    }

    const hasOffer = !!offerLinkId;
    const finalOfferLinkId = offerLinkId || null;
    const imageUrl = image || 'https://images.unsplash.com/photo-1542044896530-05d85be9b11a?q=80&w=1000';

    const [result] = await pool.query(`
      INSERT INTO posts (agency_id, location, image_url, content, has_offer, offer_link_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [agencyId, location, imageUrl, content, hasOffer, finalOfferLinkId]);

    const newPostId = result.insertId;

    // Fetch the new post
    const [rows] = await pool.query(`
      SELECT p.*, u.name as agency_name, u.avatar_url as agency_avatar 
      FROM posts p
      JOIN users u ON p.agency_id = u.id
      WHERE p.id = ?
    `, [newPostId]);

    const postResponse = await mapPostResponse(rows[0]);

    return res.status(201).json({
      success: true,
      message: 'Post published successfully',
      post: postResponse
    });
  } catch (error) {
    console.error('Error creating post:', error);
    return res.status(500).json({ success: false, message: 'Server error publishing post' });
  }
};

/**
 * Toggle like/unlike on a post
 * @route POST /api/posts/:id/like
 * @access Private
 */
export const toggleLikePost = async (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;

  try {
    // Check if post exists
    const [postRows] = await pool.query('SELECT id FROM posts WHERE id = ?', [postId]);
    if (postRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Check if already liked
    const [existing] = await pool.query('SELECT * FROM post_likes WHERE post_id = ? AND user_id = ?', [postId, userId]);

    let liked = false;
    if (existing.length > 0) {
      await pool.query('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
      liked = false;
    } else {
      await pool.query('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)', [postId, userId]);
      liked = true;
    }

    // Return updated likes list for this post
    const [likeRows] = await pool.query('SELECT user_id FROM post_likes WHERE post_id = ?', [postId]);
    const likes = likeRows.map(row => row.user_id);

    return res.status(200).json({
      success: true,
      liked,
      likes
    });
  } catch (error) {
    console.error('Error liking post:', error);
    return res.status(500).json({ success: false, message: 'Server error liking post' });
  }
};

/**
 * Add a comment to a post
 * @route POST /api/posts/:id/comment
 * @access Private
 */
export const addCommentToPost = async (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;
  const { text } = req.body;

  try {
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Comment text cannot be empty' });
    }

    // Check if post exists
    const [postRows] = await pool.query('SELECT id FROM posts WHERE id = ?', [postId]);
    if (postRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    await pool.query('INSERT INTO post_comments (post_id, user_id, text) VALUES (?, ?, ?)', [postId, userId, text.trim()]);

    // Fetch updated comments for this post
    const [commentRows] = await pool.query(`
      SELECT c.*, u.name as user_name, u.avatar_url as user_avatar 
      FROM post_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `, [postId]);

    const comments = commentRows.map(row => ({
      id: row.id,
      userName: row.user_name,
      avatar: row.user_avatar || `https://i.pravatar.cc/150?u=${encodeURIComponent(row.user_name)}`,
      text: row.text,
      createdAt: row.created_at
    }));

    return res.status(200).json({
      success: true,
      message: 'Comment added successfully',
      comments
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    return res.status(500).json({ success: false, message: 'Server error adding comment' });
  }
};

/**
 * Delete a community post
 * @route DELETE /api/posts/:id
 * @access Private (Agency owner/Admin only)
 */
export const deletePost = async (req, res) => {
  const { id } = req.params;
  const agencyId = req.user.id;

  try {
    const [existing] = await pool.query('SELECT agency_id FROM posts WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (existing[0].agency_id !== agencyId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You do not have permission to delete this post' });
    }

    await pool.query('DELETE FROM posts WHERE id = ?', [id]);

    return res.status(200).json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    return res.status(500).json({ success: false, message: 'Server error deleting post' });
  }
};

/**
 * Update a community post
 * @route PUT /api/posts/:id
 * @access Private (Agency owner/Admin only)
 */
export const updatePost = async (req, res) => {
  const { id } = req.params;
  const { content, image, offerLinkId } = req.body;
  const agencyId = req.user.id;

  try {
    const [existing] = await pool.query('SELECT agency_id FROM posts WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (existing[0].agency_id !== agencyId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You do not have permission to edit this post' });
    }

    // Build fields dynamically
    const fields = [];
    const values = [];

    if (content !== undefined) {
      if (!content.trim()) {
        return res.status(400).json({ success: false, message: 'Post content cannot be empty' });
      }
      fields.push('content = ?');
      values.push(content.trim());
    }

    if (image !== undefined) {
      fields.push('image_url = ?');
      values.push(image || '/sahara-desert-maroc-marrocain-8.webp');
    }

    if (offerLinkId !== undefined) {
      fields.push('has_offer = ?');
      values.push(!!offerLinkId);
      fields.push('offer_link_id = ?');
      values.push(offerLinkId || null);
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(id);

    await pool.query(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`, values);

    // Fetch the updated post
    const [rows] = await pool.query(`
      SELECT p.*, u.name as agency_name, u.avatar_url as agency_avatar 
      FROM posts p
      JOIN users u ON p.agency_id = u.id
      WHERE p.id = ?
    `, [id]);

    const postResponse = await mapPostResponse(rows[0]);

    return res.status(200).json({
      success: true,
      message: 'Post updated successfully',
      post: postResponse
    });
  } catch (error) {
    console.error('Error updating post:', error);
    return res.status(500).json({ success: false, message: 'Server error updating post' });
  }
};

/**
 * Delete a comment on a post
 * @route DELETE /api/posts/:postId/comments/:commentId
 * @access Private
 */
export const deleteComment = async (req, res) => {
  const { postId, commentId } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    // Check comment exists
    const [existing] = await pool.query('SELECT * FROM post_comments WHERE id = ? AND post_id = ?', [commentId, postId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    // Check if user is comment owner, post owner, or admin
    const commentOwnerId = existing[0].user_id;

    const [post] = await pool.query('SELECT agency_id FROM posts WHERE id = ?', [postId]);
    const postOwnerId = post[0]?.agency_id;

    if (userId !== commentOwnerId && userId !== postOwnerId && role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You do not have permission to delete this comment' });
    }

    await pool.query('DELETE FROM post_comments WHERE id = ?', [commentId]);

    // Fetch updated comments
    const [commentRows] = await pool.query(`
      SELECT c.*, u.name as user_name, u.avatar_url as user_avatar 
      FROM post_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `, [postId]);

    const comments = commentRows.map(row => ({
      id: row.id,
      userName: row.user_name,
      avatar: row.user_avatar || '/MorP.jpg',
      text: row.text,
      createdAt: row.created_at
    }));

    return res.status(200).json({
      success: true,
      message: 'Comment deleted successfully',
      comments
    });
  } catch (error) {
    console.error('Error deleting comment:', error);
    return res.status(500).json({ success: false, message: 'Server error deleting comment' });
  }
};
