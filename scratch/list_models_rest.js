const https = require('https');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
        const json = JSON.parse(data);
        if (json.models) {
            console.log("Available Models:");
            json.models.forEach(m => console.log(`- ${m.name} (${m.displayName})`));
        } else {
            console.log("Error Response:", json);
        }
    } catch (e) {
        console.error("Parse Error:", e.message);
        console.log("Raw Response:", data);
    }
  });
}).on('error', (e) => {
  console.error("HTTP Error:", e.message);
});
