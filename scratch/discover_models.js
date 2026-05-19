require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API key found in .env");
    return;
  }
  
  try {
    // Try to use a manual fetch to list models since the SDK might be missing the method or using wrong version
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      console.error("API Error listing models:", JSON.stringify(data.error, null, 2));
    } else if (data.models) {
      console.log("Available Models:");
      data.models.forEach(m => console.log(`- ${m.name} (${m.displayName})`));
    } else {
      console.log("No models found in response:", data);
    }
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

listModels();
