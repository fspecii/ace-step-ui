import { GoogleGenAI } from "@google/genai";
import { generateApi } from "./api";

export interface SongGenerationResult {
  title?: string;
  lyrics?: string;
  style?: string;
  tags?: string[];
}

export const lmService = {
  getSettings() {
    return {
      backend: localStorage.getItem('ace-lm-backend') || 'local',
      geminiApiKey: localStorage.getItem('ace-gemini-api-key') || '',
      koboldApiUrl: localStorage.getItem('ace-kobold-api-url') || 'http://localhost:5001/api/v1/generate',
      lyricsPrompt: localStorage.getItem('ace-lyrics-prompt') || 'Generate professional song lyrics based on the topic: "{{topic}}". \nStyle requested: {{style}}. \nFormat with [Verse], [Chorus] headers. \nReturn only the lyrics.',
      stylePrompt: localStorage.getItem('ace-style-prompt') || 'Based on the user topic: "{{topic}}", suggest a detailed music style description (genre, mood, instruments). \nKeep it concise (1-2 sentences).',
      titlePrompt: localStorage.getItem('ace-title-prompt') || 'Based on the lyrics or topic: "{{topic}}", suggest a catchy song title. \nReturn only the title.',
    };
  },

  async generateLyrics(topic: string, style: string): Promise<string> {
    const settings = this.getSettings();
    const prompt = settings.lyricsPrompt
      .replace('{{topic}}', topic)
      .replace('{{style}}', style);

    if (settings.backend === 'gemini' && settings.geminiApiKey) {
      return this.generateWithGemini(prompt, settings.geminiApiKey);
    } else if (settings.backend === 'koboldcpp') {
      return this.generateWithKobold(prompt, settings.koboldApiUrl);
    } else {
      return this.generateWithLocal(topic, style, 'lyrics');
    }
  },

  async generateStyle(topic: string): Promise<string> {
    const settings = this.getSettings();
    const prompt = settings.stylePrompt.replace('{{topic}}', topic);

    if (settings.backend === 'gemini' && settings.geminiApiKey) {
      return this.generateWithGemini(prompt, settings.geminiApiKey);
    } else if (settings.backend === 'koboldcpp') {
      return this.generateWithKobold(prompt, settings.koboldApiUrl);
    } else {
      return this.generateWithLocal(topic, "", 'style');
    }
  },

  async generateTitle(topic: string): Promise<string> {
    const settings = this.getSettings();
    const prompt = settings.titlePrompt.replace('{{topic}}', topic);

    if (settings.backend === 'gemini' && settings.geminiApiKey) {
      return this.generateWithGemini(prompt, settings.geminiApiKey);
    } else if (settings.backend === 'koboldcpp') {
      return this.generateWithKobold(prompt, settings.koboldApiUrl);
    } else {
      // Local title generation not explicitly supported by format API, 
      // but it often returns a title in some variants. 
      // For now, we'll just use Gemini/Kobold for title generation.
      return "";
    }
  },

  async generateWithLocal(topic: string, style: string, target: 'lyrics' | 'style'): Promise<string> {
    try {
      const token = localStorage.getItem('acestep_token') || localStorage.getItem('token');
      if (!token) throw new Error("Not authenticated");

      const result = await generateApi.formatInput({
        caption: topic || style || "music",
        lyrics: target === 'lyrics' ? "" : undefined,
      }, token);

      if (target === 'lyrics') {
        return result.lyrics || "Failed to generate lyrics locally.";
      } else {
        return result.caption || "Failed to generate style locally.";
      }
    } catch (error) {
      console.error("Local LM error:", error);
      throw new Error(`Local generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async generateWithGemini(prompt: string, apiKey: string): Promise<string> {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt
      });
      return (response.text || "").trim();
    } catch (error: any) {
      console.error("Gemini error:", error);
      throw new Error(`Gemini failed: ${error.message || String(error)}`);
    }
  },

  async generateWithKobold(prompt: string, apiUrl: string): Promise<string> {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          max_context_length: 2048,
          max_length: 512,
          temperature: 0.7,
          top_p: 0.9,
        }),
      });

      if (!response.ok) throw new Error(`Koboldcpp error: ${response.status}`);

      const data = await response.json();
      return (data.results?.[0]?.text || "").trim();
    } catch (error) {
      console.error("Koboldcpp error:", error);
      throw new Error(`Koboldcpp failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async formatInput(params: {
    caption: string;
    lyrics?: string;
    bpm?: number;
    duration?: number;
    keyScale?: string;
    timeSignature?: string;
  }): Promise<{
    success: boolean;
    caption?: string;
    lyrics?: string;
    bpm?: number;
    duration?: number;
    key_scale?: string;
    language?: string;
    time_signature?: string;
    status_message?: string;
    error?: string;
  }> {
    const settings = this.getSettings();

    if (settings.backend === 'gemini' && settings.geminiApiKey) {
      return this.formatWithGemini(params, settings.geminiApiKey);
    }

    // For other backends, we return null so the caller (CreatePanel) knows to fall back to the server API
    // or we could throw an error, but returning null/undefined is safer if we change the return type.
    // However, keeping strict typing, let's signal to fallback.
    return { success: false, error: "FALLBACK_TO_SERVER" };
  },

  async formatWithGemini(params: any, apiKey: string): Promise<any> {
    try {
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `You are a professional music producer assistant. Analyze the following user input and enhance/format it.
      
      User Style/Caption: "${params.caption || ''}"
      User Lyrics: "${params.lyrics || ''}"
      
      Task:
      1. Enhance the style description to be more descriptive (genre, instruments, mood) if it's too short.
      2. If lyrics are provided, ensure they are formatted with [Verse], [Chorus] tags.
      3. Infer or suggest the best BPM, Duration (in seconds), Key Scale, Time Signature, and Vocal Language.
      4. If user provided BPM/Duration/etc, respect them unless they are 0.
      
      User constraints (0 or empty means auto):
      BPM: ${params.bpm}
      Duration: ${params.duration}
      Key: ${params.keyScale}
      Time Sig: ${params.timeSignature}
      
      Return a JSON object with this structure:
      {
        "caption": "enhanced style string",
        "lyrics": "formatted lyrics string",
        "bpm": number,
        "duration": number,
        "key_scale": "C Major etc",
        "time_signature": "4/4 etc",
        "language": "en" 
      }`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const text = response.text || "{}";
      const data = JSON.parse(text);

      return {
        success: true,
        caption: data.caption,
        lyrics: data.lyrics,
        bpm: data.bpm,
        duration: data.duration,
        key_scale: data.key_scale,
        time_signature: data.time_signature,
        language: data.language
      };
    } catch (error: any) {
      console.error("Gemini format error:", error);
      return { success: false, error: error.message || String(error) };
    }
  }
};
