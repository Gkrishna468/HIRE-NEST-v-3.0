/**
 * SECURE AI UTILITY
 * 
 * This utility sends prompts to the /api/ai/proxy endpoint.
 * Benefits:
 * 1. API Key is hidden on the server.
 * 2. Server-side rate limiting prevents abuse.
 * 3. All prompts can be logged for security auditing.
 */

export async function callAIQuietly(prompt: string, context: any = {}) {
  try {
    const response = await fetch("/api/ai/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, config: context }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "AI Service Error");
    }

    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error("Secure AI Fetch Error:", error);
    throw error;
  }
}

/**
 * Robust JSON extractor for AI responses that might contain markdown blocks or leading/trailing text.
 */
export function extractJSON<T = any>(text: string | null | undefined): T | null {
  if (!text) return null;

  try {
    // 1. Try direct parse
    return JSON.parse(text);
  } catch {
    try {
      // 2. Try cleaning markdown blocks
      const cleaned = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      try {
        // 3. Regex to find the first { and last }
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          return JSON.parse(match[0]);
        }
      } catch {
        // 4. Try for arrays []
        try {
          const matchArray = text.match(/\[[\s\S]*\]/);
          if (matchArray) {
            return JSON.parse(matchArray[0]);
          }
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
