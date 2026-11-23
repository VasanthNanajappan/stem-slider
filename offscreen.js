// One audio chain per tab: tabId -> { ctx, gain, stream }
const tabs = new Map();

async function start(tabId, streamId, gainValue) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
    video: false
  });

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);

  const gain = ctx.createGain();
  gain.gain.value = gainValue;

  // Limiter to prevent crackling (clipping) at high volume
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  // stream → gain → limiter → speakers
  source.connect(gain).connect(limiter).connect(ctx.destination);

  // Clean up when the tab closes
  stream.getAudioTracks()[0].addEventListener("ended", () => stop(tabId));

  tabs.set(tabId, { ctx, gain, stream });
}

function stop(tabId) {
  const t = tabs.get(tabId);
  if (!t) return;
  t.stream.getTracks().forEach((track) => track.stop());
  t.ctx.close();
  tabs.delete(tabId);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== "offscreen") return;
  const t = tabs.get(msg.tabId);

  if (msg.type === "get") {
    sendResponse(t ? { gain: t.gain.gain.value } : null);
  } else if (msg.type === "set") {
    // Smooth change so the volume doesn't click
    if (t) t.gain.gain.setTargetAtTime(msg.gain, t.ctx.currentTime, 0.02);
    sendResponse(!!t);
  } else if (msg.type === "stop") {
    stop(msg.tabId);
    sendResponse(true);
  } else if (msg.type === "start") {
    start(msg.tabId, msg.streamId, msg.gain)
      .then(() => sendResponse(true))
      .catch((e) => sendResponse({ error: e.message }));
    return true; // keep the message open for the async reply
  }
});
