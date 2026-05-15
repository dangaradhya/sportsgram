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
        
        // 5. TABLE CREATION
        // Once connected, we execute a SQL command to ensure our schema exists.
        // This is a raw SQL string, very similar to how you use sqlx in Rust, just without the compile-time checks.
        db.run(`
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sport_category TEXT,
                headline TEXT,
                content TEXT,
                excitement_level INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('Error creating table:', err.message);
            else console.log('Posts table ready.');
        });
    }
});

// 6. ROUTING (The API Endpoints)
// This is a GET route. When a client visits http://localhost:3000/api/health
// it fires this callback function. 'req' is the incoming request, 'res' is the outgoing response.
// The GET route will send back a JSON object with a status and message to indicate that the API is running.
// The status is a standard HTTP status code, and the message is just a custom string we defined.
app.get('/api/health', (req, res) => {
    // We send back a standard HTTP 200 OK status with a JSON payload.
    res.status(200).json({ status: 'Online', message: 'Sportsgram API is running' });
});

// 7. SERVER BINDING
// Finally, we tell the Express app to bind to the port and start listening for traffic.
// This is identical to tokio::net::TcpListener::bind in your Rust backend.
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});