import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const analyzeEmail = async (content: string, retries = 3, delay = 1000): Promise<any> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
        You are an AI Recruitment Intelligence Agent. Analyze the following recruitment email and return a JSON response.
        
        Email Content:
        ${content}

        Return JSON with exactly this structure:
        {
          "matchScore": number (0-100),
          "dimensions": {
            "coreSkills": number (0-100),
            "domainExperience": number (0-100),
            "stability": number (0-100),
            "salaryAlignment": number (0-100),
            "communication": number (0-100),
            "noticePeriod": number (0-100)
          },
          "candidateName": "string",
          "summary": "1-sentence summary",
          "strengths": ["string", "string"],
          "gaps": ["string", "string"],
          "outreachDrafts": {
            "founder": "Founder-level, consultative reply",
            "professional": "Direct and standard professional recruiter reply",
            "executive": "Concise, high-level executive decision-style reply",
            "warm": "Friendly, welcoming community-style reply"
          },
          "role": "extracted job title or unknown",
          "intent": "recruitment" | "staffing_inquiry" | "vendor_intro" | "spam" | "other",
          "urgency": "high" | "medium" | "low",
          "priority": "P0" | "P1" | "P2" | "P3"
        }
      `,
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text) return null;
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
  } catch (error: any) {
    // Check for rate limit error (429)
    if (error?.message?.includes('429') || error?.status === 429 || JSON.stringify(error).includes('429')) {
      if (retries > 0) {
        console.warn(`Rate limit hit, retrying in ${delay}ms... (${retries} retries left)`);
        await wait(delay);
        return analyzeEmail(content, retries - 1, delay * 2);
      }
    }
    console.error('Gemini Analysis Error:', error);
    return null;
  }
};
