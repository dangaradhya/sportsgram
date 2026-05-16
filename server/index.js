// 1. IMPORTS (The equivalent of #include in C++ or 'use' in Rust)
// 'require' is how Node.js pulls in external libraries from your node_modules folder.
const express = require('express');
const sqlite3 = require('sqlite3').verbose(); // verbose() gives us detailed error stack traces
const cors = require('cors');

// 2. INITIALIZATION
// This creates our application instance. Think of this like initializing your Axum router in Rust.
const app = express();
const PORT = 3000; // The port our server will listen on

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
        
        // 5. TABLE CREATION - UPGRADED WITH TOKEN DEFENSE
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
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('Error creating table:', err.message);
            else console.log('Posts table ready.');
        });
    }
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
app.get('/api/posts', (req, res) => {
    // We write a SQL query to get everything, ordering by newest first.
    const sql = `SELECT * FROM posts ORDER BY timestamp DESC LIMIT 50`;

    // db.all is used when we expect multiple rows to be returned.
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error("Error fetching data:", err.message);
            return res.status(500).json({ error: 'Failed to retrieve feed' });
        }
        
        // We send the array of database rows back to the frontend as a clean JSON array.
        res.status(200).json(rows);
    });
});

// 7. SERVER BINDING
// Finally, we tell the Express app to bind to the port and start listening for traffic.
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});