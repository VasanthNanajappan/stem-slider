// Mid/side + speech EQ chain.
//
//   input ─► split L/R ─┬─► MID  = 0.5L + 0.5R ─► speech EQ ─► bass cut ─► midGain ─┐
//                       └─► SIDE = 0.5L − 0.5R ─────────────────────────► sideGain ─┤
//                                                                                   ▼
//                                      rebuild: L = Mid + Side, R = Mid − Side ─► output
//
// At voice = 0 every setting is neutral, so output = input exactly.

function createVoiceMusicChain(ctx) {
  // Settings for nodes that must stay mono (so the add/subtract math works)
  const MONO = { channelCount: 1, channelCountMode: "explicit", channelInterpretation: "discrete" };
  const gain = (value) => new GainNode(ctx, { gain: value, ...MONO });

  // Input: force stereo. A mono source becomes L = R (so Side = 0).
  const input = new GainNode(ctx, {
    gain: 1, channelCount: 2, channelCountMode: "explicit", channelInterpretation: "speakers"
  });
  const splitter = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
  input.connect(splitter);

  // ---- MID = 0.5·L + 0.5·R ----
  const mid = gain(1);
  const lToMid = gain(0.5);
  const rToMid = gain(0.5);
  splitter.connect(lToMid, 0);
  splitter.connect(rToMid, 1);
  lToMid.connect(mid);
  rToMid.connect(mid);

  // ---- SIDE = 0.5·L − 0.5·R ----
  const side = gain(1);
  const lToSide = gain(0.5);
  const rToSide = gain(-0.5);
  splitter.connect(lToSide, 0);
  splitter.connect(rToSide, 1);
  lToSide.connect(side);
  rToSide.connect(side);

  // ---- EQ on MID ----
  // Boost/cut the speech range around 2,000 Hz (wide band, roughly 1–4 kHz)
  const speechEQ = new BiquadFilterNode(ctx, { type: "peaking", frequency: 2000, Q: 0.8, gain: 0 });
  // Reduce bass in the center when leaning toward Voice
  const bassCut = new BiquadFilterNode(ctx, { type: "lowshelf", frequency: 150, gain: 0 });
  const midGain = gain(1);
  mid.connect(speechEQ).connect(bassCut).connect(midGain);

  // ---- SIDE level ----
  const sideGain = gain(1);
  side.connect(sideGain);

  // ---- Rebuild stereo: L = Mid + Side, R = Mid − Side ----
  const left = gain(1);
  const right = gain(1);
  const sideInvert = gain(-1);

  midGain.connect(left);
  sideGain.connect(left);

  midGain.connect(right);
  sideGain.connect(sideInvert).connect(right);

  const output = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
  left.connect(output, 0, 0);
  right.connect(output, 0, 1);

  // ---- Control: voice from −100 (Music) to +100 (Voice) ----
  function setVoice(value) {
    const v = Math.max(-1, Math.min(1, value / 100));
    const t = ctx.currentTime;
    const smooth = 0.03; // seconds; avoids clicks

    speechEQ.gain.setTargetAtTime(v * 8, t, smooth);                       // −8 dB … +8 dB
    bassCut.gain.setTargetAtTime(v > 0 ? -4 * v : 0, t, smooth);           // 0 … −4 dB (voice side only)
    sideGain.gain.setTargetAtTime(v > 0 ? 1 - 0.7 * v : 1 - 0.5 * v, t, smooth); // 1.5× … 1× … 0.3×
  }

  return { input, output, setVoice };
}
