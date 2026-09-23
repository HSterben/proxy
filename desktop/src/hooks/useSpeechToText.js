import { useCallback, useEffect, useRef, useState } from 'react';
import {
  blobToBase64,
  isSpeechToTextSupported,
  openMicStream,
  pickRecorderMimeType,
  stopStream,
} from '../lib/speechToText';

/** How often to refresh live transcript while the mic is open. */
const PARTIAL_INTERVAL_MS = 2500;
const MIN_PARTIAL_BYTES = 1200;
const MIN_FINAL_BYTES = 256;

/**
 * Toggle mic: record with MediaRecorder, stream interim Whisper text into the
 * input every few seconds, then finalize when stopped.
 */
export function useSpeechToText({
  deviceId = '',
  enabled = true,
  getAuthToken,
  transcribeUrl,
  onPartial,
  onResult,
  onError,
} = {}) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micStream, setMicStream] = useState(null);
  const [supported] = useState(() => isSpeechToTextSupported());
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const deviceIdRef = useRef(deviceId);
  const onPartialRef = useRef(onPartial);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const getAuthTokenRef = useRef(getAuthToken);
  const transcribeUrlRef = useRef(transcribeUrl);
  const sessionRef = useRef(0);
  const partialTimerRef = useRef(null);
  const partialKickoffRef = useRef(null);
  const partialInFlightRef = useRef(false);
  const lastPartialTextRef = useRef('');

  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);
  useEffect(() => {
    onPartialRef.current = onPartial;
  }, [onPartial]);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    getAuthTokenRef.current = getAuthToken;
  }, [getAuthToken]);
  useEffect(() => {
    transcribeUrlRef.current = transcribeUrl;
  }, [transcribeUrl]);

  const clearPartialTimer = useCallback(() => {
    if (partialTimerRef.current != null) {
      clearInterval(partialTimerRef.current);
      partialTimerRef.current = null;
    }
    if (partialKickoffRef.current != null) {
      clearTimeout(partialKickoffRef.current);
      partialKickoffRef.current = null;
    }
  }, []);

  const cleanupRecorder = useCallback(() => {
    clearPartialTimer();
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    stopStream(streamRef.current);
    streamRef.current = null;
    setMicStream(null);
    chunksRef.current = [];
    setListening(false);
  }, [clearPartialTimer]);

  useEffect(() => () => cleanupRecorder(), [cleanupRecorder]);

  const transcribeBlob = useCallback(async (blob, { allowEmpty = false } = {}) => {
    const url = transcribeUrlRef.current;
    if (!url) throw new Error('Speech endpoint is not configured.');
    const token = (await getAuthTokenRef.current?.()) || null;
    if (!token) throw new Error('Sign in to use speech-to-text.');

    const audioBase64 = await blobToBase64(blob);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioBase64,
        mimeType: blob.type || 'audio/webm',
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Transcription failed (${response.status})`);
    }
    const text = String(data.text || '').trim();
    if (!text && !allowEmpty) throw new Error('No speech detected. Try again.');
    return text;
  }, []);

  const currentRecordingBlob = useCallback(() => {
    const type =
      mediaRecorderRef.current?.mimeType || pickRecorderMimeType() || 'audio/webm';
    return new Blob(chunksRef.current, { type });
  }, []);

  const runPartialTranscribe = useCallback(async (session) => {
    if (partialInFlightRef.current) return;
    if (session !== sessionRef.current) return;
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    const blob = currentRecordingBlob();
    if (!blob || blob.size < MIN_PARTIAL_BYTES) return;

    partialInFlightRef.current = true;
    try {
      const text = await transcribeBlob(blob, { allowEmpty: true });
      if (session !== sessionRef.current) return;
      if (!text) return;
      lastPartialTextRef.current = text;
      onPartialRef.current?.(text);
    } catch {
      /* Interim failures are expected (tiny clips, network blips). */
    } finally {
      partialInFlightRef.current = false;
    }
  }, [currentRecordingBlob, transcribeBlob]);

  const start = useCallback(async () => {
    if (!enabled || !supported || listening || transcribing || mediaRecorderRef.current) return;

    try {
      const stream = await openMicStream(deviceIdRef.current);
      if (!stream) throw new Error('Could not access the microphone.');
      streamRef.current = stream;
      setMicStream(stream);

      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      lastPartialTextRef.current = '';
      sessionRef.current += 1;
      const session = sessionRef.current;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        onErrorRef.current?.('Microphone recording failed.');
        cleanupRecorder();
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setListening(true);

      clearPartialTimer();
      partialTimerRef.current = setInterval(() => {
        void runPartialTranscribe(session);
      }, PARTIAL_INTERVAL_MS);
      // First peek a bit sooner so the input isn't empty for long.
      partialKickoffRef.current = setTimeout(() => {
        partialKickoffRef.current = null;
        void runPartialTranscribe(session);
      }, 1200);
    } catch (err) {
      cleanupRecorder();
      onErrorRef.current?.(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission denied. Open Settings → Audio and pick a mic when Windows asks.'
          : err?.message || 'Could not start the microphone.',
      );
    }
  }, [
    cleanupRecorder,
    clearPartialTimer,
    enabled,
    listening,
    runPartialTranscribe,
    supported,
    transcribing,
  ]);

  const stop = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    clearPartialTimer();

    if (!recorder) {
      cleanupRecorder();
      return;
    }

    const blob = await new Promise((resolve) => {
      recorder.onstop = () => {
        resolve(currentRecordingBlob());
      };
      try {
        recorder.stop();
      } catch {
        resolve(new Blob([]));
      }
    });

    stopStream(streamRef.current);
    streamRef.current = null;
    setMicStream(null);
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setListening(false);

    // Invalidate any lingering partial requests.
    const session = ++sessionRef.current;

    if (!blob || blob.size < MIN_FINAL_BYTES) {
      if (lastPartialTextRef.current) {
        if (session !== sessionRef.current) return;
        onResultRef.current?.(lastPartialTextRef.current);
        lastPartialTextRef.current = '';
        return;
      }
      onErrorRef.current?.('Recording was too short. Hold the mic a moment longer.');
      return;
    }

    setTranscribing(true);
    try {
      const text = await transcribeBlob(blob, { allowEmpty: true });
      if (session !== sessionRef.current) return;
      const finalText = text || lastPartialTextRef.current;
      lastPartialTextRef.current = '';
      if (!finalText) {
        onErrorRef.current?.('No speech detected. Try again.');
        return;
      }
      onResultRef.current?.(finalText);
    } catch (err) {
      if (session !== sessionRef.current) return;
      if (lastPartialTextRef.current) {
        onResultRef.current?.(lastPartialTextRef.current);
        lastPartialTextRef.current = '';
      } else {
        onErrorRef.current?.(err?.message || 'Could not transcribe speech.');
      }
    } finally {
      if (session === sessionRef.current) setTranscribing(false);
    }
  }, [cleanupRecorder, clearPartialTimer, currentRecordingBlob, transcribeBlob]);

  /** Stop recording and discard any pending transcript (e.g. after send). */
  const cancel = useCallback(() => {
    sessionRef.current += 1;
    lastPartialTextRef.current = '';
    clearPartialTimer();
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    stopStream(streamRef.current);
    streamRef.current = null;
    setMicStream(null);
    chunksRef.current = [];
    setListening(false);
    setTranscribing(false);
  }, [clearPartialTimer]);

  const toggle = useCallback(() => {
    if (transcribing) return;
    if (listening) void stop();
    else void start();
  }, [listening, start, stop, transcribing]);

  return {
    supported,
    listening,
    transcribing,
    stream: micStream,
    start,
    stop,
    cancel,
    toggle,
  };
}
