require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');

const app = express();
app.use(express.json());

// ✅ Check if DATABASE_URL exists
if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set!');
    console.error('Please set it in Render Dashboard → Environment');
    process.exit(1);
}

// Create connection pool
const pool = mysql.createPool(process.env.DATABASE_URL);

// Test connection
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        console.error('Please check your DATABASE_URL in Render environment variables');
    } else {
        console.log('✅ Database connected successfully!');
        connection.release();
    }
});

// ✅ GET all users
app.get('/users', (req, res) => {
    pool.query('SELECT id, fullName, email, createdAt FROM users', (err, results) => {
        if (err) {
            console.error('Error fetching users:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// ✅ POST a new user
app.post('/users', (req, res) => {
    const { fullName, email } = req.body;

    // Validate input
    if (!fullName || !email) {
        return res.status(400).json({ error: 'fullName and email are required' });
    }

    const query = 'INSERT INTO users (fullName, email) VALUES (?, ?)';
    pool.query(query, [fullName, email], (err, result) => {
        if (err) {
            console.error('Error adding user:', err);
            return res.status(500).json({ error: err.message });
        }

        res.json({
            id: result.insertId,
            fullName: fullName,
            email: email,
            createdAt: new Date().toISOString()
        });
    });
});

// ✅ GET a single user by ID
app.get('/users/:id', (req, res) => {
    const { id } = req.params;
    pool.query('SELECT id, fullName, email, createdAt FROM users WHERE id = ?', [id], (err, results) => {
        if (err) {
            console.error('Error fetching user:', err);
            return res.status(500).json({ error: err.message });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(results[0]);
    });
});

// ✅ DELETE a user
app.delete('/users/:id', (req, res) => {
    const { id } = req.params;
    pool.query('DELETE FROM users WHERE id = ?', [id], (err, result) => {
        if (err) {
            console.error('Error deleting user:', err);
            return res.status(500).json({ error: err.message });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ message: 'User deleted successfully' });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
});
