const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

console.log('🚀 Starting server...');

// Database configuration
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'mysql-121dc750-thomasomollo01-5781.l.aivencloud.com',
    port: parseInt(process.env.DB_PORT) || 24024,
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'defaultdb',
    connectionLimit: 10,
    connectTimeout: 30000,
    waitForConnections: true,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false
    }
}).promise();

// Test database connection
(async function testConnection() {
    try {
        const conn = await pool.getConnection();
        console.log('✅ Connected to Aiven MySQL!');
        conn.release();
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
    }
})();

// ============ ROUTES ============

// GET all users
app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users ORDER BY id DESC');
        res.json({ users: rows });
    } catch (err) {
        console.error('Query Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET single user by ID
app.get('/api/users/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ user: rows[0] });
    } catch (err) {
        console.error('Query Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST - Create new user
app.post('/api/users', async (req, res) => {
    try {
        const { name, email } = req.body;
        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required' });
        }
        const [result] = await pool.query(
            'INSERT INTO users (name, email) VALUES (?, ?)',
            [name, email]
        );
        res.status(201).json({
            success: true,
            id: result.insertId,
            message: 'User added successfully'
        });
    } catch (err) {
        console.error('Insert Error:', err.message);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT - Update user
app.put('/api/users/:id', async (req, res) => {
    try {
        const { name, email } = req.body;
        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required' });
        }
        const [result] = await pool.query(
            'UPDATE users SET name = ?, email = ? WHERE id = ?',
            [name, email, req.params.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({
            success: true,
            message: 'User updated successfully'
        });
    } catch (err) {
        console.error('Update Error:', err.message);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// DELETE - Delete user
app.delete('/api/users/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (err) {
        console.error('Delete Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// Root route
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
});
