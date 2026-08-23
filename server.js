const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;

/* ================================
   MIDDLEWARE
================================ */

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================================
   DATABASE CONFIGURATION
================================ */

console.log('🚀 Starting server...');

console.log('Database Host:', process.env.DB_HOST || 'Using fallback host');
console.log('Database Name:', process.env.DB_NAME || 'defaultdb');
console.log('Database User:', process.env.DB_USER || 'avnadmin');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 24024),
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

/* ================================
   DATABASE CONNECTION TEST
================================ */

async function testDatabaseConnection() {
    try {
        const connection = await pool.getConnection();

        console.log('=================================');
        console.log('✅ Connected to Aiven MySQL!');
        console.log('=================================');

        connection.release();

    } catch (error) {

        console.error('=================================');
        console.error('❌ DATABASE CONNECTION FAILED');
        console.error('=================================');

        console.error(error.message);
    }
}

testDatabaseConnection();

/* ================================
   ROUTES
================================ */

/* HOME */

app.get('/', (req, res) => {

    res.json({
        message: 'User Management API is running',
        endpoints: {
            health: '/health',
            users: '/api/users'
        }
    });

});


/* HEALTH CHECK */

app.get('/health', async (req, res) => {

    try {

        await pool.query('SELECT 1');

        res.status(200).json({
            status: 'ok',
            database: 'connected',
            timestamp: new Date().toISOString()
        });

    } catch (error) {

        res.status(500).json({
            status: 'error',
            database: 'disconnected',
            error: error.message
        });

    }

});


/* ================================
   GET ALL USERS
================================ */

app.get('/api/users', async (req, res) => {

    try {

        const [rows] = await pool.query(
            'SELECT id, name, email FROM users ORDER BY id DESC'
        );

        res.status(200).json({
            success: true,
            users: rows
        });

    } catch (error) {

        console.error('GET USERS ERROR:', error);

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});


/* ================================
   GET SINGLE USER
================================ */

app.get('/api/users/:id', async (req, res) => {

    try {

        const id = Number(req.params.id);

        if (!id) {

            return res.status(400).json({
                success: false,
                error: 'Invalid user ID'
            });

        }

        const [rows] = await pool.query(
            'SELECT id, name, email FROM users WHERE id = ?',
            [id]
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

        console.error('GET USER ERROR:', error);

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});


/* ================================
   CREATE USER
================================ */

app.post('/api/users', async (req, res) => {

    try {

        console.log('POST REQUEST BODY:', req.body);

        const name = req.body.name?.trim();
        const email = req.body.email?.trim().toLowerCase();


        /* VALIDATION */

        if (!name || !email) {

            return res.status(400).json({
                success: false,
                error: 'Name and email are required'
            });

        }


        /* EMAIL VALIDATION */

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(email)) {

            return res.status(400).json({
                success: false,
                error: 'Please enter a valid email address'
            });

        }


        /* INSERT */

        const [result] = await pool.execute(
            'INSERT INTO users (name, email) VALUES (?, ?)',
            [name, email]
        );


        console.log('✅ USER CREATED:', result.insertId);


        res.status(201).json({

            success: true,

            id: result.insertId,

            message: 'User added successfully'

        });

    } catch (error) {

        console.error('=================================');
        console.error('INSERT USER ERROR');
        console.error('=================================');

        console.error(error);


        if (error.code === 'ER_DUP_ENTRY') {

            return res.status(409).json({
                success: false,
                error: 'This email already exists'
            });

        }


        res.status(500).json({

            success: false,

            error: error.message

        });

    }

});


/* ================================
   UPDATE USER
================================ */

app.put('/api/users/:id', async (req, res) => {

    try {

        const id = Number(req.params.id);

        const name = req.body.name?.trim();
        const email = req.body.email?.trim().toLowerCase();


        if (!id) {

            return res.status(400).json({
                success: false,
                error: 'Invalid user ID'
            });

        }


        if (!name || !email) {

            return res.status(400).json({
                success: false,
                error: 'Name and email are required'
            });

        }


        const [result] = await pool.execute(
            `
            UPDATE users
            SET name = ?, email = ?
            WHERE id = ?
            `,
            [name, email, id]
        );


        if (result.affectedRows === 0) {

            return res.status(404).json({
                success: false,
                error: 'User not found'
            });

        }


        res.status(200).json({

            success: true,

            message: 'User updated successfully'

        });

    } catch (error) {

        console.error('UPDATE USER ERROR:', error);


        if (error.code === 'ER_DUP_ENTRY') {

            return res.status(409).json({
                success: false,
                error: 'This email already exists'
            });

        }


        res.status(500).json({

            success: false,

            error: error.message

        });

    }

});


/* ================================
   DELETE USER
================================ */

app.delete('/api/users/:id', async (req, res) => {

    try {

        const id = Number(req.params.id);


        if (!id) {

            return res.status(400).json({
                success: false,
                error: 'Invalid user ID'
            });

        }


        const [result] = await pool.execute(
            'DELETE FROM users WHERE id = ?',
            [id]
        );


        if (result.affectedRows === 0) {

            return res.status(404).json({
                success: false,
                error: 'User not found'
            });

        }


        res.status(200).json({

            success: true,

            message: 'User deleted successfully'

        });

    } catch (error) {

        console.error('DELETE USER ERROR:', error);


        res.status(500).json({

            success: false,

            error: error.message

        });

    }

});


/* ================================
   404 HANDLER
================================ */

app.use((req, res) => {

    res.status(404).json({
        success: false,
        error: 'Route not found'
    });

});


/* ================================
   START SERVER
================================ */

app.listen(PORT, '0.0.0.0', () => {

    console.log('=================================');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('=================================');

});
