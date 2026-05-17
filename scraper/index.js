// 1. IMPORTS & CONFIGURATION
require('dotenv').config(); // Loads your GEMINI_API_KEY from the .env file
const cheerio = require('cheerio');
const Parser = require('rss-parser');
// Import node-cron for Strategic Pacing (Token Defense)
const cron = require('node-cron'); 
const { GoogleGenAI } = require('@google/genai'); 

const parser = new Parser();
// Initialize the Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const RSS_FEED_URL = 'https://www.skysports.com/rss/12040';
// This is the URL of your Express API that we built earlier
const SPORTSGRAM_API_URL = 'http://localhost:3000/api/posts'; 
// The URL of our new Deduplication Gate route on the Express Server
const CHECK_URL = 'http://localhost:3000/api/posts/check';

// 2. THE AI REWRITE FUNCTION
// This function takes the boring RSS text and uses Gemini to transform it into strict JSON.
// Handles an ARRAY of articles for Batch Processing (Token Defense).
async function batchFormatWithGemini(articlesArray) {
    const prompt = `
    You are Fabrizio Romano, the world's most energetic sports journalist.
    Review the following JSON array of raw sports articles.
    Extract the core facts for each and rewrite it as a short, punchy social media update. 
    
    RAW ARTICLES:
    ${JSON.stringify(articlesArray)}
    
    Return ONLY a valid JSON ARRAY containing objects with exact following keys (no markdown formatting, no code blocks):
    - sport_category: (e.g., "Football", "Golf", "Formula 1")
    - headline: (A punchy, exciting headline)
    - content: (The rewritten summary, max 2 sentences. Make it sound exciting)
    - excitement_level: (A number from 1 to 10)
    - url: (You MUST include the exact original URL provided in the raw data)
    `;

    try {
        // We call the Gemini Flash model (fast and cheap, perfect for data pipelines)
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
        });

        // The AI returns a string, so we parse it into a native JavaScript object
        const cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanText);
    } catch (error) {
        console.error("⚠️ AI Formatting Error:", error.message);
        // Return an empty array if the AI fails, acting as error handling for batches
        return []; 
    }
}

// 3. THE IMAGE SCRAPER FUNCTION
async function extractOgImage(articleUrl) {

    // We fetch the article's HTML and use Cheerio to look for the Open Graph image tag, which is commonly used for social media previews. 
    // If we find it, we return that URL. If not, we return a cool fallback image URL.
    try {
        const response = await fetch(articleUrl);
        const html = await response.text();
        
        // Load the HTML into Cheerio so we can query it like the browser DOM
        const $ = cheerio.load(html);
        
        // Look for the Open Graph image tag
        const ogImage = $('meta[property="og:image"]').attr('content');
        
        // Return the image, or a cool fallback image if the article has none
        return ogImage || 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?q=80&w=1000&auto=format&fit=crop';
    } catch (error) {
        console.error(`Failed to fetch image for ${articleUrl}:`, error.message);
        return 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?q=80&w=1000&auto=format&fit=crop';
    }
}

// 4. THE MAIN INGESTION LOOP
async function runIngestionPipeline() {
    // Added a timestamp to the log so we can track the cron jobs
    console.log(`\n📡 [${new Date().toLocaleTimeString()}] Fetching live sports news...`);
    const feed = await parser.parseURL(RSS_FEED_URL);
    // Increased slice from 1 to 5 since we are safely batching with the AI now (Token Defense)
    const topArticles = feed.items.slice(0, 5); 

    // Array to hold only the articles that pass the gate
    const newArticlesToProcess = [];

    // DEFENSE 1 - THE DEDUPLICATION GATE
    // We loop through each article and check the database BEFORE spending AI tokens
    for (const article of topArticles) {

        // For each article, we send a POST request to our Express server's /api/posts/check route to see if the URL already exists in the database.
        try {
            const checkRes = await fetch(CHECK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: article.link })
            });
            const { exists } = await checkRes.json();

            if (!exists) {
                // If the article is NOT in the DB, add it to our batch
                newArticlesToProcess.push({ 
                    title: article.title, 
                    summary: article.contentSnippet, 
                    url: article.link 
                });
            }
        } catch (err) {
            console.error(`🔌 Gate check failed for ${article.title}`);
        }
    }

    // If the array is empty, exit early and save tokens!
    if (newArticlesToProcess.length === 0) {
        console.log(`🛡️ Gate closed: All articles already in database. Zero AI tokens consumed.`);
        return; 
    }

    console.log(`\n🧠 Sending batch of ${newArticlesToProcess.length} new articles to AI...`);
    
    // Pass data to Gemini (Now passing the filtered batch array)
    const aiFormattedPosts = await batchFormatWithGemini(newArticlesToProcess);
    
    if (aiFormattedPosts && aiFormattedPosts.length > 0) {
        console.log(`✅ AI successfully formatted the batch! Saving to database...`);
        
        // Loop through the returned AI array to save each post individually
        for (const post of aiFormattedPosts) {
            
            // Fetch the image directly from the source article!
            const articleImageUrl = await extractOgImage(post.url);

            // Add it to the payload alongside Gemini's data
            const payload = {
                sport_category: post.sport_category,
                headline: post.headline,
                content: post.content,
                excitement_level: post.excitement_level,
                url: post.url,
                image_url: articleImageUrl
            };

            // Send the AI's output to our Express Server via an HTTP POST request
            // This is the built-in Node.js fetch API 
            try {
                const dbResponse = await fetch(SPORTSGRAM_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // We now stringify the new 'payload' object instead of just 'post'
                    body: JSON.stringify(payload) 
                });

                if (dbResponse.ok) {
                    console.log(`💾 Successfully saved to Sportsgram Database: ${post.headline}`);
                } else {
                    console.error(`❌ Failed to save to database. Is the server running?`);
                }
            } catch (networkError) {
                console.error(`🔌 Network Error: Could not reach Express server.`, networkError.message);
            }
        }
    }
    console.log(`\n🏁 Ingestion cycle complete!`);
}

// DEFENSE 3 - STRATEGIC PACING
// Execute the pipeline once immediately on startup...
runIngestionPipeline();

// ...then schedule it to run automatically every 1 hour in the background
cron.schedule('0 * * * *', () => {
    runIngestionPipeline();
});