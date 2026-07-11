import pool from '../config/db.js';

// Helper to map DB booking to CamelCase frontend structure
export const mapBookingResponse = (dbBooking) => {
  return {
    id: dbBooking.id,
    travelerId: dbBooking.traveler_id,
    travelerName: dbBooking.traveler_name || 'Traveler Name',
    travelerPhone: dbBooking.traveler_phone,
    guestsCount: parseInt(dbBooking.guests_count || 1, 10),
    agencyId: dbBooking.agency_id,
    agencyName: dbBooking.agency_name || 'Agency Name',
    tourId: dbBooking.tour_id,
    tourTitle: dbBooking.tour_title,
    date: dbBooking.created_at,
    status: dbBooking.status
  };
};

/**
 * Create a new booking inquiry (WhatsApp Lead)
 * @route POST /api/bookings
 * @access Private (Traveler only)
 */
export const createBooking = async (req, res) => {
  const { tourId, travelerPhone, guestsCount } = req.body;
  const travelerId = req.user.id;
  const seats = parseInt(guestsCount || 1, 10);

  try {
    if (!tourId || !travelerPhone) {
      return res.status(400).json({ success: false, message: 'Please provide tour ID and traveler phone number' });
    }

    // 1. Fetch tour details to get agency_id and title
    const [tourRows] = await pool.query('SELECT agency_id, title FROM tours WHERE id = ?', [tourId]);
    if (tourRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tour experience not found' });
    }
    const tour = tourRows[0];
    const agencyId = tour.agency_id;

    // 2. Insert Booking entry with guests_count
    const [bookingResult] = await pool.query(`
      INSERT INTO bookings (traveler_id, agency_id, tour_id, traveler_phone, guests_count, status)
      VALUES (?, ?, ?, ?, ?, 'New')
    `, [travelerId, agencyId, tourId, travelerPhone, seats]);

    // 3. Initiate or find Chat Thread between traveler and agency
    let chatId;
    const [existingChats] = await pool.query(
      'SELECT id FROM chats WHERE traveler_id = ? AND agency_id = ?',
      [travelerId, agencyId]
    );

    if (existingChats.length > 0) {
      chatId = existingChats[0].id;
    } else {
      const [chatResult] = await pool.query(
        'INSERT INTO chats (traveler_id, agency_id) VALUES (?, ?)',
        [travelerId, agencyId]
      );
      chatId = chatResult.insertId;
    }

    // 4. Insert TWO structured automated confirmation messages in the chat
    const inquiryMessageText = `📅 New Reservation Placed: ${seats} Seat(s) for "${tour.title}". Traveler Contact Phone: ${travelerPhone}. Status: Pending Confirmation.`;
    await pool.query(
      'INSERT INTO messages (chat_id, sender_id, message_text) VALUES (?, ?, ?)',
      [chatId, travelerId, inquiryMessageText]
    );

    const automatedReplyText = `✅ Salam! We saw your booking for ${seats} seat(s) on "${tour.title}". Your reservation has been logged and sent to the agency team! We are checking our availability schedule right now and will send you a confirmation message via WhatsApp (${travelerPhone}) shortly.`;
    await pool.query(
      'INSERT INTO messages (chat_id, sender_id, message_text) VALUES (?, ?, ?)',
      [chatId, agencyId, automatedReplyText]
    );

    return res.status(201).json({
      success: true,
      message: 'Booking reservation created successfully',
      bookingId: bookingResult.insertId,
      threadId: chatId
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    return res.status(500).json({ success: false, message: 'Server error creating booking inquiry' });
  }
};

/**
 * Fetch bookings for current user (Traveler/Agency leads list)
 * @route GET /api/bookings
 * @access Private
 */
export const getAllBookings = async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  try {
    let query = `
      SELECT b.*, t.title as tour_title, tu.name as traveler_name, au.name as agency_name
      FROM bookings b
      JOIN tours t ON b.tour_id = t.id
      JOIN users tu ON b.traveler_id = tu.id
      JOIN users au ON b.agency_id = au.id
    `;
    const params = [];

    if (role === 'traveler') {
      query += ' WHERE b.traveler_id = ?';
      params.push(userId);
    } else if (role === 'agency') {
      query += ' WHERE b.agency_id = ?';
      params.push(userId);
    }

    query += ' ORDER BY b.created_at DESC';

    const [rows] = await pool.query(query, params);
    const bookings = rows.map(mapBookingResponse);

    return res.status(200).json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching bookings' });
  }
};

/**
 * Update Booking status
 * @route PUT /api/bookings/:id/status
 * @access Private (Agency owner/Admin only)
 */
export const updateBookingStatus = async (req, res) => {
  const bookingId = req.params.id;
  const { status } = req.body;
  const userId = req.user.id;

  try {
    if (!status) {
      return res.status(400).json({ success: false, message: 'Please provide status' });
    }

    // Verify booking exists and user is owner
    const [bookingRows] = await pool.query('SELECT agency_id FROM bookings WHERE id = ?', [bookingId]);
    if (bookingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const booking = bookingRows[0];
    if (booking.agency_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You do not have permission to modify this lead' });
    }

    await pool.query('UPDATE bookings SET status = ? WHERE id = ?', [status, bookingId]);

    // Fetch updated bookings
    let query = `
      SELECT b.*, t.title as tour_title, tu.name as traveler_name, au.name as agency_name
      FROM bookings b
      JOIN tours t ON b.tour_id = t.id
      JOIN users tu ON b.traveler_id = tu.id
      JOIN users au ON b.agency_id = au.id
      WHERE b.agency_id = ?
      ORDER BY b.created_at DESC
    `;
    const [rows] = await pool.query(query, [userId]);
    const bookings = rows.map(mapBookingResponse);

    return res.status(200).json({
      success: true,
      message: 'Booking status updated successfully',
      bookings
    });
  } catch (error) {
    console.error('Error updating booking status:', error);
    return res.status(500).json({ success: false, message: 'Server error updating booking status' });
  }
};
