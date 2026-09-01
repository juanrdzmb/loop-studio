import type { EditAssetMeta } from "./editStudio";

export interface EditAssetManifest extends EditAssetMeta {
  size?: number;
  lastModified?: number;
}

export interface EditAssetFileCandidate {
  name: string;
  kind: "video" | "image";
  size?: number;
  lastModified?: number;
}

function normalizedName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function normalizedStem(name: string): string {
  return normalizedName(name)
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/[\s_-]+(?:h264|converted|convertido|transcoded)$/i, "")
    .replace(/[\s_-]+/g, " ")
    .trim();
}

function candidateScore(manifest: EditAssetManifest, candidate: EditAssetFileCandidate): number {
  const expectedName = normalizedName(manifest.name);
  const actualName = normalizedName(candidate.name);
  const expectedStem = normalizedStem(manifest.name);
  const actualStem = normalizedStem(candidate.name);
  let score = 0;

  if (expectedName === actualName) score += 120;
  else if (expectedStem && expectedStem === actualStem) score += 88;
  else if (expectedStem.length >= 4 && actualStem.length >= 4 && (
    expectedStem.includes(actualStem) || actualStem.includes(expectedStem)
  )) score += 42;

  if (manifest.kind === candidate.kind) score += 24;
  else score -= 18;
  if (manifest.size && candidate.size) {
    const sizeRatio = Math.min(manifest.size, candidate.size) / Math.max(manifest.size, candidate.size);
    if (sizeRatio >= 0.995) score += 18;
    else if (sizeRatio >= 0.92) score += 8;
  }
  if (manifest.lastModified && candidate.lastModified && manifest.lastModified === candidate.lastModified) score += 7;
  return score;
}

/**
 * Encuentra el ID persistido que debe recuperar un archivo reimportado.
 * El nombre/base manda y los metadatos solo desempatan, de modo que una
 * conversión local de contenedor siga reconectando la toma original.
 */
export function matchEditAssetManifest(
  manifests: EditAssetManifest[],
  candidate: EditAssetFileCandidate,
  connectedIds: ReadonlySet<string>
): EditAssetManifest | null {
  const ranked = manifests
    .filter((manifest) => !connectedIds.has(manifest.id))
    .map((manifest) => ({ manifest, score: candidateScore(manifest, candidate) }))
    .filter((entry) => entry.score >= 60)
    .sort((left, right) => right.score - left.score || left.manifest.id.localeCompare(right.manifest.id));
  return ranked[0]?.manifest ?? null;
}

export function buildFallbackEditAssetManifest(
  clips: Array<Pick<{ assetId: string; label: string }, "assetId" | "label">>
): EditAssetManifest[] {
  const seen = new Set<string>();
  const manifests: EditAssetManifest[] = [];
  for (const clip of clips) {
    if (!clip.assetId || seen.has(clip.assetId)) continue;
    seen.add(clip.assetId);
    manifests.push({
      id: clip.assetId,
      name: clip.label || clip.assetId,
      kind: "video",
      duration: 0,
      width: 0,
      height: 0,
    });
  }
  return manifests;
}
