export function createPlayerControlsShell() {
  const controls = document.createElement("section");
  controls.className = "controls";

  const record = document.createElement("span");
  record.className = "control-record";
  record.setAttribute("aria-hidden", "true");

  const soundbar = document.createElement("div");
  soundbar.className = "control-soundbar";
  soundbar.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 96; index += 1) {
    const bar = document.createElement("span");
    bar.className = "control-soundbar-bar";
    soundbar.appendChild(bar);
  }

  const progress = document.createElement("div");
  progress.className = "control-progress";
  progress.setAttribute("aria-hidden", "true");

  const progressFill = document.createElement("div");
  progressFill.className = "control-progress-fill";
  progress.appendChild(progressFill);

  const buttonRail = document.createElement("div");
  buttonRail.className = "control-button-rail";

  const connectButton = document.createElement("button");
  connectButton.type = "button";
  connectButton.className = "control-button control-connect";
  connectButton.setAttribute("aria-label", "spotify-connect");
  connectButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm4.58 14.55a.76.76 0 0 1-1.05.24 9.2 9.2 0 0 0-8.9-.53.75.75 0 0 1-.65-1.35 10.7 10.7 0 0 1 10.36.62.75.75 0 0 1 .24 1.02Zm1.49-2.76a.94.94 0 0 1-1.3.32 11.8 11.8 0 0 0-11.27-.67.94.94 0 0 1-.8-1.7 13.7 13.7 0 0 1 13.07.77.94.94 0 0 1 .3 1.28Zm.12-2.87A14.3 14.3 0 0 0 4.82 10a1.12 1.12 0 0 1-.96-2.02 16.5 16.5 0 0 1 15.42.95 1.12 1.12 0 1 1-1.09 1.99Z"></path>
    </svg>
  `;

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "control-button control-play";
  playButton.setAttribute("aria-label", "play-toggle");
  playButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path class="icon-play" d="M8 6v12l10-6z"></path>
      <path class="icon-pause" d="M8 6h3v12H8zM13 6h3v12h-3z"></path>
    </svg>
  `;

  const skipButton = document.createElement("button");
  skipButton.type = "button";
  skipButton.className = "control-button control-skip";
  skipButton.setAttribute("aria-label", "skip-next");
  skipButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 6v12l8-6-8-6zM14 6v12l8-6-8-6z"></path>
    </svg>
  `;

  const statusDot = document.createElement("span");
  statusDot.className = "control-status";
  statusDot.setAttribute("aria-hidden", "true");

  buttonRail.append(connectButton, playButton, skipButton);
  controls.append(record, soundbar, progress, buttonRail, statusDot);
  return { controls, record, soundbar, connectButton, playButton, skipButton, progressFill, statusDot };
}
