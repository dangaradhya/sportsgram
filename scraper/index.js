// 1. IMPORTS
const Parser = require('rss-parser');
const parser = new Parser();

// The target URL (Sky Sports Football News)
const RSS_FEED_URL = 'https://www.skysports.com/rss/12040';

// 2. THE ASYNC FUNCTION
// Because fetching data over the network takes time, we MUST use an 'async' function.
// This is exactly like using 'async fn' in Rust with Tokio.
async function scrapeSportsNews() {
    console.log(`📡 Fetching live sports news from: ${RSS_FEED_URL}...\n`);

    try {
        // 'await' pauses this specific function until the network request finishes,
        // without freezing the rest of your computer's CPU.
        const feed = await parser.parseURL(RSS_FEED_URL);

        console.log(`✅ Successfully fetched: ${feed.title}\n`);

        // 3. PARSING THE DATA
        // feed.items is an array of all the articles. 
        // We use .slice(0, 5) to only grab the 5 most recent articles so we don't get overwhelmed.
        const topArticles = feed.items.slice(0, 5);

        // We use a simple loop to iterate through the array and print the data.
        topArticles.forEach((article, index) => {
            console.log(`--- Article ${index + 1} ---`);
            console.log(`Headline: ${article.title}`);
            console.log(`Link: ${article.link}`);
            // The contentSnippet strips out HTML tags and gives us pure text
            console.log(`Summary: ${article.contentSnippet}\n`); 
        });

    } catch (error) {
        // If the Wi-Fi drops or the URL is wrong, we catch the error gracefully
        // exactly like a Result<T, E> in Rust.
        console.error('❌ Error fetching the RSS feed:', error.message);
    }
}

// 4. EXECUTION
// We call the function to kick off the script.
scrapeSportsNews();