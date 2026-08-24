const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { body, validationResult, matchedData } = require('express-validator');
const path = require('path');

// ================================
//  ENV VALIDATION
// ================================
const REQUIRED_ENV = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length) {
    console.error(`❌ Missing env: ${missing.join(', ')}`);
    process.exit(1);
}

const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// ================================
//  APP
// ================================
const app = express();
app.use(helmet());
app.use(compression());
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// ================================
//  LOGGER
// ================================
const log = {
    info: (...args) => console.log(`[${new Date().toISOString()}] INFO:`, ...args),
    error: (...args) => console.error(`[${new Date().toISOString()}] ERROR:`, ...args),
};

// ================================
//  DATABASE
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

(async () => {
    try {
        const conn = await pool.getConnection();
        log.info('✅ Database connected');
        conn.release();
    } catch (err) {
        log.error('❌ DB connection failed:', err.message);
        process.exit(1);
    }
})();

// ================================
//  HELPERS
// ================================
function splitName(fullName) {
    const parts = (fullName || '').trim().split(/\s+/);
    return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '' };
}

// ================================
//  VALIDATION
// ================================
const validateUser = () => [
    body('name').trim().isLength({ min: 1, max: 255 }).escape(),
    body('email').trim().isEmail().normalizeEmail().isLength({ max: 255 }),
];

const handleValidation = (req, res, next) => {
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

// GET all users (includes created_at for "Last added" stat)
app.get('/api/users', async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, first_name, last_name, email, created_at FROM users ORDER BY id DESC'
        );
        const users = rows.map(row => ({
            ...row,
            name: `${row.first_name} ${row.last_name}`.trim(),
            created_at: row.created_at ? new Date(row.created_at).toISOString() : null
        }));
        res.json({ success: true, users });
    } catch (err) { next(err); }
});

// GET single user
app.get('/api/users/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });

        const [rows] = await pool.query(
            'SELECT id, first_name, last_name, email, created_at FROM users WHERE id = ?',
            [id]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });

        const user = {
            ...rows[0],
            name: `${rows[0].first_name} ${rows[0].last_name}`.trim(),
            created_at: rows[0].created_at ? new Date(rows[0].created_at).toISOString() : null
        };
        res.json({ success: true, user });
    } catch (err) { next(err); }
});

// CREATE user
app.post('/api/users', validateUser(), handleValidation, async (req, res, next) => {
    try {
        const { name, email } = matchedData(req);
        const { firstName, lastName } = splitName(name);

        const [result] = await pool.execute(
            'INSERT INTO users (first_name, last_name, email) VALUES (?, ?, ?)',
            [firstName, lastName, email]
        );
        log.info(`✅ Created user: ${name} (ID: ${result.insertId})`);
        res.status(201).json({ success: true, id: result.insertId, message: 'User added successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, error: 'Email already exists' });
        }
        next(err);
    }
});

// UPDATE user
app.put('/api/users/:id', validateUser(), handleValidation, async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });

        const { name, email } = matchedData(req);
        const { firstName, lastName } = splitName(name);

        const [result] = await pool.execute(
            'UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = ?',
            [firstName, lastName, email, id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ success: false, error: 'User not found' });

        log.info(`✅ Updated user ${id}`);
        res.json({ success: true, message: 'User updated successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, error: 'Email already exists' });
        }
        next(err);
    }
});

// DELETE user
app.delete('/api/users/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });

        const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, error: 'User not found' });

        log.info(`🗑 Deleted user ${id}`);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (err) { next(err); }
});

// HEALTH
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'healthy', database: 'connected', timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(503).json({ status: 'unhealthy', database: 'disconnected', error: err.message });
    }
});

// ERROR HANDLER
app.use((err, req, res, next) => {
    log.error('Unhandled:', err.stack || err.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

// FRONTEND FALLBACK
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// START
const server = app.listen(PORT, '0.0.0.0', () => log.info(`🚀 Server on port ${PORT}`));

// GRACEFUL SHUTDOWN
const shutdown = async () => {
    log.info('Shutting down gracefully...');
    server.close(async () => {
        await pool.end();
        process.exit(0);
    });
    setTimeout(() => { process.exit(1); }, 10000);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
