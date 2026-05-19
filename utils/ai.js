const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Helper to extract and parse JSON from AI response
 */
function parseAIShow(text) {
  try {
    // Try direct parse
    return JSON.parse(text);
  } catch (e) {
    // Try to extract from markdown blocks
    let jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) jsonMatch = text.match(/```\s*([\s\S]*?)\s*```/);
    
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch (e2) {
        console.error("Failed to parse extracted JSON block:", e2);
      }
    }
    
    // Last ditch: look for anything that looks like an array
    const arrayMatch = text.match(/\[\s*{[\s\S]*}\s*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch (e3) {
        console.error("Failed to parse array match:", e3);
      }
    }
    
    throw new Error("Could not extract valid JSON from AI response: " + text.substring(0, 100) + "...");
  }
}

async function generateQuestionsFromAI(topic, difficulty, count = 5, type = 'mcq') {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing in .env");
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim());
  // Diversify models to increase chance of success
  const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];
  
  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`[AI-TRY] Attempting with model: ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });

      let typePrompt = "";
      if (type === 'mcq') {
          typePrompt = `4-option MCQs. Each should have unique and plausible incorrect options.`;
      } else if (type === 'true_false') {
          typePrompt = `True/False questions.`;
      } else {
          typePrompt = `short-answer text questions (the student will type the answer).`;
      }

      const prompt = `Task: Create a high-quality quiz for a student learning platform.
      Topic: ${topic}
      Difficulty: ${difficulty}
      Total Questions: ${count}
      Format: ${typePrompt}

      Return ONLY a valid JSON array exactly matching this structure (use real data, not placeholder text):
      [
        {
          "questionText": "What is the capital of France?",
          "type": "${type}",
          "options": ["London", "Paris", "Berlin", "Madrid"],
          "correctAnswer": "Paris"
        }
      ]

      Rules:
      1. For true_false, options MUST be ["True", "False"].
      2. For text, options MUST be [].
      3. Ensure all ${count} questions are unique and cover different aspects of ${topic}.
      4. CRITICAL: Every option in the "options" array MUST be unique. Do not repeat the same answer multiple times.
      5. Do not use generic strings like "Option A". Output the actual string of the answer.
      6. Do not include any explanation, markdown blocks, or conversational text.`;

      const start = Date.now();
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const questions = parseAIShow(text);
      console.log(`[AI-DONE] Success with ${modelName}! Took ${Date.now() - start}ms`);
      
      return questions.slice(0, count).map(q => {
        let options = Array.isArray(q.options) ? q.options : [];
        if (q.type === 'mcq') {
            options = options.sort(() => Math.random() - 0.5);
        }
        return {
            questionText: q.questionText || "Untitled Question",
            type: q.type || type,
            options: options,
            correctAnswer: q.correctAnswer || "",
            timeLimit: 15
        };
      });
    } catch (error) {
      console.warn(`[AI-WARN] Model ${modelName} failed:`, error.message);
      lastError = error;
      // Continue to next model loop
    }
  }

  // --- FALLBACK SYSTEM (If all AI models fail) ---
  console.error('All AI models failed. Using diversified fallback data. Last error:', lastError);

  const fallbackTemplates = [
    `What is a fundamental principle of ${topic}?`,
    `Which component is essential for ${topic} to function?`,
    `In the context of ${topic}, what does the primary term refer to?`,
    `Identify a key benefit of using ${topic} in modern applications.`,
    `Which historical development was most crucial for ${topic}?`,
    `What is the most widely recognized standard in ${topic}?`,
    `Describe a common misconception people have about ${topic}.`
  ];

  const optionsPool = [
    ['Core Concept', 'Standard Practice', 'Advanced Theory', 'Experimental Data'],
    ['Historical Fact', 'Modern Application', 'Future Trend', 'Common Myth'],
    ['Primary Method', 'Alternative Approach', 'Deprecated Logic', 'Emerging Tech'],
    ['Key Component', 'Optional Add-on', 'External Dependency', 'Internal Protocol']
  ];

  return Array(count).fill(0).map((_, i) => {
    const template = fallbackTemplates[i % fallbackTemplates.length];
    let options = [...optionsPool[i % optionsPool.length]]; // Clone array
    const correctAnswer = options[0]; // The first one is correct before shuffle
    
    // Shuffle options
    options = options.sort(() => Math.random() - 0.5);

    return {
      questionText: `${template} (Topic: ${topic})`,
      type: 'mcq',
      options: options,
      correctAnswer: correctAnswer,
      timeLimit: 15
    };
  });
}

module.exports = { generateQuestionsFromAI };
