const PREVIEW_COMPOSE_FPS = 15;
const RECORD_COMPOSE_FPS = 30;
const AUDIO_BITRATE = 256_000;
const PREFERRED_WEBM = 'video/webm;codecs=vp9,opus';
const MP4_CANDIDATES = [
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=h264,aac',
  'video/mp4',
];
const SYSTEM_AUDIO_GAIN = 0.85;
const MEETING_SOURCE_HINTS = [
  { pattern: /zoom meeting/i, label: 'Zoom' },
  { pattern: /zoom/i, label: 'Zoom' },
  { pattern: /google chrome|chrome/i, label: 'Google Meet (Chrome)' },
  { pattern: /meet/i, label: 'Meet' },
  { pattern: /microsoft teams|teams/i, label: 'Teams' },
  { pattern: /webex/i, label: 'Webex' },
  { pattern: /slack/i, label: 'Slack' },
  { pattern: /discord/i, label: 'Discord' },
];
const CAMERA_IDEAL_WIDTH = 1280;
const CAMERA_IDEAL_HEIGHT = 720;

const sourceSelect = document.getElementById('source-select');
const refreshBtn = document.getElementById('refresh-sources');
const preview = document.getElementById('preview');
const composeCanvas = document.getElementById('compose-canvas');
const recordBtn = document.getElementById('record-btn');
const stopBtn = document.getElementById('stop-btn');
const statusEl = document.getElementById('status');
const cameraEnabled = document.getElementById('camera-enabled');
const cameraSelect = document.getElementById('camera-select');
const bubbleSize = document.getElementById('bubble-size');
const bubbleSizeVal = document.getElementById('bubble-size-val');
const bubbleCorner = document.getElementById('bubble-corner');
const micEnabled = document.getElementById('mic-enabled');
const systemAudioEnabled = document.getElementById('system-audio-enabled');
const micSelect = document.getElementById('mic-select');
const enhancedNoise = document.getElementById('enhanced-noise');
const voiceBoost = document.getElementById('voice-boost');
const voiceBoostVal = document.getElementById('voice-boost-val');
const qualityMode = document.getElementById('quality-mode');
const minimizeOnRecord = document.getElementById('minimize-on-record');
const exportFormat = document.getElementById('export-format');
const refreshDevicesBtn = document.getElementById('refresh-devices');
const previewPanel = document.getElementById('preview-panel');
const previewHint = document.getElementById('preview-hint');
const previewBadge = document.getElementById('preview-badge');
const scriptText = document.getElementById('script-text');
const togglePrompter = document.getElementById('toggle-prompter');
const fontSize = document.getElementById('font-size');
const scrollSpeed = document.getElementById('scroll-speed');
const fontSizeVal = document.getElementById('font-size-val');
const scrollSpeedVal = document.getElementById('scroll-speed-val');
const scrollPlay = document.getElementById('scroll-play');
const scrollPause = document.getElementById('scroll-pause');
const scrollReset = document.getElementById('scroll-reset');

let mediaStream = null;
let micStream = null;
let audioContext = null;
let recordingAVStream = null;
let cameraStream = null;
let composedPreviewStream = null;
let mediaRecorder = null;
let chunks = [];
let recordingStartedAt = 0;
let totalPausedMs = 0;
let pauseStartedAt = 0;
let timerInterval = null;
let prompterOpen = false;
let isRecording = false;
let isPaused = false;
let pauseSupported = false;
let composeRafId = null;
let composeStreamFps = 0;
let screenVideo = null;
let cameraVideo = null;
let composeCtx = null;
let recordWidth = 1280;
let recordHeight = 720;
let activeSourceId = null;

composeCtx = composeCanvas?.getContext('2d');
if (composeCtx) {
  composeCtx.imageSmoothingEnabled = true;
  composeCtx.imageSmoothingQuality = 'high';
  applyRecordDimensions();
}

function getTargetDimensions() {
  if (qualityMode?.value === '1080') return { w: 1920, h: 1080, bitrate: 12_000_000 };
  return { w: 1280, h: 720, bitrate: 6_000_000 };
}

function applyRecordDimensions() {
  const { w, h } = getTargetDimensions();
  recordWidth = w;
  recordHeight = h;
  if (composeCanvas) {
    composeCanvas.width = w;
    composeCanvas.height = h;
  }
}

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`.trim();
}

function logEvent(level, message, meta) {
  window.crownRecord?.log(level, message, meta).catch(() => {});
}

function pickMimeType() {
  if (exportFormat?.value === 'mp4') {
    const mp4 = MP4_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
    if (mp4) return mp4;
    setStatus('MP4 not supported — using WebM.', '');
  }
  if (MediaRecorder.isTypeSupported(PREFERRED_WEBM)) return PREFERRED_WEBM;
  return ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm'].find((t) =>
    MediaRecorder.isTypeSupported(t),
  ) || '';
}

function extensionForMime(mimeType) {
  return mimeType?.includes('mp4') ? 'mp4' : 'webm';
}

function needsCompositor() {
  return Boolean(cameraEnabled.checked && cameraStream);
}

function meetingRank(name) {
  const lower = name.toLowerCase();
  for (let i = 0; i < MEETING_SOURCE_HINTS.length; i += 1) {
    if (MEETING_SOURCE_HINTS[i].pattern.test(lower)) return i;
  }
  return 50;
}

function formatTimer(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

function getElapsedMs() {
  if (!isRecording) return 0;
  if (isPaused) return pauseStartedAt - recordingStartedAt - totalPausedMs;
  return Date.now() - recordingStartedAt - totalPausedMs;
}

function pushHud(recording) {
  window.crownRecord.setHudState({
    recording,
    paused: isPaused,
    pauseSupported,
    elapsedMs: getElapsedMs(),
    timer: formatTimer(getElapsedMs()),
  });
}

function updateRecordingPreviewUi() {
  previewPanel?.classList.toggle('is-recording', isRecording);
  if (previewBadge) previewBadge.hidden = !isRecording;
  if (previewHint && isRecording) {
    previewHint.textContent = needsCompositor()
      ? 'Recording at full quality — bubble is in the saved file. Live preview here if the window is open.'
      : 'Recording at full quality — screen only (lighter on CPU).';
  } else if (previewHint && !isRecording && needsCompositor()) {
    previewHint.textContent =
      'Webcam bubble shows here and will be burned into your saved video at 30fps.';
  }
}

function stopMic() {
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = null;
}

function stopAudioMixer() {
  stopMic();
  if (audioContext?.state !== 'closed') audioContext.close().catch(() => {});
  audioContext = null;
  recordingAVStream = null;
}

function stopCamera() {
  cameraStream?.getTracks().forEach((t) => t.stop());
  cameraStream = null;
  if (cameraVideo) {
    cameraVideo.srcObject = null;
    cameraVideo = null;
  }
}

function stopComposedPreviewStream() {
  composedPreviewStream?.getTracks().forEach((t) => t.stop());
  composedPreviewStream = null;
  composeStreamFps = 0;
}

function stopComposeLoop() {
  if (composeRafId != null) {
    cancelAnimationFrame(composeRafId);
    composeRafId = null;
  }
}

function stopPreviewStream() {
  stopComposeLoop();
  stopComposedPreviewStream();
  isRecording = false;
  isPaused = false;
  totalPausedMs = 0;
  stopAudioMixer();
  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;
  stopCamera();
  if (screenVideo) {
    screenVideo.srcObject = null;
    screenVideo = null;
  }
  preview.srcObject = null;
}

function getBubbleGeometry() {
  const scale = composeCanvas.width / recordWidth;
  const diameter = Number(bubbleSize.value) * scale;
  const margin = 44 * scale;
  const radius = diameter / 2;
  const corner = bubbleCorner.value;
  const cx = corner === 'br' ? composeCanvas.width - margin - radius : margin + radius;
  const cy = composeCanvas.height - margin - radius;
  return { cx, cy, radius, diameter };
}

function drawCameraBubble() {
  if (!cameraVideo || !cameraStream) return;
  const vw = cameraVideo.videoWidth;
  const vh = cameraVideo.videoHeight;
  if (!vw || !vh) return;

  const { cx, cy, radius, diameter } = getBubbleGeometry();
  const border = Math.max(4, radius * 0.06);
  composeCtx.save();
  composeCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  composeCtx.shadowBlur = 28;
  composeCtx.shadowOffsetY = 10;
  composeCtx.beginPath();
  composeCtx.arc(cx, cy, radius + border, 0, Math.PI * 2);
  composeCtx.fillStyle = '#ffffff';
  composeCtx.fill();
  composeCtx.shadowColor = 'transparent';
  composeCtx.beginPath();
  composeCtx.arc(cx, cy, radius, 0, Math.PI * 2);
  composeCtx.clip();
  const cover = Math.max(diameter / vw, diameter / vh);
  composeCtx.translate(cx, cy);
  composeCtx.scale(-1, 1);
  composeCtx.drawImage(cameraVideo, -(vw * cover) / 2, -(vh * cover) / 2, vw * cover, vh * cover);
  composeCtx.restore();
}

function drawComposeFrame() {
  if (!needsCompositor() || !screenVideo) return;
  const vw = screenVideo.videoWidth;
  const vh = screenVideo.videoHeight;
  if (vw && vh) {
    composeCtx.drawImage(screenVideo, 0, 0, composeCanvas.width, composeCanvas.height);
  } else {
    composeCtx.fillStyle = '#000';
    composeCtx.fillRect(0, 0, composeCanvas.width, composeCanvas.height);
  }
  drawCameraBubble();
  composeRafId = requestAnimationFrame(drawComposeFrame);
}

async function ensureScreenVideo() {
  if (!screenVideo) {
    screenVideo = document.createElement('video');
    screenVideo.muted = true;
    screenVideo.playsInline = true;
  }
  if (screenVideo.srcObject !== mediaStream) {
    screenVideo.srcObject = mediaStream;
    await screenVideo.play().catch(() => {});
    if (screenVideo.readyState < 2) {
      await new Promise((r) => { screenVideo.onloadeddata = () => r(); });
    }
  }
}

async function ensureCameraVideo() {
  if (!cameraVideo) {
    cameraVideo = document.createElement('video');
    cameraVideo.muted = true;
    cameraVideo.playsInline = true;
  }
  cameraVideo.srcObject = cameraStream;
  await cameraVideo.play().catch(() => {});
  if (cameraVideo.readyState < 2) {
    await new Promise((r) => { cameraVideo.onloadeddata = () => r(); });
  }
}

function ensureComposedStream() {
  const fps = isRecording ? RECORD_COMPOSE_FPS : PREVIEW_COMPOSE_FPS;
  if (!composedPreviewStream || composeStreamFps !== fps) {
    stopComposedPreviewStream();
    composedPreviewStream = composeCanvas.captureStream(fps);
    composeStreamFps = fps;
  }
}

function getVideoStreamForRecording() {
  if (needsCompositor()) {
    ensureComposedStream();
    return composedPreviewStream;
  }
  return mediaStream;
}

function desktopAudioConstraints(sourceId) {
  return {
    mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId },
  };
}

function videoConstraintAttempts(sourceId) {
  return [
    {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        minWidth: recordWidth,
        minHeight: recordHeight,
        maxWidth: recordWidth,
        maxHeight: recordHeight,
        maxFrameRate: 30,
      },
    },
    {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxFrameRate: 30,
      },
    },
    {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
      },
    },
  ];
}

async function bindPreviewStream(stream) {
  preview.srcObject = stream;
  await new Promise((resolve) => {
    if (preview.readyState >= 1) {
      resolve();
      return;
    }
    preview.onloadedmetadata = () => resolve();
    setTimeout(resolve, 2000);
  });
  await preview.play().catch(() => {});
}

async function waitForPreviewFrames(videoEl, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

async function captureVideoStream(sourceId) {
  const errors = [];

  for (const video of videoConstraintAttempts(sourceId)) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
      const track = stream?.getVideoTracks()[0];
      if (track && track.readyState === 'live') {
        logEvent('info', 'Video capture ok', {
          label: track.label,
          settings: track.getSettings(),
        });
        return stream;
      }
      stream?.getTracks().forEach((t) => t.stop());
    } catch (err) {
      errors.push(err.message);
      logEvent('warn', 'Capture attempt failed', { message: err.message });
    }
  }

  try {
    await window.crownRecord.setCaptureSource(sourceId);
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const track = stream?.getVideoTracks()[0];
    if (track) {
      logEvent('info', 'Video capture ok (displayMedia)', { label: track.label });
      return stream;
    }
  } catch (err) {
    errors.push(err.message);
    logEvent('warn', 'displayMedia failed', { message: err.message });
  }

  throw new Error(errors[errors.length - 1] || 'Screen capture failed');
}

async function addSystemAudioTrack(stream, sourceId) {
  if (!systemAudioEnabled.checked) return false;
  if (stream.getAudioTracks().some((t) => t.readyState === 'live')) return true;

  try {
    const audioStream = await navigator.mediaDevices.getUserMedia({
      audio: desktopAudioConstraints(sourceId),
      video: false,
    });
    const tracks = audioStream.getAudioTracks();
    if (!tracks.length) return false;
    tracks.forEach((t) => stream.addTrack(t));
    return true;
  } catch (err) {
    logEvent('warn', 'System audio unavailable', { message: err.message });
    return false;
  }
}

async function captureDesktopStream(sourceId) {
  activeSourceId = sourceId;
  const stream = await captureVideoStream(sourceId);
  await addSystemAudioTrack(stream, sourceId);
  return stream;
}

async function ensureSystemAudio() {
  if (!mediaStream || !activeSourceId) return;
  await addSystemAudioTrack(mediaStream, activeSourceId);
}

function formatCaptureStatus(stream, audioNote) {
  const track = stream?.getVideoTracks()[0];
  if (!track) return `Ready${audioNote}.`;
  const s = track.getSettings();
  return `Capturing ${s.width || '?'}×${s.height || '?'} @ ${Math.round(s.frameRate || 30)}fps${audioNote}`;
}

async function loadMicDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  const mics = devices.filter((d) => d.kind === 'audioinput');
  const prev = micSelect.value;
  micSelect.innerHTML = '<option value="">Default microphone</option>';
  mics.forEach((mic) => {
    const opt = document.createElement('option');
    opt.value = mic.deviceId;
    opt.textContent = mic.label || `Microphone ${micSelect.length}`;
    micSelect.appendChild(opt);
  });
  if (prev && [...micSelect.options].some((o) => o.value === prev)) micSelect.value = prev;
}

async function loadCameraDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  const cameras = devices.filter((d) => d.kind === 'videoinput');
  const prev = cameraSelect.value;
  cameraSelect.innerHTML = '<option value="">Default camera</option>';
  if (!cameras.length) {
    cameraSelect.innerHTML = '<option value="">No camera found</option>';
    return;
  }
  cameras.forEach((cam) => {
    const opt = document.createElement('option');
    opt.value = cam.deviceId;
    opt.textContent = cam.label || `Camera ${cameraSelect.length}`;
    cameraSelect.appendChild(opt);
  });
  if (prev && [...cameraSelect.options].some((o) => o.value === prev)) cameraSelect.value = prev;
}

async function requestDeviceLabels() {
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 1, height: 1 } });
    tmp.getTracks().forEach((t) => t.stop());
  } catch { /* permission pending */ }
}

async function refreshAllDevices(notify = true) {
  await requestDeviceLabels();
  await loadMicDevices();
  await loadCameraDevices();
  if (notify) setStatus('Microphone and camera lists updated.', 'ok');
}

async function startMicCapture() {
  stopMic();
  const enhanced = enhancedNoise?.checked !== false;
  const boost = voiceBoost ? Number(voiceBoost.value) / 100 : 1;
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: micSelect.value ? { exact: micSelect.value } : undefined,
      echoCancellation: true,
      noiseSuppression: enhanced,
      autoGainControl: enhanced,
      channelCount: 2,
      sampleRate: 48000,
    },
    video: false,
  });
  return { micStream, boost, enhanced };
}

async function buildRecordingStream() {
  const videoStream = getVideoStreamForRecording();
  const videoTrack = videoStream?.getVideoTracks()[0];
  if (!videoTrack) throw new Error('No video track');

  const wantMic = micEnabled.checked;
  const wantSystem = systemAudioEnabled.checked;
  const systemTracks = mediaStream?.getAudioTracks().filter((t) => t.readyState === 'live') || [];

  if (!wantMic && (!wantSystem || !systemTracks.length)) {
    return new MediaStream([videoTrack]);
  }

  audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  let inputs = 0;

  if (wantMic) {
    try {
      const { boost, enhanced } = await startMicCapture();
      if (micStream?.getAudioTracks().length) {
        const gain = audioContext.createGain();
        gain.gain.value = boost;
        const src = audioContext.createMediaStreamSource(micStream);
        if (enhanced) {
          const hp = audioContext.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 90;
          src.connect(hp).connect(gain).connect(destination);
        } else {
          src.connect(gain).connect(destination);
        }
        inputs += 1;
      }
    } catch (err) {
      throw new Error(`Microphone failed: ${err.message}`);
    }
  }

  if (wantSystem && systemTracks.length) {
    const gain = audioContext.createGain();
    gain.gain.value = SYSTEM_AUDIO_GAIN;
    audioContext.createMediaStreamSource(new MediaStream(systemTracks)).connect(gain).connect(destination);
    inputs += 1;
  }

  const mixed = destination.stream.getAudioTracks();
  if (!mixed.length || !inputs) {
    stopAudioMixer();
    throw new Error('No audio inputs available');
  }

  recordingAVStream = new MediaStream([videoTrack, ...mixed]);
  return recordingAVStream;
}

async function updatePreviewOutput() {
  if (!mediaStream) return;
  await ensureScreenVideo();

  if (needsCompositor()) {
    ensureComposedStream();
    if (!composeRafId) drawComposeFrame();
    preview.srcObject = composedPreviewStream;
    await preview.play().catch(() => {});
  } else {
    stopComposeLoop();
    stopComposedPreviewStream();
    await bindPreviewStream(mediaStream);
  }
  updateRecordingPreviewUi();
}

function populateSourceSelect(sources) {
  sourceSelect.innerHTML = '';
  const sorted = [...sources].sort(
    (a, b) => meetingRank(a.name) - meetingRank(b.name) || a.label.localeCompare(b.label),
  );
  const screens = sorted.filter((s) => s.kind === 'screen');
  const meetings = sorted.filter((s) => s.kind === 'window' && meetingRank(s.name) < 50);
  const windows = sorted.filter((s) => s.kind === 'window' && meetingRank(s.name) >= 50);

  function addGroup(label, items, prefix = '') {
    if (!items.length) return;
    const grp = document.createElement('optgroup');
    grp.label = label;
    items.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${prefix}${s.label}`;
      grp.appendChild(opt);
    });
    sourceSelect.appendChild(grp);
  }

  addGroup('Entire screen', screens);
  addGroup('Meetings & browsers (recommended)', meetings, '★ ');
  addGroup('Application windows', windows);
}

async function loadSources() {
  sourceSelect.disabled = true;
  sourceSelect.innerHTML = '<option value="">Loading…</option>';
  try {
    const sources = await window.crownRecord.getSources();
    if (!sources.length) {
      sourceSelect.innerHTML = '<option value="">No sources found</option>';
      setStatus('No capture sources found.', 'error');
      return;
    }
    populateSourceSelect(sources);
    sourceSelect.disabled = false;
    setStatus(`${sources.length} sources — grouped by screen, meetings, and apps.`);
    await attachStream(sourceSelect.value);
    if (mediaStream) recordBtn.disabled = false;
  } catch (err) {
    logEvent('error', 'Sources failed', { message: err.message });
    setStatus(`Sources failed: ${err.message}`, 'error');
  }
}

async function attachStream(sourceId) {
  if (!sourceId) return;
  const wasCameraOn = cameraEnabled.checked;
  const cameraDevice = cameraSelect.value;
  stopPreviewStream();
  cameraEnabled.checked = wasCameraOn;
  applyRecordDimensions();

  try {
    setStatus('Connecting to source…', '');
    mediaStream = await captureDesktopStream(sourceId);
    await loadMicDevices();
    const audioNote =
      systemAudioEnabled.checked && mediaStream.getAudioTracks().length
        ? ' · system audio on'
        : systemAudioEnabled.checked
          ? ' · system audio pending'
          : '';

    previewHint.textContent =
      'Live preview below. Pick mic/camera before Record. Use 720p mode if the PC feels slow.';

    if (wasCameraOn) {
      if (cameraDevice) cameraSelect.value = cameraDevice;
      await startCamera();
    } else {
      await bindPreviewStream(mediaStream);
      const hasFrames = await waitForPreviewFrames(preview);
      if (!hasFrames) {
        setStatus(
          'Connected but preview is black — try Entire screen, bring window to front, then Refresh.',
          'error',
        );
      } else {
        setStatus(formatCaptureStatus(mediaStream, audioNote), 'ok');
      }
    }
    recordBtn.disabled = false;
  } catch (err) {
    logEvent('error', 'Capture failed', { message: err.message });
    setStatus(`Capture failed: ${err.message}. Try Entire screen or refresh sources.`, 'error');
    recordBtn.disabled = true;
  }
}

async function startCamera() {
  stopCamera();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: cameraSelect.value ? { exact: cameraSelect.value } : undefined,
        width: { ideal: CAMERA_IDEAL_WIDTH, min: 640 },
        height: { ideal: CAMERA_IDEAL_HEIGHT, min: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
    });
    await loadCameraDevices();
    await ensureCameraVideo();
    await updatePreviewOutput();
    const t = cameraStream.getVideoTracks()[0];
    setStatus(`Camera: ${t.label || 'active'}`, 'ok');
  } catch (err) {
    cameraEnabled.checked = false;
    setStatus(`Camera unavailable: ${err.message}`, 'error');
  }
}

async function onCameraToggle() {
  if (!cameraEnabled.checked) {
    stopCamera();
    await updatePreviewOutput();
    if (mediaStream) setStatus('Camera off — lighter CPU usage.', 'ok');
    return;
  }
  if (!mediaStream) {
    cameraEnabled.checked = false;
    setStatus('Pick a source and wait for preview before enabling webcam.', 'error');
    return;
  }
  await loadCameraDevices();
  await startCamera();
}

function setRecordingControlsDisabled(disabled) {
  recordBtn.disabled = disabled;
  stopBtn.disabled = !disabled;
  sourceSelect.disabled = disabled;
  refreshBtn.disabled = disabled;
  cameraEnabled.disabled = disabled;
  cameraSelect.disabled = disabled;
  bubbleSize.disabled = disabled;
  bubbleCorner.disabled = disabled;
  if (exportFormat) exportFormat.disabled = disabled;
  if (qualityMode) qualityMode.disabled = disabled;
  if (refreshDevicesBtn) refreshDevicesBtn.disabled = disabled;
  if (minimizeOnRecord) minimizeOnRecord.disabled = disabled;
  micEnabled.disabled = disabled;
  systemAudioEnabled.disabled = disabled;
  micSelect.disabled = disabled;
  if (enhancedNoise) enhancedNoise.disabled = disabled;
  if (voiceBoost) voiceBoost.disabled = disabled;
}

async function startRecording() {
  if (!mediaStream) {
    setStatus('Select a source first.', 'error');
    return;
  }

  const mimeType = pickMimeType();
  if (!mimeType) {
    setStatus('No supported video codec on this PC.', 'error');
    return;
  }

  isRecording = true;
  isPaused = false;
  totalPausedMs = 0;
  updateRecordingPreviewUi();

  try {
    await ensureScreenVideo();
    await ensureSystemAudio();
    if (cameraEnabled.checked) {
      if (!cameraStream) await startCamera();
      await ensureCameraVideo();
    }
    await updatePreviewOutput();
  } catch (err) {
    isRecording = false;
    setStatus(`Setup failed: ${err.message}`, 'error');
    return;
  }

  let streamForRecorder;
  try {
    streamForRecorder = await buildRecordingStream();
  } catch (err) {
    isRecording = false;
    await updatePreviewOutput();
    setStatus(err.message, 'error');
    return;
  }

  const { bitrate } = getTargetDimensions();
  chunks = [];

  try {
    mediaRecorder = new MediaRecorder(streamForRecorder, {
      mimeType,
      videoBitsPerSecond: bitrate,
      audioBitsPerSecond: AUDIO_BITRATE,
    });
  } catch (err) {
    isRecording = false;
    stopAudioMixer();
    await updatePreviewOutput();
    setStatus(`MediaRecorder error: ${err.message}`, 'error');
    return;
  }

  pauseSupported = typeof mediaRecorder.pause === 'function';

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    clearInterval(timerInterval);
    isRecording = false;
    isPaused = false;
    pushHud(false);
    await window.crownRecord.closeCameraMirror();
    stopAudioMixer();
    await window.crownRecord.restoreMainWindow();
    await updatePreviewOutput();
    setRecordingControlsDisabled(false);
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    updateRecordingPreviewUi();

    const blob = new Blob(chunks, { type: mimeType });
    const result = await window.crownRecord.saveRecording({
      buffer: await blob.arrayBuffer(),
      extension: extensionForMime(mimeType),
      mimeType,
    });

    if (result.saved) setStatus(`Saved: ${result.filePath}`, 'ok');
    else setStatus('Recording discarded.', '');
  };

  mediaRecorder.start(500);
  recordingStartedAt = Date.now();
  pushHud(true);
  timerInterval = setInterval(() => pushHud(true), 250);

  setRecordingControlsDisabled(true);
  recordBtn.disabled = true;
  stopBtn.disabled = false;

  if (minimizeOnRecord?.checked !== false) {
    await window.crownRecord.minimizeMainWindow();
    if (cameraEnabled.checked && cameraStream) {
      await window.crownRecord.openCameraMirror({
        deviceId: cameraSelect.value || '',
        size: Number(bubbleSize.value),
        corner: bubbleCorner.value,
      });
    }
  }

  logEvent('info', 'Recording started', { mimeType, quality: qualityMode?.value });
  setStatus(`Recording · ${qualityMode?.value === '1080' ? '1080p' : '720p'} · use floating bar to pause/stop`, 'ok');
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
}

function togglePauseRecording() {
  if (!mediaRecorder || !pauseSupported) return;
  if (isPaused) {
    mediaRecorder.resume();
    totalPausedMs += Date.now() - pauseStartedAt;
    isPaused = false;
  } else if (mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
    pauseStartedAt = Date.now();
    isPaused = true;
  }
  pushHud(true);
}

function syncTeleprompterText() {
  if (prompterOpen) window.crownRecord.setTeleprompterText(scriptText.value);
}

function sendPrompterControl(action, extra = {}) {
  window.crownRecord.teleprompterControl({
    action,
    fontSize: Number(fontSize.value),
    scrollSpeed: Number(scrollSpeed.value),
    ...extra,
  });
}

navigator.mediaDevices.addEventListener('devicechange', async () => {
  const prevMic = micSelect.value;
  await refreshAllDevices(false);
  if (prevMic && [...micSelect.options].some((o) => o.value === prevMic)) {
    micSelect.value = prevMic;
  }
  if (isRecording) {
    setStatus('New device detected — mic list updated. Stop recording to switch safely.', '');
  } else {
    setStatus('New audio/video device detected — list refreshed.', 'ok');
  }
});

sourceSelect.addEventListener('change', () => attachStream(sourceSelect.value));
refreshBtn.addEventListener('click', loadSources);
recordBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
cameraEnabled.addEventListener('change', onCameraToggle);
cameraSelect.addEventListener('change', () => { if (cameraEnabled.checked) startCamera(); });
bubbleSize?.addEventListener('input', () => { bubbleSizeVal.textContent = bubbleSize.value; });
systemAudioEnabled.addEventListener('change', () => { if (sourceSelect.value) attachStream(sourceSelect.value); });
qualityMode?.addEventListener('change', () => {
  if (sourceSelect.value && !isRecording) attachStream(sourceSelect.value);
});
voiceBoost?.addEventListener('input', () => { voiceBoostVal.textContent = voiceBoost.value; });
refreshDevicesBtn?.addEventListener('click', () => refreshAllDevices(true));
micSelect.addEventListener('change', () => {
  if (isRecording) setStatus('Mic will apply on next recording.', '');
});

togglePrompter.addEventListener('click', async () => {
  if (prompterOpen) {
    await window.crownRecord.closeTeleprompter();
    prompterOpen = false;
    togglePrompter.textContent = 'Open overlay';
  } else {
    await window.crownRecord.openTeleprompter();
    prompterOpen = true;
    togglePrompter.textContent = 'Close overlay';
    syncTeleprompterText();
    sendPrompterControl('sync');
  }
});

scriptText.addEventListener('input', syncTeleprompterText);
fontSize.addEventListener('input', () => { fontSizeVal.textContent = fontSize.value; sendPrompterControl('fontSize'); });
scrollSpeed.addEventListener('input', () => { scrollSpeedVal.textContent = scrollSpeed.value; sendPrompterControl('scrollSpeed'); });
scrollPlay.addEventListener('click', () => sendPrompterControl('play'));
scrollPause.addEventListener('click', () => sendPrompterControl('pause'));
scrollReset.addEventListener('click', () => sendPrompterControl('reset'));

async function initSupportUi() {
  const openLogsBtn = document.getElementById('open-logs');
  const logPathEl = document.getElementById('log-path');
  try {
    const info = await window.crownRecord.getLogInfo();
    if (info.logFile) logPathEl.textContent = `Logs: ${info.logFile}`;
  } catch {
    logPathEl.textContent = 'Logs available after app starts.';
  }
  openLogsBtn.addEventListener('click', async () => {
    await window.crownRecord.openLogFolder();
    setStatus('Log folder opened.', 'ok');
  });
}

function boot() {
  if (!window.crownRecord) {
    setStatus('App bridge failed to load. Restart CrownRecord.', 'error');
    return;
  }

  window.crownRecord.onRecordingCommand((action) => {
    if (action === 'stop') stopRecording();
    if (action === 'pause') togglePauseRecording();
  });

  loadSources();
  loadMicDevices();
  initSupportUi();
}

window.addEventListener('beforeunload', () => {
  stopPreviewStream();
});

window.addEventListener('error', (e) => {
  setStatus(`Error: ${e.message}`, 'error');
  logEvent('error', 'Renderer error', { message: e.message });
});

window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message || String(e.reason);
  setStatus(`Error: ${msg}`, 'error');
  logEvent('error', 'Unhandled rejection', { message: msg });
});

boot();
