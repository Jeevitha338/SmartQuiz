const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function listModels() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // The SDK doesn't have a direct 'listModels' on the main class usually, 
        // but we can try to hit the endpoint or just try 'gemini-1.5-flash-latest'
        
        console.log("Trying gemini-1.5-flash-latest...");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const result = await model.generateContent("Hi");
        console.log("Success with gemini-1.5-flash-latest!");
    } catch (error) {
        console.error("Failed:", error.message);
    }
}

listModels();
