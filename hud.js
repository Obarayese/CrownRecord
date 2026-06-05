const timerEl = document.getElementById('timer');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const recDot = document.getElementById('rec-dot');
const recLabel = document.getElementById('rec-label');

pauseBtn.addEventListener('click', () => window.hudApi.sendAction('pause'));
stopBtn.addEventListener('click', () => window.hudApi.sendAction('stop'));

window.hudApi.onUpdate((state) => {
  if (state.timer) timerEl.textContent = state.timer;

  const paused = Boolean(state.paused);
  document.body.classList.toggle('is-paused', paused);

  if (state.pauseSupported === false) {
    pauseBtn.hidden = true;
  } else {
    pauseBtn.hidden = false;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  }

  if (recLabel) recLabel.textContent = paused ? 'PAUSED' : 'REC';
  if (recDot) recDot.style.animationPlayState = paused ? 'paused' : 'running';
});
