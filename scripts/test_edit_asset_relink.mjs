import assert from "node:assert/strict";
import {
  buildFallbackEditAssetManifest,
  matchEditAssetManifest,
} from "../src/lib/editProjectAssets.ts";

const manifest = [
  { id: "asset-a", name: "panel 01.mp4", kind: "video", duration: 8, width: 1920, height: 1080, size: 1200 },
  { id: "asset-b", name: "rostro final.png", kind: "image", duration: 10, width: 1600, height: 2400, size: 640 },
];

assert.equal(
  matchEditAssetManifest(manifest, { name: "ROSTRO FINAL.PNG", kind: "image", size: 640 }, new Set())?.id,
  "asset-b",
  "debe reconectar sin depender de mayúsculas"
);
assert.equal(
  matchEditAssetManifest(manifest, { name: "panel 01.mov", kind: "video", size: 1195 }, new Set())?.id,
  "asset-a",
  "debe aceptar el mismo basename aunque cambie el contenedor"
);
assert.equal(
  matchEditAssetManifest(manifest, { name: "panel 01.mp4", kind: "video", size: 1200 }, new Set(["asset-a"])),
  null,
  "un archivo ya reconectado no puede ocupar dos IDs"
);

const fallback = buildFallbackEditAssetManifest([
  { assetId: "legacy-a", label: "Plano antiguo" },
  { assetId: "legacy-a", label: "Plano antiguo" },
]);
assert.deepEqual(fallback.map(({ id, name }) => ({ id, name })), [{ id: "legacy-a", name: "Plano antiguo" }]);

console.log("✓ manifiesto y reconexión determinista de medios");
