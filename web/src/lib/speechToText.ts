/**
 * Mic helpers + MediaRecorder speech capture.
 * Transcription goes through PROXY backend (Whisper).
 */

const MIC_DEVICE_STORAGE_KEY = 'proxy.micDeviceId'

export type MicDevice = {
  deviceId: string
  label: string
  groupId?: string
}

export function isSpeechToTextSupported(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
      navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined',
  )
}

export function getStoredMicDeviceId(): string {
  try {
    return localStorage.getItem(MIC_DEVICE_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function setStoredMicDeviceId(deviceId: string): void {
  try {
    if (deviceId) localStorage.setItem(MIC_DEVICE_STORAGE_KEY, deviceId)
    else localStorage.removeItem(MIC_DEVICE_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export async function requestMicrophoneAccess(deviceId = ''): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access is not available in this browser.')
  }
  const constraints: MediaStreamConstraints = {
    audio: deviceId
      ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true }
      : { echoCancellation: true, noiseSuppression: true },
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints)
  } catch (err) {
    if (deviceId) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
    } else {
      throw err
    }
  }
  stream.getTracks().forEach((t) => t.stop())
  return true
}

export async function listMicrophones(): Promise<MicDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Microphone ${i + 1}`,
      groupId: d.groupId,
    }))
}

export async function openMicStream(deviceId = ''): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null
  const audio: MediaTrackConstraints = deviceId
    ? { deviceId: { ideal: deviceId }, echoCancellation: true, noiseSuppression: true }
    : { echoCancellation: true, noiseSuppression: true }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio })
  } catch {
    return navigator.mediaDevices.getUserMedia({ audio: true })
  }
}

export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return
  stream.getTracks().forEach((t) => {
    try {
      t.stop()
    } catch {
      /* ignore */
    }
  })
}

export function pickRecorderMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(type)) {
      return type
    }
  }
  return ''
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
