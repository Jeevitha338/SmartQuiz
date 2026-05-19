const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: '.env' });

async function test() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim());
    const models = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-pro"];
    
    for (const m of models) {
        try {
            console.log("Trying", m);
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.generateContent("hello");
            console.log("Success with", m);
            console.log(result.response.text());
        } catch (e) {
            console.error(m, "failed:", e.message);
        }
    }
}
test();
