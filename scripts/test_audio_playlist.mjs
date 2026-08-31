import assert from "node:assert/strict";

class TestAudioBuffer {
  constructor({ length, numberOfChannels, sampleRate }) {
    this.length = length;
    this.numberOfChannels = numberOfChannels;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(channel) { return this.channels[channel]; }
}

globalThis.AudioBuffer = TestAudioBuffer;

const { mixAudioPlaylistBuffers } = await import("../src/lib/audioPlaylistMix.ts");

const makeBuffer = (seconds, sampleRate, value) => {
  const buffer = new TestAudioBuffer({ length: seconds * sampleRate, numberOfChannels: 2, sampleRate });
  for (let channel = 0; channel < 2; channel++) buffer.getChannelData(channel).fill(value);
  return buffer;
};
const tracks = [
  { id: "a", file: {}, name: "Primera", buffer: makeBuffer(4, 44_100, 0.3), effect: "original" },
  { id: "b", file: {}, name: "Segunda", buffer: makeBuffer(3, 48_000, 0.25), effect: "original" },
  { id: "c", file: {}, name: "Tercera", buffer: makeBuffer(5, 32_000, 0.2), effect: "original" },
];
const result = await mixAudioPlaylistBuffers(tracks, 0.75);

assert.equal(result.buffer.sampleRate, 48_000);
assert.equal(result.timeline.length, 3);
assert.equal(result.timeline[0].start, 0);
assert.ok(Math.abs(result.timeline[1].start - 3.64) < 1e-6);
assert.ok(Math.abs(result.timeline[2].start - 6.28) < 1e-6);
assert.ok(Math.abs(result.buffer.duration - 11.28) < 1 / 48_000);
assert.ok(result.timeline.every((item, index) => item.id === tracks[index].id));
for (let channel = 0; channel < result.buffer.numberOfChannels; channel++) {
  for (const value of result.buffer.getChannelData(channel)) {
    assert.ok(Number.isFinite(value));
    assert.ok(Math.abs(value) <= 10 ** (-1 / 20) + 1e-6);
  }
}

console.log("✓ playlist: orden, resampling 48 kHz, transiciones y duración exacta");
