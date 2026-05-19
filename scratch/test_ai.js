const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: '.env' });

async function testAI() {
    const key = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : null;
    console.log("Testing with Key:", key);
    
    if (!key) {
        console.error("No API key found in .env");
        return;
    }

    try {
        const genAI = new GoogleGenerativeAI(key);
        // Try flash first
        console.log("Trying gemini-1.5-flash...");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Say hello");
        console.log("Flash Response:", result.response.text());
    } catch (error) {
        console.error("Flash Failed:", error.message);
        
        try {
            console.log("Trying gemini-pro...");
            const genAI = new GoogleGenerativeAI(key);
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await model.generateContent("Say hello");
            console.log("Pro Response:", result.response.text());
        } catch (e2) {
            console.error("Pro Failed:", e2.message);
        }
    }
}

testAI();
