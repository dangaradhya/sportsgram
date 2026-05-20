// 1. IMPORTS (The equivalent of #include in C++ or 'use' in Rust)
// 'require' is how Node.js pulls in external libraries from your node_modules folder.
require('dotenv').config(); // Loads your GOOGLE_CLIENT_ID from the .env file
const express = require('express');
const sqlite3 = require('sqlite3').verbose(); // verbose() gives us detailed error stack traces
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

// 2. INITIALIZATION
// This creates our application instance. Think of this like initializing your Axum router in Rust.
const app = express();
const PORT = 3000; // The port our server will listen on
// In production, this lives in a .env file. We hardcode it here for development.
const JWT_SECRET = 'glide_super_secret_key_2026';

// For Google Sign-In, we need to set up the OAuth2 client with our Google Client ID.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// 3. MIDDLEWARE
// Middleware are functions that intercept incoming HTTP requests before they hit your routes.
// cors() allows your React frontend (which will run on a different port) to talk to this backend without security blocks.
app.use(cors()); 
// express.json() parses incoming JSON payloads (like when we POST new data). 
// Without this, the body of an incoming request would just be raw bytes.
app.use(express.json());

// --- THE AUTHENTICATION BOUNCER ---
// This middleware function checks the headers of incoming requests. 
// If the user doesn't have a valid JWT token, it blocks them from liking/sharing.
const authenticateToken = (req, res, next) => {

    // Get the Authorization header from the incoming request. This is where the frontend should send the JWT token after logging in.
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN_STRING"

    // If there's no token, we return a 401 Unauthorized status with a message. This means the user needs to log in first.
    if (!token) return res.status(401).json({ error: 'Access denied. Please log in.' });

    // In case the user has a token
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
        req.user = user; // Attach the verified user data (like user.id) to the request
        next(); // Let them through to the actual route
    });
};

// 4. DATABASE CONNECTION
// We are creating a connection pool to a local SQLite file. 
// If 'glide.sqlite' doesn't exist, SQLite will create it automatically.
const db = new sqlite3.Database('./glide.sqlite', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        // TABLE 1: Posts (Articles)
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
                image_url TEXT,
                likes INTEGER DEFAULT 0, 
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('Error creating table:', err.message);
            else console.log('Posts table ready.');
        });

        // Table 2: Users (Authentication - upgraded for Google OAuth)
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                google_id TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                name TEXT,
                picture TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('Error creating users table:', err.message);
            else console.log('Users table ready.');
        });

        // TABLE 3: Reels (Videos)
        db.run(`
            CREATE TABLE IF NOT EXISTS reels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT UNIQUE NOT NULL, 
                title TEXT,
                channel_name TEXT,
                likes INTEGER DEFAULT 0,
                shares INTEGER DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('Error creating reels table:', err.message);
            else console.log('Reels table ready.');
        });

        // THE JUNCTION TABLES (Guaranteeing 1 like per user)
        db.run(`CREATE TABLE IF NOT EXISTS post_likes (
            post_id INTEGER,
            user_id INTEGER,
            PRIMARY KEY (post_id, user_id)
            )
        `, (err) => {
            if (err) console.error('Error creating post_likes table:', err.message);
            else console.log('post_likes table ready.');
        });

        db.run(`CREATE TABLE IF NOT EXISTS reel_likes (
            reel_id INTEGER,
            user_id INTEGER,
            PRIMARY KEY (reel_id, user_id)
            )
        `, (err) => {
            if (err) console.error('Error creating reel_likes table:', err.message);
            else console.log('reel_likes table ready.');

        });
    }
});

// 5. GOOGLE AUTHENTICATION ROUTE
// Big Picture: This is the route that handles Google Sign-In. When a user clicks "Sign in with Google" on the frontend, 
// it sends the Google ID token to this endpoint. We verify the token with Google's servers, extract the user's info, and 
// then either create a new user in our database or find the existing one. Finally, we generate a JWT token for our app and 
// send it back to the frontend so they can authenticate future requests.
app.post('/api/auth/google', async (req, res) => {
    // The frontend should send a JSON payload with the Google ID token they received after the user signed in with Google.
    const { token } = req.body;

    try {
        // Ask Google to verify the token sent from the frontend
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID, 
        });
        
        // Extract the user's data from the verified payload
        const payload = ticket.getPayload();
        const { sub: google_id, email, name, picture } = payload;

        // Check if this Google user already exists in our database by looking up their google_id.
        db.get(`SELECT id FROM users WHERE google_id = ?`, [google_id], (err, user) => {
            if (err) return res.status(500).json({ error: 'Database error' });

            if (user) {
                // User exists, generate Glide JWT and log them in
                const glideToken = jwt.sign({ userId: user.id, email: email }, JWT_SECRET, { expiresIn: '90d' });
                return res.status(200).json({ token: glideToken, user: { id: user.id, name, picture } });
            } else {
                // New user! Save them to the database first
                db.run(`INSERT INTO users (google_id, email, name, picture) VALUES (?, ?, ?, ?)`, 
                [google_id, email, name, picture], function(insertErr) {
                    if (insertErr) return res.status(500).json({ error: 'Failed to create user' });
                    
                    // After inserting, 'this.lastID' gives us the ID of the newly created user. We use that to generate the JWT token.
                    const glideToken = jwt.sign({ userId: this.lastID, email: email }, JWT_SECRET, { expiresIn: '90d' });
                    res.status(201).json({ token: glideToken, user: { id: this.lastID, name, picture } });
                });
            }
        });
    } catch (error) {
        console.error("Google Auth Error:", error);
        res.status(401).json({ error: 'Invalid Google token' });
    }
});

// 6. ROUTING (The API Endpoints)
// When a client visits http://localhost:3000/api/health it fires this callback function. 
// 'req' is the incoming request, 'res' is the outgoing response.
app.get('/api/health', (req, res) => {
    // We send back a standard HTTP 200 OK status with a JSON payload.
    res.status(200).json({ status: 'Online', message: 'Glide API is running' });
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
    const { sport_category, headline, content, excitement_level, url, image_url } = req.body;

    // Basic validation: Check if the request is missing any data.
    if (!sport_category || !headline || !content || !excitement_level || !url) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // The question marks are placeholders for parameterized queries. They help prevent SQL injection attacks by treating the 
    // values as data rather than executable code. When we call db.run, we pass an array of values that correspond to each question
    // mark in the SQL string. The database engine safely substitutes these values into the query, ensuring that any malicious input 
    // is not executed as part of the SQL command.
    const sql = `INSERT INTO posts (sport_category, headline, content, excitement_level, url, image_url) 
                 VALUES (?, ?, ?, ?, ?, ?)`;

    db.run(sql, [sport_category, headline, content, excitement_level, url, image_url], function(err) {
        if (err) {
            console.error("Error inserting data:", err.message);
            return res.status(500).json({ error: 'Failed to save post to database' });
        }
        res.status(201).json({ message: 'Glide post created successfully!', postId: this.lastID });
    });
});

// 9. READING DATA (The GET Route - 'read operation')
// Big Picture: When a user opens Glide on their phone or laptop, the UI is completely empty. 
// The frontend immediately fires off a GET request to your server asking for the latest data to display.
app.get('/api/posts', (req, res) => {
    // Extract query parameters with fallbacks (default to page 1, limit 5)
    // We use a small limit of 5 so you can easily test the "Load More" button!
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    
    // Calculate the offset (e.g., if page 2 and limit 5, skip the first 5 records)
    const offset = (page - 1) * limit;

    // Authentication Check - We check if the frontend sent a token. If they did, 
    // we figure out who they are. This allows us to personalize the feed in the future 
    // (e.g., show which posts they've liked).
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    let userId = null;

    // If there's a token, we try to verify it. If it's valid, we extract the user ID from the token's payload.
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            userId = decoded.userId;
        } catch (err) {
            // Ignore expired tokens on the GET request; just treat them as a logged-out guest
        }
    }

    // Dynamic SQL based on Auth Status
    // If we have a userId, we ask SQLite to check the post_likes junction table for a match.
    // This way, each post in the feed will come back with an extra field 'userLiked' that is true if this user has liked it, and false otherwise.
    const sql = userId 
        ? `SELECT posts.*, EXISTS(SELECT 1 FROM post_likes WHERE post_id = posts.id AND user_id = ?) AS userLiked 
           FROM posts ORDER BY timestamp DESC LIMIT ? OFFSET ?`
        : `SELECT posts.*, 0 AS userLiked 
           FROM posts ORDER BY timestamp DESC LIMIT ? OFFSET ?`;

    // The parameters we pass to the database depend on whether we have a userId or not. 
    // If we do, we need to include it for the subquery that checks if the user liked each post.
    const params = userId ? [userId, limit, offset] : [limit, offset];

    // Finally, we execute the query. If there's an error, we log it and return a 500 status. 
    // If it's successful, we return the rows of posts as JSON.
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error("Error fetching data:", err.message);
            return res.status(500).json({ error: 'Failed to retrieve feed' });
        }

        // SQLite returns 1 for true and 0 for false. We map it to standard strict booleans for React.
        // We take each row of the result and create a new object that has all the same fields (...row) but overrides 'userLiked' to be a boolean.
        const formattedRows = rows.map(row => ({
            ...row,
            userLiked: row.userLiked === 1
        }));

        res.status(200).json(formattedRows);                                55
    });
});

// 10. SOCIAL INTERACTION ROUTES (Protected by authenticateToken)
// Upgraded Like system to use Junction Tables, securing routes with JWT.

// Toggle Like on a Post
// This route allows a logged-in user to like or unlike a post. It checks if the user has already liked the post by 
// looking up the junction table (post_likes).
app.post('/api/posts/:id/like', authenticateToken, (req, res) => {
    // We extract the post ID from the URL parameters and the user ID from the authenticated JWT token.
    const postId = req.params.id;
    const userId = req.user.userId; 

    // Check if the user already liked this post
    db.get(`SELECT * FROM post_likes WHERE post_id = ? AND user_id = ?`, [postId, userId], (err, row) => {
        // If there's an error with the database query, we return a 500 status with an error message.
        // If the query runs successfully, we check if 'row' exists. If it does, that means the user has already liked the post.
        if (row) {
            // They already liked it. We DELETE the record and decrement the main counter (Unlike)
            db.run(`DELETE FROM post_likes WHERE post_id = ? AND user_id = ?`, [postId, userId], () => {
                db.run(`UPDATE posts SET likes = likes - 1 WHERE id = ?`, [postId]);
                res.json({ liked: false });
            });
        } else {
            // They haven't liked it. INSERT a record and increment the main counter (Like)
            db.run(`INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)`, [postId, userId], () => {
                db.run(`UPDATE posts SET likes = likes + 1 WHERE id = ?`, [postId]);
                res.json({ liked: true });
            });
        }
    });
});

// Toggle Like on a Reel
// This route is essentially the same logic as the post like route, but it operates on reels and uses the reel_likes junction table.
app.post('/api/reels/:id/like', authenticateToken, (req, res) => {
    // We extract the reel ID from the URL parameters and the user ID from the authenticated JWT token, just like with posts.
    const reelId = req.params.id;
    const userId = req.user.userId;

    // We check if the user has already liked this reel by querying the reel_likes junction table. If a record exists, they have liked it.
    db.get(`SELECT * FROM reel_likes WHERE reel_id = ? AND user_id = ?`, [reelId, userId], (err, row) => {
        if (row) {
            // They already liked it. We DELETE the record from the junction table and decrement the likes counter in the reels table (Unlike).
            db.run(`DELETE FROM reel_likes WHERE reel_id = ? AND user_id = ?`, [reelId, userId], () => {
                db.run(`UPDATE reels SET likes = likes - 1 WHERE id = ?`, [reelId]);
                res.json({ liked: false });
            });
        } else {
            // They haven't liked it. We INSERT a new record into the reel_likes junction table and increment the likes counter in the reels table (Like).
            db.run(`INSERT INTO reel_likes (reel_id, user_id) VALUES (?, ?)`, [reelId, userId], () => {
                db.run(`UPDATE reels SET likes = likes + 1 WHERE id = ?`, [reelId]);
                res.json({ liked: true });
            });
        }
    });
});

// Share a Reel
// We don't necessarily need the user to be logged in just to share it with a friend, 
// so this route doesn't have the 'authenticateToken' bouncer.
app.post('/api/reels/:id/share', (req, res) => {
    // When a user clicks the "Share" button on a reel, the frontend will hit this endpoint to record that share in the database.
    const reelId = req.params.id;

    // We simply increment the 'shares' counter for that reel. In a real app, we might also want to log who shared it and when, 
    // but for simplicity, we're just counting total shares.
    db.run(`UPDATE reels SET shares = shares + 1 WHERE id = ?`, [reelId], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to record share' });
        res.json({ success: true, message: 'Share recorded' });
    });
});

// 11. REELS ROUTES (Videos)

// These routes follow the same pattern as the posts routes. 
// We have a check route to prevent duplicates, a POST route to create new reels, 
// and a GET route to retrieve them with pagination. The main difference is that 
// reels are simpler objects (just video_id, title, and channel_name) compared to the rich article posts.
app.post('/api/reels/check', (req, res) => {
    const { video_id } = req.body;
    db.get(`SELECT id FROM reels WHERE video_id = ?`, [video_id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ exists: !!row }); 
    });
});

// The video_id is the unique identifier for YouTube videos (the string in the URL after 'v=').
// For example, in https://www.youtube.com/watch?v=dQw4w9WgXcQ, the video_id is 'dQw4w9WgXcQ'.
// The title and channel_name are just metadata to display in the UI.
// We could expand this later to include things like thumbnail URLs, view counts, etc.
// This is the POST route (save reels to the database) that the scraper will hit when it finds a new sports highlight 
// reel to save in the database.
app.post('/api/reels', (req, res) => {
    const { video_id, title, channel_name } = req.body;
    if (!video_id || !title) return res.status(400).json({ error: 'Missing required video fields' });

    const sql = `INSERT INTO reels (video_id, title, channel_name) VALUES (?, ?, ?)`;
    db.run(sql, [video_id, title, channel_name], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to save reel' });
        res.status(201).json({ message: 'Reel saved!', reelId: this.lastID });
    });
});

// This GET route retrieves reels with pagination, similar to the posts route, essentially
// fetching reels for the Next.js frontend to display in the reels section.
// Replaced the 'page/offset' chronological logic with a dynamic 'exclude' list and 'ORDER BY RANDOM()'.
app.get('/api/reels', (req, res) => {
    // We still allow a 'limit' query parameter to control how many reels we return at once (default 3).
    const limit = parseInt(req.query.limit) || 3;
    const exclude = req.query.exclude || ''; // Capture the list of IDs from the frontend
    
    // Optional Authentication Check
    // If the frontend sends a token, we verify it to get the user ID. 
    // This allows us to personalize the reels feed in the future (e.g., show which reels they've liked).
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    let userId = null;

    // If there's a token, we try to verify it. If it's valid, we extract the 
    // user ID from the token's payload.
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            userId = decoded.userId;
        } catch (err) {}
    }

    // Dynamic SQL builder - if we have a userId, we include the subquery to check if they've liked each reel.
    let sql = userId
        ? `SELECT reels.*, EXISTS(SELECT 1 FROM reel_likes WHERE reel_id = reels.id AND user_id = ?) AS userLiked FROM reels`
        : `SELECT reels.*, 0 AS userLiked FROM reels`;
    
    // The 'exclude' parameter allows the frontend to tell us which reels it has already displayed, 
    // so we can avoid showing the same ones again as the user scrolls.
    let params = [];
    if (userId) params.push(userId); // Add userId first if it exists

    // If the frontend sends IDs to exclude, we inject the NOT IN clause
    // This allows us to avoid showing the same reels repeatedly as the user loads more.
    if (exclude) {
        // Convert the string "1,4,7" into an array of integers [1, 4, 7]
        // We also filter out any non-numeric values just in case the frontend sends something unexpected.
        // The 'exclude' query parameter is expected to be a comma-separated string of reel IDs that the frontend has already displayed.
        const excludeIds = exclude.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
        
        // If there are valid IDs to exclude, we modify the SQL query to add a NOT IN clause.
        if (excludeIds.length > 0) {
            // Generate the exact number of ? placeholders needed (e.g. ?, ?, ?)
            // This is important for parameterized queries to prevent SQL injection. We can't just inject the IDs directly into the SQL string.
            // For example, if excludeIds has 3 IDs, we need "?, ?, ?" in the SQL to safely substitute those values.
            const placeholders = excludeIds.map(() => '?').join(',');
            sql += ` WHERE id NOT IN (${placeholders})`;
            params.push(...excludeIds); // Push all excluded IDs into the params array
        }
    }

    // Finally, we add the ORDER BY RANDOM() clause to shuffle the results and the LIMIT clause to cap how many we return.
    sql += ` ORDER BY RANDOM() LIMIT ?`;
    params.push(limit); // Finally, cap it off with the limit

    // Finally, we execute the query with the constructed SQL and parameters. 
    // The database engine will safely substitute the parameters into the query.
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // Map SQLite 1/0 to true/false
        const formattedRows = rows.map(row => ({
            ...row,
            userLiked: row.userLiked === 1
        }));

        res.json(formattedRows);
    });
});

// 12. SERVER BINDING
// Finally, we tell the Express app to bind to the port and start listening for traffic.
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});