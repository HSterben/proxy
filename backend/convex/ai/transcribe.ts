/**
 * Whisper speech-to-text via OpenAI-compatible /audio/transcriptions.
 * Defaults: GROQ_API_KEY → OpenAI → explicit WHISPER_* overrides.
 * (OpenRouter chat audio is a different API; use Groq/OpenAI for mic dictation.)
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const OPENAI_URL = 'https://api.openai.com/v1/audio/transcriptions';

export function whisperDiagnostics(): {
  configured: boolean;
  provider: 'groq' | 'openai' | 'custom' | 'none';
  keys?: {
    GROQ_API_KEY: boolean;
    OPENAI_API_KEY: boolean;
    WHISPER_API_KEY: boolean;
    WHISPER_API_URL: boolean;
  };
} {
  // Bracket access avoids any static env inlining at bundle time.
  const groq = Boolean(process.env['GROQ_API_KEY']?.trim());
  const openai = Boolean(process.env['OPENAI_API_KEY']?.trim());
  const whisperKey = Boolean(process.env['WHISPER_API_KEY']?.trim());
  const whisperUrl = Boolean(process.env['WHISPER_API_URL']?.trim());
  const keys = {
    GROQ_API_KEY: groq,
    OPENAI_API_KEY: openai,
    WHISPER_API_KEY: whisperKey,
    WHISPER_API_URL: whisperUrl,
  };

  if (whisperUrl) {
    const hasKey = groq || openai || whisperKey || Boolean(process.env['OPENROUTER_API_KEY']?.trim());
    return { configured: hasKey, provider: hasKey ? 'custom' : 'none', keys };
  }
  if (groq) return { configured: true, provider: 'groq', keys };
  if (openai || whisperKey) return { configured: true, provider: 'openai', keys };
  return { configured: false, provider: 'none', keys };
}

function getWhisperConfig() {
  const explicitUrl = process.env['WHISPER_API_URL']?.trim();
  const explicitKey = process.env['WHISPER_API_KEY']?.trim();
  const groqKey = process.env['GROQ_API_KEY']?.trim();
  const openaiKey = process.env['OPENAI_API_KEY']?.trim();

  if (explicitUrl) {
    const apiKey = explicitKey || groqKey || openaiKey || process.env['OPENROUTER_API_KEY']?.trim() || '';
    if (!apiKey) {
      throw new Error('WHISPER_API_URL is set but no API key was found (WHISPER_API_KEY).');
    }
    return {
      apiKey,
      url: explicitUrl,
      model: process.env['WHISPER_MODEL']?.trim() || 'whisper-1',
    };
  }

  if (groqKey) {
    return {
      apiKey: groqKey,
      url: GROQ_URL,
      model: process.env['WHISPER_MODEL']?.trim() || 'whisper-large-v3',
    };
  }

  if (openaiKey || explicitKey) {
    return {
      apiKey: (openaiKey || explicitKey) as string,
      url: OPENAI_URL,
      model: process.env['WHISPER_MODEL']?.trim() || 'whisper-1',
    };
  }

  throw new Error(
    'Speech-to-text needs GROQ_API_KEY or OPENAI_API_KEY in Convex env (Whisper). Browser speech is not used.',
  );
}

function extensionForMime(mime: string): string {
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

function base64ToBytes(audioBase64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(audioBase64, 'base64'));
  }
  const binary = atob(audioBase64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export async function transcribeAudioBase64(args: {
  audioBase64: string;
  mimeType?: string;
  language?: string;
}): Promise<{ text: string; model: string }> {
  return transcribeAudioBytes({
    bytes: base64ToBytes(args.audioBase64),
    mimeType: args.mimeType,
    language: args.language,
  });
}

export async function transcribeAudioBytes(args: {
  bytes: ArrayBuffer | Uint8Array;
  mimeType?: string;
  language?: string;
}): Promise<{ text: string; model: string }> {
  const { apiKey, url, model } = getWhisperConfig();
  const mimeType = (args.mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';
  const bytes =
    args.bytes instanceof Uint8Array ? args.bytes : new Uint8Array(args.bytes);

  const fileBytes = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  const form = new FormData();
  form.append(
    'file',
    new Blob([fileBytes], { type: mimeType }),
    `speech.${extensionForMime(mimeType)}`,
  );
  form.append('model', model);
  if (args.language) form.append('language', args.language);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const raw = await response.text();
  let parsed: { text?: string; error?: { message?: string } | string } = {};
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    /* non-JSON */
  }

  if (!response.ok) {
    const detail =
      typeof parsed.error === 'string'
        ? parsed.error
        : parsed.error?.message || raw.slice(0, 240) || response.statusText;
    throw new Error(`Transcription failed (${response.status}): ${detail}`);
  }

  const text = String(parsed.text || '').trim();
  if (!text) throw new Error('No speech detected. Try again closer to the mic.');
  return { text, model };
}
