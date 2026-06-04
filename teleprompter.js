const scrollContent = document.getElementById('scroll-content');

let offsetY = 0;
let scrolling = false;
let rafId = null;
let lastTs = 0;
let fontPx = 28;
let speedPxPerSec = 40;

function applyFontSize() {
  scrollContent.style.fontSize = `${fontPx}px`;
}

function tick(ts) {
  if (!scrolling) return;

  if (!lastTs) lastTs = ts;
  const delta = (ts - lastTs) / 1000;
  lastTs = ts;

  offsetY += speedPxPerSec * delta;
  scrollContent.style.transform = `translateY(${-offsetY}px)`;

  const maxScroll = scrollContent.scrollHeight + 200;
  if (offsetY < maxScroll) {
    rafId = requestAnimationFrame(tick);
  } else {
    scrolling = false;
    lastTs = 0;
  }
}

function play() {
  if (scrolling) return;
  scrolling = true;
  lastTs = 0;
  rafId = requestAnimationFrame(tick);
}

function pause() {
  scrolling = false;
  lastTs = 0;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

function reset() {
  pause();
  offsetY = 0;
  scrollContent.style.transform = 'translateY(0)';
}

function setText(text) {
  scrollContent.textContent = text || '';
  reset();
}

window.teleprompterApi.onText(setText);

window.teleprompterApi.onControl((payload) => {
  if (payload.fontSize != null) {
    fontPx = payload.fontSize;
    applyFontSize();
  }
  if (payload.scrollSpeed != null) {
    speedPxPerSec = payload.scrollSpeed;
  }

  switch (payload.action) {
    case 'play':
      play();
      break;
    case 'pause':
      pause();
      break;
    case 'reset':
      reset();
      break;
    case 'fontSize':
      applyFontSize();
      break;
    case 'scrollSpeed':
      break;
    case 'sync':
      applyFontSize();
      break;
    default:
      break;
  }
});

applyFontSize();
