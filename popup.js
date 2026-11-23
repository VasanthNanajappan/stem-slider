const volumeSlider = document.getElementById("volume");
const volumeValue = document.getElementById("volumeValue");
const voiceSlider = document.getElementById("voice");
const voiceValue = document.getElementById("voiceValue");
const statusEl = document.getElementById("status");
const resetBtn = document.getElementById("reset");

let tabId = null;
let active = false;   // is this tab already captured?
let starting = null;  // prevents starting twice

function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ target: "offscreen", type, tabId, ...extra });
}

function showVolume(percent) {
  volumeValue.textContent = percent + "%";
}

function showVoice(v) {
  if (v == 0) voiceValue.textContent = "Neutral";
  else if (v > 0) voiceValue.textContent = "Voice " + v;
  else voiceValue.textContent = "Music " + -v;
}

// Create the hidden page where the audio runs (only one allowed)
async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (existing.length) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
    justification: "Capture tab audio and process it"
  });
}

async function startCapture() {
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  const res = await send("start", {
    streamId,
    gain: volumeSlider.value / 100,
    voice: Number(voiceSlider.value)
  });
  if (res && res.error) throw new Error(res.error);
  active = true;
}

// Start capturing on the first slider move (either slider)
async function ensureActive() {
  if (active) return;
  if (!starting) starting = startCapture().finally(() => (starting = null));
  await starting;
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab.id;
  await ensureOffscreen();

  // If this tab is already captured, show its current settings
  const state = await send("get");
  if (state) {
    active = true;
    volumeSlider.value = Math.round(state.gain * 100);
    voiceSlider.value = state.voice;
    showVolume(volumeSlider.value);
    showVoice(state.voice);
    statusEl.textContent = "On";
  }
}

volumeSlider.addEventListener("input", async () => {
  showVolume(volumeSlider.value);
  try {
    await ensureActive();
    await send("set", { gain: volumeSlider.value / 100 });
    statusEl.textContent = "On";
  } catch (e) {
    statusEl.textContent = "Can't capture this tab: " + e.message;
  }
});

voiceSlider.addEventListener("input", async () => {
  showVoice(Number(voiceSlider.value));
  try {
    await ensureActive();
    await send("setVoice", { voice: Number(voiceSlider.value) });
    statusEl.textContent = "On";
  } catch (e) {
    statusEl.textContent = "Can't capture this tab: " + e.message;
  }
});

resetBtn.addEventListener("click", async () => {
  if (active) await send("stop");
  active = false;
  volumeSlider.value = 100;
  voiceSlider.value = 0;
  showVolume(100);
  showVoice(0);
  statusEl.textContent = "Normal audio";
});

init().catch((e) => (statusEl.textContent = "Error: " + e.message));
