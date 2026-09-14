/**
 * Direct OpenRouter test, same API as the app (model/prompt via env).
 *
 * From backend folder:
 *   npm run test:openrouter
 *
 * backend/.env.local:
 *   OPENROUTER_API_KEY=sk-or-v1-...
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');

function loadEnvFile(name) {
  const p = path.join(backendRoot, name);
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL =
  process.env.openrouter_model_name ||
  process.env.OPENROUTER_MODEL_NAME ||
  process.env.TEST_MODEL ||
  process.env.BENCHMARK_MODEL ||
  'arcee-ai/trinity-large-preview:free';
const SYSTEM =
  process.env.TEST_SYSTEM ||
  'You are PROXY, an expert AI assistant. Be concise and helpful. Always provide clear, accurate information and assist the user to the best of your ability.';
const USER_PROMPT =
  process.env.TEST_PROMPT ||
  'Explain the difference between regex and context-free grammar';
const MAX_TOKENS = Number(process.env.TEST_MAX_TOKENS || '1024');

function ms() {
  return performance.now();
}

async function main() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.error('\nSet OPENROUTER_API_KEY in backend/.env.local (same key as Convex).\n');
    process.exit(1);
  }

  console.log('\n========== OpenRouter test (direct) ==========');
  console.log('Model:', MODEL);
  console.log('max_tokens:', MAX_TOKENS);
  console.log('Prompt:', USER_PROMPT.slice(0, 100) + (USER_PROMPT.length > 100 ? '…' : ''));
  console.log('');

  const t0 = ms();
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://proxy.app',
      'X-Title': 'PROXY OpenRouter test',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: USER_PROMPT },
      ],
      stream: false,
      max_tokens: MAX_TOKENS,
      temperature: 0.5,
    }),
  });
  const t1 = ms();
  const data = await res.json();

  if (!res.ok) {
    console.error('OpenRouter error:', JSON.stringify(data).slice(0, 500));
    process.exit(1);
  }

  const content = data?.choices?.[0]?.message?.content || '';
  console.log(`Total: ${(t1 - t0).toFixed(0)} ms`);
  console.log(`Response length: ${content.length} chars\n`);
  console.log('--- Reply preview ---');
  console.log(content.slice(0, 800) + (content.length > 800 ? '\n…' : ''));
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
