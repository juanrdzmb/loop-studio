"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  MangaMotionConfig,
  DEFAULT_MANGA_CONFIG,
  MANGA_TEMPLATES,
  AspectRatio,
  CameraMovement,
  CAMERA_MODE_DEFAULTS,
  ParticleType,
  SpeedLinesType,
  AestheticStyle,
  KatanaArcColor,
  renderMangaMotionFrame,
} from "@/lib/mangaMotionEngine";
import { exportMangaMotionVideo } from "@/lib/mangaMotionExport";
import { renderMangaMotionVideoBackend } from "@/lib/companion";
import {
  MangaTextItem,
  BubbleType,
  MANGA_SFX_DICTIONARY,
  ANIME_PHRASES,
  translateToJapaneseManga,
} from "@/lib/mangaTypographyEngine";
import {
  MangaAudioConfig,
  DEFAULT_MANGA_AUDIO_CONFIG,
  MANGA_AUDIO_VIBES,
  MangaAudioVibe,
  MangaAudioPlayer,
  decodeAudioDataAsync,
  renderMangaMasterAudio,
  drawAudioWaveform,
  drawFullAudioTrimmerWaveform,
  analyzeAudioHighlights,
  AudioHighlightAnalysis,
} from "@/lib/mangaAudioEngine";

export default function MangaMotionStudioPage() {
  // Project Settings
  const [config, setConfig] = useState<MangaMotionConfig>(DEFAULT_MANGA_CONFIG);
  const [activeTab, setActiveTab] = useState<"text" | "fx" | "audio" | "camera_style" | "export">("text");

  // Loaded Media (Image or Video)
  const [mediaEl, setMediaEl] = useState<HTMLImageElement | HTMLVideoElement | null>(null);
  const [rawMediaFile, setRawMediaFile] = useState<File | null>(null);
  const [rawAudioFile, setRawAudioFile] = useState<File | null>(null);
  const [mediaFileName, setMediaFileName] = useState<string>("");
  const [isVideo, setIsVideo] = useState<boolean>(false);
  const [videoDuration, setVideoDuration] = useState<number>(0);

  // Audio Engine State
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [audioConfig, setAudioConfig] = useState<MangaAudioConfig>(DEFAULT_MANGA_AUDIO_CONFIG);
  const [audioFileName, setAudioFileName] = useState<string>("");
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [audioAnalysis, setAudioAnalysis] = useState<AudioHighlightAnalysis | null>(null);

  // Playback & Animation Loop
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Drag & Drop / Selection on Canvas
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<
    | { type: "text_move"; id: string }
    | { type: "text_rotate"; id: string }
    | { type: "text_scale"; id: string }
    | { type: "katana_center" }
    | { type: "katana_angle" }
    | { type: "eye" }
    | { type: "speed_center" }
    | null
  >(null);

  // Text Creator State
  const [newTextContent, setNewTextContent] = useState<string>("");
  const [newTextSub, setNewTextSub] = useState<string>("");
  const [newTextType, setNewTextType] = useState<BubbleType>("vertical_sfx");

  // Export State & In-Page Video Player
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState<string>("");
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // DOM Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const trimmerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Audio Player Ref
  const audioPlayerRef = useRef<MangaAudioPlayer | null>(null);

  // Live Timer decoupled from state for smooth 60 FPS
  const currentTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const lastUiUpdateRef = useRef(0);
  const configRef = useRef(config);
  const audioConfigRef = useRef(audioConfig);
  const isAudioMutedRef = useRef(isAudioMuted);
  const mediaElRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    audioConfigRef.current = audioConfig;
  }, [audioConfig]);

  useEffect(() => {
    isAudioMutedRef.current = isAudioMuted;
  }, [isAudioMuted]);

  useEffect(() => {
    mediaElRef.current = mediaEl;
  }, [mediaEl]);

  // Sync ref
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const getAudioPlayer = useCallback(() => {
    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new MangaAudioPlayer();
    }
    return audioPlayerRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.destroy();
      }
      if (exportedVideoUrl) {
        URL.revokeObjectURL(exportedVideoUrl);
      }
    };
  }, [exportedVideoUrl]);

  // Pause playback helper (used when dragging sliders to prevent audio tearing)
  const pausePlayback = () => {
    if (isPlayingRef.current) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      const player = getAudioPlayer();
      player.pause();
      if (mediaElRef.current instanceof HTMLVideoElement) {
        mediaElRef.current.pause();
      }
    }
  };

  // Load Main Media (Image or Video)
  const handleMediaFile = (file: File) => {
    pausePlayback();
    setExportedVideoUrl(null);
    setRawMediaFile(file);

    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.src = URL.createObjectURL(file);
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";

      video.onloadedmetadata = () => {
        setMediaEl(video);
        setIsVideo(true);
        setMediaFileName(file.name);
        const dur = Math.min(60, Math.max(3, Math.round(video.duration)));
        setVideoDuration(video.duration);
        setConfig((prev) => ({
          ...DEFAULT_MANGA_CONFIG,
          duration: dur || prev.duration,
          aspectRatio: prev.aspectRatio,
        }));
        setSelectedTextId(null);
      };
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          setMediaEl(img);
          setIsVideo(false);
          setMediaFileName(file.name);
          setConfig((prev) => ({
            ...DEFAULT_MANGA_CONFIG,
            aspectRatio: prev.aspectRatio,
          }));
          setSelectedTextId(null);
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    }
  };

  // Load Audio Track & Run Smart Analysis (Starts PAUSED)
  const handleAudioFile = async (file: File) => {
    pausePlayback();
    setIsAudioLoading(true);
    setRawAudioFile(file);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await decodeAudioDataAsync(arrayBuffer);
      setAudioBuffer(decoded);
      setAudioFileName(file.name);

      // Run Beat & Drop Highlight Analyzer
      const analysis = analyzeAudioHighlights(decoded);
      setAudioAnalysis(analysis);

      // Default start at beginning
      setAudioConfig((prev) => ({ ...prev, audioStartTime: 0 }));

      const player = getAudioPlayer();
      await player.loadBuffer(decoded);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar el archivo de audio");
    } finally {
      setIsAudioLoading(false);
    }
  };

  // Seek and sync audio (Pauses during manual seek for stability)
  const handleSeek = async (t: number) => {
    pausePlayback();
    currentTimeRef.current = t;
    setCurrentTime(t);
    if (mediaElRef.current instanceof HTMLVideoElement) {
      mediaElRef.current.currentTime = t % (mediaElRef.current.duration || 1);
    }
  };

  const togglePlayPause = async () => {
    const nextState = !isPlaying;
    setIsPlaying(nextState);
    isPlayingRef.current = nextState;

    const player = getAudioPlayer();
    if (nextState) {
      if (audioBuffer && !isAudioMuted) {
        await player.play(audioConfig, currentTimeRef.current);
      }
      if (mediaElRef.current instanceof HTMLVideoElement) {
        void mediaElRef.current.play();
      }
    } else {
      player.pause();
      if (mediaElRef.current instanceof HTMLVideoElement) {
        mediaElRef.current.pause();
      }
    }
  };

  const toggleMute = () => {
    const nextMute = !isAudioMuted;
    setIsAudioMuted(nextMute);
    const player = getAudioPlayer();
    player.setMute(nextMute);
  };

  // Jump Audio Start to Specific Second
  const setAudioStartOffset = async (startSec: number) => {
    if (!audioBuffer) return;
    const boundedStart = Math.max(0, Math.min(audioBuffer.duration - 1, startSec));
    const nextCfg = { ...audioConfig, audioStartTime: boundedStart };
    setAudioConfig(nextCfg);
    
    // Always start newly chosen clip from beginning
    currentTimeRef.current = 0;
    setCurrentTime(0);

    const player = getAudioPlayer();
    player.updateLiveSettings(nextCfg);
    if (isPlayingRef.current && !isAudioMuted) {
      await player.play(nextCfg, 0);
    }
  };

  // Select Audio Vibe
  const handleSelectVibe = async (vibeId: MangaAudioVibe) => {
    const targetVibe = MANGA_AUDIO_VIBES.find((v) => v.id === vibeId);
    if (!targetVibe) return;

    const nextCfg: MangaAudioConfig = {
      ...audioConfig,
      ...targetVibe.config,
      vibe: vibeId,
    };
    setAudioConfig(nextCfg);
    const player = getAudioPlayer();
    player.updateLiveSettings(nextCfg);
  };

  // Select Camera Mode & Reset to its Preset Defaults Cleanly
  const handleSelectCameraMode = (mode: CameraMovement) => {
    const defaults = CAMERA_MODE_DEFAULTS[mode];
    setConfig((prev) => ({
      ...prev,
      cameraMove: mode,
      ...defaults,
    }));
  };

  // Canvas Dimensions
  const getCanvasDimensions = () => {
    if (config.aspectRatio === "9:16") return { width: 450, height: 800 };
    if (config.aspectRatio === "16:9") return { width: 800, height: 450 };
    return { width: 600, height: 600 };
  };

  const dims = getCanvasDimensions();

  // Mouse Handlers on Canvas (Move Text, Rotate Text, Scale Text, Katana Arc, Eye Glow)
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    // 1. Check selected text handles first (Rotate & Scale Handles)
    if (selectedTextId) {
      const item = config.textItems.find((t) => t.id === selectedTextId);
      if (item) {
        const itemScreenX = item.x * canvas.width;
        const itemScreenY = item.y * canvas.height;
        const baseSize = item.fontSize || 34;
        const scale = item.scale || 1.0;
        const rotRad = ((item.rotation || 0) * Math.PI) / 180;

        const boundW = Math.max(90, item.type === "vertical_sfx" ? baseSize * 1.6 : item.text.length * baseSize * 0.7 + 50) * scale;
        const boundH = Math.max(60, item.type === "vertical_sfx" ? item.text.length * baseSize * 1.1 + 30 : baseSize * 2.2 + 20) * scale;
        const halfW = boundW / 2;
        const halfH = boundH / 2;

        // Top rotation handle position in canvas pixels
        const rotHandleLocalX = 0;
        const rotHandleLocalY = -halfH - 24;
        const rotHandleScreenX = itemScreenX + Math.cos(rotRad) * rotHandleLocalX - Math.sin(rotRad) * rotHandleLocalY;
        const rotHandleScreenY = itemScreenY + Math.sin(rotRad) * rotHandleLocalX + Math.cos(rotRad) * rotHandleLocalY;

        const distRotate = Math.hypot((e.clientX - rect.left) - rotHandleScreenX, (e.clientY - rect.top) - rotHandleScreenY);
        if (distRotate < 18) {
          setDragTarget({ type: "text_rotate", id: item.id });
          return;
        }

        // Bottom-Right scale handle position
        const scaleHandleLocalX = halfW;
        const scaleHandleLocalY = halfH;
        const scaleHandleScreenX = itemScreenX + Math.cos(rotRad) * scaleHandleLocalX - Math.sin(rotRad) * scaleHandleLocalY;
        const scaleHandleScreenY = itemScreenY + Math.sin(rotRad) * scaleHandleLocalX + Math.cos(rotRad) * scaleHandleLocalY;

        const distScale = Math.hypot((e.clientX - rect.left) - scaleHandleScreenX, (e.clientY - rect.top) - scaleHandleScreenY);
        if (distScale < 18) {
          setDragTarget({ type: "text_scale", id: item.id });
          return;
        }
      }
    }

    // 2. Check Katana Arc Center & Angle Handle
    if (config.katanaArc.enabled) {
      const arc = config.katanaArc;
      const distCenter = Math.hypot(clickX - arc.x, clickY - arc.y);
      if (distCenter < 0.08) {
        setDragTarget({ type: "katana_center" });
        return;
      }

      const radNorm = arc.radius / canvas.height;
      const angleRad = (arc.angle * Math.PI) / 180;
      const tipX = arc.x + Math.cos(angleRad) * radNorm * (canvas.height / canvas.width);
      const tipY = arc.y + Math.sin(angleRad) * radNorm;
      const distTip = Math.hypot(clickX - tipX, clickY - tipY);
      if (distTip < 0.08) {
        setDragTarget({ type: "katana_angle" });
        return;
      }
    }

    // 3. Check Text Items Body for Click / Move Selection
    for (let i = config.textItems.length - 1; i >= 0; i--) {
      const item = config.textItems[i];
      const dist = Math.hypot(clickX - item.x, clickY - item.y);
      if (dist < 0.14 * item.scale) {
        setSelectedTextId(item.id);
        setDragTarget({ type: "text_move", id: item.id });
        return;
      }
    }

    // 4. Check Eye Glow
    if (config.eyeGlow) {
      const distEye = Math.hypot(clickX - config.eyeGlowPos.x, clickY - config.eyeGlowPos.y);
      if (distEye < 0.09) {
        setDragTarget({ type: "eye" });
        return;
      }
    }

    // 5. Check Speedlines Center
    if (config.speedLines !== "none") {
      const distSpeed = Math.hypot(clickX - config.speedLinesCenter.x, clickY - config.speedLinesCenter.y);
      if (distSpeed < 0.09) {
        setDragTarget({ type: "speed_center" });
        return;
      }
    }

    // Deselect if clicked empty area
    setSelectedTextId(null);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragTarget) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mousePixelX = e.clientX - rect.left;
    const mousePixelY = e.clientY - rect.top;
    const normX = Math.max(0.02, Math.min(0.98, mousePixelX / rect.width));
    const normY = Math.max(0.02, Math.min(0.98, mousePixelY / rect.height));

    if (dragTarget.type === "text_move") {
      setConfig((prev) => ({
        ...prev,
        textItems: prev.textItems.map((item) =>
          item.id === dragTarget.id ? { ...item, x: normX, y: normY } : item
        ),
      }));
    } else if (dragTarget.type === "text_rotate") {
      const item = config.textItems.find((t) => t.id === dragTarget.id);
      if (!item) return;
      const itemScreenX = item.x * canvas.width;
      const itemScreenY = item.y * canvas.height;
      const dx = mousePixelX - itemScreenX;
      const dy = mousePixelY - itemScreenY;
      // Handle is at top (-90 deg), so add 90 deg
      const angleDeg = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI) + 90);
      const normalizedAngle = ((angleDeg + 180) % 360) - 180;
      setConfig((prev) => ({
        ...prev,
        textItems: prev.textItems.map((t) =>
          t.id === dragTarget.id ? { ...t, rotation: normalizedAngle } : t
        ),
      }));
    } else if (dragTarget.type === "text_scale") {
      const item = config.textItems.find((t) => t.id === dragTarget.id);
      if (!item) return;
      const itemScreenX = item.x * canvas.width;
      const itemScreenY = item.y * canvas.height;
      const dist = Math.hypot(mousePixelX - itemScreenX, mousePixelY - itemScreenY);
      const newScale = Math.max(0.3, Math.min(4.0, dist / 80));
      setConfig((prev) => ({
        ...prev,
        textItems: prev.textItems.map((t) =>
          t.id === dragTarget.id ? { ...t, scale: parseFloat(newScale.toFixed(2)) } : t
        ),
      }));
    } else if (dragTarget.type === "katana_center") {
      setConfig((prev) => ({
        ...prev,
        katanaArc: { ...prev.katanaArc, x: normX, y: normY },
      }));
    } else if (dragTarget.type === "katana_angle") {
      const dx = (normX - config.katanaArc.x) * canvas.width;
      const dy = (normY - config.katanaArc.y) * canvas.height;
      const angleDeg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
      const newRadius = Math.max(90, Math.min(450, Math.hypot(dx, dy)));
      setConfig((prev) => ({
        ...prev,
        katanaArc: { ...prev.katanaArc, angle: angleDeg, radius: newRadius },
      }));
    } else if (dragTarget.type === "eye") {
      setConfig((prev) => ({
        ...prev,
        eyeGlowPos: { x: normX, y: normY },
      }));
    } else if (dragTarget.type === "speed_center") {
      setConfig((prev) => ({
        ...prev,
        speedLinesCenter: { x: normX, y: normY },
      }));
    }
  };

  const handleCanvasMouseUp = () => {
    setDragTarget(null);
  };

  // Main 60 FPS Live Render Loop
  useEffect(() => {
    if (!mediaEl) return;

    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const delta = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      if (isPlayingRef.current) {
        const maxDur = Math.max(1, configRef.current.duration);
        const prevT = currentTimeRef.current;
        currentTimeRef.current = (currentTimeRef.current + delta) % maxDur;

        // Loop detection for audio sync
        if (currentTimeRef.current < prevT) {
          const player = getAudioPlayer();
          if (player && isPlayingRef.current && !isAudioMutedRef.current) {
            void player.play(audioConfigRef.current, 0);
          }
        }

        // Sync Video Element current time with seamless loop mode (ping-pong / smooth)
        if (mediaElRef.current instanceof HTMLVideoElement) {
          const vid = mediaElRef.current;
          const vidDur = vid.duration || maxDur;
          let targetVidT = 0;
          if (configRef.current.seamMode === "pingpong") {
            const pingPhase = (currentTimeRef.current % (vidDur * 2)) / vidDur;
            const normT = pingPhase <= 1.0 ? pingPhase : 2.0 - pingPhase;
            targetVidT = normT * vidDur;
          } else {
            targetVidT = currentTimeRef.current % vidDur;
          }
          if (Math.abs(vid.currentTime - targetVidT) > 0.18) {
            vid.currentTime = targetVidT;
          }
          if (vid.paused && isPlayingRef.current) {
            void vid.play();
          }
        }

        // Throttle UI timeline update
        if (now - lastUiUpdateRef.current > 100) {
          lastUiUpdateRef.current = now;
          setCurrentTime(currentTimeRef.current);
        }
      } else {
        if (mediaElRef.current instanceof HTMLVideoElement && !mediaElRef.current.paused) {
          mediaElRef.current.pause();
        }
      }

      const curT = currentTimeRef.current;

      // Draw Main Canvas Frame (Supports Image and Video with seamless crossfade loop)
      const canvas = canvasRef.current;
      if (canvas && mediaElRef.current) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          renderMangaMotionFrame(
            ctx,
            mediaElRef.current,
            configRef.current,
            canvas.width,
            canvas.height,
            curT,
            selectedTextId
          );
        }
      }

      // Draw Live Mini Waveform
      const waveCanvas = waveformCanvasRef.current;
      if (waveCanvas) {
        drawAudioWaveform(waveCanvas, audioBuffer, curT, configRef.current.duration);
      }

      // Draw Interactive Full Song Trimmer
      const trimCanvas = trimmerCanvasRef.current;
      if (trimCanvas) {
        drawFullAudioTrimmerWaveform(
          trimCanvas,
          audioBuffer,
          audioConfigRef.current.audioStartTime,
          configRef.current.duration,
          curT,
          audioConfigRef.current.reverbSettings.speed,
          audioAnalysis
        );
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [
    mediaEl,
    audioBuffer,
    audioAnalysis,
    selectedTextId,
    getAudioPlayer,
  ]);

  // Reset to 100% Pristine Clean State
  const handleResetToClean = () => {
    pausePlayback();
    setConfig({
      ...DEFAULT_MANGA_CONFIG,
      aspectRatio: config.aspectRatio,
      duration: config.duration,
    });
    setSelectedTextId(null);
  };

  // Apply Curated Template (Cleanly resets other settings first)
  const applyTemplate = (tmplConfig: Partial<MangaMotionConfig>) => {
    pausePlayback();
    setConfig((prev) => ({
      ...DEFAULT_MANGA_CONFIG,
      aspectRatio: prev.aspectRatio,
      duration: prev.duration,
      ...tmplConfig,
    }));
    setSelectedTextId(null);
  };

  // Add / Translate Text Item
  const textCounterRef = useRef(1);
  const handleAddText = () => {
    if (!newTextContent.trim()) return;

    const newId = `txt_${textCounterRef.current++}`;
    const newItem: MangaTextItem = {
      id: newId,
      type: newTextType,
      text: newTextContent.trim(),
      subText: newTextSub.trim() || undefined,
      x: 0.5,
      y: 0.35,
      scale: 1.2,
      rotation: 0,
      fontSize: newTextType === "vertical_sfx" ? 36 : 24,
      textColor: newTextType === "vertical_sfx" ? "#ffffff" : "#000000",
      strokeColor: newTextType === "vertical_sfx" ? "#000000" : "#000000",
      strokeWidth: newTextType === "vertical_sfx" ? 7 : 3,
      bgColor: newTextType === "narration_box" ? "#09090b" : "#ffffff",
      pulseType: newTextType === "vertical_sfx" ? "rumble_shake" : "none",
    };

    setConfig((prev) => ({
      ...prev,
      textItems: [...prev.textItems, newItem],
    }));

    setSelectedTextId(newId);
    setNewTextContent("");
    setNewTextSub("");
  };

  // Auto Translate helper
  const handleAutoTranslateInput = () => {
    if (!newTextContent.trim()) return;
    const res = translateToJapaneseManga(newTextContent);
    setNewTextContent(res.japanese);
    setNewTextSub(res.romaji ? `${res.romaji} (${res.translation})` : res.translation);
  };

  // Insert or Update SFX from dictionary (Clean swapping without infinite screen accumulation)
  const handleInsertSfx = (kana: string, romaji: string, meaning: string, recType: BubbleType, color: string) => {
    setConfig((prev) => {
      const targetId = selectedTextId || (prev.textItems.length > 0 ? prev.textItems[prev.textItems.length - 1].id : null);
      if (targetId) {
        return {
          ...prev,
          textItems: prev.textItems.map((item) =>
            item.id === targetId
              ? {
                  ...item,
                  type: recType,
                  text: kana,
                  subText: `${romaji} · ${meaning}`,
                  textColor: color,
                  entranceEffect: item.entranceEffect || "manga_slash_in",
                }
              : item
          ),
        };
      }

      const newId = `sfx_${textCounterRef.current++}`;
      const newItem: MangaTextItem = {
        id: newId,
        type: recType,
        text: kana,
        subText: `${romaji} · ${meaning}`,
        x: 0.78,
        y: 0.32,
        scale: 1.3,
        rotation: -8,
        fontSize: 36,
        textColor: color,
        strokeColor: "#000000",
        strokeWidth: 7,
        bgColor: "#09090b",
        pulseType: "rumble_shake",
        depthPlane: "always_visible",
        entranceEffect: "manga_slash_in",
      };
      setSelectedTextId(newId);
      return { ...prev, textItems: [...prev.textItems, newItem] };
    });
  };

  // Insert or Update Phrase
  const handleInsertPhrase = (ja: string, ro: string, es: string) => {
    setConfig((prev) => {
      const targetId = selectedTextId || (prev.textItems.length > 0 ? prev.textItems[prev.textItems.length - 1].id : null);
      if (targetId) {
        return {
          ...prev,
          textItems: prev.textItems.map((item) =>
            item.id === targetId
              ? {
                  ...item,
                  type: "anime_subtitle",
                  text: ja,
                  subText: `${ro} (${es})`,
                  textColor: "#facc15",
                }
              : item
          ),
        };
      }

      const newId = `txt_${textCounterRef.current++}`;
      const newItem: MangaTextItem = {
        id: newId,
        type: "anime_subtitle",
        text: ja,
        subText: `${ro} (${es})`,
        x: 0.5,
        y: 0.86,
        scale: 1.0,
        rotation: 0,
        fontSize: 26,
        textColor: "#facc15",
        strokeColor: "#000000",
        strokeWidth: 5,
        depthPlane: "camera_far_apex",
        entranceEffect: "depth_plane_fade",
      };
      setSelectedTextId(newId);
      return { ...prev, textItems: [...prev.textItems, newItem] };
    });
  };

  const removeTextItem = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      textItems: prev.textItems.filter((t) => t.id !== id),
    }));
    if (selectedTextId === id) setSelectedTextId(null);
  };

  // HD Export directly in Manga Motion Studio (No redirects!)
  const handleExportHD = async () => {
    if (!mediaEl) return;
    pausePlayback();
    setIsExporting(true);
    setExportProgress(0);
    setExportStatus("Sintetizando audio maestro y codificando video HD a 60 FPS...");
    setError(null);

    try {
      const targetDuration = Math.max(3, Math.min(60, config.duration));

      if (isVideo && rawMediaFile) {
        setExportStatus("Renderizando video con aceleración FFmpeg (partículas + filtros + loop continuo)...");
        setExportProgress(20);
        try {
          const blob = await renderMangaMotionVideoBackend(rawMediaFile, rawAudioFile, {
            ...config,
            duration: targetDuration,
          });
          setExportProgress(100);
          if (exportedVideoUrl) {
            URL.revokeObjectURL(exportedVideoUrl);
          }
          const videoUrl = URL.createObjectURL(blob);
          setExportedVideoUrl(videoUrl);
          setExportedBlob(blob);
          setExportStatus(`¡Video HD (${targetDuration}s) generado con éxito! Puedes reproducirlo abajo o descargarlo.`);
          return;
        } catch (backendErr) {
          console.warn("Backend render fallback to client:", backendErr);
        }
      }

      let finalAudio: AudioBuffer | null = null;
      if (audioBuffer) {
        finalAudio = await renderMangaMasterAudio(
          audioBuffer,
          audioConfig,
          targetDuration
        );
      }

      const res = await exportMangaMotionVideo({
        image: mediaEl,
        config: { ...config, duration: targetDuration },
        audioBuffer: finalAudio,
        onProgress: (ratio) => {
          setExportProgress(Math.round(ratio * 100));
        },
      });

      if (exportedVideoUrl) {
        URL.revokeObjectURL(exportedVideoUrl);
      }

      const videoUrl = URL.createObjectURL(res.blob);
      setExportedVideoUrl(videoUrl);
      setExportedBlob(res.blob);
      setExportStatus(`¡Video HD (${targetDuration}s) generado con éxito! Puedes reproducirlo abajo o descargarlo.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al exportar el video");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadFile = () => {
    if (!exportedBlob || !exportedVideoUrl) return;
    const a = document.createElement("a");
    a.href = exportedVideoUrl;
    a.download = `manga_motion_${config.aspectRatio.replace(":", "x")}_${config.duration}s_${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const activeTextObj = config.textItems.find((t) => t.id === selectedTextId);

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">✨</span>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Manga Motion <span className="text-fuchsia-400">Studio 2.5D</span>
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-fuchsia-950/80 border border-fuchsia-800/60 text-fuchsia-300 rounded-full">
              Imágenes & Videos · 60 FPS · Loop Infinito
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Crea animaciones y loops continuos a partir de <strong className="text-zinc-200">imágenes o videos</strong> con tipografía, partículas y efectos manga.
          </p>
        </div>

        {/* Global Reset Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetToClean}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 transition-all flex items-center gap-2 shadow-sm"
          >
            <span>🔄</span>
            <span>Restablecer Limpio</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center justify-between shadow-lg">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white font-bold ml-4">
            ✕
          </button>
        </div>
      )}

      {/* Main Grid: Left Preview (5 Cols) vs Right Controls (7 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Live Canvas & Trimmer */}
        <div className="lg:col-span-5 space-y-4">
          {/* Canvas Wrapper */}
          <div className="relative rounded-2xl bg-zinc-950 border border-zinc-800 p-3 shadow-2xl flex flex-col items-center justify-center min-h-[480px] overflow-hidden">
            {!mediaEl ? (
              <div className="text-center p-8 space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-3xl shadow-inner">
                  🎬
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-zinc-200">Sube una Imagen o Video</h3>
                  <p className="text-xs text-zinc-500 max-w-xs">
                    Acepta ilustraciones manga (PNG, JPG, WebP) o clips de video (MP4, WebM, MOV) para crear loops continuos.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold cursor-pointer transition-all shadow-lg shadow-fuchsia-950/60">
                  <span>📁 Seleccionar Imagen o Video</span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleMediaFile(e.target.files[0]);
                    }}
                  />
                </label>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center space-y-3">
                <div className="relative rounded-xl overflow-hidden shadow-2xl border border-zinc-800/80 bg-black">
                  <canvas
                    ref={canvasRef}
                    width={dims.width}
                    height={dims.height}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                    className="w-full max-w-[360px] h-auto object-contain cursor-crosshair rounded-lg"
                  />

                  {/* Top Badge */}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-[10px] font-mono text-zinc-300 border border-zinc-700/60 flex items-center gap-1.5">
                    <span>{isVideo ? "🎥 Video Loop" : "🖼️ Imagen"}</span>
                    <span>·</span>
                    <span>{config.aspectRatio}</span>
                    <span>·</span>
                    <span>{config.duration}s</span>
                  </div>

                  {/* Change Media Button */}
                  <label className="absolute bottom-2 left-2 px-2.5 py-1 rounded-lg bg-black/80 hover:bg-zinc-800 backdrop-blur-md text-[11px] text-zinc-300 border border-zinc-700/60 cursor-pointer transition-all">
                    <span>Cambiar archivo 🔄</span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleMediaFile(e.target.files[0]);
                      }}
                    />
                  </label>
                </div>

                <p className="text-[11px] text-zinc-400 text-center leading-relaxed">
                  💡 Haz clic sobre cualquier <strong className="text-fuchsia-300">texto</strong> para moverlo, arrastra el <span className="text-cyan-400 font-bold">círculo azul</span> para <strong className="text-cyan-300">girarlo</strong> o el <span className="text-pink-400 font-bold">círculo rosa</span> para <strong className="text-pink-300">escalarlo</strong>.
                </p>
              </div>
            )}
          </div>

          {/* Timeline & Audio Controls Bar */}
          {mediaEl && (
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePlayPause}
                    className="px-3.5 py-1.5 rounded-lg font-bold bg-fuchsia-600 hover:bg-fuchsia-500 text-white transition-all flex items-center gap-1.5 shadow"
                  >
                    {isPlaying ? "⏸ Pausar" : "▶ Reproducir"}
                  </button>
                  <span className="font-mono text-zinc-300 text-xs">
                    {currentTime.toFixed(1)}s / {config.duration}s
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {audioBuffer && (
                    <>
                      {/* Live Volume Slider */}
                      <div className="flex items-center gap-1.5 bg-zinc-950/80 px-2.5 py-1 rounded-lg border border-zinc-800">
                        <span className="text-[11px] text-zinc-400">🔊</span>
                        <input
                          type="range"
                          min="0"
                          max="150"
                          value={Math.round((audioConfig.musicVolume ?? 0.85) * 100)}
                          onChange={(e) => {
                            const newVol = parseInt(e.target.value) / 100;
                            const nextCfg = { ...audioConfig, musicVolume: newVol };
                            setAudioConfig(nextCfg);
                            const player = getAudioPlayer();
                            player.updateLiveSettings(nextCfg);
                          }}
                          className="w-16 h-1 accent-fuchsia-500 bg-zinc-800 rounded cursor-pointer"
                          title={`Volumen de audio: ${Math.round((audioConfig.musicVolume ?? 0.85) * 100)}%`}
                        />
                        <span className="font-mono text-[10px] text-zinc-400 w-7 text-right">
                          {Math.round((audioConfig.musicVolume ?? 0.85) * 100)}%
                        </span>
                      </div>

                      <button
                        onClick={toggleMute}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                          isAudioMuted
                            ? "border-red-800 bg-red-950/60 text-red-300"
                            : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-white"
                        }`}
                      >
                        {isAudioMuted ? "🔇 Silenciado" : "🔊 Música ON"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Scrubber */}
              <input
                type="range"
                min="0"
                max={config.duration}
                step="0.05"
                value={currentTime}
                onMouseDown={pausePlayback}
                onTouchStart={pausePlayback}
                onChange={(e) => {
                  const t = parseFloat(e.target.value);
                  void handleSeek(t);
                }}
                className="w-full accent-fuchsia-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
              />

              {/* Live Waveform Visualizer */}
              <canvas
                ref={waveformCanvasRef}
                width={450}
                height={36}
                className="w-full h-8 rounded-lg bg-zinc-950 border border-zinc-800/80 shadow-inner"
              />
            </div>
          )}

          {/* Quick Preset Templates Carousel */}
          {mediaEl && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Estilos Rápidos Pro
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {MANGA_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => applyTemplate(tmpl.config)}
                    className="p-2.5 text-left rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-700 transition-all text-xs space-y-1 group"
                  >
                    <div className="font-semibold text-zinc-200 group-hover:text-fuchsia-400 transition-colors truncate">
                      {tmpl.name}
                    </div>
                    <div className="text-[10px] text-zinc-400 line-clamp-1">{tmpl.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Studio Tabs & Inspectors */}
        <div className="lg:col-span-7 space-y-4">
          {/* Navigation Tabs */}
          <div className="flex border-b border-zinc-800 text-xs font-medium overflow-x-auto gap-1 pb-1">
            <button
              onClick={() => setActiveTab("text")}
              className={`px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
                activeTab === "text"
                  ? "bg-fuchsia-950/60 border border-fuchsia-800/80 text-fuchsia-200 font-semibold"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              ✍️ Textos & SFX Manga
            </button>
            <button
              onClick={() => setActiveTab("fx")}
              className={`px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
                activeTab === "fx"
                  ? "bg-fuchsia-950/60 border border-fuchsia-800/80 text-fuchsia-200 font-semibold"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              ⚡ Partículas HD & Katana Arc
            </button>
            <button
              onClick={() => setActiveTab("audio")}
              className={`px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
                activeTab === "audio"
                  ? "bg-fuchsia-950/60 border border-fuchsia-800/80 text-fuchsia-200 font-semibold"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              🎵 Música & Detector Clímax
            </button>
            <button
              onClick={() => setActiveTab("camera_style")}
              className={`px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
                activeTab === "camera_style"
                  ? "bg-fuchsia-950/60 border border-fuchsia-800/80 text-fuchsia-200 font-semibold"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              🎨 Filtros & Duración (60s)
            </button>
            <button
              onClick={() => setActiveTab("export")}
              className={`px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
                activeTab === "export"
                  ? "bg-fuchsia-950/60 border border-fuchsia-800/80 text-fuchsia-200 font-semibold"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              📥 Exportar HD & Player
            </button>
          </div>

          {/* TAB 1: Typography, Japanese Translation & Speech Bubbles */}
          {activeTab === "text" && (
            <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-5">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                  Tipografía Manga & Traductor Japonés Automático
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Escribe en español o inglés y tradúcelo al instante a Kanji/Katakana con bocadillos personalizables.
                </p>
              </div>

              {/* Text Creator Box */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-3">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Escribe aquí (ej: Corte, Furia, El camino del samurai, ドドド)..."
                      value={newTextContent}
                      onChange={(e) => setNewTextContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddText();
                      }}
                      className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-fuchsia-500"
                    />
                    <button
                      onClick={handleAutoTranslateInput}
                      title="Traducir a Japonés Manga"
                      className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all flex items-center gap-1 shadow"
                    >
                      <span>🇯🇵</span>
                      <span>Traducir</span>
                    </button>
                  </div>

                  <input
                    type="text"
                    placeholder="Subtítulo o significado opcional (ej: Bushidō · El camino del samurái)..."
                    value={newTextSub}
                    onChange={(e) => setNewTextSub(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-fuchsia-500"
                  />
                </div>

                {/* Bubble Style Picker */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-400 block">
                    Estilo de Bocadillo / Letra:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
                    {[
                      { id: "vertical_sfx", label: "🈲 SFX Vertical Manga" },
                      { id: "shonen_spikes", label: "🗯️ Grito de Combate" },
                      { id: "classic_speech", label: "💬 Bocadillo Clásico" },
                      { id: "thought_cloud", label: "💭 Pensamiento" },
                      { id: "narration_box", label: "📜 Caja Seinen" },
                      { id: "anime_subtitle", label: "🎌 Subtítulo Anime" },
                    ].map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setNewTextType(b.id as BubbleType)}
                        className={`p-2 rounded-lg border text-left text-xs transition-all ${
                          newTextType === b.id
                            ? "border-fuchsia-500 bg-fuchsia-950/70 text-white font-semibold"
                            : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleAddText}
                  disabled={!newTextContent.trim()}
                  className="w-full py-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-lg"
                >
                  + Agregar al Panel de Manga
                </button>
              </div>

              {/* Active Selected Text Item Inspector (Sliders & Color Controls) */}
              {activeTextObj && (
                <div className="p-4 rounded-xl border border-fuchsia-900/60 bg-zinc-950 space-y-3.5 text-xs">
                  <div className="flex items-center justify-between text-zinc-200 font-semibold border-b border-zinc-800 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-fuchsia-400">✏️ Editando:</span>
                      <span className="font-bold text-white text-sm">&quot;{activeTextObj.text}&quot;</span>
                    </div>
                    <button
                      onClick={() => removeTextItem(activeTextObj.id)}
                      className="text-red-400 hover:text-red-300 font-medium px-2 py-0.5 rounded border border-red-900/50 bg-red-950/40 text-xs transition-colors"
                    >
                      Eliminar 🗑️
                    </button>
                  </div>

                  {/* Size, Scale, Rotation Sliders */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-zinc-400 text-[11px]">
                        <span>Tamaño de Letra</span>
                        <span className="font-mono text-fuchsia-400">{activeTextObj.fontSize || 34}px</span>
                      </div>
                      <input
                        type="range"
                        min="14"
                        max="80"
                        value={activeTextObj.fontSize || 34}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setConfig((prev) => ({
                            ...prev,
                            textItems: prev.textItems.map((item) =>
                              item.id === activeTextObj.id ? { ...item, fontSize: val } : item
                            ),
                          }));
                        }}
                        className="w-full accent-fuchsia-500 h-1 bg-zinc-800 rounded"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-zinc-400 text-[11px]">
                        <span>Escala</span>
                        <span className="font-mono text-fuchsia-400">{activeTextObj.scale.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min="3"
                        max="40"
                        value={Math.round(activeTextObj.scale * 10)}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) / 10;
                          setConfig((prev) => ({
                            ...prev,
                            textItems: prev.textItems.map((item) =>
                              item.id === activeTextObj.id ? { ...item, scale: val } : item
                            ),
                          }));
                        }}
                        className="w-full accent-fuchsia-500 h-1 bg-zinc-800 rounded"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-zinc-400 text-[11px]">
                        <span>Rotación</span>
                        <span className="font-mono text-fuchsia-400">{activeTextObj.rotation}°</span>
                      </div>
                      <input
                        type="range"
                        min="-180"
                        max="180"
                        value={activeTextObj.rotation}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setConfig((prev) => ({
                            ...prev,
                            textItems: prev.textItems.map((item) =>
                              item.id === activeTextObj.id ? { ...item, rotation: val } : item
                            ),
                          }));
                        }}
                        className="w-full accent-fuchsia-500 h-1 bg-zinc-800 rounded"
                      />
                    </div>
                  </div>

                  {/* Colors & Pulse Effect */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    <div className="space-y-1">
                      <span className="text-zinc-400 text-[11px] block">Color de Letra</span>
                      <input
                        type="color"
                        value={activeTextObj.textColor || "#ffffff"}
                        onChange={(e) => {
                          const val = e.target.value;
                          setConfig((prev) => ({
                            ...prev,
                            textItems: prev.textItems.map((item) =>
                              item.id === activeTextObj.id ? { ...item, textColor: val } : item
                            ),
                          }));
                        }}
                        className="w-full h-7 rounded border border-zinc-700 cursor-pointer bg-transparent"
                      />
                    </div>

                    <div className="space-y-1">
                      <span className="text-zinc-400 text-[11px] block">Color del Borde</span>
                      <input
                        type="color"
                        value={activeTextObj.strokeColor || "#000000"}
                        onChange={(e) => {
                          const val = e.target.value;
                          setConfig((prev) => ({
                            ...prev,
                            textItems: prev.textItems.map((item) =>
                              item.id === activeTextObj.id ? { ...item, strokeColor: val } : item
                            ),
                          }));
                        }}
                        className="w-full h-7 rounded border border-zinc-700 cursor-pointer bg-transparent"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-zinc-400 text-[11px]">
                        <span>Grosor Borde</span>
                        <span className="font-mono text-fuchsia-400">{activeTextObj.strokeWidth}px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="15"
                        value={activeTextObj.strokeWidth}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setConfig((prev) => ({
                            ...prev,
                            textItems: prev.textItems.map((item) =>
                              item.id === activeTextObj.id ? { ...item, strokeWidth: val } : item
                            ),
                          }));
                        }}
                        className="w-full accent-fuchsia-500 h-1 bg-zinc-800 rounded"
                      />
                    </div>

                    <div className="space-y-1">
                      <span className="text-zinc-400 text-[11px] block">Animación de Pulso</span>
                      <select
                        value={activeTextObj.pulseType || "none"}
                        onChange={(e) => {
                          const val = e.target.value as MangaTextItem["pulseType"];
                          setConfig((prev) => ({
                            ...prev,
                            textItems: prev.textItems.map((item) =>
                              item.id === activeTextObj.id ? { ...item, pulseType: val } : item
                            ),
                          }));
                        }}
                        className="w-full px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs"
                      >
                        <option value="none">Fijo</option>
                        <option value="rumble_shake">⚡ Temblor Furia</option>
                        <option value="zoom_heartbeat">💓 Latido</option>
                        <option value="subtle_float">🍃 Flotación</option>
                      </select>
                    </div>

                    {/* Depth Plane & 2.5D Layer Timing */}
                    <div className="space-y-1">
                      <span className="text-zinc-400 text-[11px] block font-semibold text-fuchsia-300">
                        🔭 Plano 2.5D / Profundidad
                      </span>
                      <select
                        value={activeTextObj.depthPlane || "always_visible"}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setConfig((prev) => ({
                            ...prev,
                            textItems: prev.textItems.map((item) =>
                              item.id === activeTextObj.id ? { ...item, depthPlane: val } : item
                            ),
                          }));
                        }}
                        className="w-full px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs"
                      >
                        <option value="always_visible">🌐 Siempre Visible</option>
                        <option value="camera_far_apex">🔭 Plano Lejano (Apex Profundo)</option>
                        <option value="camera_close_apex">🔍 Plano Cercano (Zoom In)</option>
                        <option value="timed_window">⏱️ Rango de Segundos</option>
                      </select>
                    </div>

                    {/* Anime Entrance Transition Effect */}
                    <div className="space-y-1">
                      <span className="text-zinc-400 text-[11px] block font-semibold text-cyan-300">
                        ⚡ Transición Entrada Anime
                      </span>
                      <select
                        value={activeTextObj.entranceEffect || "none"}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setConfig((prev) => ({
                            ...prev,
                            textItems: prev.textItems.map((item) =>
                              item.id === activeTextObj.id ? { ...item, entranceEffect: val } : item
                            ),
                          }));
                        }}
                        className="w-full px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs"
                      >
                        <option value="none">Normal (Fijo)</option>
                        <option value="manga_slash_in">⚡ Corte de Katana (Slash)</option>
                        <option value="shonen_impact">💥 Impacto Shonen (Punch)</option>
                        <option value="depth_plane_fade">🌫️ Fundido de Profundidad</option>
                        <option value="ink_reveal">🖋️ Tinta Sumi-e</option>
                      </select>
                    </div>
                  </div>

                  {/* Timed Window Details if selected */}
                  {activeTextObj.depthPlane === "timed_window" && (
                    <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="flex justify-between text-[10px] text-zinc-400">
                          <span>Segundo de Entrada</span>
                          <span className="font-mono text-fuchsia-400">{activeTextObj.appearTime || 0}s</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max={Math.max(1, config.duration - 1)}
                          value={activeTextObj.appearTime || 0}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setConfig((prev) => ({
                              ...prev,
                              textItems: prev.textItems.map((item) =>
                                item.id === activeTextObj.id ? { ...item, appearTime: val } : item
                              ),
                            }));
                          }}
                          className="w-full accent-fuchsia-500 h-1 bg-zinc-800 rounded"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] text-zinc-400">
                          <span>Duración en Pantalla</span>
                          <span className="font-mono text-cyan-400">{activeTextObj.durationSec || 5}s</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max={config.duration}
                          value={activeTextObj.durationSec || 5}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setConfig((prev) => ({
                              ...prev,
                              textItems: prev.textItems.map((item) =>
                                item.id === activeTextObj.id ? { ...item, durationSec: val } : item
                              ),
                            }));
                          }}
                          className="w-full accent-cyan-500 h-1 bg-zinc-800 rounded"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Curated SFX Quick-Insert Dictionary */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Diccionario Rápido de Onomatopeyas Manga (1-Click)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {MANGA_SFX_DICTIONARY.slice(0, 8).map((sfx) => (
                    <button
                      key={sfx.kana}
                      onClick={() =>
                        handleInsertSfx(
                          sfx.kana,
                          sfx.romaji,
                          sfx.meaningEs,
                          sfx.recommendedType,
                          sfx.defaultColor
                        )
                      }
                      className="p-2 rounded-xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 hover:border-zinc-700 text-left transition-all group"
                    >
                      <div className="text-sm font-bold text-zinc-100 group-hover:text-fuchsia-400">
                        {sfx.kana}
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">{sfx.romaji} · {sfx.meaningEs}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Legendary Anime Phrases */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Frases Legendarias de Anime
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {ANIME_PHRASES.slice(0, 4).map((p) => (
                    <button
                      key={p.japanese}
                      onClick={() => handleInsertPhrase(p.japanese, p.romaji, p.spanish)}
                      className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 hover:border-zinc-700 text-left transition-all"
                    >
                      <div className="font-bold text-amber-300 text-xs truncate">{p.japanese}</div>
                      <div className="text-[10px] text-zinc-400 truncate">{p.spanish}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Physics Particles & Katana Arc */}
          {activeTab === "fx" && (
            <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-5">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                  Partículas HD & Corte de Katana Interactivo
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Agrega efectos atmosféricos realistas de combate y posiciona la estela de katana directamente sobre la imagen.
                </p>
              </div>

              {/* Particles Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Partículas Atmosféricas HD
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {[
                    { id: "none", name: "🛑 Ninguna (Limpio)", desc: "Sin partículas" },
                    { id: "bamboo_leaves", name: "🎋 Hojas de Bambú", desc: "Estilo Vagabond" },
                    { id: "embers_fire", name: "🔥 Brasas Ardientes", desc: "Fuego & Berserk" },
                    { id: "sakura_petals", name: "🌸 Pétalos de Sakura", desc: "Demon Slayer" },
                    { id: "cinematic_rain", name: "🌧️ Lluvia Cinemática", desc: "Gotas y velocidad" },
                    { id: "dark_ink_fog", name: "🌫️ Humo de Tinta", desc: "Aura espiritual" },
                    { id: "blood_drips", name: "🩸 Gotas de Sangre", desc: "Gotas de combate" },
                    { id: "golden_sparks", name: "✨ Destellos Anime", desc: "Polvo dorado místico" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          particles: item.id as ParticleType,
                        }))
                      }
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        config.particles === item.id
                          ? "border-fuchsia-600 bg-fuchsia-950/60 text-white font-semibold shadow"
                          : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-300"
                      }`}
                    >
                      <div className="font-bold text-xs truncate">{item.name}</div>
                      <div className="text-[10px] text-zinc-400 truncate mt-0.5">{item.desc}</div>
                    </button>
                  ))}
                </div>

                {config.particles !== "none" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-zinc-400">
                        <span>Intensidad de Partículas</span>
                        <span className="font-mono text-fuchsia-400">{config.particleIntensity}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={config.particleIntensity}
                        onChange={(e) => setConfig((prev) => ({ ...prev, particleIntensity: parseInt(e.target.value) }))}
                        className="w-full accent-fuchsia-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-zinc-400">
                        <span>Velocidad de Caída / Viento</span>
                        <span className="font-mono text-fuchsia-400">{config.particleSpeed.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="25"
                        value={Math.round(config.particleSpeed * 10)}
                        onChange={(e) => setConfig((prev) => ({ ...prev, particleSpeed: parseInt(e.target.value) / 10 }))}
                        className="w-full accent-fuchsia-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Interactive Katana Arc */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-3.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.katanaArc.enabled}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          katanaArc: { ...prev.katanaArc, enabled: e.target.checked },
                        }))
                      }
                      className="accent-fuchsia-500 w-4 h-4 rounded cursor-pointer"
                    />
                    <span className="font-bold text-zinc-100 text-xs">Activar Estela de Corte Katana</span>
                  </label>

                  {config.katanaArc.enabled && (
                    <span className="text-[11px] text-fuchsia-300 font-mono">
                      Ángulo: {config.katanaArc.angle}°
                    </span>
                  )}
                </div>

                {config.katanaArc.enabled && (
                  <div className="space-y-3 pt-2 border-t border-zinc-900 text-xs">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-zinc-400 block">
                        Color y Elemento de la Espada:
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                        {[
                          { id: "thunder_cyan", name: "⚡ Rayo Cyan", color: "#06b6d4" },
                          { id: "getsuga_dark", name: "🌑 Getsuga Violeta", color: "#a855f7" },
                          { id: "nichirin_fire", name: "🔥 Nichirin Fuego", color: "#f97316" },
                          { id: "blood_crimson", name: "🩸 Corte Carmesí", color: "#e11d48" },
                          { id: "divine_white", name: "✨ Luz Divina", color: "#ffffff" },
                        ].map((c) => (
                          <button
                            key={c.id}
                            onClick={() =>
                              setConfig((prev) => ({
                                ...prev,
                                katanaArc: { ...prev.katanaArc, color: c.id as KatanaArcColor },
                              }))
                            }
                            className={`p-2 rounded-lg border text-center transition-all ${
                              config.katanaArc.color === c.id
                                ? "border-fuchsia-500 bg-fuchsia-950 text-white font-bold"
                                : "border-zinc-800 bg-zinc-900 text-zinc-300"
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full inline-block mr-1" style={{ backgroundColor: c.color }} />
                            <span>{c.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-zinc-400 text-[11px]">
                          <span>Ángulo de Corte</span>
                          <span className="font-mono text-fuchsia-400">{config.katanaArc.angle}°</span>
                        </div>
                        <input
                          type="range"
                          min="-180"
                          max="180"
                          value={config.katanaArc.angle}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              katanaArc: { ...prev.katanaArc, angle: parseInt(e.target.value) },
                            }))
                          }
                          className="w-full accent-fuchsia-500 h-1 bg-zinc-800 rounded"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-zinc-400 text-[11px]">
                          <span>Radio del Arco</span>
                          <span className="font-mono text-fuchsia-400">{config.katanaArc.radius}px</span>
                        </div>
                        <input
                          type="range"
                          min="120"
                          max="400"
                          value={config.katanaArc.radius}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              katanaArc: { ...prev.katanaArc, radius: parseInt(e.target.value) },
                            }))
                          }
                          className="w-full accent-fuchsia-500 h-1 bg-zinc-800 rounded"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-zinc-400 text-[11px]">
                          <span>Grosor de la Hoja</span>
                          <span className="font-mono text-fuchsia-400">{config.katanaArc.thickness}px</span>
                        </div>
                        <input
                          type="range"
                          min="6"
                          max="30"
                          value={config.katanaArc.thickness}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              katanaArc: { ...prev.katanaArc, thickness: parseInt(e.target.value) },
                            }))
                          }
                          className="w-full accent-fuchsia-500 h-1 bg-zinc-800 rounded"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Eye Glow & Speedlines */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Eye Glow */}
                <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950 space-y-2 text-xs">
                  <label className="flex items-center justify-between cursor-pointer font-semibold text-zinc-200">
                    <span>👁️ Destello Ocular (Eye Glow)</span>
                    <input
                      type="checkbox"
                      checked={config.eyeGlow}
                      onChange={(e) => setConfig((prev) => ({ ...prev, eyeGlow: e.target.checked }))}
                      className="accent-fuchsia-500 w-4 h-4 rounded cursor-pointer"
                    />
                  </label>
                  {config.eyeGlow && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-zinc-400">Color:</span>
                        <input
                          type="color"
                          value={config.eyeGlowColor}
                          onChange={(e) => setConfig((prev) => ({ ...prev, eyeGlowColor: e.target.value }))}
                          className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Speedlines */}
                <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950 space-y-2 text-xs">
                  <label className="font-semibold text-zinc-200 block">
                    ⚡ Líneas de Acción (Speedlines)
                  </label>
                  <select
                    value={config.speedLines}
                    onChange={(e) => setConfig((prev) => ({ ...prev, speedLines: e.target.value as SpeedLinesType }))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs"
                  >
                    <option value="none">Ninguna</option>
                    <option value="radial_burst">💥 Ráfaga Radial (Burst)</option>
                    <option value="horizontal_rush">⏩ Velocidad Horizontal</option>
                    <option value="vertical_fall">⏬ Caída Vertical</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Music & Beat/Drop Detection */}
          {activeTab === "audio" && (
            <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-5">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                  Recorte de Música & Detector Inteligente de Clímax
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Sube tu canción y salta automáticamente a los mejores momentos, subidas y drops con efectos Slowed+Reverb.
                </p>
              </div>

              {/* Upload Song Button */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">
                      {audioFileName ? `🎵 ${audioFileName}` : "Sube tu canción para el Short"}
                    </p>
                    <p className="text-[11px] text-zinc-400">MP3, WAV, FLAC, M4A, OGG</p>
                  </div>

                  <label className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-2 shadow">
                    <span>📂 Subir Canción</span>
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) void handleAudioFile(e.target.files[0]);
                      }}
                    />
                  </label>
                </div>

                {/* Smart Highlights Jump Buttons */}
                {audioAnalysis && (
                  <div className="space-y-2 pt-2 border-t border-zinc-900">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block">
                      🎯 Momentos Clave Detectados con IA
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <button
                        onClick={() => void setAudioStartOffset(audioAnalysis.dropTime)}
                        className="p-2.5 rounded-xl border border-fuchsia-800/60 bg-fuchsia-950/50 hover:bg-fuchsia-900/60 text-left transition-all text-fuchsia-200 font-semibold"
                      >
                        <div>🔥 Clímax / Drop ({audioAnalysis.dropTime.toFixed(1)}s)</div>
                        <div className="text-[10px] text-fuchsia-300/80 font-normal mt-0.5">Momento de mayor impacto</div>
                      </button>

                      <button
                        onClick={() => void setAudioStartOffset(audioAnalysis.buildupTime)}
                        className="p-2.5 rounded-xl border border-amber-800/60 bg-amber-950/50 hover:bg-amber-900/60 text-left transition-all text-amber-200 font-semibold"
                      >
                        <div>⚡ Subida Épica ({audioAnalysis.buildupTime.toFixed(1)}s)</div>
                        <div className="text-[10px] text-amber-300/80 font-normal mt-0.5">Incremento de energía</div>
                      </button>

                      <button
                        onClick={() => void setAudioStartOffset(audioAnalysis.melodicTime)}
                        className="p-2.5 rounded-xl border border-sky-800/60 bg-sky-950/50 hover:bg-sky-900/60 text-left transition-all text-sky-200 font-semibold"
                      >
                        <div>🎶 Intro / Melodía ({audioAnalysis.melodicTime.toFixed(1)}s)</div>
                        <div className="text-[10px] text-sky-300/80 font-normal mt-0.5">Inicio atmosférico</div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Full Interactive Waveform Trimmer */}
              {audioBuffer && (
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-zinc-400">
                    <span>Zona de Recorte (Haz clic en la onda para mover la ventana):</span>
                    <span className="font-mono text-fuchsia-400 font-semibold">
                      {audioConfig.audioStartTime.toFixed(1)}s → {(audioConfig.audioStartTime + config.duration).toFixed(1)}s ({config.duration}s)
                    </span>
                  </div>

                  <canvas
                    ref={trimmerCanvasRef}
                    width={600}
                    height={60}
                    onClick={(e) => {
                      const canvas = trimmerCanvasRef.current;
                      if (!canvas || !audioBuffer) return;
                      const rect = canvas.getBoundingClientRect();
                      const ratio = (e.clientX - rect.left) / rect.width;
                      const newStart = Math.max(0, Math.min(audioBuffer.duration - 1, ratio * audioBuffer.duration));
                      void setAudioStartOffset(newStart);
                    }}
                    className="w-full h-14 rounded-xl bg-zinc-950 border border-zinc-800 cursor-pointer shadow-inner"
                  />

                  {/* Energy Color Guide */}
                  <div className="flex items-center justify-center gap-4 text-[10px] text-zinc-400 pt-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50 inline-block" />
                      <strong className="text-amber-300">🔥 Drop / Clímax Fuerte</strong>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-500 inline-block" />
                      <strong className="text-fuchsia-300">⚡ Subida de Energía</strong>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                      <strong className="text-sky-300">🎶 Melódico / Intro</strong>
                    </span>
                  </div>
                </div>
              )}

              {/* Audio Presets & Slowed Reverb */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Estilos de Audio & Reverberación
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {MANGA_AUDIO_VIBES.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => void handleSelectVibe(v.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        audioConfig.vibe === v.id
                          ? "border-fuchsia-600 bg-fuchsia-950/60 text-white font-semibold"
                          : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-300"
                      }`}
                    >
                      <div className="font-bold truncate">{v.name}</div>
                      <div className="text-[10px] text-zinc-400 truncate mt-0.5">{v.badge}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Master Volume Slider */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-zinc-200">🔊 Volumen Maestro de la Música</span>
                  <span className="font-mono font-bold text-fuchsia-400">
                    {Math.round((audioConfig.musicVolume ?? 0.85) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="150"
                  value={Math.round((audioConfig.musicVolume ?? 0.85) * 100)}
                  onChange={(e) => {
                    const newVol = parseInt(e.target.value) / 100;
                    const nextCfg = { ...audioConfig, musicVolume: newVol };
                    setAudioConfig(nextCfg);
                    const player = getAudioPlayer();
                    player.updateLiveSettings(nextCfg);
                  }}
                  className="w-full accent-fuchsia-500 h-2 bg-zinc-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                  <span>0% (Silencio)</span>
                  <span>50% (Suave de fondo)</span>
                  <span>85% (Recomendado)</span>
                  <span>150% (Potente)</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Filters, Camera & Duration (Up to 60s) */}
          {activeTab === "camera_style" && (
            <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-5">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                  Filtros Anime, Cámara & Duración (Hasta 1 Minuto)
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Ajusta la duración del video de 3 a 60 segundos con fusión de loop infinito y filtros de color.
                </p>
              </div>

              {/* Duration Slider (3 to 60s) */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-zinc-200">Duración del Short</span>
                  <span className="font-mono font-bold text-fuchsia-400">{config.duration} Segundos</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="60"
                  value={config.duration}
                  onMouseDown={pausePlayback}
                  onTouchStart={pausePlayback}
                  onChange={(e) => {
                    pausePlayback();
                    const val = parseInt(e.target.value);
                    setConfig((prev) => ({ ...prev, duration: val }));
                    if (currentTimeRef.current >= val) {
                      currentTimeRef.current = 0;
                      setCurrentTime(0);
                    }
                  }}
                  className="w-full accent-fuchsia-500 h-2 bg-zinc-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                  <span>3s (Loop Rápido)</span>
                  <span>15s (Shorts/TikTok)</span>
                  <span>30s (Reels)</span>
                  <span>60s (1 Minuto Máx)</span>
                </div>

                {/* Transición de Bucle (Suavizado de Costura & Boomerang) */}
                <div className="pt-3 border-t border-zinc-900 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-zinc-200 block">
                      🌊 Transición de Bucle (Loop Seamless & Boomerang)
                    </label>
                    <span className="text-fuchsia-400 font-mono text-[11px]">
                      {config.seamMode === "smooth"
                        ? `Fundido Suave (${config.loopCrossfadeDuration.toFixed(1)}s)`
                        : config.seamMode === "pingpong"
                        ? "Ida y Vuelta (Boomerang)"
                        : "Corte Directo"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      {
                        id: "smooth",
                        label: "🌊 Fundido Suave",
                        desc: "Transición continua imperceptible.",
                      },
                      {
                        id: "pingpong",
                        label: "🔄 Ida y Vuelta (Boomerang)",
                        desc: "Movimiento continuo adelante y atrás.",
                      },
                      {
                        id: "cut",
                        label: "✂️ Corte Directo",
                        desc: "Para loops fotograma a fotograma.",
                      },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            seamMode: m.id as "smooth" | "pingpong" | "cut",
                            enableSeamlessLoop: m.id !== "cut",
                          }))
                        }
                        className={`p-2 rounded-xl border text-left transition-all ${
                          config.seamMode === m.id
                            ? "border-fuchsia-500 bg-fuchsia-950/60 text-white font-semibold ring-1 ring-fuchsia-400/40"
                            : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-300"
                        }`}
                      >
                        <div className="text-xs font-bold truncate">{m.label}</div>
                        <div className="text-[10px] text-zinc-400 truncate mt-0.5">{m.desc}</div>
                      </button>
                    ))}
                  </div>
                  {config.seamMode === "smooth" && (
                    <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1 text-xs">
                      <div className="flex justify-between text-[11px] text-zinc-400">
                        <span>Duración del Fundido de Enlace</span>
                        <span className="font-mono text-fuchsia-400">{config.loopCrossfadeDuration.toFixed(1)}s</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="3.0"
                        step="0.1"
                        value={config.loopCrossfadeDuration}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            loopCrossfadeDuration: parseFloat(e.target.value),
                          }))
                        }
                        className="w-full accent-fuchsia-500 h-1 bg-zinc-800 rounded"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Aesthetic Filter Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Filtros Visuales Anime & Manga
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {[
                    { id: "original", name: "🖼️ Original Limpio", desc: "Sin filtros" },
                    { id: "seinen_bw", name: "🖋️ Seinen B&W", desc: "Tinta de alto contraste" },
                    { id: "retro_90s", name: "📼 Retro 90s", desc: "Evangelion / Cowboy Bebop" },
                    { id: "dark_fantasy", name: "🌑 Dark Fantasy", desc: "Berserk / Frío sombrío" },
                    { id: "cyberpunk_neon", name: "🌆 Cyberpunk Glow", desc: "Neón cyan y magenta" },
                    { id: "screentone", name: "📰 Screentone", desc: "Trama halftone Shonen" },
                    { id: "vintage_sepia", name: "📜 Pergamino Sepia", desc: "Samurái tradicional" },
                    { id: "lofi_sunset", name: "🌅 Lo-Fi Sunset", desc: "Colores cálidos pastel" },
                  ].map((style) => (
                    <button
                      key={style.id}
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          aestheticStyle: style.id as AestheticStyle,
                        }))
                      }
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        config.aestheticStyle === style.id
                          ? "border-fuchsia-600 bg-fuchsia-950/60 text-white font-semibold"
                          : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-300"
                      }`}
                    >
                      <div className="font-bold truncate">{style.name}</div>
                      <div className="text-[10px] text-zinc-400 truncate mt-0.5">{style.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Advanced Professional Manga Motion Camera Modes */}
              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300 block">
                  🎥 Modos de Cámara Manga Motion Avanzados
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {[
                    { id: "static", name: "🛑 Estática Fija", desc: "100% nítida, sin movimiento" },
                    { id: "slow_push", name: "🔍 Zoom Lento (Dolly)", desc: "Acercamiento dramático suave" },
                    { id: "dutch_drift", name: "📐 Plano Holandés", desc: "Inclinación cinemática flotante" },
                    { id: "whip_pan", name: "⚡ Latigazo Anime", desc: "Whip Pan con inercia" },
                    { id: "vertigo_zoom", name: "🌀 Efecto Vértigo", desc: "Dolly Zoom / Despertar" },
                    { id: "spiral_vortex", name: "🌪️ Vórtice Espiral", desc: "Espiral de combate Shonen" },
                    { id: "cinematic_scan", name: "📜 Escaneo Diagonal", desc: "Lectura de viñeta completa" },
                    { id: "impact_shake", name: "🫨 Sacudida & Hitstop", desc: "Golpe e impacto de combate" },
                  ].map((cam) => (
                    <button
                      key={cam.id}
                      onClick={() => handleSelectCameraMode(cam.id as CameraMovement)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        config.cameraMove === cam.id
                          ? "border-fuchsia-600 bg-fuchsia-950/60 text-white font-semibold shadow"
                          : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-300"
                      }`}
                    >
                      <div className="font-bold truncate text-xs">{cam.name}</div>
                      <div className="text-[10px] text-zinc-400 truncate mt-0.5">{cam.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Fine Camera Controls Sliders */}
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  {/* Camera Speed */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-zinc-400 text-[11px]">
                      <span>Velocidad Cámara</span>
                      <span className="font-mono text-fuchsia-400">{(config.cameraSpeed || 1.0).toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="30"
                      value={Math.round((config.cameraSpeed || 1.0) * 10)}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, cameraSpeed: parseInt(e.target.value) / 10 }))
                      }
                      className="w-full accent-fuchsia-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Camera Intensity */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-zinc-400 text-[11px]">
                      <span>Intensidad / Amplitud</span>
                      <span className="font-mono text-fuchsia-400">{config.cameraIntensity || 30}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      value={config.cameraIntensity || 30}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, cameraIntensity: parseInt(e.target.value) }))
                      }
                      className="w-full accent-fuchsia-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Dutch Tilt Angle */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-zinc-400 text-[11px]">
                      <span>Inclinación (Dutch Angle)</span>
                      <span className="font-mono text-fuchsia-400">{config.cameraAngle || 0}°</span>
                    </div>
                    <input
                      type="range"
                      min="-45"
                      max="45"
                      value={config.cameraAngle || 0}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, cameraAngle: parseInt(e.target.value) }))
                      }
                      className="w-full accent-fuchsia-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Base Framing Zoom */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-zinc-400 text-[11px]">
                      <span>Zoom de Encuadre</span>
                      <span className="font-mono text-fuchsia-400">{(config.cameraBaseZoom || 1.0).toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="25"
                      value={Math.round((config.cameraBaseZoom || 1.0) * 10)}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, cameraBaseZoom: parseInt(e.target.value) / 10 }))
                      }
                      className="w-full accent-fuchsia-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Export Video & In-Page Video Player */}
          {activeTab === "export" && (
            <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-5">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                  Exportación Maestra HD a 60 FPS (Todo en esta pestaña)
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Genera y previsualiza el video final MP4 directamente aquí con duración exacta de {config.duration}s.
                </p>
              </div>

              {/* Export Status Progress */}
              {isExporting && (
                <div className="p-4 rounded-xl bg-fuchsia-950/40 border border-fuchsia-800/80 space-y-2">
                  <div className="flex justify-between text-xs text-fuchsia-200 font-semibold">
                    <span>{exportStatus}</span>
                    <span>{exportProgress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-fuchsia-500 to-pink-500 transition-all duration-150"
                      style={{ width: `${exportProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Render Action Button */}
              <button
                onClick={() => void handleExportHD()}
                disabled={!mediaEl || isExporting}
                className="w-full p-4 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 hover:from-fuchsia-500 hover:to-rose-500 disabled:opacity-40 text-white font-bold text-sm transition-all flex flex-col items-center justify-center gap-1 shadow-lg shadow-fuchsia-950/60"
              >
                <span>🎬 Renderizar Video HD ({config.duration}s a 60 FPS)</span>
                <span className="text-[11px] font-normal opacity-90">
                  Formato {config.aspectRatio} · Audio Sincronizado · Loop Infinito
                </span>
              </button>

              {/* In-Page Rendered Video Player */}
              {exportedVideoUrl && (
                <div className="p-4 rounded-2xl bg-zinc-950 border border-fuchsia-900/60 space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 text-lg">✓</span>
                      <span className="font-bold text-zinc-100 text-sm">Video HD Renderizado Listo</span>
                    </div>
                    <span className="text-xs font-mono text-fuchsia-300 px-2 py-0.5 rounded bg-fuchsia-950 border border-fuchsia-800/60">
                      {config.duration}.0s · HD
                    </span>
                  </div>

                  <div className="rounded-xl overflow-hidden bg-black border border-zinc-800 max-h-[380px] flex items-center justify-center">
                    <video
                      src={exportedVideoUrl}
                      controls
                      autoPlay
                      loop
                      playsInline
                      className="max-h-[360px] w-auto rounded-lg"
                    />
                  </div>

                  <button
                    onClick={handleDownloadFile}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/60"
                  >
                    <span>⬇️ Descargar Archivo MP4 Completo</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
