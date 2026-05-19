const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function checkModels() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // There isn't a direct "listModels" in the simple API, 
    // but I can try a common one and see if it fails or use a known one.
    console.log("Testing gemini-1.5-flash...");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Say hello");
    console.log("Response:", result.response.text());
  } catch (e) {
    console.error("Error:", e.message);
  }
}

checkModels();
