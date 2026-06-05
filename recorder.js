const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;
const VIDEO_BITRATE = 12_000_000;
const AUDIO_BITRATE = 256_000;
const PREFERRED_WEBM = 'video/webm;codecs=vp9,opus';
const MP4_CANDIDATES = [
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=h264,aac',
  'video/mp4',
];
const MIC_GAIN = 1;
const SYSTEM_AUDIO_GAIN = 0.85;
const COMPOSE_FPS = 30;
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
const scriptText = document.getElementById('script-text');
const togglePrompter = document.getElementById('toggle-prompter');
const fontSize = document.getElementById('font-size');
const scrollSpeed = document.getElementById('scroll-speed');
const fontSizeVal = document.getElementById('font-size-val');
const scrollSpeedVal = document.getElementById('scroll-speed-val');
const scrollPlay = document.getElementById('scroll-play');
const scrollPause = document.getElementById('scroll-pause');
const scrollReset = document.getElementById('scroll-reset');
const exportFormat = document.getElementById('export-format');
const refreshDevicesBtn = document.getElementById('refresh-devices');
const previewPanel = document.getElementById('preview-panel');
const previewHint = document.getElementById('preview-hint');
const previewBadge = document.getElementById('preview-badge');

let mediaStream = null;
let micStream = null;
let audioContext = null;
let recordingAVStream = null;
let cameraStream = null;
let composedPreviewStream = null;
let mediaRecorder = null;
let chunks = [];
let recordingStartedAt = 0;
let timerInterval = null;
let prompterOpen = false;
let isRecording = false;
let composeRafId = null;
let screenVideo = null;
let cameraVideo = null;
let composeCtx = null;

composeCanvas.width = TARGET_WIDTH;
composeCanvas.height = TARGET_HEIGHT;
composeCtx = composeCanvas.getContext('2d');
composeCtx.imageSmoothingEnabled = true;
composeCtx.imageSmoothingQuality = 'high';

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`.trim();
}

function logEvent(level, message, meta) {
  if (window.crownRecord?.log) {
    window.crownRecord.log(level, message, meta).catch(() => {});
  }
}

function pickMimeType() {
  const wantMp4 = exportFormat?.value === 'mp4';

  if (wantMp4) {
    const mp4 = MP4_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
    if (mp4) return mp4;
    setStatus('MP4 encoding not supported here — recording as WebM instead.', '');
  }

  if (MediaRecorder.isTypeSupported(PREFERRED_WEBM)) return PREFERRED_WEBM;
  const fallbacks = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm',
  ];
  return fallbacks.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

function extensionForMime(mimeType) {
  return mimeType && mimeType.includes('mp4') ? 'mp4' : 'webm';
}

function updateRecordingPreviewUi() {
  if (!previewPanel) return;
  previewPanel.classList.toggle('is-recording', isRecording);
  if (previewBadge) {
    previewBadge.hidden = !isRecording;
  }
  if (previewHint) {
    if (isRecording) {
      const cam = cameraEnabled.checked && cameraStream;
      previewHint.textContent = cam
        ? 'Live preview — screen + webcam bubble (saved to your file).'
        : 'Live preview — screen capture (saved to your file).';
    }
  }
}

function shouldComposite() {
  return isRecording || (cameraEnabled.checked && cameraStream);
}

function stopMic() {
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
}

function stopAudioMixer() {
  stopMic();
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {});
  }
  audioContext = null;
  recordingAVStream = null;
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  if (cameraVideo) {
    cameraVideo.srcObject = null;
    cameraVideo = null;
  }
}

function stopComposedPreviewStream() {
  if (composedPreviewStream) {
    composedPreviewStream.getTracks().forEach((t) => t.stop());
    composedPreviewStream = null;
  }
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
  stopAudioMixer();

  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  stopCamera();

  if (screenVideo) {
    screenVideo.srcObject = null;
    screenVideo = null;
  }

  preview.srcObject = null;
}

function formatTimer(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  if (h > 0) return `${h}:${m}:${s}`;
  return `${m}:${s}`;
}

function getBubbleGeometry() {
  const scale = composeCanvas.width / TARGET_WIDTH;
  const diameter = Number(bubbleSize.value) * scale;
  const margin = 44 * scale;
  const radius = diameter / 2;
  const corner = bubbleCorner.value;
  const cx =
    corner === 'br'
      ? composeCanvas.width - margin - radius
      : margin + radius;
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
  const dw = vw * cover;
  const dh = vh * cover;

  composeCtx.translate(cx, cy);
  composeCtx.scale(-1, 1);
  composeCtx.drawImage(cameraVideo, -dw / 2, -dh / 2, dw, dh);

  composeCtx.restore();
}

function drawComposeFrame() {
  if (!shouldComposite() || !screenVideo) return;

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
      await new Promise((resolve) => {
        screenVideo.onloadeddata = () => resolve();
      });
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
    await new Promise((resolve) => {
      cameraVideo.onloadeddata = () => resolve();
    });
  }
}

function getStreamForRecorder() {
  return composedPreviewStream;
}

function desktopVideoConstraints(sourceId) {
  return {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: sourceId,
      minWidth: TARGET_WIDTH,
      minHeight: TARGET_HEIGHT,
      maxWidth: TARGET_WIDTH,
      maxHeight: TARGET_HEIGHT,
      maxFrameRate: 30,
    },
  };
}

function meetingRank(name) {
  const lower = name.toLowerCase();
  for (let i = 0; i < MEETING_SOURCE_HINTS.length; i += 1) {
    if (MEETING_SOURCE_HINTS[i].pattern.test(lower)) return i;
  }
  return 50;
}

function sortSourcesForPicker(sources) {
  return [...sources].sort(
    (a, b) => meetingRank(a.name) - meetingRank(b.name) || a.name.localeCompare(b.name),
  );
}

function formatCaptureStatus(stream, audioNote) {
  const video = stream?.getVideoTracks()[0];
  if (!video) return `Preview ready${audioNote}.`;
  const s = video.getSettings();
  const w = s.width || '?';
  const h = s.height || '?';
  const fps = s.frameRate ? `${Math.round(s.frameRate)}fps` : '30fps';
  return `Capturing ${w}×${h} @ ${fps} · VP9 ${VIDEO_BITRATE / 1_000_000}Mbps${audioNote}`;
}

function desktopAudioConstraints(sourceId) {
  return {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: sourceId,
    },
  };
}

async function captureDesktopStream(sourceId, includeSystemAudio) {
  const video = desktopVideoConstraints(sourceId);

  if (!includeSystemAudio) {
    return navigator.mediaDevices.getUserMedia({ audio: false, video });
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: desktopAudioConstraints(sourceId),
      video,
    });
  } catch (err) {
    setStatus(
      `System audio unavailable for this source — video only. (${err.message})`,
      'error',
    );
    return navigator.mediaDevices.getUserMedia({ audio: false, video });
  }
}

async function loadMicDevices() {
  let devices = [];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    return;
  }

  const mics = devices.filter((d) => d.kind === 'audioinput');
  const prev = micSelect.value;

  micSelect.innerHTML = '<option value="">Default microphone</option>';
  for (const mic of mics) {
    const opt = document.createElement('option');
    opt.value = mic.deviceId;
    opt.textContent = mic.label || `Microphone ${micSelect.length}`;
    micSelect.appendChild(opt);
  }

  if (prev && [...micSelect.options].some((o) => o.value === prev)) {
    micSelect.value = prev;
  }
}

async function startMicCapture() {
  stopMic();

  const deviceId = micSelect.value;
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 2,
      sampleRate: 48000,
    },
    video: false,
  });

  return micStream;
}

async function buildRecordingStream() {
  const videoStream = getStreamForRecorder();
  if (!videoStream) throw new Error('No composited video stream');

  const videoTrack = videoStream.getVideoTracks()[0];
  if (!videoTrack) throw new Error('No video track');

  const wantMic = micEnabled.checked;
  const wantSystem = systemAudioEnabled.checked;
  const systemTracks = mediaStream
    ? mediaStream.getAudioTracks().filter((t) => t.readyState === 'live')
    : [];

  if (!wantMic && (!wantSystem || !systemTracks.length)) {
    return new MediaStream([videoTrack]);
  }

  audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  let inputs = 0;

  if (wantMic) {
    try {
      await startMicCapture();
      if (micStream?.getAudioTracks().length) {
        const gain = audioContext.createGain();
        gain.gain.value = MIC_GAIN;
        audioContext
          .createMediaStreamSource(micStream)
          .connect(gain)
          .connect(destination);
        inputs += 1;
      }
    } catch (err) {
      throw new Error(`Microphone failed: ${err.message}`);
    }
  }

  if (wantSystem && systemTracks.length) {
    const gain = audioContext.createGain();
    gain.gain.value = SYSTEM_AUDIO_GAIN;
    audioContext
      .createMediaStreamSource(new MediaStream(systemTracks))
      .connect(gain)
      .connect(destination);
    inputs += 1;
  }

  const mixedAudio = destination.stream.getAudioTracks();
  if (!mixedAudio.length || inputs === 0) {
    stopAudioMixer();
    if (wantMic && !wantSystem) {
      throw new Error('Microphone produced no audio track');
    }
    if (wantSystem && !wantMic) {
      throw new Error('No system audio track on this capture source');
    }
    throw new Error('No audio inputs available');
  }

  recordingAVStream = new MediaStream([videoTrack, ...mixedAudio]);
  return recordingAVStream;
}

function setAudioControlsDisabled(disabled) {
  micEnabled.disabled = disabled;
  systemAudioEnabled.disabled = disabled;
  micSelect.disabled = disabled;
}

async function updatePreviewOutput() {
  if (!mediaStream) return;

  await ensureScreenVideo();

  if (shouldComposite()) {
    if (!composedPreviewStream) {
      composedPreviewStream = composeCanvas.captureStream(COMPOSE_FPS);
    }
    if (!composeRafId) {
      drawComposeFrame();
    }
    preview.srcObject = composedPreviewStream;
  } else {
    stopComposeLoop();
    stopComposedPreviewStream();
    preview.srcObject = mediaStream;
  }

  await preview.play().catch(() => {});
  updateRecordingPreviewUi();
}

async function requestDeviceLabels() {
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { width: 1, height: 1 },
    });
    tmp.getTracks().forEach((t) => t.stop());
  } catch {
    /* labels may stay generic until record */
  }
}

async function refreshAllDevices() {
  await requestDeviceLabels();
  await loadMicDevices();
  await loadCameraDevices();
  cameraSelect.disabled = false;
  setStatus('Microphone and camera lists updated.', 'ok');
}

async function loadCameraDevices() {
  let devices = [];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    return;
  }

  const cameras = devices.filter((d) => d.kind === 'videoinput');
  const prev = cameraSelect.value;

  cameraSelect.innerHTML = '';
  if (!cameras.length) {
    cameraSelect.innerHTML = '<option value="">No camera found</option>';
    cameraSelect.disabled = true;
    return;
  }

  for (const cam of cameras) {
    const opt = document.createElement('option');
    opt.value = cam.deviceId;
    opt.textContent = cam.label || `Camera ${cameraSelect.length + 1}`;
    cameraSelect.appendChild(opt);
  }

  if (prev && [...cameraSelect.options].some((o) => o.value === prev)) {
    cameraSelect.value = prev;
  }
}

async function startCamera() {
  const deviceId = cameraSelect.value;
  const constraints = {
    audio: false,
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: CAMERA_IDEAL_WIDTH, min: 640 },
      height: { ideal: CAMERA_IDEAL_HEIGHT, min: 480 },
      frameRate: { ideal: 30, max: 30 },
      facingMode: 'user',
    },
  };

  stopCamera();

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    await loadCameraDevices();

    const track = cameraStream.getVideoTracks()[0];
    const settings = track.getSettings();
    const label = track.label || 'Camera';
    setStatus(
      `Camera on · ${label} (${settings.width || '?'}×${settings.height || '?'})`,
      'ok',
    );

    await ensureCameraVideo();
    await updatePreviewOutput();
  } catch (err) {
    cameraEnabled.checked = false;
    setStatus(`Camera blocked or unavailable: ${err.message}`, 'error');
  }
}

async function onCameraToggle() {
  if (cameraEnabled.checked) {
    await loadCameraDevices();
    if (!cameraSelect.value && cameraSelect.options.length) {
      cameraSelect.selectedIndex = 0;
    }
    if (!mediaStream) {
      setStatus('Select a screen source first, then enable camera.', 'error');
      cameraEnabled.checked = false;
      cameraSelect.disabled = true;
      return;
    }
    await startCamera();
  } else {
    stopCamera();
    await updatePreviewOutput();
    if (mediaStream) setStatus('Camera off. Screen preview active.', 'ok');
  }
}

function pushHud(recording) {
  const elapsed = recording ? Date.now() - recordingStartedAt : 0;
  window.crownRecord.setHudState({
    recording,
    elapsedMs: elapsed,
    timer: formatTimer(elapsed),
  });
}

async function loadSources() {
  sourceSelect.disabled = true;
  sourceSelect.innerHTML = '<option value="">Loading…</option>';

  try {
    const sources = await window.crownRecord.getSources();
    sourceSelect.innerHTML = '';

    if (!sources.length) {
      sourceSelect.innerHTML = '<option value="">No sources found</option>';
      setStatus('No capture sources. Grant screen capture permission.', 'error');
      return;
    }

    const sorted = sortSourcesForPicker(sources);
    for (const s of sorted) {
      const opt = document.createElement('option');
      opt.value = s.id;
      const rank = meetingRank(s.name);
      const prefix = rank < 50 ? '★ ' : '';
      opt.textContent = `${prefix}${s.name}`;
      sourceSelect.appendChild(opt);
    }

    sourceSelect.disabled = false;
    recordBtn.disabled = false;
    setStatus(
      `${sources.length} sources ready. ★ = Zoom, Meet, Teams, etc. — pick the meeting window.`,
    );
    await attachStream(sourceSelect.value);
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

  try {
    mediaStream = await captureDesktopStream(
      sourceId,
      systemAudioEnabled.checked,
    );

    await loadMicDevices();

    const sysTracks = mediaStream.getAudioTracks();
    const audioNote =
      systemAudioEnabled.checked && sysTracks.length
        ? ' · system audio on'
        : systemAudioEnabled.checked
          ? ' · system audio pending'
          : '';

    previewHint.textContent =
      'Live preview below. Pick mic, camera, and format before Record. REC/timer only on floating HUD, not in saved video.';

    if (wasCameraOn) {
      if (cameraDevice) cameraSelect.value = cameraDevice;
      await startCamera();
    } else {
      preview.srcObject = mediaStream;
      await preview.play().catch(() => {});
      setStatus(formatCaptureStatus(mediaStream, audioNote), 'ok');
    }
  } catch (err) {
    logEvent('error', 'Capture failed', { message: err.message });
    setStatus(`Capture failed: ${err.message}`, 'error');
    recordBtn.disabled = true;
  }
}

async function startRecording() {
  if (!mediaStream) {
    setStatus('Select a source first.', 'error');
    return;
  }

  const mimeType = pickMimeType();
  if (!mimeType) {
    setStatus('VP9/WebM not supported on this system.', 'error');
    return;
  }

  isRecording = true;
  updateRecordingPreviewUi();

  try {
    await ensureScreenVideo();
    if (cameraEnabled.checked) {
      if (!cameraStream) await startCamera();
      await ensureCameraVideo();
    }
    await updatePreviewOutput();
  } catch (err) {
    isRecording = false;
    setStatus(`Compositor failed: ${err.message}`, 'error');
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

  if (!streamForRecorder) {
    isRecording = false;
    setStatus('Could not start recording stream.', 'error');
    return;
  }

  chunks = [];
  const options = {
    mimeType,
    videoBitsPerSecond: VIDEO_BITRATE,
    audioBitsPerSecond: AUDIO_BITRATE,
  };

  try {
    mediaRecorder = new MediaRecorder(streamForRecorder, options);
  } catch (err) {
    isRecording = false;
    stopAudioMixer();
    await updatePreviewOutput();
    setStatus(`MediaRecorder error: ${err.message}`, 'error');
    return;
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    clearInterval(timerInterval);
    isRecording = false;
    pushHud(false);
    stopAudioMixer();
    await updatePreviewOutput();

    const blob = new Blob(chunks, { type: mimeType });
    const buffer = await blob.arrayBuffer();
    const extension = extensionForMime(mimeType);

    recordBtn.disabled = false;
    stopBtn.disabled = true;
    sourceSelect.disabled = false;
    refreshBtn.disabled = false;
    cameraEnabled.disabled = false;
    bubbleSize.disabled = false;
    bubbleCorner.disabled = false;
    cameraSelect.disabled = false;
    if (exportFormat) exportFormat.disabled = false;
    if (refreshDevicesBtn) refreshDevicesBtn.disabled = false;
    setAudioControlsDisabled(false);

    updateRecordingPreviewUi();
    setStatus('Saving…');
    const result = await window.crownRecord.saveRecording({
      buffer,
      extension,
      mimeType,
    });

    if (result.saved) {
      setStatus(`Saved: ${result.filePath}`, 'ok');
    } else {
      setStatus('Recording discarded (save canceled).');
    }
  };

  mediaRecorder.start(500);
  recordingStartedAt = Date.now();
  pushHud(true);
  timerInterval = setInterval(() => pushHud(true), 250);

  recordBtn.disabled = true;
  stopBtn.disabled = false;
  sourceSelect.disabled = true;
  refreshBtn.disabled = true;
  cameraSelect.disabled = true;
  cameraEnabled.disabled = true;
  bubbleSize.disabled = true;
  bubbleCorner.disabled = true;
  if (exportFormat) exportFormat.disabled = true;
  if (refreshDevicesBtn) refreshDevicesBtn.disabled = true;
  setAudioControlsDisabled(true);

  const camNote = cameraStream ? ' · webcam' : '';
  const micNote = micEnabled.checked ? ' · mic' : '';
  const sysNote =
    systemAudioEnabled.checked && mediaStream?.getAudioTracks().length
      ? ' · system audio'
      : '';
  logEvent('info', 'Recording started', { mimeType, mic: micEnabled.checked, systemAudio: systemAudioEnabled.checked });
  setStatus(
    `Recording${micNote}${sysNote}${camNote} · ${mimeType}`,
    'ok',
  );
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

function syncTeleprompterText() {
  if (prompterOpen) {
    window.crownRecord.setTeleprompterText(scriptText.value);
  }
}

function sendPrompterControl(action, extra = {}) {
  window.crownRecord.teleprompterControl({
    action,
    fontSize: Number(fontSize.value),
    scrollSpeed: Number(scrollSpeed.value),
    ...extra,
  });
}

sourceSelect.addEventListener('change', () => attachStream(sourceSelect.value));
refreshBtn.addEventListener('click', loadSources);
recordBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

cameraEnabled.addEventListener('change', onCameraToggle);
cameraSelect.addEventListener('change', () => {
  if (cameraEnabled.checked) startCamera();
});
bubbleSize.addEventListener('input', () => {
  bubbleSizeVal.textContent = bubbleSize.value;
});
bubbleCorner.addEventListener('change', () => {});

systemAudioEnabled.addEventListener('change', () => {
  if (sourceSelect.value) attachStream(sourceSelect.value);
});

micEnabled.addEventListener('change', async () => {
  if (micEnabled.checked) {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      tmp.getTracks().forEach((t) => t.stop());
      await loadMicDevices();
    } catch {
      /* mic permission requested again when recording starts */
    }
  }
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

fontSize.addEventListener('input', () => {
  fontSizeVal.textContent = fontSize.value;
  sendPrompterControl('fontSize');
});

scrollSpeed.addEventListener('input', () => {
  scrollSpeedVal.textContent = scrollSpeed.value;
  sendPrompterControl('scrollSpeed');
});

scrollPlay.addEventListener('click', () => sendPrompterControl('play'));
scrollPause.addEventListener('click', () => sendPrompterControl('pause'));
scrollReset.addEventListener('click', () => sendPrompterControl('reset'));

async function initSupportUi() {
  const openLogsBtn = document.getElementById('open-logs');
  const logPathEl = document.getElementById('log-path');

  try {
    const info = await window.crownRecord.getLogInfo();
    if (info.logFile) {
      logPathEl.textContent = `Logs: ${info.logFile}`;
    }
  } catch {
    logPathEl.textContent = 'Logs available after app starts.';
  }

  openLogsBtn.addEventListener('click', async () => {
    try {
      await window.crownRecord.openLogFolder();
      setStatus('Log folder opened — attach latest .log to support email.', 'ok');
    } catch (err) {
      setStatus(`Could not open logs: ${err.message}`, 'error');
    }
  });
}

if (refreshDevicesBtn) {
  refreshDevicesBtn.addEventListener('click', refreshAllDevices);
}

if (exportFormat) {
  exportFormat.addEventListener('change', () => {
    const mp4Ok = MP4_CANDIDATES.some((t) => MediaRecorder.isTypeSupported(t));
    if (exportFormat.value === 'mp4' && !mp4Ok) {
      setStatus('MP4 may not be available on this PC — WebM will be used if needed.', '');
    }
  });
}

loadSources();
loadMicDevices();
requestDeviceLabels().then(() => loadCameraDevices());
initSupportUi();
