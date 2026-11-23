const slider = document.getElementById("slider");
const valueEl = document.getElementById("value");
const statusEl = document.getElementById("status");
const resetBtn = document.getElementById("reset");

let tabId = null;
let active = false;   // is this tab already boosted?
let starting = null;  // prevents starting twice

function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ target: "offscreen", type, tabId, ...extra });
}

// Create the hidden page where the audio runs (only one allowed)
async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (existing.length) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
    justification: "Capture tab audio and play it back louder"
  });
}

async function startCapture(gain) {
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  const res = await send("start", { streamId, gain });
  if (res && res.error) throw new Error(res.error);
  active = true;
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab.id;
  await ensureOffscreen();

  // If this tab is already boosted, show its current level
  const state = await send("get");
  if (state) {
    active = true;
    slider.value = Math.round(state.gain * 100);
    valueEl.textContent = slider.value + "%";
    statusEl.textContent = "Boost is on";
  }
}

slider.addEventListener("input", async () => {
  valueEl.textContent = slider.value + "%";
  try {
    if (!active) {
      if (!starting) starting = startCapture(slider.value / 100).finally(() => (starting = null));
      await starting;
    }
    await send("set", { gain: slider.value / 100 });
    statusEl.textContent = "Boost is on";
  } catch (e) {
    statusEl.textContent = "Can't boost this tab: " + e.message;
  }
});

resetBtn.addEventListener("click", async () => {
  if (active) await send("stop");
  active = false;
  slider.value = 100;
  valueEl.textContent = "100%";
  statusEl.textContent = "Normal volume";
});

init().catch((e) => (statusEl.textContent = "Error: " + e.message));
