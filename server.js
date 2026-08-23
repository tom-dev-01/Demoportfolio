const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();

// Render automatically provides PORT
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

console.log('🚀 Starting server...');

// ================================
// DATABASE CONFIGURATION
// ================================
const requiredEnv = [
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME'
];

for (const key of requiredEnv) {
    if (!process.env[key]) {
        console.error(`❌ Missing environment variable: ${key}`);
    }
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

    connectTimeout: 30000,

    ssl: {
        rejectUnauthorized: false
    }
}).promise();


// ================================
// TEST DATABASE CONNECTION
// ================================

async function testDatabaseConnection() {
    try {
        const connection = await pool.getConnection();

        console.log('✅ Connected to Aiven MySQL successfully!');

        connection.release();

    } catch (error) {

        console.error('❌ Database connection failed!');
        console.error('Error Code:', error.code);
        console.error('Error Message:', error.message);

    }
}

testDatabaseConnection();


// ================================
// ROUTES
// ================================


// GET ALL USERS
app.get('/api/users', async (req, res) => {

    try {

        const [rows] = await pool.query(
            'SELECT * FROM users ORDER BY id DESC'
        );

        res.status(200).json({
            success: true,
            users: rows
        });

    } catch (error) {

        console.error('❌ GET Users Error:', error.message);

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});


// GET SINGLE USER
app.get('/api/users/:id', async (req, res) => {

    try {

        const [rows] = await pool.query(
            'SELECT * FROM users WHERE id = ?',
            [req.params.id]
        );

        if (rows.length === 0) {

            return res.status(404).json({
                success: false,
                error: 'User not found'
            });

        }

        res.status(200).json({
            success: true,
            user: rows[0]
        });

    } catch (error) {

        console.error('❌ GET User Error:', error.message);

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});


// CREATE USER
app.post('/api/users', async (req, res) => {

    try {

        const name = req.body.name?.trim();
        const email = req.body.email?.trim();

        // Validation
        if (!name || !email) {

            return res.status(400).json({
                success: false,
                error: 'Name and email are required'
            });

        }

        // Insert user
        const [result] = await pool.execute(
            'INSERT INTO users (name, email) VALUES (?, ?)',
            [name, email]
        );

        console.log(`✅ New user created: ${name}`);

        res.status(201).json({
            success: true,
            id: result.insertId,
            message: 'User added successfully'
        });

    } catch (error) {

        console.error('❌ INSERT Error:', error.message);

        if (error.code === 'ER_DUP_ENTRY') {

            return res.status(409).json({
                success: false,
                error: 'Email already exists'
            });

        }

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});


// UPDATE USER
app.put('/api/users/:id', async (req, res) => {

    try {

        const name = req.body.name?.trim();
        const email = req.body.email?.trim();

        if (!name || !email) {

            return res.status(400).json({
                success: false,
                error: 'Name and email are required'
            });

        }

        const [result] = await pool.execute(
            'UPDATE users SET name = ?, email = ? WHERE id = ?',
            [name, email, req.params.id]
        );

        if (result.affectedRows === 0) {

            return res.status(404).json({
                success: false,
                error: 'User not found'
            });

        }

        console.log(`✅ User ${req.params.id} updated`);

        res.status(200).json({
            success: true,
            message: 'User updated successfully'
        });

    } catch (error) {

        console.error('❌ UPDATE Error:', error.message);

        if (error.code === 'ER_DUP_ENTRY') {

            return res.status(409).json({
                success: false,
                error: 'Email already exists'
            });

        }

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});


// DELETE USER
app.delete('/api/users/:id', async (req, res) => {

    try {

        const [result] = await pool.execute(
            'DELETE FROM users WHERE id = ?',
            [req.params.id]
        );

        if (result.affectedRows === 0) {

            return res.status(404).json({
                success: false,
                error: 'User not found'
            });

        }

        console.log(`🗑 User ${req.params.id} deleted`);

        res.status(200).json({
            success: true,
            message: 'User deleted successfully'
        });

    } catch (error) {

        console.error('❌ DELETE Error:', error.message);

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});


// ================================
// HEALTH CHECK
// ================================

app.get('/health', async (req, res) => {

    try {

        await pool.query('SELECT 1');

        res.status(200).json({
            status: 'healthy',
            database: 'connected',
            timestamp: new Date().toISOString()
        });

    } catch (error) {

        res.status(503).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message
        });

    }

});


// ================================
// FRONTEND
// ================================

app.get('/', (req, res) => {

    res.sendFile(
        path.join(__dirname, 'public', 'index.html')
    );

});


// ================================
// START SERVER
// ================================

app.listen(PORT, '0.0.0.0', () => {

    console.log(`🚀 Server running on port ${PORT}`);

});
