import { REVERB_PRESETS } from "./audioEngine";
import { buildProcessedOneShotBuffer } from "./mangaAudioEngine";
import {
  mixAudioPlaylistBuffers,
  type PlaylistTimelineItem,
  type PlaylistTrackEffect,
} from "./audioPlaylistMix";
export type { PlaylistTimelineItem, PlaylistTrackEffect } from "./audioPlaylistMix";

export type AudioPlaylistTrack = {
  id: string;
  file: File;
  name: string;
  buffer: AudioBuffer;
  effect: PlaylistTrackEffect;
};

export type AudioPlaylistMaster = {
  buffer: AudioBuffer;
  timeline: PlaylistTimelineItem[];
  transitionSeconds: number;
};

const processedTrackCache = new WeakMap<AudioBuffer, Map<PlaylistTrackEffect, Promise<AudioBuffer>>>();

function processedTrack(track: AudioPlaylistTrack): Promise<AudioBuffer> {
  let byEffect = processedTrackCache.get(track.buffer);
  if (!byEffect) {
    byEffect = new Map();
    processedTrackCache.set(track.buffer, byEffect);
  }
  const cached = byEffect.get(track.effect);
  if (cached) return cached;
  const settings = track.effect === "original" ? null : REVERB_PRESETS[track.effect]?.settings;
  const promise = buildProcessedOneShotBuffer({
    sourceBuffer: track.buffer,
    enableSlowedReverb: Boolean(settings),
    reverbSettings: settings ?? REVERB_PRESETS.clasico.settings,
  });
  byEffect.set(track.effect, promise);
  promise.catch(() => byEffect?.delete(track.effect));
  return promise;
}

/**
 * Une canciones ya decodificadas en un master one-shot de 48 kHz. Cada pista se
 * procesa con su propio preset y las fronteras usan un fundido de potencia
 * constante corto para evitar clicks sin convertir la playlist en un loop.
 */
export async function buildAudioPlaylistMaster(
  tracks: AudioPlaylistTrack[],
  options: {
    transitionSeconds?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<AudioPlaylistMaster> {
  if (tracks.length === 0) throw new Error("La playlist necesita al menos una canción.");
  const processed: AudioBuffer[] = [];
  for (let index = 0; index < tracks.length; index++) {
    processed.push(await processedTrack(tracks[index]!));
    options.onProgress?.(index + 1, tracks.length);
    // Cede el hilo entre canciones: evita que una carga múltiple congele los controles.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  return mixAudioPlaylistBuffers(
    processed.map((buffer, index) => ({
      id: tracks[index]!.id,
      name: tracks[index]!.name,
      effect: tracks[index]!.effect,
      buffer,
    })),
    options.transitionSeconds ?? 0.75
  );
}
