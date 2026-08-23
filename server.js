const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

console.log('🔧 Starting server...');

// AIVEN MYSQL CONFIGURATION
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: true
    }
}).promise();

// Test database connection
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database Error:', err.message);
        console.error('📌 Check your Aiven credentials');
        process.exit(1);
    }
    console.log('✅ Connected to Aiven MySQL!');
    connection.release();
});

// GET all users
app.get('/api/users', (req, res) => {
    pool.query('SELECT * FROM users ORDER BY id DESC', (err, results) => {
        if (err) {
            console.error('❌ Query Error:', err.message);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(results);
    });
});

// GET single user by ID
app.get('/api/users/:id', (req, res) => {
    const { id } = req.params;
    pool.query('SELECT * FROM users WHERE id = ?', [id], (err, results) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (results.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json(results[0]);
    });
});

// POST - Add new user
app.post('/api/users', (req, res) => {
    const { name, email } = req.body;
    console.log('📝 Adding user:', { name, email });
    
    if (!name || !email) {
        res.status(400).json({ error: 'Name and email are required' });
        return;
    }
    
    pool.query(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        [name, email],
        (err, result) => {
            if (err) {
                console.error('❌ Insert Error:', err.message);
                if (err.code === 'ER_DUP_ENTRY') {
                    res.status(400).json({ error: 'Email already exists' });
                } else {
                    res.status(500).json({ error: err.message });
                }
                return;
            }
            res.json({ 
                id: result.insertId, 
                name, 
                email,
                message: 'User added successfully!'
            });
        }
    );
});

// PUT - Update user
app.put('/api/users/:id', (req, res) => {
    const { id } = req.params;
    const { name, email } = req.body;
    
    if (!name || !email) {
        res.status(400).json({ error: 'Name and email are required' });
        return;
    }
    
    pool.query(
        'UPDATE users SET name = ?, email = ? WHERE id = ?',
        [name, email, id],
        (err, result) => {
            if (err) {
                console.error('❌ Update Error:', err.message);
                if (err.code === 'ER_DUP_ENTRY') {
                    res.status(400).json({ error: 'Email already exists' });
                } else {
                    res.status(500).json({ error: err.message });
                }
                return;
            }
            if (result.affectedRows === 0) {
                res.status(404).json({ error: 'User not found' });
                return;
            }
            res.json({ 
                id: parseInt(id), 
                name, 
                email,
                message: 'User updated successfully!'
            });
        }
    );
});

// DELETE - Remove user
app.delete('/api/users/:id', (req, res) => {
    const { id } = req.params;
    console.log('🗑️ Deleting user ID:', id);
    
    pool.query('DELETE FROM users WHERE id = ?', [id], (err, result) => {
        if (err) {
            console.error('❌ Delete Error:', err.message);
            res.status(500).json({ error: err.message });
            return;
        }
        if (result.affectedRows === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({ 
            message: 'User deleted successfully!',
            id: parseInt(id)
        });
    });
});

// SEARCH users
app.get('/api/search', (req, res) => {
    const { q } = req.query;
    if (!q) {
        res.status(400).json({ error: 'Search query required' });
        return;
    }
    
    pool.query(
        'SELECT * FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY id DESC',
        [`%${q}%`, `%${q}%`],
        (err, results) => {
            if (err) {
                console.error('❌ Search Error:', err.message);
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(results);
        }
    );
});

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ SERVER RUNNING!`);
    console.log(`📱 Port: ${PORT}`);
    console.log(`📡 http://localhost:${PORT}/api/users`);
    console.log(`🔍 http://localhost:${PORT}/api/search?q=demo`);
    console.log(`\n🔄 Database: Aiven MySQL\n`);
});
