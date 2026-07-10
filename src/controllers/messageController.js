import pool from '../config/db.js';

// Helper to format thread ID
const getFormattedThreadId = (travelerId, agencyId) => {
  return `thread_${travelerId}_${agencyId}`;
};

// Helper to parse thread ID into travelerId and agencyId
const parseThreadId = (threadId) => {
  const parts = threadId.split('_');
  // Format is "thread_<travelerId>_<agencyId>"
  return {
    travelerId: parseInt(parts[1], 10),
    agencyId: parseInt(parts[2], 10)
  };
};

// Helper to map DB messages to CamelCase structure
const mapMessages = (rows) => {
  return rows.map(row => ({
    id: `msg_${row.id}`,
    senderId: row.sender_id,
    text: row.message_text,
    timestamp: row.created_at
  }));
};

/**
 * Fetch all chat threads for the logged-in user
 * @route GET /api/chats
 * @access Private
 */
export const getAllChats = async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  try {
    let query = `
      SELECT c.*, 
             tu.name as traveler_name, tu.avatar_url as traveler_avatar,
             au.name as agency_name, au.avatar_url as agency_avatar
      FROM chats c
      JOIN users tu ON c.traveler_id = tu.id
      JOIN users au ON c.agency_id = au.id
    `;
    const params = [];

    if (role === 'traveler') {
      query += ' WHERE c.traveler_id = ?';
      params.push(userId);
    } else if (role === 'agency') {
      query += ' WHERE c.agency_id = ?';
      params.push(userId);
    }

    const [chatRows] = await pool.query(query, params);

    const threads = await Promise.all(chatRows.map(async (row) => {
      // Fetch messages for this chat
      const [msgRows] = await pool.query(
        'SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC',
        [row.id]
      );

      const formattedThreadId = getFormattedThreadId(row.traveler_id, row.agency_id);

      return {
        id: formattedThreadId,
        dbChatId: row.id,
        travelerId: row.traveler_id,
        travelerName: row.traveler_name,
        travelerAvatar: row.traveler_avatar || '/MorP.jpg',
        agencyId: row.agency_id,
        agencyName: row.agency_name,
        agencyAvatar: row.agency_avatar || '/MorP.jpg',
        messages: mapMessages(msgRows)
      };
    }));

    return res.status(200).json(threads);
  } catch (error) {
    console.error('Error fetching chats:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching chats' });
  }
};

/**
 * Initiate/fetch a chat thread with an agency
 * @route POST /api/chats/initiate
 * @access Private (Traveler only)
 */
export const initiateChat = async (req, res) => {
  const { agencyId } = req.body;
  const travelerId = req.user.id;

  try {
    if (!agencyId) {
      return res.status(400).json({ success: false, message: 'Please provide agency ID' });
    }

    // Check if chat exists
    const [existing] = await pool.query(
      'SELECT id FROM chats WHERE traveler_id = ? AND agency_id = ?',
      [travelerId, agencyId]
    );

    let chatId;
    if (existing.length > 0) {
      chatId = existing[0].id;
    } else {
      const [result] = await pool.query(
        'INSERT INTO chats (traveler_id, agency_id) VALUES (?, ?)',
        [travelerId, agencyId]
      );
      chatId = result.insertId;

      // Add a system welcome message
      await pool.query(
        'INSERT INTO messages (chat_id, sender_id, message_text) VALUES (?, ?, ?)',
        [chatId, travelerId, 'Salam! Click reply to start chatting!']
      );
    }

    const threadId = getFormattedThreadId(travelerId, agencyId);

    return res.status(200).json({
      success: true,
      threadId,
      chatId
    });
  } catch (error) {
    console.error('Error initiating chat:', error);
    return res.status(500).json({ success: false, message: 'Server error initiating chat' });
  }
};

/**
 * Send a message to a chat thread
 * @route POST /api/chats/:threadId/messages
 * @access Private
 */
export const sendChatMessage = async (req, res) => {
  const { threadId } = req.params;
  const { text } = req.body;
  const senderId = req.user.id;

  try {
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Message text cannot be empty' });
    }

    // Parse threadId
    const { travelerId, agencyId } = parseThreadId(threadId);

    // Verify sender belongs to chat
    if (senderId !== travelerId && senderId !== agencyId) {
      return res.status(403).json({ success: false, message: 'You are not authorized to send messages to this thread' });
    }

    // Find the chat in database
    const [chatRows] = await pool.query(
      'SELECT id FROM chats WHERE traveler_id = ? AND agency_id = ?',
      [travelerId, agencyId]
    );

    if (chatRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Chat thread not found' });
    }

    const chatId = chatRows[0].id;

    // Insert message
    await pool.query(
      'INSERT INTO messages (chat_id, sender_id, message_text) VALUES (?, ?, ?)',
      [chatId, senderId, text.trim()]
    );

    // Fetch and return the updated chat thread details
    const [threadInfo] = await pool.query(`
      SELECT c.*, 
             tu.name as traveler_name, tu.avatar_url as traveler_avatar,
             au.name as agency_name, au.avatar_url as agency_avatar
      FROM chats c
      JOIN users tu ON c.traveler_id = tu.id
      JOIN users au ON c.agency_id = au.id
      WHERE c.id = ?
    `, [chatId]);

    const [msgRows] = await pool.query(
      'SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC',
      [chatId]
    );

    const updatedThread = {
      id: threadId,
      dbChatId: chatId,
      travelerId: threadInfo[0].traveler_id,
      travelerName: threadInfo[0].traveler_name,
      travelerAvatar: threadInfo[0].traveler_avatar || '/MorP.jpg',
      agencyId: threadInfo[0].agency_id,
      agencyName: threadInfo[0].agency_name,
      agencyAvatar: threadInfo[0].agency_avatar || '/MorP.jpg',
      messages: mapMessages(msgRows)
    };

    return res.status(200).json({
      success: true,
      message: 'Message sent successfully',
      thread: updatedThread
    });
  } catch (error) {
    console.error('Error sending message:', error);
    return res.status(500).json({ success: false, message: 'Server error sending message' });
  }
};
