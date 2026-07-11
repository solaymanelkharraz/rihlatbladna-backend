import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Helper function to test db connection on startup
export const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Alwaysdata MySQL database connection pool established.');
    connection.release();
    await ensureSchema();
    return true;
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    return false;
  }
};

// Helper to verify and migrate database schema on startup without wiping existing tables
export const ensureSchema = async () => {
  try {
    const connection = await pool.getConnection();
    await connection.query(`
      CREATE TABLE IF NOT EXISTS stories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        agency_id INT NOT NULL,
        image_url VARCHAR(500) NOT NULL,
        views_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_stories_agency FOREIGN KEY (agency_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure story_views_count exists on users table
    const [cols] = await connection.query("SHOW COLUMNS FROM users LIKE 'story_views_count'");
    if (cols.length === 0) {
      await connection.query("ALTER TABLE users ADD COLUMN story_views_count INT DEFAULT 0");
      console.log('✅ Added story_views_count column to users table.');
    }

    // Check if stories table is empty but users have story_image_url, migrate initial stories
    const [existingStories] = await connection.query("SELECT COUNT(*) as cnt FROM stories");
    if (existingStories[0].cnt === 0) {
      const [agenciesWithStory] = await connection.query("SELECT id, story_image_url, story_created_at FROM users WHERE role = 'agency' AND story_image_url IS NOT NULL AND story_image_url != ''");
      for (const ag of agenciesWithStory) {
        const initialViews = ag.id === 1 ? 245 : (ag.id === 2 ? 180 : 310);
        await connection.query(
          "INSERT INTO stories (agency_id, image_url, views_count, created_at) VALUES (?, ?, ?, COALESCE(?, NOW()))",
          [ag.id, ag.story_image_url, initialViews, ag.story_created_at]
        );
        await connection.query("UPDATE users SET story_views_count = ? WHERE id = ?", [initialViews, ag.id]);
      }
      console.log('✅ Migrated initial agency stories to stories table.');
    }

    // Ensure guests_count exists on bookings table
    const [bookingCols] = await connection.query("SHOW COLUMNS FROM bookings LIKE 'guests_count'");
    if (bookingCols.length === 0) {
      await connection.query("ALTER TABLE bookings ADD COLUMN guests_count INT DEFAULT 1");
      console.log('✅ Added guests_count column to bookings table.');
    }

    connection.release();
    console.log('✅ Database schema check and migration complete.');
  } catch (err) {
    console.error('⚠️ Error verifying schema:', err.message);
  }
};

export default pool;
