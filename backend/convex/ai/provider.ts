import { resolveAiModelWithSource } from './model';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
};

export type GenerateOptions = {
  messages: ChatMessage[];
  systemPrompt?: string;
  model?: string | null;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string | string[];
  stream?: boolean;
};

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type GenerateResult = {
  content: string;
  model: string;
  modelSource: string;
  usage: TokenUsage;
  finishReason: string;
  id: string;
  messages: ChatMessage[];
};

/** OpenRouter OpenAI-compatible Chat Completions endpoint. */
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw new Error('OPENROUTER_API_KEY is not set in environment variables');
  }
  return key;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'http://localhost:5173',
    'X-Title': process.env.OPENROUTER_X_TITLE || 'PROXY',
  };
}

function buildMessages(options: GenerateOptions): ChatMessage[] {
  const messages = options.messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  if (options.systemPrompt) {
    const hasSystem = messages.some((m) => m.role === 'system');
    if (!hasSystem) {
      messages.unshift({
        role: 'system',
        content: options.systemPrompt,
      });
    }
  }

  return messages;
}

function buildPayload(options: GenerateOptions, stream: boolean) {
  const { model, source } = resolveAiModelWithSource(options.model);
  const messages = buildMessages(options);

  const payload: Record<string, unknown> = {
    model,
    messages,
    stream,
  };

  if (stream) {
    payload.stream_options = { include_usage: true };
  }

  if (options.temperature !== undefined) payload.temperature = options.temperature;
  if (options.maxTokens !== undefined) payload.max_tokens = options.maxTokens;
  if (options.topP !== undefined) payload.top_p = options.topP;
  if (options.frequencyPenalty !== undefined) {
    payload.frequency_penalty = options.frequencyPenalty;
  }
  if (options.presencePenalty !== undefined) {
    payload.presence_penalty = options.presencePenalty;
  }
  if (options.stop !== undefined) payload.stop = options.stop;

  return { payload, model, source, messages };
}

/**
 * Non-streaming completion via OpenRouter (Luna by default).
 * OpenRouter can apply its own provider fallbacks, PROXY does not route.
 */
export async function generateAI(
  options: GenerateOptions
): Promise<GenerateResult> {
  const apiKey = getApiKey();
  const { payload, model, source, messages } = buildPayload(options, false);

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; detail?: string };
      message?: string;
    };
    const errorMessage =
      errorData.error?.message ||
      errorData.error?.detail ||
      errorData.message ||
      `OpenRouter API error: ${response.status} ${response.statusText}`;
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as {
    id: string;
    model: string;
    choices?: Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>;
    usage?: TokenUsage;
  };

  if (!data.choices?.[0]?.message) {
    throw new Error(
      'OpenRouter returned an invalid response: no message in choice'
    );
  }

  const assistantContent = data.choices[0].message.content ?? '';
  const content =
    typeof assistantContent === 'string'
      ? assistantContent
      : JSON.stringify(assistantContent);

  const assistantMessage: ChatMessage = {
    role: 'assistant',
    content,
  };

  return {
    content,
    model: data.model || model,
    modelSource: source,
    usage: {
      prompt_tokens: data.usage?.prompt_tokens ?? 0,
      completion_tokens: data.usage?.completion_tokens ?? 0,
      total_tokens: data.usage?.total_tokens ?? 0,
    },
    finishReason: data.choices[0].finish_reason || 'stop',
    id: data.id,
    messages: [...messages, assistantMessage],
  };
}

/**
 * Streaming completion. Returns the raw OpenRouter SSE Response.
 * Final chunk may include usage when stream_options.include_usage is set.
 */
export async function streamAI(options: GenerateOptions): Promise<{
  response: Response;
  model: string;
  modelSource: string;
}> {
  const apiKey = getApiKey();
  const { payload, model, source } = buildPayload(options, true);

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(
      errorData.error?.message ||
        `OpenRouter API error: ${response.status} ${response.statusText}`
    );
  }

  return { response, model, modelSource: source };
}

export function weightedTokensFromUsage(usage: {
  prompt_tokens?: number;
  completion_tokens?: number;
}): number {
  const inputTokens = usage.prompt_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? 0;
  return inputTokens + outputTokens * 6;
}
