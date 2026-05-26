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

        // THE JUNCTION TABLES FOR BOOKMARKS
        db.run(`CREATE TABLE IF NOT EXISTS saved_posts (
            post_id INTEGER,
            user_id INTEGER,
            PRIMARY KEY (post_id, user_id)
            )
        `, (err) => {
            if (err) console.error('Error creating saved_posts table:', err.message);
            else console.log('saved_posts table ready.');
        });

        db.run(`CREATE TABLE IF NOT EXISTS saved_reels (
            reel_id INTEGER,
            user_id INTEGER,
            PRIMARY KEY (reel_id, user_id)
            )
        `, (err) => {
            if (err) console.error('Error creating saved_reels table:', err.message);
            else console.log('saved_reels table ready.');
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
    // We do the same for 'userSaved' by checking the saved_posts junction table. If we don't have a userId, we just return 0 for both fields.
    const sql = userId 
        ? `SELECT posts.*, 
             EXISTS(SELECT 1 FROM post_likes WHERE post_id = posts.id AND user_id = ?) AS userLiked,
             EXISTS(SELECT 1 FROM saved_posts WHERE post_id = posts.id AND user_id = ?) AS userSaved
           FROM posts ORDER BY timestamp DESC LIMIT ? OFFSET ?`
        : `SELECT posts.*, 0 AS userLiked, 0 AS userSaved 
           FROM posts ORDER BY timestamp DESC LIMIT ? OFFSET ?`;

    // The parameters we pass to the database depend on whether we have a userId or not. 
    // If we do, we need to include it for the subquery that checks if the user liked each post.
    // Because we added a second ? for the userSaved subquery, we must pass userId TWICE in the array 
    // (once for userLiked and once for userSaved), followed by the limit and offset.
    const params = userId ? [userId, userId, limit, offset] : [limit, offset];
    
    // Finally, we execute the query. If there's an error, we log it and return a 500 status. 
    // If it's successful, we return the rows of posts as JSON.
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error("Error fetching data:", err.message);
            return res.status(500).json({ error: 'Failed to retrieve feed' });
        }

        // SQLite returns 1 for true and 0 for false. We map it to standard strict booleans for React.
        // We take each row of the result and create a new object that has all the same fields (...row) but overrides 'userLiked' to be a boolean.
        // This way, the frontend can easily check if userLiked is true or false without having to remember that 1 means liked and 0 means not liked.
        // We do the same for 'userSaved' if we want to use that in the frontend as well.
        const formattedRows = rows.map(row => ({
            ...row,
            userLiked: row.userLiked === 1,
            userSaved: row.userSaved === 1
        }));

        res.status(200).json(formattedRows);
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

// Toggle Save on a Post
// This route allows users to bookmark posts. It checks the saved_posts junction table to see if the user has already saved the post,
app.post('/api/posts/:id/save', authenticateToken, (req, res) => {
    // We extract the post ID from the URL parameters and the user ID from the authenticated JWT token, just like with likes.
    const postId = req.params.id;
    const userId = req.user.userId; 

    // We check if the user has already saved this post by querying the saved_posts junction table. If a record exists, they have saved it.
    db.get(`SELECT * FROM saved_posts WHERE post_id = ? AND user_id = ?`, [postId, userId], (err, row) => {
        if (row) {
            // Un-save it
            db.run(`DELETE FROM saved_posts WHERE post_id = ? AND user_id = ?`, [postId, userId], () => {
                res.json({ saved: false });
            });
        } else {
            // Save it
            db.run(`INSERT INTO saved_posts (post_id, user_id) VALUES (?, ?)`, [postId, userId], () => {
                res.json({ saved: true });
            });
        }
    });
});

// Toggle Save on a Reel
// This route is the same logic as the post save route, but it operates on reels and uses the saved_reels junction table.
app.post('/api/reels/:id/save', authenticateToken, (req, res) => {
    // We extract the reel ID from the URL parameters and the user ID from the authenticated JWT token, just like with posts.
    const reelId = req.params.id;
    const userId = req.user.userId;

    // We check if the user has already saved this reel by querying the saved_reels junction table. If a record exists, they have saved it.
    db.get(`SELECT * FROM saved_reels WHERE reel_id = ? AND user_id = ?`, [reelId, userId], (err, row) => {
        if (row) {
            // Un-save it
            db.run(`DELETE FROM saved_reels WHERE reel_id = ? AND user_id = ?`, [reelId, userId], () => {
                res.json({ saved: false });
            });
        } else {
            // Save it
            db.run(`INSERT INTO saved_reels (reel_id, user_id) VALUES (?, ?)`, [reelId, userId], () => {
                res.json({ saved: true });
            });
        }
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
// Upgraded GET /api/reels to safely prioritize deep-linked reel IDs from the profile vault
app.get('/api/reels', (req, res) => {
    // We still allow a 'limit' query parameter to control how many reels we return at once (default 3).
    const limit = parseInt(req.query.limit) || 3;
    const exclude = req.query.exclude || ''; // Capture the list of IDs from the frontend
    const forceId = req.query.reelId || null; // Capture explicit target video_id from URL query string
    
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
    //  If not, we just return 0 for userLiked. We do the same for userSaved as well
    let sql = userId
        ? `SELECT reels.*, 
           EXISTS(SELECT 1 FROM reel_likes WHERE reel_id = reels.id AND user_id = ?) AS userLiked,
           EXISTS(SELECT 1 FROM saved_reels WHERE reel_id = reels.id AND user_id = ?) AS userSaved
           FROM reels`
        : `SELECT reels.*, 0 AS userLiked, 0 AS userSaved
           FROM reels`;
    
    // The 'exclude' parameter allows the frontend to tell us which reels it has already displayed, 
    // so we can avoid showing the same ones again as the user scrolls.
    let params = [];
    if (userId) {
        params.push(userId, userId); // For the userLiked and userSaved subqueries
    }

    // Build the dynamic WHERE statements
    let whereClauses = [];

    // If we have an explicit target reelId from a Vault click, skip the regular exclude lists for the top item
    if (forceId) {
        whereClauses.push(`video_id = ?`);
        params.push(forceId);
    } else if (exclude) {
        // Convert the string "1,4,7" into an array of integers [1, 4, 7]
        // We also filter out any non-numeric values just in case the frontend sends something unexpected.
        // The 'exclude' query parameter is expected to be a comma-separated string of reel IDs that the frontend has already displayed.
        const excludeIds = exclude.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
        
        // If there are valid IDs to exclude, we modify the SQL query to add a NOT IN clause safely.
        // This tells the database to skip any reels whose IDs are in the exclude list. We also push those IDs 
        // into the params array so they get safely substituted into the query.
        if (excludeIds.length > 0) {
            // Generate the exact number of ? placeholders needed (e.g. ?, ?, ?)
            const placeholders = excludeIds.map(() => '?').join(',');
            whereClauses.push(`id NOT IN (${placeholders})`);
            params.push(...excludeIds); // Push all excluded IDs into the params array
        }
    }

    // If any clauses were added, safely combine them and append a single WHERE keyword to the SQL statement
    if (whereClauses.length > 0) {
        sql += ` WHERE ` + whereClauses.join(' AND ');
    }

   // If 'forceId' is present, we want to fetch that specific reel, so we limit the results to 1 without randomization.
   // If 'forceId' is not present, we want to fetch a random selection of reels while respecting the exclude list, so we 
   // order by RANDOM() and limit by the specified number.
   sql += forceId ? ` LIMIT 1` : ` ORDER BY RANDOM() LIMIT ?`;
   if (!forceId) {
       params.push(limit);
   }

    // Finally, we execute the query with the constructed SQL and parameters. 
    // The database engine will safely substitute the parameters into the query.
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // Map SQLite 1/0 to true/false
        const formattedRows = rows.map(row => ({
            ...row,
            userLiked: row.userLiked === 1,
            userSaved: row.userSaved === 1
        }));

        // Dual-stage response padding layout
        // If we forced a single specific video, immediately run a background fallback query 
        // to grab normal random items, so the layout feed isn't an empty dead-end string.
        if (forceId && formattedRows.length > 0) {
            let fallbackSql = userId
                ? `SELECT reels.*, 
                   EXISTS(SELECT 1 FROM reel_likes WHERE reel_id = reels.id AND user_id = ?) AS userLiked,
                   EXISTS(SELECT 1 FROM saved_reels WHERE reel_id = reels.id AND user_id = ?) AS userSaved
                   FROM reels WHERE video_id != ? ORDER BY RANDOM() LIMIT ?`
                : `SELECT reels.*, 0 AS userLiked, 0 AS userSaved FROM reels WHERE video_id != ? ORDER BY RANDOM() LIMIT ?`;

            let fallbackParams = userId ? [userId, userId, forceId, limit] : [forceId, limit];
            
            // We run the fallback query in the background. If it fails, we just return the single forced video. 
            // If it succeeds, we append those random videos to the response.
            db.all(fallbackSql, fallbackParams, (fallbackErr, fallbackRows) => {
                if (fallbackErr) return res.json(formattedRows); // Gracefully fall back to single video if query drops
                
                // Map the fallback rows to convert userLiked and userSaved to booleans as well
                const formattedFallback = fallbackRows.map(row => ({
                    ...row,
                    userLiked: row.userLiked === 1,
                    userSaved: row.userSaved === 1
                }));

                // Combine the requested video AT THE TOP [0] with random videos appended below it
                res.json([...formattedRows, ...formattedFallback]);
            });
        } else {
            // Normal passive random scrolling response stream
            res.json(formattedRows);
        }
    });
});

// 12. THE VAULT (User Profile Data)
// This route fetches everything a user has interacted with. 
// It requires the 'authenticateToken' bouncer to ensure we know exactly who is asking.
app.get('/api/users/me/vault', authenticateToken, async (req, res) => {
    const userId = req.user.userId;

    // Define our 4 targeted SQL queries
    const queries = {
        likedPosts: `SELECT posts.*, 1 AS userLiked FROM posts 
                     INNER JOIN post_likes ON posts.id = post_likes.post_id 
                     WHERE post_likes.user_id = ? ORDER BY posts.timestamp DESC`,
                     
        savedPosts: `SELECT posts.*, 1 AS userSaved FROM posts 
                     INNER JOIN saved_posts ON posts.id = saved_posts.post_id 
                     WHERE saved_posts.user_id = ? ORDER BY posts.timestamp DESC`,
                     
        likedReels: `SELECT reels.*, 1 AS userLiked FROM reels 
                     INNER JOIN reel_likes ON reels.id = reel_likes.reel_id 
                     WHERE reel_likes.user_id = ? ORDER BY reels.timestamp DESC`,
                     
        savedReels: `SELECT reels.*, 1 AS userSaved FROM reels 
                     INNER JOIN saved_reels ON reels.id = saved_reels.reel_id 
                     WHERE saved_reels.user_id = ? ORDER BY reels.timestamp DESC`
    };

    // Helper function to wrap SQLite callbacks in modern Promises
    // This allows us to use async/await syntax for cleaner code when executing multiple queries in parallel.
    const fetchQuery = (query, params) => {
        // We return a new Promise (JavaScript object that represents the eventual completion (or failure) of an 
        // asynchronous operation and its resulting value) that wraps the db.all method. The Promise constructor takes a function with 
        // 'resolve' and 'reject' parameters, which we call based on whether the database query succeeds or fails.
        // If the query encounters an error, we call 'reject(err)' which will cause the Promise to fail and jump to the catch block.
        // If the query is successful, we call 'resolve(rows)' which will pass the resulting rows to the next step in our async function.
        return new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    };

    try {
        // Execute all 4 database queries at the exact same time
        // Promise.all takes an array of Promises and returns a new Promise that resolves when all of the input Promises have resolved.
        const [likedPosts, savedPosts, likedReels, savedReels] = await Promise.all([
            fetchQuery(queries.likedPosts, [userId]),
            fetchQuery(queries.savedPosts, [userId]),
            fetchQuery(queries.likedReels, [userId]),
            fetchQuery(queries.savedReels, [userId])
        ]);

        // Send a massive, beautifully organized JSON payload back to the frontend
        res.status(200).json({
            likedPosts,
            savedPosts,
            likedReels,
            savedReels
        });
    } catch (error) {
        console.error("Vault fetch error:", error);
        res.status(500).json({ error: 'Failed to retrieve vault data' });
    }
});

// 13. LIVE UPDATES X AGGREGATION ROUTE 
// This route acts as a server-side proxy to fetch real-time updates directly from X's 
// public syndication stream, safely bypassing browser-level CORS security blocks.

// In-memory cache to prevent X from instantly rate-limiting our backend
const tweetCache = {};
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// Helper function to insert explicit delays between sequential requests to protect our IP profile
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.get('/api/live-updates', async (req, res) => {
    // We allow the frontend to specify handles via query parameters, but we'll multiplex a verified core pool!
    // Caching multiplexer array targeting sports handles natively without list constraints
    // Expanded core pool to 10 premier channels spanning dynamic real-time insights
    const sportsPool = [
        '433', 'DAZNBoxing', 'NBA', 
        'ESPN', 'FabrizioRomano', 'atptour',
        'F1', 'ufc', 'BleacherReport', 'TNTSportsUS'
    ];
    
    // Generate a secure aggregate unique cache string signature
    const cacheKey = 'global_sports_feed';

    // Before we even attempt to fetch from X, we check our in-memory cache to see if we have a recent response that we can return immediately.
    // If a timestamp exists and is less than 15 minutes old, respect the cooldown NO MATTER WHAT.
    if (tweetCache[cacheKey] && (Date.now() - tweetCache[cacheKey].timestamp < CACHE_DURATION)) {
        if (tweetCache[cacheKey].data.length > 0) {
            console.log(`\n📡 [${new Date().toLocaleTimeString()}] Serving balanced sports feed from system cache layer memory cleanly.`);
        } else {
            console.log(`\n🛡️ [${new Date().toLocaleTimeString()}] IP Protection Shield active. Cooldown timer running before we hit X again.`);
        }
        return res.status(200).json(tweetCache[cacheKey].data);
    }

    const aggregatedTweets = [];
    const fortyEightHoursAgo = Date.now() - (48 * 60 * 60 * 1000); // Explicit 48-Hour chronological date subtraction barrier filter

    try {
        console.log(`\n🔄 [${new Date().toLocaleTimeString()}] Cache empty or expired. Initiating secure multi-path fetch to X servers...`);

        // Async loop matrix engine fetching handles sequentially across working profile layers
        // Converted from Promise.all to sequential loop pacing with delay throttle steps
        for (const handle of sportsPool) {
            try {
                // NEW TELEMETRY: Prove the server is actively targeting the channel
                console.log(`\n▶ [FETCHING] @${handle}...`);

                // Requesting 30 entries per handle to yield comfortable aggregation boundaries
                const targetUrl = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}?maxEntries=30`;
                const xResponse = await fetch(targetUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                        'Referer': 'https://platform.twitter.com/'
                    }
                });

                if (!xResponse.ok) {
                    console.log(`  └─ ❌ HTTP Error ${xResponse.status}`);
                    continue; // Skip individual user failures gracefully
                }
                
                // We need to parse the HTML response to extract the embedded JSON data that contains the tweets.
                // X's syndication endpoint returns an HTML page that includes a <script> tag with the ID "__NEXT_DATA__". 
                // This script tag contains a JSON object with all the data for the user's timeline, including the tweets.
                const htmlText = await xResponse.text();
                const dataRegex = /<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/;
                const match = htmlText.match(dataRegex);

                if (!match) {
                    console.log(`  └─ ❌ No JSON data block found in HTML.`);
                    continue;
                }
                
                // If we successfully find the JSON data, we parse it and extract the tweets. We then map those tweets into a 
                // simplified format that includes just the ID, text, creation time, and author handle.
                const parsedJson = JSON.parse(match[1]);
                const entries = parsedJson.props?.pageProps?.timeline?.entries || [];
                
                console.log(`  └─ 📦 Raw entries downloaded: ${entries.length}`);

                // We apply a series of transformations to the entries to extract valid tweets, filter out old ones, sort by newest, 
                // and take the top 5 freshest tweets per handle.
                const handleSpecificTweets = entries
                    .map(entry => {
                        if (!entry || !entry.content) return null;
                        
                        // EXPANDED MATRIX: Catching standard tweets, widgets, and deeply nested Media/Quote tweets
                        return entry.content.tweet || 
                               entry.content.item?.content?.tweet || 
                               entry.content.itemContent?.tweet_results?.result?.legacy ||
                               entry.content.itemContent?.tweet_results?.result?.tweet?.legacy; 
                    })
                    .filter(tweetData => !!tweetData && !!tweetData.text)
                    // FILTER FIRST: Drop everything older than 48 hours immediately
                    .filter(tweetData => {
                        const tweetTime = new Date(tweetData.created_at).getTime();
                        // If parsing fails (NaN), keep the tweet so we at least see data.
                        if (isNaN(tweetTime)) return true; 
                        return tweetTime > fortyEightHoursAgo;
                    })
                    // SORT SECOND: Now that we only have fresh data, sort by newest
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    // SLICE LAST: Take the freshest 5
                    .slice(0, 5);

                // Log the telemetry so you can see exactly who is supplying data
                console.log(`  └─ ✅ Extracted ${handleSpecificTweets.length} valid fresh tweets for @${handle}.`);

                // Push those balanced 5 tweets into our master array
                handleSpecificTweets.forEach(tweetData => {
                    aggregatedTweets.push({
                        id: tweetData.id_str || String(Math.random()), // Fallback ID if X changes their structure
                        text: tweetData.text,
                        created_at: tweetData.created_at,
                        author: `@${handle}`
                    }); 
                });

                // Inject a quiet 250ms block pause to make sure X firewalls view requests as separate organic actions
                await sleep(250);

            } catch (innerErr) {
                // Swallow handle dropout loops safely
                console.warn(`  └─ ⚠️ Soft handle loop dropout checked for account target: @${handle} | Error: ${innerErr.message}`);
            }
        }
        
        // Final UI Mapping: We now have up to 50 perfectly balanced tweets. 
        // We just need to sort the master array chronologically so the user's timeline flows naturally.
        const finalFeed = aggregatedTweets
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map(tweet => {
                // UI Time Labels
                // We want to show "Just now", "5m ago", "2h ago", or a date depending on how old the tweet is.
                let timeLabel = 'Just now';
                const tweetDate = new Date(tweet.created_at);
                const diffMinutes = Math.floor((Date.now() - tweetDate.getTime()) / 60000);
                if (diffMinutes < 60) timeLabel = `${diffMinutes}m ago`;
                else if (diffMinutes < 1440) timeLabel = `${Math.floor(diffMinutes / 60)}h ago`;
                else timeLabel = tweetDate.toLocaleDateString();
                
                // We return a simplified object for the frontend that includes the tweet ID, text, 
                // formatted time label, author handle, and a direct URL to the tweet on X.
                return {
                    id: tweet.id, 
                    text: tweet.text,
                    time: timeLabel,
                    author: tweet.author,
                    url: `https://x.com/${tweet.author.replace('@', '')}/status/${tweet.id}`
                };
            });

        // CACHE SHIELD: Manage state updates safely
        if (finalFeed.length > 0) {
            // Success! Save the data and start the 15-minute timer
            tweetCache[cacheKey] = {
                timestamp: Date.now(),
                data: finalFeed
            };
            console.log(`\n📡 [${new Date().toLocaleTimeString()}] Successfully pulled and aggregated ${finalFeed.length} fresh sports updates from X syndication streams.`);
            return res.status(200).json(finalFeed);
        } else {
            // We got 0 tweets back (either due to a 429 or empty timelines)
            if (tweetCache[cacheKey] && tweetCache[cacheKey].data.length > 0) {
                console.warn("\n⚠️ X returned 0 new tweets. Shield activated: serving previous valid cache and resetting timer.");
                // Reset the timer so we don't hammer them again immediately
                tweetCache[cacheKey].timestamp = Date.now(); 
                return res.status(200).json(tweetCache[cacheKey].data);
            } else {
                console.log(`\n🛡️ [${new Date().toLocaleTimeString()}] Complete fetch failure. Locking down server requests for 15 minutes to protect IP.`);
                // THE DEATH SPIRAL FIX: Save an empty array AND start the 15-minute timer!
                tweetCache[cacheKey] = {
                    timestamp: Date.now(),
                    data: []
                };
                return res.status(200).json([]);
            }
        }
    } catch (error) {
        console.error("Backend Proxy Error aggregating multiplex arrays:", error.message);
        
        // FAILSAFE ARCHITECTURE
        if (tweetCache[cacheKey] && tweetCache[cacheKey].data.length > 0) {
            console.warn("Server hit dynamic lockouts. Deploying backup cache state metrics immediately.");
            // Reset the timer here too
            tweetCache[cacheKey].timestamp = Date.now();
            return res.status(200).json(tweetCache[cacheKey].data);
        }

        // Lock down the server to prevent death spirals on fatal errors
        tweetCache[cacheKey] = { timestamp: Date.now(), data: [] };
        res.status(502).json({ error: "Failed to pull fresh breaking data assets directly from X server streams." });
    }
});

// 14. SERVER BINDING
// Finally, we tell the Express app to bind to the port and start listening for traffic.
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});