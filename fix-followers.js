import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '3306', 10),
  });

  try {
    const [travelers] = await pool.query('SELECT id FROM users WHERE role = "traveler"');
    const [agencies] = await pool.query('SELECT id FROM users WHERE role = "agency"');
    
    let addedFollows = 0;
    
    for (const traveler of travelers) {
      for (const agency of agencies) {
        // 80% chance for a traveler to follow an agency
        if (Math.random() < 0.8) {
          try {
            await pool.query('INSERT IGNORE INTO user_follows (follower_id, agency_id) VALUES (?, ?)', [traveler.id, agency.id]);
            addedFollows++;
          } catch(e) {}
        }
      }
    }
    
    console.log(`Added ${addedFollows} new follow relationships.`);
    
    // Reset all followers counts to exactly match the user_follows table
    await pool.query(`
      UPDATE users u
      SET followers_count = (
        SELECT COUNT(*) FROM user_follows f WHERE f.agency_id = u.id
      )
    `);
    
    console.log('Successfully recalculated and reset all followers_count values to their accurate database limits!');
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
