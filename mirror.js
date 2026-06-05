const video = document.getElementById('mirror-video');
let activeStream = null;

function stopStream() {
  activeStream?.getTracks().forEach((t) => t.stop());
  activeStream = null;
  video.srcObject = null;
}

async function startMirror(config) {
  stopStream();
  const size = config.size || 200;
  document.documentElement.style.setProperty('--bubble-size', `${size}px`);

  const constraints = {
    audio: false,
    video: {
      deviceId: config.deviceId ? { exact: config.deviceId } : undefined,
      width: { ideal: 1280, min: 640 },
      height: { ideal: 720, min: 480 },
      frameRate: { ideal: 30, max: 30 },
    },
  };

  try {
    activeStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = activeStream;
    await video.play();
  } catch {
    document.body.style.opacity = '0.35';
  }
}

window.mirrorApi.onConfig((config) => {
  startMirror(config);
});

window.addEventListener('beforeunload', stopStream);
