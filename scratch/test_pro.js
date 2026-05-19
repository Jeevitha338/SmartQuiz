const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testPro() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log("Testing gemini-pro...");
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent("hello");
    console.log("Success with gemini-pro:", result.response.text());
  } catch (e) {
    console.error("Pro Error:", e.message);
  }
}

testPro();
