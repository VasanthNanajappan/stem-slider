// One audio setup per tab: tabId -> { ctx, stream, chain, volume, voice }
const tabs = new Map();

async function start(tabId, streamId, gainValue, voice) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
    video: false
  });

  const ctx = new AudioContext({ latencyHint: "interactive" });
  const source = ctx.createMediaStreamSource(stream);

  // Mid/side + speech EQ (from audio-chain.js)
  const chain = createVoiceMusicChain(ctx);
  chain.setVoice(voice);

  // Volume boost
  const volume = ctx.createGain();
  volume.gain.value = gainValue;

  // Limiter to prevent crackling (clipping)
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  // tab audio → mid/side + EQ → volume → limiter → speakers
  source.connect(chain.input);
  chain.output.connect(volume).connect(limiter).connect(ctx.destination);

  // Clean up when the tab closes
  stream.getAudioTracks()[0].addEventListener("ended", () => stop(tabId));

  tabs.set(tabId, { ctx, stream, chain, volume, voice });
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
    sendResponse(t ? { gain: t.volume.gain.value, voice: t.voice } : null);
  } else if (msg.type === "set") {
    if (t) t.volume.gain.setTargetAtTime(msg.gain, t.ctx.currentTime, 0.02);
    sendResponse(!!t);
  } else if (msg.type === "setVoice") {
    if (t) {
      t.voice = msg.voice;
      t.chain.setVoice(msg.voice);
    }
    sendResponse(!!t);
  } else if (msg.type === "stop") {
    stop(msg.tabId);
    sendResponse(true);
  } else if (msg.type === "start") {
    start(msg.tabId, msg.streamId, msg.gain, msg.voice)
      .then(() => sendResponse(true))
      .catch((e) => sendResponse({ error: e.message }));
    return true; // keep the message open for the async reply
  }
});
