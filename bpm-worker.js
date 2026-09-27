'use strict';
// Onset-energy autocorrelation. Returns an estimate, never a guaranteed tempo.
function estimateBpm(samples, sampleRate) {
  const hop = Math.max(1, Math.round(sampleRate / 100)),
    n = Math.floor(samples.length / hop);
  if (n < 800) return { bpm: null };
  const energy = new Float64Array(n),
    onsets = new Float64Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let j = 0; j < hop; j++) {
      const v = samples[i * hop + j];
      e += v * v;
    }
    energy[i] = Math.sqrt(e / hop);
    total += energy[i];
  }
  if (total / n < 0.0001) return { bpm: null };
  let power = 0;
  for (let i = 1; i < n; i++) {
    onsets[i] = Math.max(0, energy[i] - energy[i - 1]);
    power += onsets[i] * onsets[i];
  }
  if (power < 1e-8) return { bpm: null };
  const fps = sampleRate / hop,
    scores = [];
  let best = 0,
    bestLag = 0;
  for (
    let lag = Math.floor((fps * 60) / 200);
    lag <= Math.ceil((fps * 60) / 60);
    lag++
  ) {
    let xy = 0,
      xx = 0,
      yy = 0;
    for (let i = lag; i < n; i++) {
      xy += onsets[i] * onsets[i - lag];
      xx += onsets[i] * onsets[i];
      yy += onsets[i - lag] * onsets[i - lag];
    }
    const v = xy / Math.sqrt(xx * yy || 1);
    scores[lag] = v;
    if (v > best) {
      best = v;
      bestLag = lag;
    }
  }
  if (best < 0.15) return { bpm: null };
  const l = scores[bestLag - 1],
    r = scores[bestLag + 1],
    den = l - 2 * best + r;
  const offset =
    Number.isFinite(den) && den !== 0
      ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / den))
      : 0;
  return { bpm: Math.round((60 * fps) / (bestLag + offset)) };
}
self.onmessage = ({ data }) => {
  try {
    self.postMessage(estimateBpm(data.samples, data.sampleRate));
  } catch {
    self.postMessage({ bpm: null });
  }
};
