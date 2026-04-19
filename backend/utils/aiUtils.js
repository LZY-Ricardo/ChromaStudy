const config = require("../config");
const { normalizeBaseUrl, clampErrorText } = require("./stringUtils");

function resolveAiConfig(ai) {
  const provider = ai?.provider === "openai" ? "openai" : "ollama";

  if (provider === "openai") {
    const baseUrl = normalizeBaseUrl(ai?.openai?.baseUrl);
    const model =
      typeof ai?.openai?.model === "string" ? ai.openai.model.trim() : "";
    const apiKey =
      typeof ai?.openai?.apiKey === "string" ? ai.openai.apiKey.trim() : "";

    return {
      provider: "openai",
      baseUrl,
      model,
      apiKey,
    };
  }

  const host =
    typeof ai?.ollama?.host === "string" ? ai.ollama.host.trim() : "";
  const model =
    typeof ai?.ollama?.model === "string" ? ai.ollama.model.trim() : "";

  return {
    provider: "ollama",
    host: host || config.ollamaHost,
    model: model || config.ollamaModel,
  };
}

function validateOpenAiConfig(aiConfig) {
  if (!aiConfig.baseUrl || !aiConfig.model || !aiConfig.apiKey) {
    return "openai config requires baseUrl/model/apiKey";
  }
  return "";
}

function validateOpenAiAuth(aiConfig) {
  if (!aiConfig.baseUrl || !aiConfig.apiKey) {
    return "openai config requires baseUrl/apiKey";
  }
  return "";
}

const OPENAI_MODELS_CACHE_TTL_MS = 10 * 60 * 1000;
const openAiModelsCache = new Map();
const openAiModelsInflight = new Map();

function extractOpenAiModelIds(payload) {
  if (Array.isArray(payload?.data)) {
    return payload.data
      .map((item) => (typeof item?.id === "string" ? item.id.trim() : ""))
      .filter(Boolean);
  }
  if (Array.isArray(payload?.models)) {
    return payload.models
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  return [];
}

async function fetchOpenAiModelsFromProvider(aiConfig) {
  const error = validateOpenAiAuth(aiConfig);
  if (error) {
    throw new Error(error);
  }

  const response = await fetch(`${aiConfig.baseUrl}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${aiConfig.apiKey}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`openai request failed: ${response.status} ${clampErrorText(body)}`);
  }

  const data = await response.json().catch(() => ({}));
  const ids = extractOpenAiModelIds(data);
  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
}

async function getOpenAiModelsCached(aiConfig, { refresh = false } = {}) {
  const key = aiConfig.baseUrl;
  if (!key) {
    throw new Error("openai config requires baseUrl/apiKey");
  }

  if (refresh) {
    openAiModelsCache.delete(key);
  }

  const now = Date.now();
  const cached = openAiModelsCache.get(key);
  if (cached && now - cached.at < OPENAI_MODELS_CACHE_TTL_MS && Array.isArray(cached.models)) {
    return cached.models;
  }

  const inflight = openAiModelsInflight.get(key);
  if (inflight) {
    return inflight;
  }

  const promise = fetchOpenAiModelsFromProvider(aiConfig)
    .then((models) => {
      openAiModelsCache.set(key, { at: Date.now(), models });
      openAiModelsInflight.delete(key);
      return models;
    })
    .catch((error) => {
      openAiModelsInflight.delete(key);
      throw error;
    });

  openAiModelsInflight.set(key, promise);
  return promise;
}

async function pingAi(aiConfig) {
  if (aiConfig.provider === "openai") {
    const error = validateOpenAiConfig(aiConfig);
    if (error) {
      return { ok: false, error };
    }

    const response = await fetch(`${aiConfig.baseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        error: `openai request failed: ${response.status} ${clampErrorText(body)}`,
      };
    }

    const data = await response.json().catch(() => ({}));
    const models = Array.isArray(data?.data)
      ? data.data.map((item) => item?.id).filter(Boolean)
      : [];

    return {
      ok: true,
      provider: "openai",
      modelCount: models.length,
    };
  }

  const response = await fetch(`${aiConfig.host}/api/tags`, { method: "GET" });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      error: `ollama request failed: ${response.status} ${clampErrorText(body)}`,
    };
  }

  const data = await response.json().catch(() => ({}));
  const models = Array.isArray(data?.models)
    ? data.models.map((item) => item?.name).filter(Boolean)
    : [];

  return {
    ok: true,
    provider: "ollama",
    modelCount: models.length,
    hasModel: models.includes(aiConfig.model),
  };
}

module.exports = {
  resolveAiConfig,
  validateOpenAiConfig,
  validateOpenAiAuth,
  getOpenAiModelsCached,
  pingAi,
  openAiModelsCache,
};
