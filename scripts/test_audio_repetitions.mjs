import assert from "node:assert/strict";

class TestAudioBuffer {
  constructor({ length, numberOfChannels, sampleRate }) {
    this.length = length;
    this.numberOfChannels = numberOfChannels;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(channel) {
    return this.channels[channel];
  }
}

globalThis.AudioBuffer = TestAudioBuffer;

const {
  repeatOneShotMasterWithCrossfade,
  SAFE_MASTER_PEAK,
} = await import("../src/lib/audioRepeat.ts");

const sampleRate = 1000;
const source = new TestAudioBuffer({ length: 4000, numberOfChannels: 2, sampleRate });
for (let channel = 0; channel < 2; channel++) {
  const data = source.getChannelData(channel);
  for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * 0.021 + channel * 0.1) * 0.82;
}

for (const repetitions of [2, 3, 4, 5]) {
  const output = repeatOneShotMasterWithCrossfade(source, repetitions);
  assert.equal(output.length, source.length * repetitions);
  assert.equal(output.duration, source.duration * repetitions);
  let peak = 0;
  for (let channel = 0; channel < output.numberOfChannels; channel++) {
    const data = output.getChannelData(channel);
    for (const value of data) {
      assert.ok(Number.isFinite(value));
      peak = Math.max(peak, Math.abs(value));
    }
  }
  assert.ok(peak <= SAFE_MASTER_PEAK + 1e-6, `peak seguro en ${repetitions} vueltas`);
  assert.equal(output.getChannelData(0)[0], source.getChannelData(0)[0], "el inicio queda limpio");
}

console.log("✓ audio: 2–5 vueltas conservan duración exacta, inicio limpio y margen −1 dBFS");
