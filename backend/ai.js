// backend/ai.js
const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");

router.post("/assistant", async (req, res) => {
  try {
    const { textElements, mode } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!textElements || !Array.isArray(textElements) || textElements.length === 0) {
      return res.status(400).json({ error: "No text found on canvas to analyze!" });
    }

    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured in server environment variables." });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let systemInstruction = "";
    let prompt = "";
    const textListString = textElements.join(', ');

    if (mode === "summarize") {
      systemInstruction = "You are an expert executive meeting scribe.";
      prompt = `${systemInstruction}
      
Task: Take the following extracted whiteboard text strings and compile a clean, highly organized, human-readable meeting summary.

STRICT FORMATTING RULES:
1. Do NOT output any markdown symbols such as hashes (#, ##), asterisks (*, **), or bold markdown tags. 
2. Write clear capitalised titles (e.g., MEETING SUMMARY, KEY DECISIONS, NEXT STEPS) to separate sections.
3. Use simple dashes (-) or bullet points (•) for listing items.
4. Add extra empty lines between sections to keep the plain text well-spaced, clean, and highly readable.

Whiteboard text to process: [${textListString}]`;

    } else if (mode === "analyze") {
      systemInstruction = "You are an Elite Cloud Infrastructure Architect.";
      prompt = `${systemInstruction}
      
Task: Look at the following system architecture diagram text components, perform a structural critique, point out missing layers (like security, caching, or databases) based on real-world best practices, and output an architecture review.

STRICT FORMATTING RULES:
1. Do NOT output any markdown symbols such as hashes (#, ##), asterisks (*, **), or bold markdown tags.
2. Write clear capitalised titles (e.g., ARCHITECTURE CRITIQUE, MISSING LAYERS, RECOMMENDATIONS) to separate sections.
3. Use simple dashes (-) or bullet points (•) for listing items.
4. Add extra empty lines between sections to keep the plain text well-spaced, clean, and highly readable.

Architecture components to process: [${textListString}]`;
    } else {
      prompt = `Analyze the following elements: [${textListString}]`;
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();

    return res.json({ success: true, result: responseText });
  } catch (error) {
    console.error("Error communicating with Google Generative AI:", error);
    return res.status(500).json({ 
      error: error.message || "Failed to communicate with AI assistant." 
    });
  }
});

module.exports = router;