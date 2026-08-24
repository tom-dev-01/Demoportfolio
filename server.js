const express = require('express');
const mysql = require('mysql2/promise'); // use promise version directly
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { body, validationResult, matchedData } = require('express-validator');
const path = require('path');

// ================================
//  CONFIGURATION & ENV
// ================================
const REQUIRED_ENV = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
}

const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'; // Set to your frontend URL in production

// ================================
//  EXPRESS APP
// ================================
const app = express();

// Security & performance middleware
app.use(helmet());
app.use(compression());
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '10kb' })); // limit payload size

// Rate limiting – protect against brute force
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per window
    message: { success: false, error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// ================================
//  LOGGING (simple structured)
// ================================
const log = {
    info: (...args) => console.log(`[${new Date().toISOString()}] INFO:`, ...args),
    error: (...args) => console.error(`[${new Date().toISOString()}] ERROR:`, ...args),
    warn: (...args) => console.warn(`[${new Date().toISOString()}] WARN:`, ...args),
};

// ================================
//  DATABASE POOL
// ================================
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 30000,
    ssl: { rejectUnauthorized: false },
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
});

// Test connection on startup
(async () => {
    try {
        const conn = await pool.getConnection();
        log.info('✅ Database connected successfully');
        conn.release();
    } catch (err) {
        log.error('❌ Database connection failed:', err.message);
        process.exit(1);
    }
})();

// ================================
//  HELPERS
// ================================
function splitName(fullName) {
    const parts = (fullName || '').trim().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';
    return { firstName, lastName };
}

// ================================
//  VALIDATION SCHEMAS
// ================================
const userValidationRules = () => [
    body('name')
        .trim()
        .isLength({ min: 1, max: 255 }).withMessage('Name must be between 1 and 255 characters')
        .escape(),
    body('email')
        .trim()
        .isEmail().withMessage('Must be a valid email address')
        .normalizeEmail()
        .isLength({ max: 255 }).withMessage('Email too long'),
];

// ================================
//  MIDDLEWARE: Handle validation errors
// ================================
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array().map(e => e.msg)
        });
    }
    next();
};

// ================================
//  ROUTES
// ================================

// GET all users
app.get('/api/users', async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, first_name, last_name, email FROM users ORDER BY id DESC'
        );
        const users = rows.map(row => ({
            ...row,
            name: `${row.first_name} ${row.last_name}`.trim()
        }));
        res.json({ success: true, users });
    } catch (err) {
        next(err);
    }
});

// GET single user
app.get('/api/users/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return res.status(400).json({ success: false, error: 'Invalid user ID' });
        }
        const [rows] = await pool.query(
            'SELECT id, first_name, last_name, email FROM users WHERE id = ?',
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        const user = {
            ...rows[0],
            name: `${rows[0].first_name} ${rows[0].last_name}`.trim()
        };
        res.json({ success: true, user });
    } catch (err) {
        next(err);
    }
});

// CREATE user
app.post('/api/users',
    userValidationRules(),
    validate,
    async (req, res, next) => {
        try {
            const { name, email } = matchedData(req);
            const { firstName, lastName } = splitName(name);

            const [result] = await pool.execute(
                'INSERT INTO users (first_name, last_name, email) VALUES (?, ?, ?)',
                [firstName, lastName, email]
            );

            log.info(`✅ New user created: ${name} (ID: ${result.insertId})`);
            res.status(201).json({
                success: true,
                id: result.insertId,
                message: 'User added successfully'
            });
        } catch (err) {
            // Duplicate email
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ success: false, error: 'Email already exists' });
            }
            next(err);
        }
    }
);

// UPDATE user
app.put('/api/users/:id',
    userValidationRules(),
    validate,
    async (req, res, next) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                return res.status(400).json({ success: false, error: 'Invalid user ID' });
            }

            const { name, email } = matchedData(req);
            const { firstName, lastName } = splitName(name);

            const [result] = await pool.execute(
                'UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = ?',
                [firstName, lastName, email, id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            log.info(`✅ User ${id} updated`);
            res.json({ success: true, message: 'User updated successfully' });
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ success: false, error: 'Email already exists' });
            }
            next(err);
        }
    }
);

// DELETE user
app.delete('/api/users/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return res.status(400).json({ success: false, error: 'Invalid user ID' });
        }

        const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        log.info(`🗑 User ${id} deleted`);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (err) {
        next(err);
    }
});

// HEALTH check
app.get('/health', async (req, res, next) => {
    try {
        await pool.query('SELECT 1');
        res.json({
            status: 'healthy',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(503).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: err.message
        });
    }
});

// ================================
//  CENTRAL ERROR HANDLER
// ================================
app.use((err, req, res, next) => {
    log.error('Unhandled error:', err.stack || err.message);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// ================================
//  FRONTEND FALLBACK
// ================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================================
//  START SERVER + GRACEFUL SHUTDOWN
// ================================
const server = app.listen(PORT, '0.0.0.0', () => {
    log.info(`🚀 Server running on port ${PORT}`);
});

// Graceful shutdown
const shutdown = async () => {
    log.warn('Received shutdown signal, closing gracefully...');
    server.close(async () => {
        log.warn('HTTP server closed.');
        try {
            await pool.end();
            log.warn('Database pool closed.');
        } catch (err) {
            log.error('Error closing database pool:', err.message);
        }
        process.exit(0);
    });
    // Force exit after 10 seconds if not closed
    setTimeout(() => {
        log.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
