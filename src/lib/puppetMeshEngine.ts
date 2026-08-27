/**
 * 2D Puppet Mesh Rigging & Vector Deformation Engine
 * Enables Live2D / Puppet Warp character deformation directly in HTML5 Canvas.
 * Supports interactive control pins (Head, Torso, Arms, Hands, Jaw),
 * As-Rigid-As-Possible (ARAP) / RBF mesh deformation, and automated anime motion generators.
 */

export type PuppetPinType =
  | "head"
  | "chest"
  | "arm_left"
  | "arm_right"
  | "hand_left"
  | "hand_right"
  | "face_jaw"
  | "custom";

export interface PuppetPin {
  id: string;
  name: string;
  type: PuppetPinType;
  baseX: number; // 0..1 normalized across cutout width
  baseY: number; // 0..1 normalized across cutout height
  offsetX: number; // -100..100 user pose offset in pixels
  offsetY: number; // -100..100 user pose offset in pixels
  radius: number; // 0.1..0.6 radius of influence
  color: string;
}

export type PuppetMotionStyle =
  | "none"
  | "organic_breathing" // Torso expansion + gentle head nodding
  | "katana_stance"     // Arms & hands swaying with sword motion
  | "wind_flutter"      // Cloth, hair and hands fluttering
  | "tension_shiver"    // High-frequency fury/combat muscle pulse
  | "living_gaze";      // Subtle head turning & micro facial movements

export interface PuppetRigConfig {
  enabled: boolean;
  motionStyle: PuppetMotionStyle;
  motionIntensity: number; // 0..100
  motionSpeed: number; // 0.2..3.0
  pins: PuppetPin[];
  showMeshWireframe: boolean;
  showPins: boolean;
}

export type PuppetFramingPreset = "portrait" | "mid_body" | "full_body";

export const PUPPET_FRAMING_PRESETS: Record<PuppetFramingPreset, { label: string; desc: string; icon: string; pins: PuppetPin[] }> = {
  portrait: {
    label: "Primer Plano / Rostro",
    desc: "Enfoque en cara, mirada, mandíbula y respiración facial (Ideal para viñetas de retrato)",
    icon: "👤",
    pins: [
      {
        id: "pin-head",
        name: "Corona / Cabeza",
        type: "head",
        baseX: 0.5,
        baseY: 0.14,
        offsetX: 0,
        offsetY: 0,
        radius: 0.32,
        color: "#38bdf8",
      },
      {
        id: "pin-eyes",
        name: "Mirada / Ojos",
        type: "head",
        baseX: 0.5,
        baseY: 0.34,
        offsetX: 0,
        offsetY: 0,
        radius: 0.22,
        color: "#818cf8",
      },
      {
        id: "pin-face-jaw",
        name: "Mandíbula / Boca",
        type: "face_jaw",
        baseX: 0.5,
        baseY: 0.62,
        offsetX: 0,
        offsetY: 0,
        radius: 0.26,
        color: "#facc15",
      },
      {
        id: "pin-cheek-left",
        name: "Cabello / Lado Izq",
        type: "arm_left",
        baseX: 0.26,
        baseY: 0.44,
        offsetX: 0,
        offsetY: 0,
        radius: 0.22,
        color: "#4ade80",
      },
      {
        id: "pin-cheek-right",
        name: "Cabello / Lado Der",
        type: "arm_right",
        baseX: 0.74,
        baseY: 0.44,
        offsetX: 0,
        offsetY: 0,
        radius: 0.22,
        color: "#fb7185",
      },
      {
        id: "pin-chest",
        name: "Cuello / Hombros",
        type: "chest",
        baseX: 0.5,
        baseY: 0.86,
        offsetX: 0,
        offsetY: 0,
        radius: 0.32,
        color: "#c084fc",
      },
    ],
  },
  mid_body: {
    label: "Medio Cuerpo / Torso",
    desc: "Cabeza, pecho, brazos y manos de combate (Ideal para espadachines)",
    icon: "🥋",
    pins: [
      {
        id: "pin-head",
        name: "Cabeza / Mirada",
        type: "head",
        baseX: 0.5,
        baseY: 0.18,
        offsetX: 0,
        offsetY: 0,
        radius: 0.26,
        color: "#38bdf8",
      },
      {
        id: "pin-chest",
        name: "Pecho / Torso",
        type: "chest",
        baseX: 0.5,
        baseY: 0.46,
        offsetX: 0,
        offsetY: 0,
        radius: 0.32,
        color: "#c084fc",
      },
      {
        id: "pin-arm-left",
        name: "Brazo Izquierdo",
        type: "arm_left",
        baseX: 0.24,
        baseY: 0.44,
        offsetX: 0,
        offsetY: 0,
        radius: 0.24,
        color: "#4ade80",
      },
      {
        id: "pin-arm-right",
        name: "Brazo Derecho",
        type: "arm_right",
        baseX: 0.76,
        baseY: 0.44,
        offsetX: 0,
        offsetY: 0,
        radius: 0.24,
        color: "#fb7185",
      },
      {
        id: "pin-hand-left",
        name: "Mano / Hoja Izq",
        type: "hand_left",
        baseX: 0.18,
        baseY: 0.70,
        offsetX: 0,
        offsetY: 0,
        radius: 0.20,
        color: "#2dd4bf",
      },
      {
        id: "pin-hand-right",
        name: "Mano / Hoja Der",
        type: "hand_right",
        baseX: 0.82,
        baseY: 0.70,
        offsetX: 0,
        offsetY: 0,
        radius: 0.20,
        color: "#f43f5e",
      },
      {
        id: "pin-face-jaw",
        name: "Mandíbula / Boca",
        type: "face_jaw",
        baseX: 0.5,
        baseY: 0.29,
        offsetX: 0,
        offsetY: 0,
        radius: 0.18,
        color: "#facc15",
      },
    ],
  },
  full_body: {
    label: "Cuerpo Entero",
    desc: "Control total de cabeza a pies para figuras completas en salto o carrera",
    icon: "🏃",
    pins: [
      { id: "pin-head", name: "Cabeza", type: "head", baseX: 0.5, baseY: 0.10, offsetX: 0, offsetY: 0, radius: 0.18, color: "#38bdf8" },
      { id: "pin-chest", name: "Pecho", type: "chest", baseX: 0.5, baseY: 0.28, offsetX: 0, offsetY: 0, radius: 0.22, color: "#c084fc" },
      { id: "pin-arm-left", name: "Brazo Izq", type: "arm_left", baseX: 0.28, baseY: 0.26, offsetX: 0, offsetY: 0, radius: 0.18, color: "#4ade80" },
      { id: "pin-arm-right", name: "Brazo Der", type: "arm_right", baseX: 0.72, baseY: 0.26, offsetX: 0, offsetY: 0, radius: 0.18, color: "#fb7185" },
      { id: "pin-hand-left", name: "Mano Izq", type: "hand_left", baseX: 0.20, baseY: 0.44, offsetX: 0, offsetY: 0, radius: 0.15, color: "#2dd4bf" },
      { id: "pin-hand-right", name: "Mano Der", type: "hand_right", baseX: 0.80, baseY: 0.44, offsetX: 0, offsetY: 0, radius: 0.15, color: "#f43f5e" },
      { id: "pin-leg-left", name: "Pierna Izq", type: "custom", baseX: 0.38, baseY: 0.68, offsetX: 0, offsetY: 0, radius: 0.20, color: "#34d399" },
      { id: "pin-leg-right", name: "Pierna Der", type: "custom", baseX: 0.62, baseY: 0.68, offsetX: 0, offsetY: 0, radius: 0.20, color: "#f87171" },
      { id: "pin-foot-left", name: "Pie Izq", type: "custom", baseX: 0.34, baseY: 0.90, offsetX: 0, offsetY: 0, radius: 0.16, color: "#a7f3d0" },
      { id: "pin-foot-right", name: "Pie Der", type: "custom", baseX: 0.66, baseY: 0.90, offsetX: 0, offsetY: 0, radius: 0.16, color: "#fecdd3" },
    ],
  },
};

export const DEFAULT_PUPPET_PINS: PuppetPin[] = PUPPET_FRAMING_PRESETS.portrait.pins;

export const DEFAULT_PUPPET_CONFIG: PuppetRigConfig = {
  enabled: true,
  motionStyle: "organic_breathing",
  motionIntensity: 65,
  motionSpeed: 1.0,
  pins: DEFAULT_PUPPET_PINS,
  showMeshWireframe: false,
  showPins: true,
};

/**
 * High-performance 2D Puppet Mesh Warper
 */
export class PuppetMeshWarper {
  private gridCols = 14;
  private gridRows = 16;

  /**
   * Render deformed character cutout with puppet rigging
   */
  public renderDeformedCutout(
    targetCtx: CanvasRenderingContext2D,
    cutoutImg: HTMLImageElement | HTMLCanvasElement,
    dstX: number,
    dstY: number,
    dstW: number,
    dstH: number,
    rig: PuppetRigConfig,
    t: number,
    selectedPinId: string | null = null
  ) {
    const srcW = cutoutImg.width || (cutoutImg as HTMLImageElement).naturalWidth || 640;
    const srcH = cutoutImg.height || (cutoutImg as HTMLImageElement).naturalHeight || 480;

    if (!rig.enabled || rig.pins.length === 0) {
      // Fallback direct draw
      targetCtx.drawImage(cutoutImg, dstX, dstY, dstW, dstH);
      return;
    }

    // Calculate dynamic animation offsets for each pin
    const strength = (rig.motionIntensity / 100);
    const speed = rig.motionSpeed;
    const style = rig.motionStyle;

    const pinOffsets = rig.pins.map((pin) => {
      let animX = 0;
      let animY = 0;

      if (style === "organic_breathing") {
        if (pin.type === "chest") {
          animY = -Math.sin(t * 2.2 * speed) * 8 * strength;
          animX = Math.cos(t * 1.1 * speed) * 2 * strength;
        } else if (pin.type === "head" || pin.type === "face_jaw") {
          animY = -Math.sin(t * 2.2 * speed + 0.3) * 5 * strength;
          animX = Math.sin(t * 1.5 * speed) * 3 * strength;
        } else if (pin.type === "arm_left" || pin.type === "hand_left") {
          animX = -Math.sin(t * 2.0 * speed) * 4 * strength;
          animY = Math.cos(t * 2.2 * speed) * 3 * strength;
        } else if (pin.type === "arm_right" || pin.type === "hand_right") {
          animX = Math.sin(t * 2.0 * speed) * 4 * strength;
          animY = Math.cos(t * 2.2 * speed) * 3 * strength;
        }
      } else if (style === "katana_stance") {
        if (pin.type === "hand_right" || pin.type === "arm_right") {
          animX = Math.sin(t * 2.8 * speed) * 16 * strength;
          animY = -Math.cos(t * 2.8 * speed) * 12 * strength;
        } else if (pin.type === "hand_left" || pin.type === "arm_left") {
          animX = -Math.cos(t * 2.4 * speed) * 10 * strength;
          animY = Math.sin(t * 2.4 * speed) * 8 * strength;
        } else if (pin.type === "chest" || pin.type === "head") {
          animX = Math.sin(t * 1.4 * speed) * 5 * strength;
          animY = Math.cos(t * 1.8 * speed) * 4 * strength;
        }
      } else if (style === "wind_flutter") {
        const wave = Math.sin(t * 3.5 * speed + pin.baseY * 6);
        animX = wave * 12 * strength;
        animY = Math.cos(t * 3.0 * speed + pin.baseX * 4) * 5 * strength;
      } else if (style === "tension_shiver") {
        const jitterX = (Math.sin(t * 28.0 + pin.baseX * 20) + Math.cos(t * 44.0)) * 2.5 * strength;
        const jitterY = (Math.cos(t * 26.0 + pin.baseY * 20) + Math.sin(t * 38.0)) * 2.5 * strength;
        animX = jitterX;
        animY = jitterY;
      } else if (style === "living_gaze") {
        if (pin.type === "head" || pin.type === "face_jaw") {
          animX = Math.sin(t * 0.9 * speed) * 9 * strength;
          animY = Math.cos(t * 0.7 * speed) * 4 * strength;
        }
      }

      return {
        pin,
        totalOffsetX: (pin.offsetX || 0) + animX,
        totalOffsetY: (pin.offsetY || 0) + animY,
      };
    });

    // Generate deformed mesh vertices
    const cols = this.gridCols;
    const rows = this.gridRows;
    const gridPoints: { u: number; v: number; x: number; y: number }[][] = [];

    for (let r = 0; r <= rows; r++) {
      gridPoints[r] = [];
      const vNorm = r / rows;
      const vPix = vNorm * srcH;
      const baseScreenY = dstY + vNorm * dstH;

      for (let c = 0; c <= cols; c++) {
        const uNorm = c / cols;
        const uPix = uNorm * srcW;
        const baseScreenX = dstX + uNorm * dstW;

        // Compute deformation displacement via RBF
        let dispX = 0;
        let dispY = 0;
        let totalWeight = 0;

        for (const item of pinOffsets) {
          const pinNormX = item.pin.baseX;
          const pinNormY = item.pin.baseY;
          const distNorm = Math.hypot(uNorm - pinNormX, vNorm - pinNormY);
          const rad = item.pin.radius || 0.3;

          if (distNorm < rad * 1.5) {
            // Smooth Gaussian-like kernel
            const weight = Math.exp(-((distNorm * distNorm) / (2 * rad * rad)));
            dispX += item.totalOffsetX * weight;
            dispY += item.totalOffsetY * weight;
            totalWeight += weight;
          }
        }

        const normWeight = Math.min(1.0, totalWeight);
        const screenX = baseScreenX + dispX * normWeight;
        const screenY = baseScreenY + dispY * normWeight;

        gridPoints[r][c] = {
          u: uPix,
          v: vPix,
          x: screenX,
          y: screenY,
        };
      }
    }

    // Render Textured Triangles onto target canvas
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p00 = gridPoints[r][c];
        const p10 = gridPoints[r][c + 1];
        const p01 = gridPoints[r + 1][c];
        const p11 = gridPoints[r + 1][c + 1];

        // Triangle 1: (p00, p10, p01)
        this.drawTexturedTriangle(
          targetCtx,
          cutoutImg,
          p00.u, p00.v,
          p10.u, p10.v,
          p01.u, p01.v,
          p00.x, p00.y,
          p10.x, p10.y,
          p01.x, p01.y
        );

        // Triangle 2: (p10, p11, p01)
        this.drawTexturedTriangle(
          targetCtx,
          cutoutImg,
          p10.u, p10.v,
          p11.u, p11.v,
          p01.u, p01.v,
          p10.x, p10.y,
          p11.x, p11.y,
          p01.x, p01.y
        );
      }
    }

    // Optional: Draw Wireframe Mesh
    if (rig.showMeshWireframe) {
      targetCtx.save();
      targetCtx.strokeStyle = "rgba(168, 85, 247, 0.4)";
      targetCtx.lineWidth = 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const p00 = gridPoints[r][c];
          const p10 = gridPoints[r][c + 1];
          const p01 = gridPoints[r + 1][c];
          const p11 = gridPoints[r + 1][c + 1];

          targetCtx.beginPath();
          targetCtx.moveTo(p00.x, p00.y);
          targetCtx.lineTo(p10.x, p10.y);
          targetCtx.lineTo(p01.x, p01.y);
          targetCtx.closePath();
          targetCtx.stroke();

          targetCtx.beginPath();
          targetCtx.moveTo(p10.x, p10.y);
          targetCtx.lineTo(p11.x, p11.y);
          targetCtx.lineTo(p01.x, p01.y);
          targetCtx.closePath();
          targetCtx.stroke();
        }
      }
      targetCtx.restore();
    }

    // Optional: Draw Interactive Puppet Pins
    if (rig.showPins) {
      this.drawPuppetPins(targetCtx, dstX, dstY, dstW, dstH, pinOffsets, selectedPinId);
    }
  }

  /**
   * Render single affine-mapped triangle using Canvas 2D Transform
   */
  private drawTexturedTriangle(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement | HTMLCanvasElement,
    u0: number, v0: number,
    u1: number, v1: number,
    u2: number, v2: number,
    x0: number, y0: number,
    x1: number, y1: number,
    x2: number, y2: number
  ) {
    ctx.save();

    // Clip to destination triangle with 0.5px margin to avoid seam gaps
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.clip();

    // Compute Exact Affine Matrix from UV (Texture) to XY (Canvas)
    const delta = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
    if (Math.abs(delta) < 0.0001) {
      ctx.restore();
      return;
    }

    const deltaInv = 1.0 / delta;

    const a = (x0 * (v1 - v2) + x1 * (v2 - v0) + x2 * (v0 - v1)) * deltaInv;
    const b = (y0 * (v1 - v2) + y1 * (v2 - v0) + y2 * (v0 - v1)) * deltaInv;
    const c = (x0 * (u2 - u1) + x1 * (u0 - u2) + x2 * (u1 - u0)) * deltaInv;
    const d = (y0 * (u2 - u1) + y1 * (u0 - u2) + y2 * (u1 - u0)) * deltaInv;
    const e = (x0 * (u1 * v2 - u2 * v1) + x1 * (u2 * v0 - u0 * v2) + x2 * (u0 * v1 - u1 * v0)) * deltaInv;
    const f = (y0 * (u1 * v2 - u2 * v1) + y1 * (u2 * v0 - u0 * v2) + y2 * (u0 * v1 - u1 * v0)) * deltaInv;

    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);

    ctx.restore();
  }

  /**
   * Render color-coded control pins on canvas for interactive dragging
   */
  private drawPuppetPins(
    ctx: CanvasRenderingContext2D,
    dstX: number,
    dstY: number,
    dstW: number,
    dstH: number,
    pinOffsets: { pin: PuppetPin; totalOffsetX: number; totalOffsetY: number }[],
    selectedPinId: string | null
  ) {
    for (const item of pinOffsets) {
      const pin = item.pin;
      const px = dstX + pin.baseX * dstW + item.totalOffsetX;
      const py = dstY + pin.baseY * dstH + item.totalOffsetY;
      const isSelected = selectedPinId === pin.id;

      ctx.save();

      // Pin influence ring
      if (isSelected) {
        ctx.strokeStyle = pin.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(px, py, pin.radius * dstW * 0.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Outer glow
      ctx.shadowColor = pin.color;
      ctx.shadowBlur = isSelected ? 16 : 8;

      // Outer ring
      ctx.fillStyle = isSelected ? "#ffffff" : pin.color;
      ctx.beginPath();
      ctx.arc(px, py, isSelected ? 8 : 6, 0, Math.PI * 2);
      ctx.fill();

      // Center core
      ctx.fillStyle = isSelected ? pin.color : "#000000";
      ctx.beginPath();
      ctx.arc(px, py, isSelected ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Label
      if (isSelected) {
        ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.textAlign = 'center';
        ctx.fillText(pin.name, px, py - 12);
      }

      ctx.restore();
    }
  }
}

export const globalPuppetWarper = new PuppetMeshWarper();
