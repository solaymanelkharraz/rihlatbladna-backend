import pool from '../config/db.js';

/**
 * Top up user credits wallet
 * @route POST /api/wallet/topup
 * @access Private (Agency only)
 */
export const topUpWallet = async (req, res) => {
  const { amount } = req.body;
  const userId = req.user.id;

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid amount' });
  }

  try {
    // Add amount to user's credits
    await pool.query('UPDATE users SET credits = credits + ? WHERE id = ?', [amount, userId]);

    // Fetch the updated credits
    const [rows] = await pool.query('SELECT credits FROM users WHERE id = ?', [userId]);

    return res.status(200).json({
      success: true,
      message: 'Wallet topped up successfully',
      credits: rows[0].credits
    });
  } catch (error) {
    console.error('Error topping up wallet:', error);
    return res.status(500).json({ success: false, message: 'Server error topping up wallet' });
  }
};
