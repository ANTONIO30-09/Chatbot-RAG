module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GROQ_BASE: 'https://api.groq.com/openai/v1',
  MODELOS: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_BASE: 'https://generativelanguage.googleapis.com/v1beta/openai',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  GEMINI_TIMEOUT_MS: 8000,
  STT_MODEL: 'whisper-large-v3-turbo',
  LLM_TIMEOUT_MS: 12000,
  STT_TIMEOUT_MS: 30000,
  MAX_HISTORIAL: 6,
  MAX_MSG_CHARS: 600,
  TOP_K: 4,
  LIMITE_POR_MINUTO: 60,
  MAX_AUDIO_BYTES: 5 * 1024 * 1024
};
