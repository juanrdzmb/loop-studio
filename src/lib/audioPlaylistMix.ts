export type PlaylistTrackEffect = "original" | "suave" | "clasico" | "profundo";

export type PlaylistTimelineItem = {
  id: string;
  name: string;
  start: number;
  end: number;
  duration: number;
  effect: PlaylistTrackEffect;
};

export type PlaylistMixSource = {
  id: string;
  name: string;
  effect: PlaylistTrackEffect;
  buffer: AudioBuffer;
};

const SAFE_MASTER_PEAK = Math.pow(10, -1 / 20);

export async function mixAudioPlaylistBuffers(
  sources: PlaylistMixSource[],
  requestedTransition: number = 0.75
): Promise<{ buffer: AudioBuffer; timeline: PlaylistTimelineItem[]; transitionSeconds: number }> {
  if (!sources.length) throw new Error("La playlist necesita al menos una canción.");
  const transitionSeconds = Math.max(0, Math.min(1.5, requestedTransition));
  const overlaps = sources.slice(0, -1).map((source, index) => Math.min(
    transitionSeconds,
    source.buffer.duration * 0.12,
    sources[index + 1]!.buffer.duration * 0.12
  ));
  const totalDuration = sources.reduce((sum, source) => sum + source.buffer.duration, 0)
    - overlaps.reduce((sum, duration) => sum + duration, 0);
  const sampleRate = 48_000;
  const channels = Math.min(2, Math.max(...sources.map((source) => source.buffer.numberOfChannels)));
  const output = new AudioBuffer({
    length: Math.max(1, Math.ceil(totalDuration * sampleRate)),
    numberOfChannels: channels,
    sampleRate,
  });
  const timeline: PlaylistTimelineItem[] = [];
  let cursor = 0;
  let peak = 0;

  for (let trackIndex = 0; trackIndex < sources.length; trackIndex++) {
    const source = sources[trackIndex]!;
    const buffer = source.buffer;
    const fadeIn = trackIndex > 0 ? overlaps[trackIndex - 1]! : 0;
    const fadeOut = trackIndex < sources.length - 1 ? overlaps[trackIndex]! : 0;
    const start = cursor;
    const end = start + buffer.duration;
    timeline.push({
      id: source.id,
      name: source.name,
      start,
      end,
      duration: buffer.duration,
      effect: source.effect,
    });
    const startSample = Math.round(start * sampleRate);
    const sampleCount = Math.min(Math.ceil(buffer.duration * sampleRate), output.length - startSample);
    // Arrays de canal hoisteados: antes cada muestra llamaba getChannelData y
    // sampleAt() (3 operaciones Math por muestra y canal) — millones de llamadas
    // por canción. La interpolación lineal inline y el pico fusionado en esta
    // única pasada conservan el resultado exacto.
    const srcChannels: Float32Array[] = [];
    const dstChannels: Float32Array[] = [];
    for (let channel = 0; channel < channels; channel++) {
      srcChannels.push(buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1)));
      dstChannels.push(output.getChannelData(channel));
    }
    const srcLength = buffer.length;
    const ratio = buffer.sampleRate / sampleRate;
    const fadeOutStart = fadeOut > 0 ? buffer.duration - fadeOut : 0;
    for (let sample = 0; sample < sampleCount; sample++) {
      const time = sample / sampleRate;
      let gain = 1;
      if (fadeIn > 0 && time < fadeIn) gain *= Math.sin((Math.PI / 2) * (time / fadeIn));
      if (fadeOut > 0 && time > fadeOutStart) {
        gain *= Math.sin((Math.PI / 2) * Math.max(0, (buffer.duration - time) / fadeOut));
      }
      const position = Math.max(0, Math.min(srcLength - 1, sample * ratio));
      const left = Math.floor(position);
      const right = Math.min(srcLength - 1, left + 1);
      const mix = position - left;
      const dst = startSample + sample;
      for (let channel = 0; channel < channels; channel++) {
        const data = srcChannels[channel]!;
        const value = data[left]! + (data[right]! - data[left]!) * mix;
        peak = Math.max(peak, Math.abs(value * gain));
        dstChannels[channel]![dst] += value * gain;
      }
      if (sample > 0 && sample % (sampleRate * 2) === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    cursor = end - fadeOut;
  }

  if (peak > SAFE_MASTER_PEAK) {
    const gain = SAFE_MASTER_PEAK / peak;
    for (let channel = 0; channel < channels; channel++) {
      const data = output.getChannelData(channel);
      for (let index = 0; index < data.length; index++) data[index] *= gain;
    }
  }
  return { buffer: output, timeline, transitionSeconds };
}

