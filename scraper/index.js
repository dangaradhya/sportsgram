// 1. IMPORTS & CONFIGURATION
require('dotenv').config(); // Loads your GEMINI_API_KEY from the .env file
const Parser = require('rss-parser');
const { GoogleGenAI } = require('@google/genai'); 

const parser = new Parser();
// Initialize the Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const RSS_FEED_URL = 'https://www.skysports.com/rss/12040';
// This is the URL of your Express API that we built earlier
const SPORTSGRAM_API_URL = 'http://localhost:3000/api/posts'; 

// 2. THE AI REWRITE FUNCTION
// This function takes the boring RSS text and uses Gemini to transform it into strict JSON.
async function formatWithGemini(rawTitle, rawSummary) {
    const prompt = `
    You are Fabrizio Romano, the world's most energetic sports journalist.
    Read the following sports news and extract the core facts.
    Rewrite it as a short, punchy social media update. 
    
    News Headline: ${rawTitle}
    News Summary: ${rawSummary}
    
    Return ONLY a valid JSON object with exact following keys (no markdown formatting, no code blocks):
    - sport_category: (e.g., "Football", "Golf", "Formula 1")
    - headline: (A punchy, exciting headline)
    - content: (The rewritten summary, max 2 sentences. Make it sound exciting)
    - excitement_level: (A number from 1 to 10)
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
        return null; // Return null if the AI fails, acting as error handling
    }
}

// 3. THE MAIN INGESTION LOOP
async function runIngestionPipeline() {
    console.log(`📡 Fetching live sports news...`);
    const feed = await parser.parseURL(RSS_FEED_URL);
    const topArticles = feed.items.slice(0, 1); // Let's just do 1 for testing

    // ADD THIS LINE: Print the entire raw object of the first article
    console.log(topArticles[0]);

    // We loop through each article
    for (const article of topArticles) {
        console.log(`\n🧠 Sending to AI: "${article.title}"...`);
        
        // 1. Pass data to Gemini
        const aiFormattedPost = await formatWithGemini(article.title, article.contentSnippet);
        
        if (aiFormattedPost) {
            console.log(`✅ AI successfully formatted the post! Saving to database...`);
            
            // 2. Send the AI's output to our Express Server via an HTTP POST request
            // This is the built-in Node.js fetch API (similar to Rust's reqwest)
            try {
                const dbResponse = await fetch(SPORTSGRAM_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(aiFormattedPost) // Convert the JS object back to a JSON string
                });

                if (dbResponse.ok) {
                    console.log(`💾 Successfully saved to Sportsgram Database!`);
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

// Execute the pipeline
runIngestionPipeline();