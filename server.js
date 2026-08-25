const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const {
    body,
    validationResult,
    matchedData
} = require("express-validator");
const path = require("path");

// ================================
// ENV VALIDATION
// ================================

const REQUIRED_ENV = [
    "DB_HOST",
    "DB_PORT",
    "DB_USER",
    "DB_PASSWORD",
    "DB_NAME"
];

const missing = REQUIRED_ENV.filter(
    key => !process.env[key]
);

if (missing.length) {
    console.error(
        `❌ Missing environment variables: ${missing.join(", ")}`
    );
    process.exit(1);
}

const PORT = process.env.PORT || 3000;

// ================================
// APP
// ================================

const app = express();

// Important for Render / reverse proxy
app.set("trust proxy", 1);

// ================================
// SECURITY
// ================================

// Helmet is useful, but disable cross-origin resource restrictions
// that can interfere with API/frontend communication.

app.use(
    helmet({
        crossOriginResourcePolicy: false
    })
);

app.use(compression());

// ================================
// CORS
// ================================

const allowedOrigins = [
    "https://demoportfolio-2.onrender.com",
    "https://olio-2.onrender.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
];

app.use(
    cors({
        origin: (origin, callback) => {

            // Allow Reqable, Postman, server-to-server
            // requests and requests without an Origin header.
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            console.warn(
                `⚠️ CORS blocked origin: ${origin}`
            );

            return callback(
                new Error("Not allowed by CORS")
            );
        },

        methods: [
            "GET",
            "POST",
            "PUT",
            "DELETE",
            "OPTIONS"
        ],

        allowedHeaders: [
            "Content-Type",
            "Authorization"
        ]
    })
);

// ================================
// MIDDLEWARE
// ================================

app.use(
    express.json({
        limit: "10kb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "10kb"
    })
);

// ================================
// LOGGER
// ================================

const log = {
    info: (...args) =>
        console.log(
            `[${new Date().toISOString()}] INFO:`,
            ...args
        ),

    error: (...args) =>
        console.error(
            `[${new Date().toISOString()}] ERROR:`,
            ...args
        )
};

// ================================
// RATE LIMITING
// ================================

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        error:
            "Too many requests. Please try again later."
    }
});

app.use("/api/", limiter);

// ================================
// DATABASE
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

    enableKeepAlive: true,

    keepAliveInitialDelay: 10000,

    ssl: {
        rejectUnauthorized: false
    }
});

// ================================
// DATABASE CONNECTION TEST
// ================================

async function testDatabaseConnection() {

    try {

        const connection =
            await pool.getConnection();

        log.info(
            "✅ Database connected successfully"
        );

        connection.release();

    } catch (error) {

        log.error(
            "❌ Database connection failed:",
            error.message
        );

        // Do not immediately crash the server.
        // This allows /health to report the real issue.
    }
}

testDatabaseConnection();

// ================================
// HELPERS
// ================================

function splitName(fullName) {

    const parts =
        (fullName || "")
            .trim()
            .split(/\s+/);

    return {
        firstName:
            parts[0] || "",

        lastName:
            parts
                .slice(1)
                .join(" ") || ""
    };
}

// ================================
// VALIDATION
// ================================

const validateUser = () => [

    body("name")
        .trim()
        .notEmpty()
        .withMessage(
            'Full name is required (e.g. "John Doe")'
        )
        .isLength({
            min: 2,
            max: 255
        })
        .withMessage(
            "Name must be between 2 and 255 characters"
        )
        .matches(
            /^[a-zA-Z\s\-']+$/
        )
        .withMessage(
            "Name can only contain letters, spaces, hyphens and apostrophes"
        ),

    body("email")
        .trim()
        .notEmpty()
        .withMessage(
            "Email is required"
        )
        .isEmail()
        .withMessage(
            "Please enter a valid email address"
        )
        .normalizeEmail()
        .isLength({
            max: 255
        })
        .withMessage(
            "Email is too long"
        )
];

const handleValidation =
    (req, res, next) => {

        const errors =
            validationResult(req);

        if (!errors.isEmpty()) {

            return res.status(400).json({
                success: false,

                error:
                    "Validation failed",

                details:
                    errors
                        .array()
                        .map(
                            error =>
                                error.msg
                        )
            });
        }

        next();
    };

// ================================
// ROOT API INFORMATION
// ================================

// ================================
// FRONTEND
// ================================
// Static middleware FIRST
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================================
// HEALTH CHECK
// ================================

app.get(
    "/health",

    async (req, res) => {

        try {

            await pool.query(
                "SELECT 1"
            );

            res.status(200).json({
                status: "healthy",

                database:
                    "connected",

                timestamp:
                    new Date()
                        .toISOString()
            });

        } catch (error) {

            log.error(
                "Health check failed:",
                error.message
            );

            res.status(503).json({
                status:
                    "unhealthy",

                database:
                    "disconnected",

                error:
                    error.message
            });
        }

    }
);

// ================================
// GET ALL USERS
// ================================

app.get(
    "/api/users",

    async (req, res, next) => {

        try {

            const [rows] =
                await pool.query(
                    `
                    SELECT
                        id,
                        first_name,
                        last_name,
                        email,
                        created_at
                    FROM users
                    ORDER BY id DESC
                    `
                );

            const users =
                rows.map(
                    row => ({

                        ...row,

                        name:
                            `${row.first_name || ""}
                            ${row.last_name || ""}`
                                .trim(),

                        created_at:
                            row.created_at
                                ? new Date(
                                    row.created_at
                                ).toISOString()
                                : null
                    })
                );

            res.json({
                success: true,

                count:
                    users.length,

                users
            });

        } catch (error) {

            next(error);

        }

    }
);

// ================================
// GET SINGLE USER
// ================================

app.get(
    "/api/users/:id",

    async (req, res, next) => {

        try {

            const id =
                Number.parseInt(
                    req.params.id,
                    10
                );

            if (
                Number.isNaN(id) ||
                id <= 0
            ) {

                return res.status(400).json({
                    success: false,

                    error:
                        "Invalid user ID"
                });

            }

            const [rows] =
                await pool.execute(
                    `
                    SELECT
                        id,
                        first_name,
                        last_name,
                        email,
                        created_at
                    FROM users
                    WHERE id = ?
                    `,
                    [id]
                );

            if (
                rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,

                    error:
                        "User not found"
                });

            }

            const row =
                rows[0];

            const user = {

                ...row,

                name:
                    `${row.first_name || ""}
                    ${row.last_name || ""}`
                        .trim(),

                created_at:
                    row.created_at
                        ? new Date(
                            row.created_at
                        ).toISOString()
                        : null
            };

            res.json({
                success: true,
                user
            });

        } catch (error) {

            next(error);

        }

    }
);

// ================================
// CREATE USER
// ================================

app.post(
    "/api/users",

    validateUser(),

    handleValidation,

    async (req, res, next) => {

        try {

            const {
                name,
                email
            } =
                matchedData(req);

            const {
                firstName,
                lastName
            } =
                splitName(name);

            const [result] =
                await pool.execute(
                    `
                    INSERT INTO users
                    (
                        first_name,
                        last_name,
                        email
                    )
                    VALUES (?, ?, ?)
                    `,
                    [
                        firstName,
                        lastName,
                        email
                    ]
                );

            log.info(
                `✅ Created user: ${name} (ID: ${result.insertId})`
            );

            res.status(201).json({

                success: true,

                id:
                    result.insertId,

                message:
                    "User added successfully"
            });

        } catch (error) {

            if (
                error.code ===
                "ER_DUP_ENTRY"
            ) {

                return res.status(409).json({

                    success: false,

                    error:
                        "Email already exists"

                });

            }

            next(error);

        }

    }
);

// ================================
// UPDATE USER
// ================================

app.put(
    "/api/users/:id",

    validateUser(),

    handleValidation,

    async (req, res, next) => {

        try {

            const id =
                Number.parseInt(
                    req.params.id,
                    10
                );

            if (
                Number.isNaN(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid user ID"

                });

            }

            const {
                name,
                email
            } =
                matchedData(req);

            const {
                firstName,
                lastName
            } =
                splitName(name);

            const [result] =
                await pool.execute(
                    `
                    UPDATE users

                    SET
                        first_name = ?,
                        last_name = ?,
                        email = ?

                    WHERE id = ?
                    `,
                    [
                        firstName,
                        lastName,
                        email,
                        id
                    ]
                );

            if (
                result.affectedRows === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "User not found"

                });

            }

            log.info(
                `✅ Updated user ID: ${id}`
            );

            res.json({

                success: true,

                message:
                    "User updated successfully"

            });

        } catch (error) {

            if (
                error.code ===
                "ER_DUP_ENTRY"
            ) {

                return res.status(409).json({

                    success: false,

                    error:
                        "Email already exists"

                });

            }

            next(error);

        }

    }
);

// ================================
// DELETE USER
// ================================

app.delete(
    "/api/users/:id",

    async (req, res, next) => {

        try {

            const id =
                Number.parseInt(
                    req.params.id,
                    10
                );

            if (
                Number.isNaN(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid user ID"

                });

            }

            const [result] =
                await pool.execute(
                    `
                    DELETE FROM users
                    WHERE id = ?
                    `,
                    [id]
                );

            if (
                result.affectedRows === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "User not found"

                });

            }

            log.info(
                `🗑 Deleted user ID: ${id}`
            );

            res.json({

                success: true,

                message:
                    "User deleted successfully"

            });

        } catch (error) {

            next(error);

        }

    }
);

// ================================
// API 404 HANDLER
// ================================

app.use(
    "/api",

    (req, res) => {

        res.status(404).json({

            success: false,

            error:
                "API endpoint not found"

        });

    }
);

// ================================
// GLOBAL ERROR HANDLER
// ================================

app.use(
    (error, req, res, next) => {

        log.error(
            "Unhandled error:",
            error.stack ||
            error.message
        );

        if (
            error.message ===
            "Not allowed by CORS"
        ) {

            return res.status(403).json({

                success: false,

                error:
                    "CORS request blocked"

            });

        }

        res.status(500).json({

            success: false,

            error:
                "Internal server error"

        });

    }
);

// ================================
// START SERVER
// ================================

const server =
    app.listen(
        PORT,
        "0.0.0.0",

        () => {

            log.info(
                `🚀 UserFlow API running on port ${PORT}`
            );

        }
    );

// ================================
// GRACEFUL SHUTDOWN
// ================================

const shutdown =
    async () => {

        log.info(
            "Shutting down server..."
        );

        server.close(
            async () => {

                try {

                    await pool.end();

                    log.info(
                        "Database pool closed"
                    );

                    process.exit(0);

                } catch (error) {

                    log.error(
                        "Shutdown error:",
                        error.message
                    );

                    process.exit(1);

                }

            }
        );

        setTimeout(
            () => {

                log.error(
                    "Forced shutdown"
                );

                process.exit(1);

            },
            10000
        );

    };

process.on(
    "SIGTERM",
    shutdown
);

process.on(
    "SIGINT",
    shutdown
);
