require('dotenv').config({ path: '.env' });
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  try {
     const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
     const data = await res.json();
     console.log("Models:", data.models ? data.models.map(m => m.name) : data);
  } catch(e) {
      console.log(e);
  }
}

test();
