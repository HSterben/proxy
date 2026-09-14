import { ConvexClient } from 'convex/browser';
import { api } from '../../../backend/convex/_generated/api';
import { convexUrl } from './convexUrls';

/** Free-tier official defaults (offline / signed-out fallback). */
export const FREE_DEFAULT_PRESETS = {
  Simplify: {
    description: 'Make it simpler.',
    systemInstruction:
      'You are a helpful assistant that simplifies text. Make it clearer and easier to understand. Use shorter sentences and plain language. Preserve the main ideas.',
    temperature: 0.3,
    frequencyPenalty: 0,
    presencePenalty: 0,
  },
  List: {
    description: 'Make a bullet list.',
    systemInstruction: 'Summarize the main points of any provided text as a concise bullet list.',
    temperature: 0.2,
    frequencyPenalty: 0.1,
    presencePenalty: 0.05,
  },
  Critique: {
    description: 'Give writing feedback.',
    systemInstruction:
      'Provide constructive feedback focusing on clarity, coherence, organization, and style. Offer at least two specific suggestions for improvement.',
    temperature: 0.4,
    frequencyPenalty: 0.15,
    presencePenalty: 0.1,
  },
};

export function subjectFromAccessToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Pull the signed-in account's library from Convex and mirror it to disk.
 * Broadcasts so bubble / chat / states windows stay aligned.
 */
export async function pullCloudStatesToDisk({
  token,
  writePresets,
  setPresetsOwner,
} = {}) {
  if (!token || !writePresets) return null;

  const client = new ConvexClient(convexUrl);
  try {
    client.setAuth(async () => token);
    try {
      await client.mutation(api.states.ensureMyLibrary, {});
    } catch (migrateErr) {
      console.warn('Library ensure skipped:', migrateErr);
    }

    const cloud = await client.query(api.states.getMyStates, {});
    if (!cloud?.states || Object.keys(cloud.states).length === 0) {
      return null;
    }

    await writePresets(cloud.states, { broadcast: true });
    const subject = subjectFromAccessToken(token);
    if (subject && setPresetsOwner) {
      await setPresetsOwner(subject);
    }
    return cloud.states;
  } finally {
    try {
      client.close?.();
    } catch {
      /* ignore */
    }
  }
}

export async function resetLocalStatesToFreeDefaults({
  writePresets,
  setPresetsOwner,
} = {}) {
  if (!writePresets) return FREE_DEFAULT_PRESETS;
  await writePresets(FREE_DEFAULT_PRESETS, { broadcast: true });
  if (setPresetsOwner) await setPresetsOwner(null);
  return FREE_DEFAULT_PRESETS;
}
