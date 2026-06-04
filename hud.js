const timerEl = document.getElementById('timer');

window.hudApi.onUpdate((state) => {
  if (state.timer) timerEl.textContent = state.timer;
});
