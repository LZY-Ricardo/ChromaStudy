export function normalizeBaseUrl(value) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\/+$/, '')
}

export const openAiCompatPresets = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    links: {
      home: 'https://openai.com',
      console: 'https://platform.openai.com',
      docs: 'https://platform.openai.com/docs',
    },
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    links: {
      home: 'https://www.deepseek.com',
      console: 'https://platform.deepseek.com',
      docs: 'https://platform.deepseek.com',
    },
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    links: {
      home: 'https://openrouter.ai',
      console: 'https://openrouter.ai/keys',
      docs: 'https://openrouter.ai/docs',
    },
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.1-70b-versatile',
    links: {
      home: 'https://groq.com',
      console: 'https://console.groq.com/keys',
      docs: 'https://console.groq.com/docs',
    },
  },
  {
    id: 'custom',
    label: '自定义（OpenAI兼容）',
    baseUrl: '',
    defaultModel: '',
    links: {},
  },
]

export function detectOpenAiCompatPresetId(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return 'custom'
  const preset = openAiCompatPresets.find((item) => item.id !== 'custom' && item.baseUrl === normalized)
  return preset?.id ?? 'custom'
}

export function getOpenAiCompatPreset(id) {
  return openAiCompatPresets.find((item) => item.id === id) ?? null
}

export const ollamaLinks = {
  home: 'https://ollama.com',
  library: 'https://ollama.com/library',
  docs: 'https://github.com/ollama/ollama',
}

