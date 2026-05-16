// 1. IMPORTS (The equivalent of #include in C++ or 'use' in Rust)
// 'require' is how Node.js pulls in external libraries from your node_modules folder.
const express = require('express');
const sqlite3 = require('sqlite3').verbose(); // verbose() gives us detailed error stack traces
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 2. INITIALIZATION
// This creates our application instance. Think of this like initializing your Axum router in Rust.
const app = express();
const PORT = 3000; // The port our server will listen on
// In production, this lives in a .env file. We hardcode it here for development.
const JWT_SECRET = 'sportsgram_super_secret_key_2026';

// 3. MIDDLEWARE
// Middleware are functions that intercept incoming HTTP requests before they hit your routes.
// cors() allows your React frontend (which will run on a different port) to talk to this backend without security blocks.
app.use(cors()); 
// express.json() parses incoming JSON payloads (like when we POST new data). 
// Without this, the body of an incoming request would just be raw bytes.
app.use(express.json());

// 4. DATABASE CONNECTION
// We are creating a connection pool to a local SQLite file. 
// If 'sportsgram.sqlite' doesn't exist, SQLite will create it automatically.
const db = new sqlite3.Database('./sportsgram.sqlite', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        // TABLE CREATION - UPGRADED WITH TOKEN DEFENSE
        // Once connected, we execute a SQL command to ensure our schema exists.
        // Added the 'url' column as UNIQUE to prevent duplicate AI processing.
        db.run(`
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sport_category TEXT,
                headline TEXT,
                content TEXT,
                excitement_level INTEGER,
                url TEXT UNIQUE,
                likes INTEGER DEFAULT 0, 
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('Error creating table:', err.message);
            else console.log('Posts table ready.');
        });

        // Create the users table for authentication. This will store usernames and hashed passwords.
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('Error creating users table:', err.message);
            else console.log('Users table ready.');
        });
    }
});

// 5. AUTHENTICATION ROUTES 

// Route A: Registration
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    // Basic validation: Check if the username and password are provided and meet criteria.
    if (!username || !password || password.length < 6) {
        return res.status(400).json({ error: 'Username and a 6+ char password are required' });
    }

    try {
        // We "salt" and hash the password. The '10' is the cost factor (how many rounds of hashing).
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert the user into the database with the scrambled password
        db.run(`INSERT INTO users (username, password_hash) VALUES (?, ?)`, [username, hashedPassword], function(err) {
            if (err) {
                // SQLite error code 19 usually means UNIQUE constraint failed (username taken)
                if (err.message.includes('UNIQUE')) {
                    return res.status(409).json({ error: 'Username already exists' });
                }
                return res.status(500).json({ error: 'Database error during registration' });
            }
            res.status(201).json({ message: 'User created successfully', userId: this.lastID });
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error during hashing' });
    }
});

// Route B: Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    // First, find the user in the database
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        // If no user is found with that username, we return a 401 Unauthorized. 
        // We don't specify whether it was the username or password that was wrong to avoid giving hints to attackers.
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' }); // We keep errors vague for security
        }

        // Use bcrypt to check if the typed password matches the stored hash
        const isMatch = await bcrypt.compare(password, user.password_hash);
        
        // If it doesn't match, we return the same 401 Unauthorized error. Again, we don't specify which part was wrong.
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // If it matches, generate a JWT token. This token proves the user is logged in.
        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });

        // Send the token back to the frontend
        res.status(200).json({ 
            message: 'Login successful', 
            token: token,
            username: user.username 
        });
    });
});

// 6. ROUTING (The API Endpoints)
// When a client visits http://localhost:3000/api/health it fires this callback function. 
// 'req' is the incoming request, 'res' is the outgoing response.
app.get('/api/health', (req, res) => {
    // We send back a standard HTTP 200 OK status with a JSON payload.
    res.status(200).json({ status: 'Online', message: 'Sportsgram API is running' });
});

// THE DEDUPLICATION CHECKER ROUTE (The Gatekeeper)
// The scraper hits this route first to see if a URL already exists in the database.
app.post('/api/posts/check', (req, res) => {
    const { url } = req.body;
    // We query the database to see if any post already has this URL. If it does, we return { exists: true }.
    // {exists:!!row} is a common JavaScript trick to convert a row object into a boolean (true if it exists, false if null).
    db.get(`SELECT id FROM posts WHERE url = ?`, [url], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ exists: !!row }); // Returns true if the URL is already in the DB
    });
});

// 8. CREATING DATA (The POST Route - the 'write' operation)
// Big Picture: The post route is where the scraper or AI agent will send new sports news to be saved in the database.
// When your scraper grabs a new article from the web and Gemini formats it, the scraper needs a way to hand that 
// data over to the database. It packages the data into a JSON payload and sends it via a POST request.
app.post('/api/posts', (req, res) => {
    const { sport_category, headline, content, excitement_level, url } = req.body;

    // Basic validation: Check if the request is missing any data.
    if (!sport_category || !headline || !content || !excitement_level || !url) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // The question marks are placeholders for parameterized queries. They help prevent SQL injection attacks by treating the 
    // values as data rather than executable code. When we call db.run, we pass an array of values that correspond to each question
    // mark in the SQL string. The database engine safely substitutes these values into the query, ensuring that any malicious input 
    // is not executed as part of the SQL command.
    const sql = `INSERT INTO posts (sport_category, headline, content, excitement_level, url) 
                 VALUES (?, ?, ?, ?, ?)`;

    db.run(sql, [sport_category, headline, content, excitement_level, url], function(err) {
        if (err) {
            console.error("Error inserting data:", err.message);
            return res.status(500).json({ error: 'Failed to save post to database' });
        }
        res.status(201).json({ message: 'Sportsgram post created successfully!', postId: this.lastID });
    });
});

// 9. READING DATA (The GET Route - 'read operation')
// Big Picture: When a user opens Sportsgram on their phone or laptop, the UI is completely empty. 
// The frontend immediately fires off a GET request to your server asking for the latest data to display.
// 9. READING DATA (Upgraded with Phase 2 Pagination)
app.get('/api/posts', (req, res) => {
    // Extract query parameters with fallbacks (default to page 1, limit 5)
    // We use a small limit of 5 so you can easily test the "Load More" button!
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    
    // 2. Calculate the offset (e.g., if page 2 and limit 5, skip the first 5 records)
    const offset = (page - 1) * limit;

    // 3. Inject LIMIT and OFFSET into the SQL query
    const sql = `SELECT * FROM posts ORDER BY timestamp DESC LIMIT ? OFFSET ?`;

    db.all(sql, [limit, offset], (err, rows) => {
        if (err) {
            console.error("Error fetching data:", err.message);
            return res.status(500).json({ error: 'Failed to retrieve feed' });
        }
        res.status(200).json(rows);
    });
});

// 10. UPDATING DATA (The PUT Route - the 'update' operation)
// This listens for requests to /api/posts/1/like, /api/posts/2/like, etc.
app.put('/api/posts/:id/like', (req, res) => {
    const postId = req.params.id; // Grab the ID from the URL

    // We use a SQL UPDATE command to increment the current like count by 1
    const sql = `UPDATE posts SET likes = likes + 1 WHERE id = ?`;

    db.run(sql, [postId], function(err) {
        if (err) {
            console.error("Error updating likes:", err.message);
            return res.status(500).json({ error: 'Failed to add like' });
        }
        
        // 'this.changes' tells us how many rows were affected. If 0, the post doesn't exist.
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }

        res.status(200).json({ message: 'Like added successfully!' });
    });
});

// 11. SERVER BINDING
// Finally, we tell the Express app to bind to the port and start listening for traffic.
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});