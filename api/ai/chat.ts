import { GoogleGenAI } from "@google/genai";

export const config = {
  maxDuration: 60,
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set in environment' });
  }

  try {
    const { prompt, context } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    const ai = new GoogleGenAI({ apiKey });
    
    // Inject system instructions for the recruitment OS
    const systemPrompt = `You are HireNest AI, a high-performance recruitment assistant. 
    ${context ? `Context of current page: ${JSON.stringify(context)}` : ""}
    User Message: ${prompt}`;
    
    const response = await ai.models.generateContent({
      model: "gemini-1.5-pro",
      contents: systemPrompt
    });

    res.status(200).json({ reply: response.text }); // Match common "reply" key
  } catch (error: any) {
    console.error("AI API Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate AI response" });
  }
}
