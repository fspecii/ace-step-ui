import { GoogleGenAI, Type } from "@google/genai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ''; // Optional client-provided key
const ai = new GoogleGenAI({ apiKey });

export const generateSongData = async (
  topic: string, 
  style: string
): Promise<{ title: string; lyrics: string; tags: string[] }> => {
  if (!apiKey) {
    // Mock response if no API key is present
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          title: "Neon Echoes (Mock)",
          lyrics: "[Verse]\nChecking for API key...\nNone found, so here is a mock.\n\n[Chorus]\nVirtual sounds in a digital world.",
          tags: ["electronic", "mock", "ambient"]
        });
      }, 2000);
    });
  }

  try {
    const prompt = `Generate a song title, lyrics, and 3 style tags based on this user prompt: "${topic}". The style requested is: "${style}". 
    Format the lyrics with standard song structure headers like [Verse], [Chorus].`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-latest",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            lyrics: { type: Type.STRING },
            tags: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["title", "lyrics", "tags"]
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from Gemini");

    return JSON.parse(jsonText);

  } catch (error) {
    console.error("Gemini generation error:", error);
    return {
      title: "Generation Failed",
      lyrics: "[Error]\nCould not generate lyrics at this time.",
      tags: ["error"]
    };
  }
};
