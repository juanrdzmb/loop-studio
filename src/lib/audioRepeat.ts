/** −1 dBFS: margen seguro para AAC y para la suma posterior de SFX. */
export const SAFE_MASTER_PEAK = Math.pow(10, -1 / 20);

/**
 * Construye una salida de duración EXACTA `N × master`. El primer inicio queda
 * limpio; desde la primera costura se repite un período con fundido de potencia
 * constante, evitando que cada solapamiento acorte el vídeo final.
 */
export function repeatOneShotMasterWithCrossfade(
  buffer: AudioBuffer,
  repetitions: number
): AudioBuffer {
  const count = Math.max(1, Math.min(5, Math.round(repetitions)));
  if (count === 1 || buffer.length < 2) return copyExactAudio(buffer, buffer.duration);
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const fadeSamples = Math.min(
    Math.floor(buffer.sampleRate * Math.min(2, Math.max(0.8, buffer.duration * 0.06))),
    Math.floor(buffer.length * 0.45)
  );
  if (fadeSamples < 2) return copyExactAudio(buffer, buffer.duration * count);
  const period = buffer.length - fadeSamples;
  const length = buffer.length * count;
  const out = new AudioBuffer({ length, numberOfChannels: channels, sampleRate: buffer.sampleRate });
  let peak = 0;
  for (let c = 0; c < channels; c++) {
    const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
    const dst = out.getChannelData(c);
    dst.set(src.subarray(0, period), 0);
    const cycle = new Float32Array(period);
    for (let i = 0; i < period; i++) {
      if (i < fadeSamples) {
        const x = i / Math.max(1, fadeSamples - 1);
        cycle[i] = src[period + i]! * Math.sqrt(1 - x) + src[i]! * Math.sqrt(x);
      } else {
        cycle[i] = src[i]!;
      }
    }
    for (let offset = period; offset < length; offset += period) {
      dst.set(cycle.subarray(0, Math.min(period, length - offset)), offset);
    }
    for (let i = 0; i < dst.length; i++) peak = Math.max(peak, Math.abs(dst[i]!));
  }
  if (peak > SAFE_MASTER_PEAK) {
    const gain = SAFE_MASTER_PEAK / peak;
    for (let c = 0; c < channels; c++) {
      const data = out.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i] *= gain;
    }
  }
  return out;
}

function copyExactAudio(buffer: AudioBuffer, durationSec: number): AudioBuffer {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const length = Math.max(1, Math.ceil(durationSec * buffer.sampleRate));
  const out = new AudioBuffer({ length, numberOfChannels: channels, sampleRate: buffer.sampleRate });
  for (let c = 0; c < channels; c++) {
    const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
    const dst = out.getChannelData(c);
    for (let offset = 0; offset < length; offset += src.length) {
      dst.set(src.subarray(0, Math.min(src.length, length - offset)), offset);
    }
  }
  return out;
}
