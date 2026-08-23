const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

console.log('🚀 Starting server...');
console.log('📡 Environment:', {
    DB_HOST: process.env.DB_HOST ? '✓ Set' : '✗ Missing',
    DB_PORT: process.env.DB_PORT ? '✓ Set' : '✗ Missing',
    DB_USER: process.env.DB_USER ? '✓ Set' : '✗ Missing',
    DB_NAME: process.env.DB_NAME ? '✓ Set' : '✗ Missing',
    DB_PASSWORD: process.env.DB_PASSWORD ? '✓ Set' : '✗ Missing'
});

// Database connection with explicit timeout
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'mysql-121dc750-thomasomollo01-5781.l.aivencloud.com',
    port: parseInt(process.env.DB_PORT) || 24024,
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'defaultdb',
    connectionLimit: 5,
    connectTimeout: 30000,  // 30 seconds timeout
    waitForConnections: true,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false
    }
}).promise();

// Test connection immediately
(async function testConnection() {
    try {
        const conn = await pool.getConnection();
        console.log('✅ Connected to Aiven MySQL!');
        conn.release();
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        console.error('⚠️ Error code:', err.code);
        console.error('⚠️ Error errno:', err.errno);
    }
})();

// Routes
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Server is running!',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString() 
    });
});

app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT 1 as test');
        res.json({ users: rows });
    } catch (err) {
        console.error('Query Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
});
