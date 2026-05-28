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

    // Generic mapper for team-based sports to prevent redundant code
    const mapTeamSport = (game, prefix, isFixture = false) => {
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
            text: `[${statusObj.short || 'LIVE'}] ${homeTeam} ${homeScore ?? 0} - ${awayScore ?? 0} ${awayTeam}`,
            time_label: `${statusObj.elapsed || statusObj.timer || 'In Play'}'`,
            author: game.league?.name || prefix,
            image_url: game.teams?.home?.logo || null,
            url: `https://www.google.com/search?q=${searchString}`
        };
    };

    // Expanded the endpoints matrix to encompass ALL 12 active APIs from your dashboard
    const endpoints = [
        { sport: "FOOTBALL", url: "https://v3.football.api-sports.io/fixtures?live=all", host: "v3.football.api-sports.io", mapData: (g) => mapTeamSport(g, 'fb', true) },
        { sport: "NBA", url: "https://v2.nba.api-sports.io/games?live=all", host: "v2.nba.api-sports.io", mapData: (g) => mapTeamSport(g, 'nba') },
        { sport: "NFL", url: "https://v1.american-football.api-sports.io/games?live=all", host: "v1.american-football.api-sports.io", mapData: (g) => mapTeamSport(g, 'nfl') },
        { sport: "AFL", url: "https://v1.afl.api-sports.io/games?live=all", host: "v1.afl.api-sports.io", mapData: (g) => mapTeamSport(g, 'afl') },
        { sport: "BASEBALL", url: "https://v1.baseball.api-sports.io/games?live=all", host: "v1.baseball.api-sports.io", mapData: (g) => mapTeamSport(g, 'bsb') },
        { sport: "BASKETBALL", url: "https://v1.basketball.api-sports.io/games?live=all", host: "v1.basketball.api-sports.io", mapData: (g) => mapTeamSport(g, 'bkb') },
        { sport: "HANDBALL", url: "https://v1.handball.api-sports.io/games?live=all", host: "v1.handball.api-sports.io", mapData: (g) => mapTeamSport(g, 'hbl') },
        { sport: "HOCKEY", url: "https://v1.hockey.api-sports.io/games?live=all", host: "v1.hockey.api-sports.io", mapData: (g) => mapTeamSport(g, 'hky') },
        { sport: "RUGBY", url: "https://v1.rugby.api-sports.io/games?live=all", host: "v1.rugby.api-sports.io", mapData: (g) => mapTeamSport(g, 'rgb') },
        { sport: "VOLLEYBALL", url: "https://v1.volleyball.api-sports.io/games?live=all", host: "v1.volleyball.api-sports.io", mapData: (g) => mapTeamSport(g, 'vbl') },
        // F1 and MMA use non-team structures, requiring specialized mappers
        { 
            sport: "FORMULA-1", 
            url: "https://v1.formula-1.api-sports.io/races?type=Race", 
            host: "v1.formula-1.api-sports.io", 
            mapData: (g) => ({
                id: `f1_${g.id}`,
                text: `[${g.status}] ${g.competition?.name || 'Grand Prix'}`,
                time_label: "LIVE",
                author: "Formula 1",
                image_url: null,
                url: `https://www.google.com/search?q=${encodeURIComponent(g.competition?.name || 'F1 Race')}`
            }) 
        },
        { 
            sport: "MMA", 
            url: "https://v1.mma.api-sports.io/fights?status=live", 
            host: "v1.mma.api-sports.io", 
            mapData: (g) => ({
                id: `mma_${g.id}`,
                text: `[LIVE] ${g.fighters?.first?.name || 'Fighter 1'} vs ${g.fighters?.second?.name || 'Fighter 2'}`,
                time_label: `Round ${g.status?.round || 1}`,
                author: g.league?.name || "MMA",
                image_url: g.fighters?.first?.logo || null,
                url: `https://www.google.com/search?q=${encodeURIComponent((g.fighters?.first?.name || 'MMA') + ' vs ' + (g.fighters?.second?.name || 'Fight'))}`
            }) 
        }
    ];

    // Loop through each sport configuration and fetch
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
            
            // Limit to top 3 matches per sport so the UI doesn't drown in 50+ obscure games
            const topMatches = activeMatches.slice(0, 3);

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
    // Set firmly to 15 minutes to guarantee you stay under the 100 limit per day per API.
    const FIFTEEN_MINUTES = 15 * 60 * 1000; 
    console.log(`\n💤 [${new Date().toLocaleTimeString()}] Scoreboard worker asleep to conserve API limits. Next fetch in 15 minutes...`);
    setTimeout(runScraperPipeline, FIFTEEN_MINUTES);
}