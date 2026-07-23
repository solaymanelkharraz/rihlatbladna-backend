import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

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
    const [rows] = await pool.query("SELECT * FROM users WHERE role = 'admin'");
    if (rows.length > 0) {
      console.log('Admin already exists: ' + rows[0].email);
    } else {
      const hash = await bcrypt.hash('admin123', 10);
      await pool.query("INSERT INTO users (name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?)", ['Super Admin', 'admin@rihlatbladna.com', hash, 'admin', true]);
      console.log('Admin created: admin@rihlatbladna.com / admin123');
    }
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
