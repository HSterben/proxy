/**
 * Mic helpers + MediaRecorder speech capture.
 * Transcription goes through PROXY backend (Whisper via OpenRouter-compatible API).
 * Browser Web Speech API is unreliable in Electron, so we do not use it.
 */

const MIC_DEVICE_STORAGE_KEY = 'proxy.micDeviceId';

export function isSpeechToTextSupported() {
  return Boolean(
    typeof window !== 'undefined' &&
      navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined',
  );
}

export function getStoredMicDeviceId() {
  try {
    return localStorage.getItem(MIC_DEVICE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredMicDeviceId(deviceId) {
  try {
    if (deviceId) localStorage.setItem(MIC_DEVICE_STORAGE_KEY, deviceId);
    else localStorage.removeItem(MIC_DEVICE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export async function requestMicrophoneAccess(deviceId = '') {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access is not available in this environment.');
  }
  const constraints = {
    audio: deviceId
      ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true }
      : { echoCancellation: true, noiseSuppression: true },
  };
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    if (deviceId) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } else {
      throw err;
    }
  }
  stream.getTracks().forEach((t) => t.stop());
  return true;
}

export async function listMicrophones() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Microphone ${i + 1}`,
      groupId: d.groupId,
    }));
}

export async function openMicStream(deviceId = '') {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  const audio = deviceId
    ? { deviceId: { ideal: deviceId }, echoCancellation: true, noiseSuppression: true }
    : { echoCancellation: true, noiseSuppression: true };
  try {
    return await navigator.mediaDevices.getUserMedia({ audio });
  } catch {
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

export function stopStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  });
}

export function pickRecorderMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(type)) {
      return type;
    }
  }
  return '';
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
