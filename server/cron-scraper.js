// cron-scraper.js
require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();

// This cron scraper is designed to fetch live match updates from a curated array of active games across major sports leagues.
const db = new sqlite3.Database('./glide.sqlite', (err) => {
    if (err) {
        console.error('Score synchronization database attachment warning:', err.message);
        process.exit(1);
    }
    console.log('Cron Scraper successfully attached to glide.sqlite.');
    initializeScraperTable();
});

// The scraper pipeline is structured to run every minute, ensuring that live match updates are captured in near real-time. 
// The data is stored in a dedicated table with a timestamp to manage freshness and relevance.
function initializeScraperTable() {
    db.run(`
        CREATE TABLE IF NOT EXISTS live_updates (
            id TEXT PRIMARY KEY,
            text TEXT,
            time_label TEXT,
            author TEXT,
            url TEXT,
            image_url TEXT,
            fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Error establishing database cache table:', err.message);
            process.exit(1);
        } else console.log('live_updates table ready.');
        runScraperPipeline();
    });
}

// The runScraperPipeline function simulates fetching live match updates from a curated array of active games across major sports leagues.
// In a production environment, this would be replaced with actual API calls to sports data providers or web scraping logic to extract live updates from official sources.
async function runScraperPipeline() {
    console.log(`\n🔄 [${new Date().toLocaleTimeString()}] Live Match Sync initialized. Fetching API-SPORTS endpoints...`);

    const aggregatedUpdates = [];
    const API_KEY = process.env.RAPIDAPI_KEY;

    // Added production block to ensure script halts safely if key is missing
    if (!API_KEY) {
        console.error("❌ CRITICAL: RAPIDAPI_KEY is missing from your .env file!");
        return;
    }

    // HIGHLIGHT: The exact API-Football IDs for your requested premium leagues
    const PREMIUM_FOOTBALL_LEAGUES = {
        39: 'Premier League',
        135: 'Serie A',
        140: 'La Liga',
        78: 'Bundesliga',
        61: 'Ligue 1',
        2: 'UEFA Champions League',
        3: 'UEFA Europa League',
        848: 'UEFA Europa Conference League',
        1: 'World Cup',
        4: 'Euros',
        9: 'Copa America',
        5: 'UEFA Nations League'
    };

    // Generic mapper for team-based sports to prevent redundant code
    // This function takes a game object and extracts the relevant information to create a consistent format for team sports, 
    // including football, basketball, baseball, hockey, and American football. It handles both live and fixture data structures, 
    // ensuring that the text format is uniform across all sports.
    const mapTeamSport = (game, prefix, isFixture = false, customAuthor = null) => {
        const base = isFixture ? game.fixture : game;
        const statusObj = base.status || game.game?.status || {};
        const homeTeam = game.teams?.home?.name || "Home";
        const awayTeam = game.teams?.away?.name || "Away";
        const homeScore = isFixture ? game.goals?.home : game.scores?.home?.total || 0;
        const awayScore = isFixture ? game.goals?.away : game.scores?.away?.total || 0;
        
        const searchString = encodeURIComponent(`${homeTeam} vs ${awayTeam} live score`);

        // Constructed a consistent text format for all team sports, incorporating status and scores where available.
        return {
            id: `${prefix}_${base.id || game.game?.id || Math.random()}`,
            text: `[${statusObj.short || 'FT'}] ${homeTeam} ${homeScore ?? 0} - ${awayScore ?? 0} ${awayTeam}`,
            time_label: `${statusObj.elapsed || statusObj.timer || 'Final'}'`,
            author: customAuthor || game.league?.name || prefix,
            image_url: game.teams?.home?.logo || null,
            url: `https://www.google.com/search?q=${searchString}`
        };
    };

    // Expanded the endpoints matrix to encompass your specific premium dashboard requests
    const endpoints = [
        { sport: "NBA", url: "https://v2.nba.api-sports.io/games?live=all", host: "v2.nba.api-sports.io", mapData: (g) => mapTeamSport(g, 'nba', false, 'NBA') },
        { sport: "MLB", url: "https://v1.baseball.api-sports.io/games?live=all", host: "v1.baseball.api-sports.io", mapData: (g) => mapTeamSport(g, 'mlb', false, 'MLB') },
        { sport: "NFL", url: "https://v1.american-football.api-sports.io/games?live=all", host: "v1.american-football.api-sports.io", mapData: (g) => mapTeamSport(g, 'nfl', false, 'NFL') },
        { sport: "NHL", url: "https://v1.hockey.api-sports.io/games?live=all", host: "v1.hockey.api-sports.io", mapData: (g) => mapTeamSport(g, 'nhl', false, 'NHL') }, 
        // F1 and MMA use non-team structures, requiring specialized mappers
        { 
            sport: "FORMULA-1", 
            url: "https://v1.formula-1.api-sports.io/races?type=Race", 
            host: "v1.formula-1.api-sports.io", 
            mapData: (g) => ({
                id: `f1_${g.id}`,
                text: `[${g.status}] ${g.competition?.name || 'Grand Prix'}`,
                time_label: "Recent",
                author: "Formula 1",
                image_url: null,
                url: `https://www.google.com/search?q=${encodeURIComponent(g.competition?.name || 'F1 Race')}`
            }) 
        },
        { 
            sport: "UFC", 
            url: "https://v1.mma.api-sports.io/fights?status=live", 
            host: "v1.mma.api-sports.io", 
            mapData: (g) => ({
                id: `mma_${g.id}`,
                text: `[LIVE] ${g.fighters?.first?.name || 'Fighter 1'} vs ${g.fighters?.second?.name || 'Fighter 2'}`,
                time_label: `Round ${g.status?.round || 1}`,
                author: "UFC",
                image_url: g.fighters?.first?.logo || null,
                url: `https://www.google.com/search?q=${encodeURIComponent((g.fighters?.first?.name || 'MMA') + ' vs ' + (g.fighters?.second?.name || 'Fight'))}`
            }) 
        }
    ];

    // FOOTBALL HISTORICAL & LIVE SWEEP: Since football has the most complex structure and the highest demand for live updates, we perform a combined sweep to 
    // capture both live and recent historical matches in one go. This approach maximizes the chances of having relevant football matches in the database without 
    // burning through API credits on multiple calls. The historical fallback ensures that if there are no live matches at the moment, users will still see recent 
    // results from their favorite leagues, keeping the dashboard engaging at all times.
    try {
        console.log(`  ▶ Fetching Global Football Data (Live & Historical Fallback)...`);
        
        // Trick to get historical data without burning 15 API credits: Grabbing yesterday and today globally.
        // This way, if there are no live matches right now, we still have a chance to show recent results from the premium leagues you care about, 
        // keeping the football section of the dashboard vibrant and engaging.
        const today = new Date().toISOString().split('T')[0];
        let yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterday = yesterdayDate.toISOString().split('T')[0];

        // Fetch Live Games
        const liveRes = await fetch("https://v3.football.api-sports.io/fixtures?live=all", { headers: { "x-rapidapi-host": "v3.football.api-sports.io", "x-rapidapi-key": API_KEY } });
        // Fetch Yesterday's Completed Games
        const histRes = await fetch(`https://v3.football.api-sports.io/fixtures?date=${yesterday}`, { headers: { "x-rapidapi-host": "v3.football.api-sports.io", "x-rapidapi-key": API_KEY } });

        if (liveRes.ok && histRes.ok) {
            const liveData = await liveRes.json();
            const histData = await histRes.json();
            
            // Combine all games into one massive array
            const allFootballGames = [...(liveData.response || []), ...(histData.response || [])];

            // Filter out everything EXCEPT the premium leagues you specified
            const premiumGames = allFootballGames.filter(game => PREMIUM_FOOTBALL_LEAGUES[game.league.id]);

            // Map the filtered games to the consistent format using the mapTeamSport function, which abstracts away the differences in API response structures for football fixtures and live games.
            premiumGames.forEach(game => {
                const authorName = PREMIUM_FOOTBALL_LEAGUES[game.league.id];
                aggregatedUpdates.push(mapTeamSport(game, 'fb', true, authorName));
            });
            console.log(`    └─ ✅ Found ${premiumGames.length} premium football matches (Live & Recent).`);
        }
    } catch (err) {
        console.error(`  ❌ Failed to fetch Global Football sweep:`, err.message);
    }

    // Loop through the rest of the endpoints (NBA, NHL, NFL, F1, etc.)
    for (const api of endpoints) {
        try {
            console.log(`  ▶ Fetching live ${api.sport} games...`);
            
            // Each API call is wrapped in a try-catch to ensure that a failure in one doesn't halt the entire pipeline, 
            // allowing for maximum data retrieval across all sports.
            const response = await fetch(api.url, {
                method: "GET",
                headers: {
                    "x-rapidapi-host": api.host,
                    "x-rapidapi-key": API_KEY
                }
            });

            if (!response.ok) {
                console.warn(`    └─ ⚠️ Fetch failed for ${api.sport}: ${response.status}`);
                continue;
            }

            // The response structure is expected to have a 'response' array containing the live games, but this may vary by API.
            const liveData = await response.json();
            const activeMatches = liveData.response || [];
            
            // Limit to top 5 matches per sport so the UI doesn't drown in 50+ obscure games
            const topMatches = activeMatches.slice(0, 5);

            // Each match is mapped to a consistent format using the provided mapping function, which abstracts away the differences in API response structures across sports.
            topMatches.forEach((game) => {
                const formattedGame = api.mapData(game);
                
                aggregatedUpdates.push({
                    id: formattedGame.id,
                    text: formattedGame.text,
                    time_label: formattedGame.time_label,
                    author: formattedGame.author,
                    url: formattedGame.url, 
                    image_url: formattedGame.image_url
                });
            });

            if(topMatches.length > 0) {
                console.log(`    └─ ✅ Found ${topMatches.length} live matches.`);
            }

        } catch (err) {
            console.error(`  ❌ Failed to fetch ${api.sport}:`, err.message);
        }
    }

    if (aggregatedUpdates.length > 0) {
        db.serialize(() => {
            // Clear items older than 48 hours to keep rows lean
            db.run(`DELETE FROM live_updates WHERE fetched_at <= datetime('now', '-2 days')`, (delErr) => {
                if (delErr) console.error("Error executing database cleanup sweep:", delErr.message);

                // Using a prepared statement for bulk insertion to optimize performance and ensure data integrity.
                const stmt = db.prepare(`
                    INSERT OR REPLACE INTO live_updates (id, text, time_label, author, url, image_url)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);
                
                // Each item in the aggregated updates array is inserted into the database, with the prepared statement ensuring 
                // that the operation is efficient and secure against SQL injection.
                aggregatedUpdates.forEach(item => {
                    stmt.run(item.id, item.text, item.time_label, item.author, item.url, item.image_url);
                });

                // Finalize the statement and log the successful synchronization of the scoreboard updates, including the number of matches saved.
                stmt.finalize(() => {
                    console.log(`\n✅ [${new Date().toLocaleTimeString()}] Scoreboard update synchronized. Saved ${aggregatedUpdates.length} clean match tracks.`);
                    setupNextScraperInterval(); 
                });
            });
        });
    } else {
        console.log("\n⚠️ No live matches happening right now across any tracked leagues. Database unchanged.");
        setupNextScraperInterval();
    }
}

function setupNextScraperInterval() {
    // Set firmly to 30 minutes to guarantee you stay under the 100 limit per day per API.
    const THIRTY_MINUTES = 30 * 60 * 1000; 
    console.log(`\n💤 [${new Date().toLocaleTimeString()}] Scoreboard worker asleep to conserve API limits. Next fetch in 30 minutes...`);
    setTimeout(runScraperPipeline, THIRTY_MINUTES);
}