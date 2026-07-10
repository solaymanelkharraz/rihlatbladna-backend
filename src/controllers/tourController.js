import pool from '../config/db.js';

// Helper to map DB tour object to CamelCase frontend structure
export const mapTourResponse = (dbTour) => {
  let included = [];
  let notIncluded = [];
  let tags = [];

  try {
    included = typeof dbTour.included === 'string' ? JSON.parse(dbTour.included) : (dbTour.included || []);
  } catch (err) {
    included = [];
  }

  try {
    notIncluded = typeof dbTour.not_included === 'string' ? JSON.parse(dbTour.not_included) : (dbTour.not_included || []);
  } catch (err) {
    notIncluded = [];
  }

  try {
    tags = typeof dbTour.tags === 'string' ? JSON.parse(dbTour.tags) : (dbTour.tags || []);
  } catch (err) {
    tags = [];
  }

  return {
    id: dbTour.id,
    title: dbTour.title,
    price: parseFloat(dbTour.price),
    location: dbTour.location,
    duration: dbTour.duration,
    description: dbTour.description,
    image: dbTour.image_url,
    included,
    notIncluded,
    tags,
    status: dbTour.status,
    views: parseInt(dbTour.views || 0, 10),
    rating: parseFloat(dbTour.rating || 4.8),
    reviews: parseInt(dbTour.reviews_count || 0, 10),
    agencyId: dbTour.agency_id,
    agencyName: dbTour.agency_name || 'Atlas Nomads Travel',
    agencyAvatar: dbTour.agency_avatar || '/MorP.jpg',
    isBoosted: !!dbTour.is_boosted,
    createdAt: dbTour.created_at
  };
};

/**
 * Fetch all tours (active by default, supports query filters)
 * @route GET /api/tours
 * @access Public
 */
export const getAllTours = async (req, res) => {
  const { dest, activity, agencyId } = req.query;

  try {
    let query = `
      SELECT t.*, u.name as agency_name, u.avatar_url as agency_avatar 
      FROM tours t
      JOIN users u ON t.agency_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // Filter by active status unless specifically requesting all
    if (!agencyId) {
      query += " AND t.status = 'Active'";
    }

    if (agencyId) {
      query += " AND t.agency_id = ?";
      params.push(agencyId);
    }

    if (dest) {
      query += " AND (t.location LIKE ? OR t.title LIKE ?)";
      params.push(`%${dest}%`, `%${dest}%`);
    }

    query += " ORDER BY t.created_at DESC";

    const [rows] = await pool.query(query, params);

    // Map each row
    const tours = rows.map(mapTourResponse);

    // If filter activity is set, filter arrays in JS (since tags is stored as JSON array)
    let filteredTours = tours;
    if (activity) {
      const q = activity.toLowerCase();
      filteredTours = tours.filter(tour => 
        tour.tags.some(tag => tag.toLowerCase().includes(q)) ||
        tour.title.toLowerCase().includes(q) ||
        tour.description.toLowerCase().includes(q)
      );
    }

    return res.status(200).json(filteredTours);
  } catch (error) {
    console.error('Error fetching tours:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch tours. Please try again later.'
    });
  }
};

/**
 * Fetch a single tour by ID
 * @route GET /api/tours/:id
 * @access Public
 */
export const getTourById = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(`
      SELECT t.*, u.name as agency_name, u.avatar_url as agency_avatar 
      FROM tours t
      JOIN users u ON t.agency_id = u.id
      WHERE t.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tour experience not found' });
    }

    const tour = rows[0];

    // Increment views asynchronously
    pool.query('UPDATE tours SET views = views + 1 WHERE id = ?', [id]).catch(err => {
      console.error('Error updating views count:', err);
    });

    return res.status(200).json(mapTourResponse(tour));
  } catch (error) {
    console.error('Error fetching tour by ID:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching tour details' });
  }
};

/**
 * Create a new Tour listing
 * @route POST /api/tours
 * @access Private (Agency only)
 */
export const createTour = async (req, res) => {
  const { title, price, location, duration, description, image, included, notIncluded, tags } = req.body;
  const agencyId = req.user.id;

  try {
    if (!title || !price || !location || !duration || !description) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }

    const imageUrl = image || '/Sahara Desert Adventure.jpg';

    const [result] = await pool.query(`
      INSERT INTO tours (agency_id, title, price, location, duration, description, image_url, included, not_included, tags, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
    `, [
      agencyId,
      title,
      price,
      location,
      duration,
      description,
      imageUrl,
      JSON.stringify(included || []),
      JSON.stringify(notIncluded || []),
      JSON.stringify(tags || [])
    ]);

    const newTourId = result.insertId;

    // Fetch the created tour
    const [rows] = await pool.query(`
      SELECT t.*, u.name as agency_name, u.avatar_url as agency_avatar 
      FROM tours t
      JOIN users u ON t.agency_id = u.id
      WHERE t.id = ?
    `, [newTourId]);

    return res.status(201).json({
      success: true,
      message: 'Tour listed successfully',
      tour: mapTourResponse(rows[0])
    });
  } catch (error) {
    console.error('Error creating tour:', error);
    return res.status(500).json({ success: false, message: 'Server error listing tour' });
  }
};

/**
 * Update Tour Details
 * @route PUT /api/tours/:id
 * @access Private (Agency owner only)
 */
export const updateTour = async (req, res) => {
  const { id } = req.params;
  const { title, price, location, duration, description, image, included, notIncluded, tags, status } = req.body;
  const agencyId = req.user.id;

  try {
    // Check ownership
    const [existing] = await pool.query('SELECT agency_id FROM tours WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Tour listing not found' });
    }

    if (existing[0].agency_id !== agencyId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You do not have permission to update this listing' });
    }

    // Build fields dynamically
    const fields = [];
    const values = [];

    if (title) { fields.push('title = ?'); values.push(title); }
    if (price) { fields.push('price = ?'); values.push(price); }
    if (location) { fields.push('location = ?'); values.push(location); }
    if (duration) { fields.push('duration = ?'); values.push(duration); }
    if (description) { fields.push('description = ?'); values.push(description); }
    if (image) { fields.push('image_url = ?'); values.push(image); }
    if (included) { fields.push('included = ?'); values.push(JSON.stringify(included)); }
    if (notIncluded) { fields.push('not_included = ?'); values.push(JSON.stringify(notIncluded)); }
    if (tags) { fields.push('tags = ?'); values.push(JSON.stringify(tags)); }
    if (status) { fields.push('status = ?'); values.push(status); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(id);

    await pool.query(`UPDATE tours SET ${fields.join(', ')} WHERE id = ?`, values);

    // Fetch updated tour
    const [rows] = await pool.query(`
      SELECT t.*, u.name as agency_name, u.avatar_url as agency_avatar 
      FROM tours t
      JOIN users u ON t.agency_id = u.id
      WHERE t.id = ?
    `, [id]);

    return res.status(200).json({
      success: true,
      message: 'Tour listing updated successfully',
      tour: mapTourResponse(rows[0])
    });
  } catch (error) {
    console.error('Error updating tour:', error);
    return res.status(500).json({ success: false, message: 'Server error updating tour listing' });
  }
};

/**
 * Delete a Tour listing
 * @route DELETE /api/tours/:id
 * @access Private (Agency owner/Admin only)
 */
export const deleteTour = async (req, res) => {
  const { id } = req.params;
  const agencyId = req.user.id;

  try {
    const [existing] = await pool.query('SELECT agency_id FROM tours WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Tour listing not found' });
    }

    if (existing[0].agency_id !== agencyId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You do not have permission to delete this listing' });
    }

    await pool.query('DELETE FROM tours WHERE id = ?', [id]);

    return res.status(200).json({
      success: true,
      message: 'Tour listing deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting tour:', error);
    return res.status(500).json({ success: false, message: 'Server error deleting tour listing' });
  }
};

/**
 * Toggle Wishlist for a tour
 * @route POST /api/tours/:id/wishlist
 * @access Private (Traveler only)
 */
export const toggleWishlist = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Check if exists in wishlist
    const [existing] = await pool.query('SELECT * FROM user_wishlist WHERE user_id = ? AND tour_id = ?', [userId, id]);

    let saved = false;
    if (existing.length > 0) {
      // Remove
      await pool.query('DELETE FROM user_wishlist WHERE user_id = ? AND tour_id = ?', [userId, id]);
      saved = false;
    } else {
      // Add
      await pool.query('INSERT INTO user_wishlist (user_id, tour_id) VALUES (?, ?)', [userId, id]);
      saved = true;
    }

    // Return the updated wishlist array
    const [wishlistRows] = await pool.query('SELECT tour_id FROM user_wishlist WHERE user_id = ?', [userId]);
    const savedTours = wishlistRows.map(row => row.tour_id);

    return res.status(200).json({
      success: true,
      saved,
      savedTours
    });
  } catch (error) {
    console.error('Error toggling wishlist:', error);
    return res.status(500).json({ success: false, message: 'Server error toggling wishlist' });
  }
};

/**
 * Toggle Boost for a tour (Agency only)
 * @route PUT /api/tours/:id/boost
 * @access Private (Agency owner only)
 */
export const toggleBoostTour = async (req, res) => {
  const { id } = req.params;
  const agencyId = req.user.id;

  try {
    // Check if tour exists and check ownership
    const [existing] = await pool.query('SELECT agency_id, is_boosted FROM tours WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Tour experience not found' });
    }

    if (existing[0].agency_id !== agencyId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You do not have permission to boost this tour' });
    }

    const newBoostStatus = !existing[0].is_boosted;

    await pool.query('UPDATE tours SET is_boosted = ? WHERE id = ?', [newBoostStatus, id]);

    // Fetch the updated tour
    const [rows] = await pool.query(`
      SELECT t.*, u.name as agency_name, u.avatar_url as agency_avatar 
      FROM tours t
      JOIN users u ON t.agency_id = u.id
      WHERE t.id = ?
    `, [id]);

    return res.status(200).json({
      success: true,
      message: newBoostStatus ? 'Tour boosted successfully! 🚀' : 'Tour unboosted successfully.',
      tour: mapTourResponse(rows[0])
    });
  } catch (error) {
    console.error('Error toggling tour boost:', error);
    return res.status(500).json({ success: false, message: 'Server error toggling tour boost' });
  }
};
