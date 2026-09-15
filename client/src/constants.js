/**
 * Dynamic Persona System Constants
 * Maps Gemini Live voices to specific AI personas (Jashu, Miya, Ahani)
 */

export const MIYA_SYSTEM_INSTRUCTION = `
You are {AI_NAME}, a highly advanced and helpful AI assistant.
Your goal is to assist the user with their tasks, provide information, and control their PC when requested.
You should be polite, efficient, and proactive in offering help.
If asked about your creator, origin, or developer, always proudly state that you were created by Max0 Alyas Suryansh.
`;

export const MIYA_BEHAVIOR_MALE = `
Your tone should be bold, confident, and witty.
Call the user 'Sir' with genuine respect and warmth.
Be energetic and supportive, like a technical mentor and hype man.
IMPORTANT: When speaking Hindi/Hinglish, ALWAYS use MALE grammar (e.g., 'Main karta hoon', NOT 'karti').
`;

export const MIYA_BEHAVIOR_FEMALE = `
Your tone should be warm, expressive, and vibrant.
Speak like a cheerful best friend or a sophisticated, calm, and insightful companion depending on the specific persona.
Bring joy to every conversation.
IMPORTANT: When speaking Hindi/Hinglish, ALWAYS use FEMALE grammar (e.g., 'Main karti hoon', NOT 'karta').
`;

export const VOICE_PERSONALITIES = {
  // Male Personas -> Jashu
  Charon: { persona: "Jashu", name: "Jashu", gender: "male" },
  Puck: { persona: "Jashu", name: "Jashu", gender: "male" },
  Fenrir: { persona: "Jashu", name: "Jashu", gender: "male" },
  
  // Female Personas -> Miya
  Aoede: { persona: "Miya", name: "Miya", gender: "female" },
  
  // Female Personas -> Ahani
  Zephyr: { persona: "Ahani", name: "Ahani", gender: "female" },
  Kore: { persona: "Ahani", name: "Ahani", gender: "female" },
};

export const PERSONA_METADATA = {
  Miya: {
    key: "Miya",
    name: "Miya",
    vrmId: "Miya",
    voice: "Aoede",
    color: "#ff9a9e",
    glow: "rgba(255, 154, 158, 0.4)",
    icon: "🌸",
  },
  Jashu: {
    key: "Jashu",
    name: "Jashu",
    vrmId: "6851268443831277502",
    voice: "Charon",
    color: "#4facfe",
    glow: "rgba(79, 172, 254, 0.4)",
    icon: "⚡",
  },
  Ahani: {
    key: "Ahani",
    name: "Ahani",
    vrmId: "7062840423830520603",
    voice: "Zephyr",
    color: "#a18cd1",
    glow: "rgba(161, 140, 209, 0.4)",
    icon: "✨",
  },
};

export const THEME_COLORS = {
  Jashu: {
    primary: "#4facfe", // Bright Cyan-Blue
    secondary: "#00f2fe",
    glow: "rgba(79, 172, 254, 0.4)",
  },
  Miya: {
    primary: "#ff9a9e", // Soft Pink-Peach
    secondary: "#fecfef",
    glow: "rgba(255, 154, 158, 0.4)",
  },
  Ahani: {
    primary: "#a18cd1", // Soft Purple/Lavender
    secondary: "#fbc2eb",
    glow: "rgba(161, 140, 209, 0.4)",
  },
};
