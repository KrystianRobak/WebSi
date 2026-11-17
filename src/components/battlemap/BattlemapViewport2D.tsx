import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Bookmark,
  Compass,
  DoorClosed,
  DoorOpen,
  Eraser,
  EyeOff,
  Flame,
  Grid,
  Hammer,
  Lightbulb,
  Lock,
  Minus,
  MousePointer,
  Package,
  Play,
  Plus,
  Ruler,
  ScrollText,
  Settings2,
  Shield,
  Skull,
  Sparkles,
  Sun,
  Target,
  UserPlus,
  Wand2,
} from 'lucide-react';
import { computeVisibilityPolygon, Segment2D } from '../../lib/battlemapLighting';
import {
  FOG_MASK_SIZE,
  createFogMask,
  loadMaskFromUrl,
  maskToCanvasBlob,
  paintFogCircle,
  unionFogMasks,
} from '../../lib/fogOfWarMask';
import { uploadAssetDataUrlOrBlob } from '../../lib/supabase';
import { useVaultStore } from '../../store/useVaultStore';
import {
  AoeTemplateShape,
  BattlemapAoeTemplate,
  BattlemapDoor,
  BattlemapLight,
  BattlemapProp,
  BattlemapPropKind,
  BattlemapToken,
  TokenDisposition,
} from '../../types/vault';
import { GuildQuestBoardModal } from '../quests/GuildQuestBoardModal';
import { InitiativeTrackerBar } from './InitiativeTrackerBar';

const LIGHT_PRESETS = [
  { label: 'Wall Torch', radiusFt: 30, color: '#f59e0b', intensity: 0.92, flicker: true },
  { label: 'Arcane Brazier', radiusFt: 35, color: '#38bdf8', intensity: 0.95, flicker: true },
  { label: 'Moonlight Orb', radiusFt: 45, color: '#a5b4fc', intensity: 0.78, flicker: false },
  { label: 'Crimson Candle', radiusFt: 20, color: '#ef4444', intensity: 0.85, flicker: true },
  { label: 'Daylight Beacon', radiusFt: 55, color: '#fde047', intensity: 1.0, flicker: false },
];

const PROP_PRESETS: Array<{
  kind: BattlemapPropKind;
  label: string;
  w: number;
  h: number;
  color: string;
  isSecret: boolean;
  blocksLight: boolean;
}> = [
  { kind: 'table', label: 'Banquet Table', w: 96, h: 48, color: '#7c5333', isSecret: false, blocksLight: false },
  { kind: 'chest', label: 'Treasure Chest', w: 46, h: 34, color: '#d4a853', isSecret: false, blocksLight: false },
  { kind: 'altar', label: 'Ritual Altar', w: 56, h: 84, color: '#b91c1c', isSecret: false, blocksLight: false },
  { kind: 'crate', label: 'Supply Crates', w: 54, h: 44, color: '#8b5e34', isSecret: false, blocksLight: true },
  { kind: 'pillar', label: 'Stone Column', w: 44, h: 44, color: '#64748b', isSecret: false, blocksLight: true },
  { kind: 'statue', label: 'Ancient Statue', w: 52, h: 52, color: '#94a3b8', isSecret: false, blocksLight: true },
  { kind: 'campfire', label: 'Campfire', w: 46, h: 46, color: '#f97316', isSecret: false, blocksLight: false },
  { kind: 'trap', label: 'Hidden Trap', w: 52, h: 52, color: '#ef4444', isSecret: true, blocksLight: false },
  { kind: 'hazard', label: 'Hazard / Acid', w: 88, h: 88, color: '#22c55e', isSecret: false, blocksLight: false },
  { kind: 'marker', label: 'GM Note Pin', w: 34, h: 34, color: '#eab308', isSecret: true, blocksLight: false },
];

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

const ENEMY_PRESETS = [
  { name: 'Shadow Enforcer', hp: 28, maxHp: 28, ac: 15, sizeCells: 1, color: '#dc2626' },
  { name: 'Guild Arcanist', hp: 22, maxHp: 22, ac: 13, sizeCells: 1, color: '#9333ea' },
  { name: 'Goblin Skirmisher', hp: 12, maxHp: 12, ac: 14, sizeCells: 1, color: '#ea580c' },
  { name: 'Obsidian Golem', hp: 68, maxHp: 68, ac: 17, sizeCells: 2, color: '#b91c1c' },
];

const PARTY_PRESETS = [
  { name: 'Kaelen Voss', hp: 46, maxHp: 46, ac: 16, lightRadiusFt: 20, color: '#d4a853' },
  { name: 'Lady Vaelora', hp: 34, maxHp: 34, ac: 14, lightRadiusFt: 0, color: '#10b981' },
  { name: 'Vanguard Ally', hp: 32, maxHp: 32, ac: 16, lightRadiusFt: 15, color: '#38bdf8' },
];

export const BattlemapViewport2D: React.FC<{ mapId: string }> = ({ mapId }) => {
  const {
    user,
    maps,
    campaignMembers,
    isEffectiveGm,
    canEditToken,
    rightInspectorCollapsed,
    inspectorWidth,
    mapFogStates,
    mapFogShares,
    updateMapFogState,
    setBattlemapFogUrl,
    fogBrushTargetUserId,
    setFogBrushTargetUserId,
    fogBrushRevealMode,
    setFogBrushRevealMode,
    questBoards,
    guildQuests,
    createQuestBoard,
    setActiveQuestBoardModalId,
    battlemapMode,
    setBattlemapMode,
    battlemapTool,
    setBattlemapTool,
    selectedTokenId,
    setSelectedTokenId,
    selectedDoorId,
    setSelectedDoorId,
    selectedLightId,
    setSelectedLightId,
    selectedPropId2D,
    setSelectedPropId2D,
    snapToGrid,
    setSnapToGrid,
    updateBattlemap,
    moveBattlemapToken,
    toggleBattlemapDoor,
    toggleBattlemapLight,
    addBattlemapToken,
    deleteBattlemapToken,
    addBattlemapWall,
    deleteBattlemapWall,
    addBattlemapDoor,
    deleteBattlemapDoor,
    addBattlemapLight,
    deleteBattlemapLight,
    addBattlemapProp,
    updateBattlemapProp,
    deleteBattlemapProp,
    addAoeTemplate,
    deleteAoeTemplate,
    setMapGeneratorModalOpen,
  } = useVaultStore();

  const effectiveGm = isEffectiveGm();
  const rightInsetPx = rightInspectorCollapsed ? 12 : inspectorWidth + 12;

  const mapData = maps.find((m) => m.id === mapId);
  const bm = useMemo(() => {
    if (!mapData) return undefined;
    const raw = (mapData.battlemap || {}) as Partial<NonNullable<typeof mapData.battlemap>> & {
      widthCells?: number;
      heightCells?: number;
    };
    const gridSizePx = raw.gridSizePx || 48;
    const width = raw.width || (raw.widthCells ? raw.widthCells * gridSizePx : 960);
    const height = raw.height || (raw.heightCells ? raw.heightCells * gridSizePx : 720);
    return {
      theme: raw.theme || 'stone-dungeon',
      backgroundUrl: raw.backgroundUrl ?? null,
      width,
      height,
      gridSizePx,
      showGrid: raw.showGrid ?? true,
      gridOpacity: raw.gridOpacity ?? 0.28,
      ambientLight: raw.ambientLight ?? 0.85,
      dynamicLighting: raw.dynamicLighting ?? false,
      fogOfWarEnabled: raw.fogOfWarEnabled ?? false,
      revealedMaskUrl: raw.revealedMaskUrl ?? null,
      tokens: raw.tokens || [],
      walls: raw.walls || [],
      doors: raw.doors || [],
      lights: raw.lights || [],
      props: raw.props || [],
      aoeTemplates: raw.aoeTemplates || [],
      sceneNotes: raw.sceneNotes,
    };
  }, [mapData]);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement>(null);
  const lightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const fogMaskRef = useRef<Uint8Array>(createFogMask(255));
  const [fogMaskSeq, setFogMaskSeq] = useState(0);
  const [bgLoadedSeq, setBgLoadedSeq] = useState(0);

  // Camera Pan & Zoom
  const [zoom, setZoom] = useState(0.82);
  const [pan, setPan] = useState({ x: 40, y: 30 });

  // Fog Brush & AoE Draft Settings
  const [fogBrushRadiusCells, setFogBrushRadiusCells] = useState(2);
  const [aoeShape, setAoeShape] = useState<AoeTemplateShape>('circle');
  const [aoeRadiusFt, setAoeRadiusFt] = useState(20);
  const [aoeColor, setAoeColor] = useState('#ef4444');
  const [dragTokenPreview, setDragTokenPreview] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  // Enemy/Party & Scene Prep Preset Selection
  const [enemyPresetIdx, setEnemyPresetIdx] = useState(0);
  const [partyPresetIdx, setPartyPresetIdx] = useState(0);
  const [spawnHidden, setSpawnHidden] = useState(false);

  const [lightPresetIdx, setLightPresetIdx] = useState(0);
  const [lightRadiusInput, setLightRadiusInput] = useState(30);
  const [lightColorInput, setLightColorInput] = useState('#f59e0b');
  const [lightFlickerInput, setLightFlickerInput] = useState(true);

  const [propPresetIdx, setPropPresetIdx] = useState(0);
  const [propSecretInput, setPropSecretInput] = useState(false);
  const [wallKindInput, setWallKindInput] = useState<'wall' | 'pillar' | 'secret-wall'>('wall');
  const [doorStyleInput, setDoorStyleInput] = useState<'standard' | 'locked' | 'secret'>('standard');

  // Interactive Drag State
  const [dragState, setDragState] = useState<
    | null
    | { kind: 'pan'; startX: number; startY: number; origPanX: number; origPanY: number }
    | { kind: 'token'; tokenId: string; startX: number; startY: number; origX: number; origY: number }
    | { kind: 'prop'; propId: string; startX: number; startY: number; origX: number; origY: number }
    | { kind: 'light'; lightId: string; startX: number; startY: number; origX: number; origY: number }
    | { kind: 'fog'; reveal: boolean }
    | { kind: 'line'; tool: 'draw-wall' | 'draw-door' | 'measure'; x1: number; y1: number; x2: number; y2: number }
  >(null);

  // Auto-exit GM prep/tools when role switches to Player
  useEffect(() => {
    if (!effectiveGm) {
      if (battlemapMode === 'prep') setBattlemapMode('play');
      if (battlemapTool !== 'select' && battlemapTool !== 'measure') {
        setBattlemapTool('select');
      }
    }
  }, [effectiveGm, battlemapMode, battlemapTool, setBattlemapMode, setBattlemapTool]);

  // Keyboard shortcuts: Delete selected element (GM Prepare Scene) / Escape cancel
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'Escape') {
        setDragState(null);
        setDragTokenPreview(null);
        setSelectedTokenId(null);
        setSelectedDoorId(null);
        setSelectedLightId(null);
        setSelectedPropId2D(null);
        if (battlemapTool !== 'select') setBattlemapTool('select');
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && effectiveGm && battlemapMode === 'prep') {
        if (selectedPropId2D) {
          e.preventDefault();
          deleteBattlemapProp(mapId, selectedPropId2D);
        } else if (selectedLightId) {
          e.preventDefault();
          deleteBattlemapLight(mapId, selectedLightId);
        } else if (selectedDoorId) {
          e.preventDefault();
          deleteBattlemapDoor(mapId, selectedDoorId);
        } else if (selectedTokenId) {
          e.preventDefault();
          deleteBattlemapToken(mapId, selectedTokenId);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    effectiveGm,
    battlemapMode,
    battlemapTool,
    mapId,
    selectedPropId2D,
    selectedLightId,
    selectedDoorId,
    selectedTokenId,
    deleteBattlemapProp,
    deleteBattlemapLight,
    deleteBattlemapDoor,
    deleteBattlemapToken,
    setSelectedTokenId,
    setSelectedDoorId,
    setSelectedLightId,
    setSelectedPropId2D,
    setBattlemapTool,
  ]);

  // Load background floor image
  useEffect(() => {
    if (!bm?.backgroundUrl) {
      bgImageRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      bgImageRef.current = img;
      setBgLoadedSeq((s) => s + 1);
    };
    img.src = bm.backgroundUrl;
  }, [bm?.backgroundUrl]);

  // Fit map cleanly on initial mount
  useEffect(() => {
    if (!containerRef.current || !bm) return;
    const rect = containerRef.current.getBoundingClientRect();
    const fitScale = Math.min((rect.width - 60) / bm.width, (rect.height - 60) / bm.height, 1.05);
    const z = Math.max(0.35, Number(fitScale.toFixed(2)));
    setZoom(z);
    setPan({
      x: Math.round((rect.width - bm.width * z) / 2),
      y: Math.round((rect.height - bm.height * z) / 2),
    });
  }, [mapId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync persisted 2D Fog of War mask (per-player + shared showings + fallback revealedMaskUrl)
  useEffect(() => {
    let cancelled = false;
    const syncFog2D = async () => {
      if (!bm) return;
      const fallbackUrl = mapData?.fog_of_war_2d || bm.revealedMaskUrl || null;
      if (effectiveGm) {
        const targetId =
          fogBrushTargetUserId === '__all__'
            ? mapFogStates.find((f) => f.map_id === mapId)?.user_id
            : fogBrushTargetUserId;
        const row = targetId
          ? mapFogStates.find((f) => f.map_id === mapId && f.user_id === targetId)
          : undefined;
        const maskUrl = row?.mask_url || fallbackUrl;
        if (maskUrl) {
          const loaded = await loadMaskFromUrl(maskUrl);
          if (!cancelled) {
            fogMaskRef.current = loaded ?? createFogMask(bm.fogOfWarEnabled ? 0 : 255);
            setFogMaskSeq((s) => s + 1);
          }
        } else if (!cancelled) {
          fogMaskRef.current = createFogMask(bm.fogOfWarEnabled ? 0 : 255);
          setFogMaskSeq((s) => s + 1);
        }
        return;
      }

      if (!user) return;
      const ownRow = mapFogStates.find((f) => f.map_id === mapId && f.user_id === user.id);
      const sharedOwners = new Set<string>();
      for (const sh of mapFogShares) {
        if (sh.map_id !== mapId) continue;
        if (sh.share_all || sh.shared_with_user_id === user.id) {
          sharedOwners.add(sh.owner_user_id);
        }
      }
      const urls = new Set<string>();
      if (ownRow?.mask_url) urls.add(ownRow.mask_url);
      for (const ownerId of sharedOwners) {
        const peerRow = mapFogStates.find((f) => f.map_id === mapId && f.user_id === ownerId);
        if (peerRow?.mask_url) urls.add(peerRow.mask_url);
      }
      if (urls.size === 0 && fallbackUrl) {
        urls.add(fallbackUrl);
      }
      if (urls.size === 0) {
        if (!cancelled) {
          fogMaskRef.current = createFogMask(bm.fogOfWarEnabled ? 0 : 255);
          setFogMaskSeq((s) => s + 1);
        }
        return;
      }
      const loaded = (await Promise.all(Array.from(urls).map((u) => loadMaskFromUrl(u)))).filter(
        (m): m is Uint8Array => m !== null,
      );
      if (!cancelled) {
        fogMaskRef.current =
          loaded.length > 0 ? unionFogMasks(loaded) : createFogMask(bm.fogOfWarEnabled ? 0 : 255);
        setFogMaskSeq((s) => s + 1);
      }
    };
    void syncFog2D();
    return () => {
      cancelled = true;
    };
  }, [
    mapId,
    bm?.fogOfWarEnabled,
    bm?.revealedMaskUrl,
    mapData?.fog_of_war_2d,
    mapFogStates,
    mapFogShares,
    effectiveGm,
    fogBrushTargetUserId,
    user,
  ]);

  const paintFogAtStagePoint = useCallback(
    (x: number, y: number, reveal: boolean) => {
      if (!bm) return;
      const normX = Math.max(0, Math.min(1, x / bm.width));
      const normY = Math.max(0, Math.min(1, y / bm.height));
      const radiusNorm = (fogBrushRadiusCells * bm.gridSizePx) / Math.max(bm.width, bm.height);
      paintFogCircle(fogMaskRef.current, normX, normY, radiusNorm, reveal);
      setFogMaskSeq((s) => s + 1);
    },
    [bm, fogBrushRadiusCells]
  );

  const commitFog2DMask = useCallback(
    async (explicitMask?: Uint8Array) => {
      if (!effectiveGm || !bm) return;
      const maskToSave = explicitMask || fogMaskRef.current;
      const blob = await maskToCanvasBlob(maskToSave);
      if (!blob) return;
      const url = await uploadAssetDataUrlOrBlob(
        blob,
        `fog-2d-${mapId}-${Date.now()}.png`,
        'image/png'
      );
      await updateMapFogState(mapId, fogBrushTargetUserId, url);
      setBattlemapFogUrl(mapId, url);
    },
    [effectiveGm, bm, mapId, fogBrushTargetUserId, updateMapFogState, setBattlemapFogUrl]
  );

  // Render 2D Fog of War Canvas Overlay
  useEffect(() => {
    if (!bm || !fogCanvasRef.current) return;
    const fCanvas = fogCanvasRef.current;
    fCanvas.width = bm.width;
    fCanvas.height = bm.height;
    const fCtx = fCanvas.getContext('2d');
    if (!fCtx) return;

    fCtx.clearRect(0, 0, bm.width, bm.height);
    const hasSavedMask = Boolean(
      bm.fogOfWarEnabled ||
        bm.revealedMaskUrl ||
        mapData?.fog_of_war_2d ||
        mapFogStates.some((f) => f.map_id === mapId)
    );
    if (!hasSavedMask) return;

    const mask = fogMaskRef.current;
    const tmp = document.createElement('canvas');
    tmp.width = FOG_MASK_SIZE;
    tmp.height = FOG_MASK_SIZE;
    const tCtx = tmp.getContext('2d');
    if (!tCtx) return;

    const imgData = tCtx.createImageData(FOG_MASK_SIZE, FOG_MASK_SIZE);
    const maxAlpha = effectiveGm ? 148 : 244;
    for (let i = 0; i < FOG_MASK_SIZE * FOG_MASK_SIZE; i++) {
      const idx = i * 4;
      const revealed = mask[i];
      const shroudAlpha = Math.round(((255 - revealed) / 255) * maxAlpha);
      imgData.data[idx] = 5;
      imgData.data[idx + 1] = 7;
      imgData.data[idx + 2] = 12;
      imgData.data[idx + 3] = shroudAlpha;
    }
    tCtx.putImageData(imgData, 0, 0);
    fCtx.imageSmoothingEnabled = true;
    fCtx.drawImage(tmp, 0, 0, bm.width, bm.height);
  }, [bm, mapData?.fog_of_war_2d, mapFogStates, mapId, effectiveGm, fogMaskSeq]);

  const screenToMap = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  const snapCoord = useCallback(
    (val: number, gridSize: number, centerOffset = true) => {
      if (!snapToGrid) return Math.round(val);
      if (centerOffset) {
        return Math.floor(val / gridSize) * gridSize + gridSize * 0.5;
      }
      return Math.round(val / (gridSize * 0.5)) * (gridSize * 0.5);
    },
    [snapToGrid]
  );

  // Active light blockers (walls + closed doors + shadow-blocking props)
  const blockerSegments = useMemo<Segment2D[]>(() => {
    if (!bm) return [];
    const segs: Segment2D[] = bm.walls.map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 }));
    for (const d of bm.doors) {
      if (!d.isOpen) {
        segs.push({ x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 });
      }
    }
    for (const p of bm.props || []) {
      if (!p.blocksLight) continue;
      const hw = p.widthPx * 0.44;
      const hh = p.heightPx * 0.44;
      const rad = (p.rotationDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rot = (dx: number, dy: number) => ({
        x: p.x + dx * cos - dy * sin,
        y: p.y + dx * sin + dy * cos,
      });
      const tl = rot(-hw, -hh);
      const tr = rot(hw, -hh);
      const br = rot(hw, hh);
      const bl = rot(-hw, hh);
      segs.push(
        { x1: tl.x, y1: tl.y, x2: tr.x, y2: tr.y },
        { x1: tr.x, y1: tr.y, x2: br.x, y2: br.y },
        { x1: br.x, y1: br.y, x2: bl.x, y2: bl.y },
        { x1: bl.x, y1: bl.y, x2: tl.x, y2: tl.y }
      );
    }
    return segs;
  }, [bm]);

  // Subtle flicker phase for dynamic lights
  const [flickerTick, setFlickerTick] = useState(0);
  useEffect(() => {
    if (!bm?.dynamicLighting) return;
    const id = setInterval(() => setFlickerTick((t) => (t + 1) % 1000), 140);
    return () => clearInterval(id);
  }, [bm?.dynamicLighting]);

  // Render Canvas layers (Floor + Grid + Walls + Raycast Dynamic Lighting)
  useEffect(() => {
    if (!bm || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = bm.width;
    canvas.height = bm.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Floor Background
    ctx.fillStyle = '#0d1016';
    ctx.fillRect(0, 0, bm.width, bm.height);
    if (bgImageRef.current) {
      ctx.drawImage(bgImageRef.current, 0, 0, bm.width, bm.height);
    }

    // 2. Tactical 5ft Square Grid
    if (bm.showGrid) {
      ctx.strokeStyle = `rgba(212, 168, 83, ${bm.gridOpacity})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= bm.width; x += bm.gridSizePx) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, bm.height);
      }
      for (let y = 0; y <= bm.height; y += bm.gridSizePx) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(bm.width, y + 0.5);
      }
      ctx.stroke();
    }

    // 3. Dynamic Raycast Lighting & Shadows
    if (bm.dynamicLighting) {
      if (!lightCanvasRef.current) {
        lightCanvasRef.current = document.createElement('canvas');
      }
      const lCanvas = lightCanvasRef.current;
      lCanvas.width = bm.width;
      lCanvas.height = bm.height;
      const lCtx = lCanvas.getContext('2d')!;

      const effectiveAmbient = effectiveGm
        ? Math.min(1, bm.ambientLight + 0.08 * (1 - bm.ambientLight))
        : bm.ambientLight;
      lCtx.globalCompositeOperation = 'source-over';
      lCtx.fillStyle = `rgba(5, 7, 12, ${Math.max(0, 1 - effectiveAmbient)})`;
      lCtx.fillRect(0, 0, bm.width, bm.height);

      const emitters: Array<{
        x: number;
        y: number;
        radiusPx: number;
        color: string;
        intensity: number;
      }> = [];

      bm.lights.forEach((l, idx) => {
        if (!l.isOn) return;
        const flick = l.flicker ? 1 + Math.sin(flickerTick * 0.45 + idx * 2.1) * 0.04 : 1;
        emitters.push({
          x: l.x,
          y: l.y,
          radiusPx: (l.radiusFt / 5) * bm.gridSizePx * flick,
          color: l.color,
          intensity: l.intensity,
        });
      });

      bm.tokens.forEach((tok) => {
        if (tok.isHidden && !effectiveGm) return;
        const rFt = Math.max(
          tok.lightRadiusFt,
          tok.disposition === 'party' ? tok.visionRangeFt * 0.45 : 0
        );
        if (rFt <= 0) return;
        emitters.push({
          x: tok.x,
          y: tok.y,
          radiusPx: (rFt / 5) * bm.gridSizePx,
          color: tok.lightRadiusFt > 0 ? tok.lightColor : '#94a3b8',
          intensity: tok.lightRadiusFt > 0 ? 0.72 : 0.32,
        });
      });

      (bm.props || []).forEach((p, idx) => {
        if (p.kind !== 'campfire' || (p.isSecret && !effectiveGm)) return;
        const flick = 1 + Math.sin(flickerTick * 0.55 + idx * 1.7) * 0.05;
        emitters.push({
          x: p.x,
          y: p.y,
          radiusPx: (22 / 5) * bm.gridSizePx * flick,
          color: '#f97316',
          intensity: 0.88,
        });
      });

      for (const em of emitters) {
        const poly = computeVisibilityPolygon(
          em.x,
          em.y,
          em.radiusPx,
          blockerSegments,
          bm.width,
          bm.height
        );
        if (poly.length < 3) continue;

        lCtx.save();
        lCtx.beginPath();
        lCtx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) {
          lCtx.lineTo(poly[i].x, poly[i].y);
        }
        lCtx.closePath();
        lCtx.clip();

        lCtx.globalCompositeOperation = 'destination-out';
        const grad = lCtx.createRadialGradient(em.x, em.y, 4, em.x, em.y, em.radiusPx);
        grad.addColorStop(0, `rgba(0,0,0,${Math.min(1, em.intensity + 0.15)})`);
        grad.addColorStop(0.55, `rgba(0,0,0,${em.intensity * 0.75})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        lCtx.fillStyle = grad;
        lCtx.fillRect(em.x - em.radiusPx, em.y - em.radiusPx, em.radiusPx * 2, em.radiusPx * 2);
        lCtx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) {
          ctx.lineTo(poly[i].x, poly[i].y);
        }
        ctx.closePath();
        ctx.clip();
        ctx.globalCompositeOperation = 'screen';
        const tint = ctx.createRadialGradient(em.x, em.y, 4, em.x, em.y, em.radiusPx);
        tint.addColorStop(0, `${em.color}44`);
        tint.addColorStop(0.5, `${em.color}1e`);
        tint.addColorStop(1, `${em.color}00`);
        ctx.fillStyle = tint;
        ctx.fillRect(em.x - em.radiusPx, em.y - em.radiusPx, em.radiusPx * 2, em.radiusPx * 2);
        ctx.restore();
      }

      ctx.drawImage(lCanvas, 0, 0);
    }

    // 4. Walls & Pillars rendered crisp on top of shadows
    for (const w of bm.walls) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#090b0f';
      ctx.lineWidth = w.kind === 'pillar' ? 12 : 10;
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();

      ctx.strokeStyle = w.kind === 'secret-wall' && effectiveGm ? '#d4a853' : '#64748b';
      ctx.lineWidth = w.kind === 'pillar' ? 7 : 5;
      if (w.kind === 'secret-wall' && effectiveGm) ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
      ctx.restore();
    }

    // 5. Doors rendered visually (open vs closed swing)
    for (const d of bm.doors) {
      if (d.isSecret && !effectiveGm && !d.isOpen) {
        ctx.save();
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(d.x1, d.y1);
        ctx.lineTo(d.x2, d.y2);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      ctx.save();
      ctx.lineCap = 'round';
      if (d.isOpen) {
        const dx = d.x2 - d.x1;
        const dy = d.y2 - d.y1;
        const angle = -Math.PI * 0.42;
        const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
        const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(d.x1, d.y1);
        ctx.lineTo(d.x1 + rx, d.y1 + ry);
        ctx.stroke();
      } else {
        ctx.strokeStyle = d.isLocked ? '#ef4444' : d.isSecret ? '#eab308' : '#d97706';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(d.x1, d.y1);
        ctx.lineTo(d.x2, d.y2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 6. Live drawing / ruler overlay
    if (dragState?.kind === 'line') {
      ctx.save();
      ctx.strokeStyle =
        dragState.tool === 'measure'
          ? '#eab308'
          : dragState.tool === 'draw-door'
          ? '#38bdf8'
          : '#cbd5e1';
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(dragState.x1, dragState.y1);
      ctx.lineTo(dragState.x2, dragState.y2);
      ctx.stroke();
      ctx.restore();
    }
  }, [bm, effectiveGm, blockerSegments, flickerTick, bgLoadedSeq, dragState]);

  if (!mapData || !bm) return null;

  const mapBoards = questBoards.filter((b) => b.map_id === mapId);

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      setDragState({
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
      });
      return;
    }

    const pt = screenToMap(e.clientX, e.clientY);
    const inBounds = pt.x >= 0 && pt.y >= 0 && pt.x <= bm.width && pt.y <= bm.height;
    if (!inBounds) {
      setDragState({
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
      });
      return;
    }

    if (effectiveGm && (battlemapTool === 'fog-reveal' || battlemapTool === 'fog-hide')) {
      const reveal = battlemapTool === 'fog-reveal' ? fogBrushRevealMode : false;
      paintFogAtStagePoint(pt.x, pt.y, reveal);
      setDragState({ kind: 'fog', reveal });
      return;
    }

    if (effectiveGm && battlemapTool === 'aoe') {
      addAoeTemplate(mapId, {
        shape: aoeShape,
        label: `${aoeRadiusFt}ft ${aoeShape}`,
        x: snapCoord(pt.x, bm.gridSizePx, true),
        y: snapCoord(pt.y, bm.gridSizePx, true),
        radiusFt: aoeRadiusFt,
        angleDeg: 0,
        color: aoeColor,
      });
      return;
    }

    if (effectiveGm && battlemapTool === 'place-quest-board') {
      void createQuestBoard({
        map_id: mapId,
        title: `Guild Bounty Board #${mapBoards.length + 1}`,
        x: Math.round(snapCoord(pt.x, bm.gridSizePx, true)),
        y: Math.round(snapCoord(pt.y, bm.gridSizePx, true)),
        z: 0,
      });
      setBattlemapTool('select');
      return;
    }

    if (effectiveGm && battlemapTool === 'place-enemy') {
      const preset = ENEMY_PRESETS[enemyPresetIdx];
      addBattlemapToken(mapId, {
        name: preset.name,
        disposition: 'enemy',
        x: snapCoord(pt.x, bm.gridSizePx, true),
        y: snapCoord(pt.y, bm.gridSizePx, true),
        sizeCells: preset.sizeCells,
        hp: preset.hp,
        maxHp: preset.maxHp,
        ac: preset.ac,
        visionRangeFt: 60,
        lightRadiusFt: 0,
        lightColor: preset.color,
        isHidden: spawnHidden,
        badgeColor: preset.color,
      });
      return;
    }

    if (effectiveGm && battlemapTool === 'place-party') {
      const preset = PARTY_PRESETS[partyPresetIdx];
      addBattlemapToken(mapId, {
        name: preset.name,
        disposition: 'party',
        x: snapCoord(pt.x, bm.gridSizePx, true),
        y: snapCoord(pt.y, bm.gridSizePx, true),
        sizeCells: 1,
        hp: preset.hp,
        maxHp: preset.maxHp,
        ac: preset.ac,
        visionRangeFt: 60,
        lightRadiusFt: preset.lightRadiusFt,
        lightColor: preset.color,
        isHidden: false,
        badgeColor: preset.color,
      });
      return;
    }

    if (effectiveGm && battlemapTool === 'place-light') {
      const lp = LIGHT_PRESETS[lightPresetIdx] || LIGHT_PRESETS[0];
      addBattlemapLight(mapId, {
        label: `${lp.label} #${bm.lights.length + 1}`,
        x: snapCoord(pt.x, bm.gridSizePx, true),
        y: snapCoord(pt.y, bm.gridSizePx, true),
        radiusFt: lightRadiusInput,
        color: lightColorInput,
        intensity: lp.intensity,
        isOn: true,
        flicker: lightFlickerInput,
      });
      return;
    }

    if (effectiveGm && battlemapTool === 'place-prop') {
      const pp = PROP_PRESETS[propPresetIdx] || PROP_PRESETS[0];
      addBattlemapProp(mapId, {
        kind: pp.kind,
        label: pp.label,
        x: snapCoord(pt.x, bm.gridSizePx, true),
        y: snapCoord(pt.y, bm.gridSizePx, true),
        widthPx: pp.w,
        heightPx: pp.h,
        rotationDeg: 0,
        color: pp.color,
        isSecret: propSecretInput || pp.isSecret,
        blocksLight: pp.blocksLight,
      });
      return;
    }

    if (effectiveGm && battlemapTool === 'erase') {
      for (const w of bm.walls) {
        if (distToSegment(pt.x, pt.y, w.x1, w.y1, w.x2, w.y2) <= 14) {
          deleteBattlemapWall(mapId, w.id);
          return;
        }
      }
      for (const d of bm.doors) {
        if (distToSegment(pt.x, pt.y, d.x1, d.y1, d.x2, d.y2) <= 16) {
          deleteBattlemapDoor(mapId, d.id);
          return;
        }
      }
      return;
    }

    if (
      battlemapTool === 'measure' ||
      (effectiveGm && (battlemapTool === 'draw-wall' || battlemapTool === 'draw-door'))
    ) {
      const sx = snapCoord(pt.x, bm.gridSizePx, false);
      const sy = snapCoord(pt.y, bm.gridSizePx, false);
      setDragState({ kind: 'line', tool: battlemapTool, x1: sx, y1: sy, x2: sx, y2: sy });
      return;
    }

    setSelectedTokenId(null);
    setSelectedPropId2D(null);
    setDragState({
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    if (dragState.kind === 'pan') {
      setPan({
        x: dragState.origPanX + (e.clientX - dragState.startX),
        y: dragState.origPanY + (e.clientY - dragState.startY),
      });
    } else if (dragState.kind === 'fog') {
      const pt = screenToMap(e.clientX, e.clientY);
      paintFogAtStagePoint(pt.x, pt.y, dragState.reveal);
    } else if (dragState.kind === 'token') {
      const dx = (e.clientX - dragState.startX) / zoom;
      const dy = (e.clientY - dragState.startY) / zoom;
      const nx = Math.max(20, Math.min(bm.width - 20, dragState.origX + dx));
      const ny = Math.max(20, Math.min(bm.height - 20, dragState.origY + dy));
      setDragTokenPreview({ id: dragState.tokenId, x: nx, y: ny });
    } else if (dragState.kind === 'prop' && effectiveGm) {
      const dx = (e.clientX - dragState.startX) / zoom;
      const dy = (e.clientY - dragState.startY) / zoom;
      const nx = Math.max(16, Math.min(bm.width - 16, dragState.origX + dx));
      const ny = Math.max(16, Math.min(bm.height - 16, dragState.origY + dy));
      updateBattlemapProp(mapId, dragState.propId, { x: nx, y: ny });
    } else if (dragState.kind === 'light' && effectiveGm) {
      const dx = (e.clientX - dragState.startX) / zoom;
      const dy = (e.clientY - dragState.startY) / zoom;
      const nx = Math.max(10, Math.min(bm.width - 10, dragState.origX + dx));
      const ny = Math.max(10, Math.min(bm.height - 10, dragState.origY + dy));
      updateBattlemap(mapId, (cur) => ({
        ...cur,
        lights: cur.lights.map((l) => (l.id === dragState.lightId ? { ...l, x: nx, y: ny } : l)),
      }));
    } else if (dragState.kind === 'line') {
      const pt = screenToMap(e.clientX, e.clientY);
      setDragState({
        ...dragState,
        x2: snapCoord(pt.x, bm.gridSizePx, false),
        y2: snapCoord(pt.y, bm.gridSizePx, false),
      });
    }
  };

  const handlePointerUp = () => {
    if (!dragState) return;
    if (dragState.kind === 'fog') {
      void commitFog2DMask();
    } else if (dragState.kind === 'token') {
      const tok = bm.tokens.find((t) => t.id === dragState.tokenId);
      const pos =
        dragTokenPreview && dragTokenPreview.id === dragState.tokenId
          ? { x: dragTokenPreview.x, y: dragTokenPreview.y }
          : tok
          ? { x: tok.x, y: tok.y }
          : null;
      if (tok && pos) {
        const finalX = snapToGrid ? snapCoord(pos.x, bm.gridSizePx, true) : pos.x;
        const finalY = snapToGrid ? snapCoord(pos.y, bm.gridSizePx, true) : pos.y;
        void moveBattlemapToken(mapId, tok.id, finalX, finalY);
      }
      setDragTokenPreview(null);
    } else if (dragState.kind === 'prop' && effectiveGm) {
      const prop = (bm.props || []).find((p) => p.id === dragState.propId);
      if (prop && snapToGrid) {
        updateBattlemapProp(mapId, prop.id, {
          x: snapCoord(prop.x, bm.gridSizePx, true),
          y: snapCoord(prop.y, bm.gridSizePx, true),
        });
      }
    } else if (dragState.kind === 'light' && effectiveGm) {
      const light = bm.lights.find((l) => l.id === dragState.lightId);
      if (light && snapToGrid) {
        const sx = snapCoord(light.x, bm.gridSizePx, true);
        const sy = snapCoord(light.y, bm.gridSizePx, true);
        updateBattlemap(mapId, (cur) => ({
          ...cur,
          lights: cur.lights.map((l) => (l.id === light.id ? { ...l, x: sx, y: sy } : l)),
        }));
      }
    } else if (dragState.kind === 'line') {
      const len = Math.hypot(dragState.x2 - dragState.x1, dragState.y2 - dragState.y1);
      if (len > 12 && effectiveGm) {
        if (dragState.tool === 'draw-wall') {
          addBattlemapWall(mapId, {
            x1: dragState.x1,
            y1: dragState.y1,
            x2: dragState.x2,
            y2: dragState.y2,
            kind: wallKindInput,
          });
        } else if (dragState.tool === 'draw-door') {
          addBattlemapDoor(mapId, {
            label:
              doorStyleInput === 'secret'
                ? `Secret Door #${bm.doors.length + 1}`
                : `Door #${bm.doors.length + 1}`,
            x1: dragState.x1,
            y1: dragState.y1,
            x2: dragState.x2,
            y2: dragState.y2,
            isOpen: false,
            isLocked: doorStyleInput === 'locked',
            isSecret: doorStyleInput === 'secret',
          });
        }
      }
    }
    setDragState(null);
  };

  // Cursor-centered smooth wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const worldX = (cursorX - pan.x) / zoom;
    const worldY = (cursorY - pan.y) / zoom;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const nextZoom = Math.max(0.35, Math.min(2.2, Number((zoom * factor).toFixed(3))));
    setZoom(nextZoom);
    setPan({
      x: cursorX - worldX * nextZoom,
      y: cursorY - worldY * nextZoom,
    });
  };

  const visibleTokens = bm.tokens.filter(
    (t) => effectiveGm || !(t.isHidden || (t as unknown as { hiddenFromPlayers?: boolean; hidden?: boolean }).hiddenFromPlayers || (t as unknown as { hidden?: boolean }).hidden)
  );
  const visibleDoors = bm.doors.filter((d) => effectiveGm || !d.isSecret || d.isOpen);
  const visibleProps = (bm.props || []).filter((p) => effectiveGm || !p.isSecret);
  const aoeTemplates = bm.aoeTemplates || [];

  const dispRing = (disp: TokenDisposition) => {
    if (disp === 'party') return 'border-[#d4a853] bg-[#1c170f] text-[#f5d88b]';
    if (disp === 'ally') return 'border-sky-400 bg-[#0d1c26] text-sky-200';
    if (disp === 'enemy') return 'border-red-500 bg-[#270e12] text-red-200';
    return 'border-slate-400 bg-[#151820] text-slate-200';
  };

  const measureDistanceFt =
    dragState?.kind === 'line'
      ? Math.round((Math.hypot(dragState.x2 - dragState.x1, dragState.y2 - dragState.y1) / bm.gridSizePx) * 5)
      : 0;

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      className={`relative w-full h-full bg-[#07090d] overflow-hidden select-none ${
        battlemapTool === 'select' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
      }`}
    >
      {/* Transformed Battlemap Stage */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          width: bm.width,
          height: bm.height,
        }}
        className="relative shadow-[0_24px_60px_rgba(0,0,0,0.8)] border border-[#232a38]"
      >
        <canvas ref={canvasRef} className="block w-full h-full" />

        {/* Scene Dressing Props, Furniture, Traps, Hazards & GM Markers */}
        {visibleProps.map((prop: BattlemapProp) => {
          const isSel = selectedPropId2D === prop.id;
          const isTrap = prop.kind === 'trap';
          const isHazard = prop.kind === 'hazard';
          const isMarker = prop.kind === 'marker';
          const isRound =
            prop.kind === 'pillar' ||
            prop.kind === 'statue' ||
            prop.kind === 'campfire' ||
            prop.kind === 'hazard' ||
            prop.kind === 'marker';

          return (
            <div
              key={prop.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (effectiveGm && battlemapTool === 'erase') {
                  deleteBattlemapProp(mapId, prop.id);
                  return;
                }
                setSelectedPropId2D(prop.id);
                if (effectiveGm && battlemapMode === 'prep') {
                  setDragState({
                    kind: 'prop',
                    propId: prop.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    origX: prop.x,
                    origY: prop.y,
                  });
                }
              }}
              title={`${prop.label}${prop.notes ? ` — ${prop.notes}` : ''}`}
              style={{
                left: prop.x,
                top: prop.y,
                width: prop.widthPx,
                height: prop.heightPx,
                transform: `translate(-50%, -50%) rotate(${prop.rotationDeg}deg)`,
                borderColor: isTrap ? '#ef4444' : isMarker ? '#eab308' : prop.color,
                backgroundColor: isHazard
                  ? `${prop.color}28`
                  : isTrap
                  ? 'rgba(127, 29, 29, 0.28)'
                  : isMarker
                  ? 'rgba(20, 17, 10, 0.92)'
                  : `${prop.color}42`,
              }}
              className={`group absolute flex items-center justify-center border-2 ${
                effectiveGm && battlemapMode === 'prep' ? 'cursor-move' : 'cursor-pointer'
              } transition-shadow ${
                isRound ? 'rounded-full' : 'rounded-md'
              } ${isTrap || isMarker ? 'border-dashed' : ''} ${
                prop.isSecret ? 'opacity-80' : ''
              } ${isSel ? 'ring-2 ring-[#eab308] ring-offset-2 ring-offset-[#090b0e] z-10' : ''}`}
            >
              {prop.kind === 'trap' ? (
                <AlertTriangle className="w-4 h-4 text-red-400" />
              ) : prop.kind === 'marker' ? (
                <Bookmark className="w-3.5 h-3.5 text-[#eab308]" />
              ) : prop.kind === 'chest' ? (
                <Archive className="w-3.5 h-3.5 text-[#f3d185]" />
              ) : prop.kind === 'campfire' ? (
                <Flame className="w-4 h-4 text-orange-400" />
              ) : prop.kind === 'altar' ? (
                <Sparkles className="w-4 h-4 text-red-300" />
              ) : prop.kind === 'table' || prop.kind === 'crate' ? (
                <Package className="w-3.5 h-3.5 text-[#e5be58]/80" />
              ) : (
                <span className="text-[9px] font-mono uppercase text-[#e7e2d8]/90 px-1 truncate">
                  {prop.label.slice(0, 6)}
                </span>
              )}

              {(isSel || prop.isSecret) && (
                <div
                  style={{ transform: `rotate(-${prop.rotationDeg}deg)` }}
                  className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 rounded bg-[#0b0d10]/90 border border-[#232936] text-[9px] text-[#e7e2d8]"
                >
                  {prop.isSecret ? 'GM: ' : ''}
                  {prop.label}
                </div>
              )}
            </div>
          );
        })}

        {/* AoE Spell / Effect Templates Overlay */}
        {aoeTemplates.length > 0 && (
          <svg
            width={bm.width}
            height={bm.height}
            viewBox={`0 0 ${bm.width} ${bm.height}`}
            className="pointer-events-none absolute inset-0 z-10"
          >
            {aoeTemplates.map((tpl: BattlemapAoeTemplate) => {
              const rPx = Math.max(16, (tpl.radiusFt / 5) * bm.gridSizePx);
              if (tpl.shape === 'circle') {
                return (
                  <g key={tpl.id}>
                    <circle
                      cx={tpl.x}
                      cy={tpl.y}
                      r={rPx}
                      fill={tpl.color}
                      fillOpacity={0.22}
                      stroke={tpl.color}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                    />
                    <text
                      x={tpl.x}
                      y={tpl.y - rPx - 6}
                      textAnchor="middle"
                      fill="#f5ead3"
                      fontSize="11"
                      fontFamily="monospace"
                    >
                      {tpl.label}
                    </text>
                  </g>
                );
              }
              if (tpl.shape === 'square') {
                return (
                  <g key={tpl.id}>
                    <rect
                      x={tpl.x - rPx}
                      y={tpl.y - rPx}
                      width={rPx * 2}
                      height={rPx * 2}
                      fill={tpl.color}
                      fillOpacity={0.22}
                      stroke={tpl.color}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                    />
                  </g>
                );
              }
              if (tpl.shape === 'line') {
                const rad = (tpl.angleDeg * Math.PI) / 180;
                const x2 = tpl.x + Math.cos(rad) * rPx * 1.5;
                const y2 = tpl.y + Math.sin(rad) * rPx * 1.5;
                return (
                  <g key={tpl.id}>
                    <line
                      x1={tpl.x}
                      y1={tpl.y}
                      x2={x2}
                      y2={y2}
                      stroke={tpl.color}
                      strokeOpacity={0.55}
                      strokeWidth={Math.max(14, bm.gridSizePx * 0.4)}
                      strokeLinecap="round"
                    />
                  </g>
                );
              }
              const halfAngle = Math.PI / 6;
              const baseRad = (tpl.angleDeg * Math.PI) / 180;
              const ax = tpl.x + Math.cos(baseRad - halfAngle) * rPx * 1.3;
              const ay = tpl.y + Math.sin(baseRad - halfAngle) * rPx * 1.3;
              const bx = tpl.x + Math.cos(baseRad + halfAngle) * rPx * 1.3;
              const by = tpl.y + Math.sin(baseRad + halfAngle) * rPx * 1.3;
              return (
                <g key={tpl.id}>
                  <polygon
                    points={`${tpl.x},${tpl.y} ${ax},${ay} ${bx},${by}`}
                    fill={tpl.color}
                    fillOpacity={0.24}
                    stroke={tpl.color}
                    strokeWidth={2}
                    strokeDasharray="5 3"
                  />
                </g>
              );
            })}
          </svg>
        )}

        {effectiveGm &&
          aoeTemplates.map((tpl) => (
            <button
              key={`del-${tpl.id}`}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                deleteAoeTemplate(mapId, tpl.id);
              }}
              style={{ left: tpl.x, top: tpl.y }}
              title={`Remove ${tpl.label}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 px-1.5 py-0.5 rounded-full bg-[#0c0e14]/90 border border-[#b68d40]/60 text-[9px] font-mono text-[#f0cf85] hover:text-red-300"
            >
              × {tpl.radiusFt}ft
            </button>
          ))}

        {/* Interactive Doors Overlay */}
        {visibleDoors.map((d: BattlemapDoor) => {
          const mx = (d.x1 + d.x2) / 2;
          const my = (d.y1 + d.y2) / 2;
          const isSel = selectedDoorId === d.id;
          return (
            <button
              key={d.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (effectiveGm && battlemapTool === 'erase') {
                  deleteBattlemapDoor(mapId, d.id);
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (effectiveGm && battlemapTool === 'erase') return;
                setSelectedDoorId(d.id);
                if (effectiveGm) {
                  toggleBattlemapDoor(mapId, d.id);
                }
              }}
              title={`${d.label} — ${effectiveGm ? `Click to ${d.isOpen ? 'Close' : 'Open'}` : d.isOpen ? 'Open' : 'Closed'}${d.isLocked ? ' (Locked)' : ''}`}
              style={{ left: mx, top: my }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center border shadow-md transition-transform hover:scale-110 ${
                d.isOpen
                  ? 'bg-emerald-950/90 border-emerald-400/70 text-emerald-300'
                  : d.isLocked
                  ? 'bg-red-950/95 border-red-400 text-red-200'
                  : 'bg-[#1a150e]/95 border-[#d4a853] text-[#f0cf85]'
              } ${isSel ? 'ring-2 ring-white/80' : ''}`}
            >
              {d.isOpen ? (
                <DoorOpen className="w-3.5 h-3.5" />
              ) : d.isLocked ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <DoorClosed className="w-3.5 h-3.5" />
              )}
            </button>
          );
        })}

        {/* Interactive Lights Overlay (GM Only) */}
        {effectiveGm &&
          bm.lights.map((l: BattlemapLight) => {
            const isSel = selectedLightId === l.id;
            return (
              <button
                key={l.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (battlemapTool === 'erase') {
                    deleteBattlemapLight(mapId, l.id);
                    return;
                  }
                  setSelectedLightId(l.id);
                  setDragState({
                    kind: 'light',
                    lightId: l.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    origX: l.x,
                    origY: l.y,
                  });
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  toggleBattlemapLight(mapId, l.id);
                }}
                title={`${l.label} (${l.radiusFt}ft, ${l.isOn ? 'ON' : 'OFF'}) — Drag to move, double-click to toggle`}
                style={{
                  left: l.x,
                  top: l.y,
                  borderColor: l.isOn ? l.color : '#475569',
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center border bg-[#0b0d10]/85 shadow-lg transition-transform hover:scale-110 ${
                  l.isOn ? 'text-amber-300' : 'text-slate-500 opacity-60'
                } ${isSel ? 'ring-2 ring-[#eab308]' : ''}`}
              >
                <Flame className="w-3.5 h-3.5" />
              </button>
            );
          })}

        {/* 2D West Marches Guild Quest Board Pins */}
        {mapBoards.map((board) => {
          const openCount = guildQuests.filter(
            (q) => q.board_id === board.id && (q.status === 'open' || q.status === 'in_progress')
          ).length;
          const boardX =
            board.x > 0 && board.x < 40 && board.y > 0 && board.y < 40
              ? board.x * bm.gridSizePx
              : Math.max(40, Math.min(bm.width - 40, board.x || bm.width * 0.5));
          const boardY =
            board.x > 0 && board.x < 40 && board.y > 0 && board.y < 40
              ? board.y * bm.gridSizePx
              : Math.max(40, Math.min(bm.height - 40, board.y || bm.height * 0.5));
          return (
            <button
              key={board.id}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setActiveQuestBoardModalId(board.id);
              }}
              style={{ left: boardX, top: boardY }}
              title={`${board.title} (${openCount} active quests)`}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#141008]/95 border border-[#d4a853] text-[#f5df9d] shadow-[0_6px_18px_rgba(0,0,0,0.8)] hover:scale-105 transition-transform"
            >
              <ScrollText className="w-3.5 h-3.5 text-[#d4a853] shrink-0" />
              <span className="text-[11px] font-serif font-semibold whitespace-nowrap">
                {board.title}
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-[#d4a853] text-black font-mono text-[10px] font-bold leading-none">
                {openCount}
              </span>
            </button>
          );
        })}

        {/* Draggable Tokens (Ownership-enforced for Players & GM) */}
        {visibleTokens.map((tok: BattlemapToken) => {
          const editable = canEditToken(tok);
          const posX = dragTokenPreview?.id === tok.id ? dragTokenPreview.x : tok.x;
          const posY = dragTokenPreview?.id === tok.id ? dragTokenPreview.y : tok.y;
          const diam = (tok.sizeCells || 1) * bm.gridSizePx * 0.82;
          const isSel = selectedTokenId === tok.id;
          const hpPct = Math.max(0, Math.min(100, (tok.hp / Math.max(1, tok.maxHp)) * 100));
          const initials = tok.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

          return (
            <div
              key={tok.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (effectiveGm && battlemapTool === 'erase') {
                  deleteBattlemapToken(mapId, tok.id);
                  return;
                }
                setSelectedTokenId(tok.id);
                if (!editable) return;
                setDragState({
                  kind: 'token',
                  tokenId: tok.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  origX: tok.x,
                  origY: tok.y,
                });
              }}
              style={{
                left: posX,
                top: posY,
                width: diam,
                height: diam,
              }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 flex flex-col items-center justify-center ${
                editable ? 'cursor-pointer' : 'cursor-not-allowed'
              } shadow-[0_6px_18px_rgba(0,0,0,0.7)] transition-shadow ${dispRing(
                tok.disposition
              )} ${tok.isHidden ? 'opacity-60 border-dashed' : ''} ${
                isSel ? 'ring-2 ring-[#eab308] ring-offset-2 ring-offset-[#090b0e]' : ''
              }`}
            >
              {tok.disposition === 'enemy' ? (
                <Skull className="w-4 h-4 mb-0.5" />
              ) : (
                <span className="font-serif text-xs font-bold tracking-wider">{initials}</span>
              )}

              {/* HP Bar */}
              <div className="w-[74%] h-1 rounded-full bg-black/70 overflow-hidden mt-0.5">
                <div
                  style={{ width: `${hpPct}%` }}
                  className={`h-full ${
                    tok.disposition === 'enemy' ? 'bg-red-500' : 'bg-emerald-400'
                  }`}
                />
              </div>

              {/* Token Name & Hidden Tag */}
              <div className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 rounded bg-[#0b0d10]/90 border border-[#232936] text-[9.5px] font-medium text-[#ede6d8] flex items-center gap-1">
                {tok.isHidden && <EyeOff className="w-2.5 h-2.5 text-red-400" />}
                <span>{tok.name}</span>
              </div>
            </div>
          );
        })}

        {/* Persistent 2D Fog of War Canvas Overlay */}
        <canvas
          ref={fogCanvasRef}
          className="pointer-events-none absolute inset-0 w-full h-full z-10"
        />

        {/* Ruler Measure Badge */}
        {dragState?.kind === 'line' && dragState.tool === 'measure' && (
          <div
            style={{ left: dragState.x2 + 10, top: dragState.y2 - 22 }}
            className="pointer-events-none absolute px-2 py-0.5 rounded bg-[#0b0d10]/95 border border-[#d4a853] font-mono text-[11px] text-[#f3d488] z-30"
          >
            {measureDistanceFt} ft ({Math.round(measureDistanceFt / 5)} sq)
          </div>
        )}
      </div>

      {/* Initiative Tracker Bar Overlay */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute top-14 left-3 z-20 pointer-events-none"
      >
        <InitiativeTrackerBar mapId={mapId} />
      </div>

      {/* Unified Top Control Overlay (Play vs Prep Scene + Map Tools) */}
      <div className="absolute top-3 inset-x-3 z-20 flex flex-wrap items-start justify-between gap-2 pointer-events-none">
        {/* Top-Left Tactical Mode & Setup Controls */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 flex-wrap pointer-events-auto"
        >
          {effectiveGm && (
            <>
              {/* Play | Prepare Scene Switcher */}
              <div className="flex items-center p-0.5 rounded-md dark-glass shadow-glass">
                <button
                  onClick={() => {
                    setBattlemapMode('play');
                    if (
                      battlemapTool === 'place-light' ||
                      battlemapTool === 'place-prop' ||
                      battlemapTool === 'draw-wall' ||
                      battlemapTool === 'draw-door' ||
                      battlemapTool === 'erase'
                    ) {
                      setBattlemapTool('select');
                    }
                  }}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                    battlemapMode === 'play'
                      ? 'bg-[#232934] text-[#f5df9d] border border-[#d4a853]/45 font-semibold'
                      : 'text-[#b5b0a5] hover:text-white'
                  }`}
                >
                  <Play className="w-3 h-3" />
                  <span>Play</span>
                </button>
                <button
                  onClick={() => {
                    setBattlemapMode('prep');
                    if (battlemapTool === 'select') {
                      setBattlemapTool('place-light');
                    }
                  }}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                    battlemapMode === 'prep'
                      ? 'btn-gold-metallic font-semibold'
                      : 'text-[#b5b0a5] hover:text-white'
                  }`}
                >
                  <Hammer className="w-3 h-3" />
                  <span>Prepare Scene</span>
                </button>
              </div>

              <button
                onClick={() => setMapGeneratorModalOpen(true, '2d', mapId)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md dark-glass-subtle hover:border-[#d4a853]/50 text-xs text-[#f0cf85]"
                title="Edit Map Title, Dimensions, Theme, or Floor Art"
              >
                <Settings2 className="w-3.5 h-3.5 text-[#d4a853]" />
                <span>Edit Map</span>
              </button>
            </>
          )}

          <button
            onClick={() => {
              if (effectiveGm) {
                updateBattlemap(mapId, (cur) => ({ ...cur, showGrid: !cur.showGrid }));
              }
            }}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs border transition-colors ${
              bm.showGrid
                ? 'dark-glass text-[#f0cf85] border-[#d4a853]/45'
                : 'dark-glass-subtle text-[#8b93a1]'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Grid</span>
          </button>

          {effectiveGm && (
            <>
              <button
                onClick={() =>
                  updateBattlemap(mapId, (cur) => ({
                    ...cur,
                    dynamicLighting: !cur.dynamicLighting,
                  }))
                }
                className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs border transition-colors ${
                  bm.dynamicLighting
                    ? 'dark-glass text-[#f0cf85] border-[#d4a853]/45'
                    : 'dark-glass-subtle text-[#8b93a1]'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Lighting</span>
              </button>

              <button
                onClick={() => setSnapToGrid(!snapToGrid)}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs border transition-colors ${
                  snapToGrid
                    ? 'dark-glass text-[#e5be58] border-[#d4a853]/35'
                    : 'dark-glass-subtle text-[#8b93a1]'
                }`}
              >
                <span>Snap 5ft</span>
              </button>

              <button
                onClick={() => setMapGeneratorModalOpen(true, '2d')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md dark-glass-subtle hover:border-[#d4a853]/50 text-xs text-[#e7e2d8]"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#d4a853]" />
                <span>New Map</span>
              </button>
            </>
          )}
        </div>

        {/* Top-Right Scene Prep & Tactical Tool Palette */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{ marginRight: rightInsetPx - 12 }}
          className="flex flex-col items-end gap-2 pointer-events-auto"
        >
          <div className="flex items-center gap-0.5 p-1 rounded-lg dark-glass shadow-glass">
            {(
              [
                {
                  id: 'select',
                  icon: MousePointer,
                  label: 'Select / Move / Inspect',
                  modes: ['play', 'prep'],
                  gmOnly: false,
                },
                {
                  id: 'place-party',
                  icon: UserPlus,
                  label: 'Place Party / Ally Token',
                  modes: ['play', 'prep'],
                  gmOnly: true,
                },
                {
                  id: 'place-enemy',
                  icon: Skull,
                  label: 'Place Enemy Token',
                  modes: ['play', 'prep'],
                  gmOnly: true,
                },
                {
                  id: 'fog-reveal',
                  icon: EyeOff,
                  label: 'Fog of War Brush',
                  modes: ['play', 'prep'],
                  gmOnly: true,
                },
                {
                  id: 'aoe',
                  icon: Target,
                  label: 'Place AoE Template',
                  modes: ['play', 'prep'],
                  gmOnly: true,
                },
                {
                  id: 'place-quest-board',
                  icon: ScrollText,
                  label: 'Place Guild Quest Board',
                  modes: ['play', 'prep'],
                  gmOnly: true,
                },
                {
                  id: 'place-light',
                  icon: Lightbulb,
                  label: 'Place Scene Light',
                  modes: ['prep'],
                  gmOnly: true,
                },
                {
                  id: 'place-prop',
                  icon: Package,
                  label: 'Place Furniture, Traps & Markers',
                  modes: ['prep'],
                  gmOnly: true,
                },
                {
                  id: 'draw-wall',
                  icon: Shield,
                  label: 'Draw Wall / Pillar / Secret Wall',
                  modes: ['prep'],
                  gmOnly: true,
                },
                {
                  id: 'draw-door',
                  icon: DoorClosed,
                  label: 'Draw Interactive Door',
                  modes: ['prep'],
                  gmOnly: true,
                },
                {
                  id: 'erase',
                  icon: Eraser,
                  label: 'Erase Wall, Door, Light, Prop or Token',
                  modes: ['prep'],
                  gmOnly: true,
                },
                {
                  id: 'measure',
                  icon: Ruler,
                  label: 'Measure Distance (5ft)',
                  modes: ['play', 'prep'],
                  gmOnly: false,
                },
              ] as const
            )
              .filter(
                (tool) =>
                  (!tool.gmOnly || effectiveGm) &&
                  (tool.modes as readonly string[]).includes(battlemapMode)
              )
              .map((tool) => {
                const Icon = tool.icon;
                const active =
                  battlemapTool === tool.id ||
                  (tool.id === 'fog-reveal' && battlemapTool === 'fog-hide');
                return (
                  <button
                    key={tool.id}
                    onClick={() => setBattlemapTool(tool.id)}
                    title={tool.label}
                    aria-label={tool.label}
                    className={`p-2 rounded-md transition-all ${
                      active
                        ? tool.id === 'erase'
                          ? 'bg-red-950/70 text-red-200 border border-red-400/60'
                          : 'bg-[#d4a853]/25 text-[#f7d983] border border-[#d4a853]/60'
                        : 'text-[#9aa3b2] hover:text-white hover:bg-[#1b2029]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
          </div>

          {/* Contextual 2D Fog of War Brush Bar */}
          {effectiveGm && (battlemapTool === 'fog-reveal' || battlemapTool === 'fog-hide') && (
            <div className="rounded-lg dark-glass p-2 flex flex-wrap items-center gap-2 text-xs max-w-lg justify-end">
              <select
                aria-label="Target Player"
                value={fogBrushTargetUserId}
                onChange={(e) => setFogBrushTargetUserId(e.target.value)}
                className="bg-[#0b0d10] border border-[#242a35] rounded px-2 py-1 text-xs text-[#f3ead8]"
              >
                <option value="__all__">All Players</option>
                {campaignMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.profile?.display_name || m.user_id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setFogBrushRevealMode(true);
                  setBattlemapTool('fog-reveal');
                }}
                className={`px-2 py-1 rounded text-xs font-medium ${
                  battlemapTool === 'fog-reveal' && fogBrushRevealMode
                    ? 'btn-gold-metallic font-semibold'
                    : 'bg-[#0e1218] text-[#9aa3b2] hover:text-white'
                }`}
              >
                Reveal
              </button>
              <button
                type="button"
                onClick={() => {
                  setFogBrushRevealMode(false);
                  setBattlemapTool('fog-hide');
                }}
                className={`px-2 py-1 rounded text-xs font-medium ${
                  battlemapTool === 'fog-hide' || !fogBrushRevealMode
                    ? 'bg-red-950/80 text-red-200 border border-red-400/50 font-semibold'
                    : 'bg-[#0e1218] text-[#9aa3b2] hover:text-white'
                }`}
              >
                Hide
              </button>
              <label className="flex items-center gap-1 text-[11px] text-[#c9c3b8]">
                <span>Size {fogBrushRadiusCells}sq</span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={fogBrushRadiusCells}
                  onChange={(e) => setFogBrushRadiusCells(Number(e.target.value))}
                  className="w-16 accent-[#d4a853]"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  const next = createFogMask(255);
                  fogMaskRef.current = next;
                  setFogMaskSeq((s) => s + 1);
                  void commitFog2DMask(next);
                }}
                className="px-2 py-1 rounded bg-[#0e1218] border border-[#242a35] text-[11px] text-[#e7e2d8]"
              >
                Reveal All
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = createFogMask(0);
                  fogMaskRef.current = next;
                  setFogMaskSeq((s) => s + 1);
                  void commitFog2DMask(next);
                }}
                className="px-2 py-1 rounded bg-[#0e1218] border border-[#242a35] text-[11px] text-[#d4a853]"
              >
                Reset Shroud
              </button>
            </div>
          )}

          {/* Contextual AoE Template Placement Bar */}
          {effectiveGm && battlemapTool === 'aoe' && (
            <div className="rounded-lg dark-glass p-2 flex flex-wrap items-center gap-2 text-xs max-w-md justify-end">
              {(
                [
                  ['circle', 'Sphere'],
                  ['cone', 'Cone'],
                  ['line', 'Line'],
                  ['square', 'Cube'],
                ] as const
              ).map(([sh, lbl]) => (
                <button
                  key={sh}
                  type="button"
                  onClick={() => setAoeShape(sh)}
                  className={`px-2 py-1 rounded text-[11px] ${
                    aoeShape === sh
                      ? 'btn-gold-metallic font-semibold'
                      : 'bg-[#0b0d10] text-[#9aa3b2] hover:text-white'
                  }`}
                >
                  {lbl}
                </button>
              ))}
              <label className="flex items-center gap-1 text-[11px] text-[#c9c3b8]">
                <span>Radius</span>
                <input
                  type="number"
                  min={5}
                  max={60}
                  step={5}
                  value={aoeRadiusFt}
                  onChange={(e) => setAoeRadiusFt(Number(e.target.value) || 20)}
                  className="w-12 bg-[#0b0d10] border border-[#242a35] rounded px-1.5 py-0.5 font-mono text-[11px] text-[#e5be58]"
                />
                <span>ft</span>
              </label>
              <input
                type="color"
                value={aoeColor}
                onChange={(e) => setAoeColor(e.target.value)}
                className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                title="AoE Color"
              />
            </div>
          )}

          {/* Contextual Scene Light Placement Bar */}
          {effectiveGm && battlemapTool === 'place-light' && (
            <div className="rounded-lg dark-glass p-2 flex flex-wrap items-center gap-2 text-xs max-w-md justify-end">
              <select
                value={lightPresetIdx}
                onChange={(e) => {
                  const idx = parseInt(e.target.value, 10);
                  setLightPresetIdx(idx);
                  const lp = LIGHT_PRESETS[idx];
                  if (lp) {
                    setLightRadiusInput(lp.radiusFt);
                    setLightColorInput(lp.color);
                    setLightFlickerInput(lp.flicker);
                  }
                }}
                className="bg-[#0b0d10] border border-[#242a35] rounded px-2 py-1 text-xs text-[#f3ead8]"
              >
                {LIGHT_PRESETS.map((lp, idx) => (
                  <option key={lp.label} value={idx}>
                    {lp.label} ({lp.radiusFt}ft)
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-[11px] text-[#c9c3b8]">
                <span>Radius</span>
                <input
                  type="number"
                  min={10}
                  max={80}
                  step={5}
                  value={lightRadiusInput}
                  onChange={(e) => setLightRadiusInput(Number(e.target.value) || 30)}
                  className="w-12 bg-[#0b0d10] border border-[#242a35] rounded px-1.5 py-0.5 font-mono text-[11px] text-[#e5be58]"
                />
                <span>ft</span>
              </label>
              <input
                type="color"
                value={lightColorInput}
                onChange={(e) => setLightColorInput(e.target.value)}
                className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                title="Light Color"
              />
              <label className="flex items-center gap-1 text-[11px] text-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lightFlickerInput}
                  onChange={(e) => setLightFlickerInput(e.target.checked)}
                  className="accent-[#d4a853]"
                />
                <span>Flicker</span>
              </label>
            </div>
          )}

          {/* Contextual Scene Props / Traps / Markers Bar */}
          {effectiveGm && battlemapTool === 'place-prop' && (
            <div className="rounded-lg dark-glass p-2 flex flex-wrap items-center gap-2 text-xs max-w-md justify-end">
              <select
                value={propPresetIdx}
                onChange={(e) => {
                  const idx = parseInt(e.target.value, 10);
                  setPropPresetIdx(idx);
                  const pp = PROP_PRESETS[idx];
                  if (pp) setPropSecretInput(pp.isSecret);
                }}
                className="bg-[#0b0d10] border border-[#242a35] rounded px-2 py-1 text-xs text-[#f3ead8]"
              >
                {PROP_PRESETS.map((pp, idx) => (
                  <option key={pp.kind} value={idx}>
                    {pp.label} {pp.blocksLight ? '(Blocks Light)' : ''}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-[11px] text-red-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={propSecretInput}
                  onChange={(e) => setPropSecretInput(e.target.checked)}
                  className="accent-red-500"
                />
                <span>GM Secret</span>
              </label>
            </div>
          )}

          {/* Contextual Wall Brush Bar */}
          {effectiveGm && battlemapTool === 'draw-wall' && (
            <div className="rounded-lg dark-glass p-1.5 flex items-center gap-1 text-[11px]">
              {(
                [
                  ['wall', 'Stone Wall'],
                  ['pillar', 'Column'],
                  ['secret-wall', 'Secret Wall (GM)'],
                ] as const
              ).map(([wk, label]) => (
                <button
                  key={wk}
                  onClick={() => setWallKindInput(wk)}
                  className={`px-2 py-1 rounded transition-colors ${
                    wallKindInput === wk
                      ? 'bg-[#d4a853]/25 text-[#f7d983] border border-[#d4a853]/60'
                      : 'text-[#9aa3b2] hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Contextual Door Brush Bar */}
          {effectiveGm && battlemapTool === 'draw-door' && (
            <div className="rounded-lg dark-glass p-1.5 flex items-center gap-1 text-[11px]">
              {(
                [
                  ['standard', 'Standard Door'],
                  ['locked', 'Locked Door'],
                  ['secret', 'Secret Door (GM)'],
                ] as const
              ).map(([ds, label]) => (
                <button
                  key={ds}
                  onClick={() => setDoorStyleInput(ds)}
                  className={`px-2 py-1 rounded transition-colors ${
                    doorStyleInput === ds
                      ? 'bg-[#d4a853]/25 text-[#f7d983] border border-[#d4a853]/60'
                      : 'text-[#9aa3b2] hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {effectiveGm && battlemapTool === 'erase' && (
            <div className="rounded-lg bg-red-950/80 border border-red-500/45 px-2.5 py-1 text-[11px] text-red-200">
              Click any wall, door, light, prop, or token to delete it
            </div>
          )}

          {/* Contextual Spawner Bar for Enemies / Party */}
          {effectiveGm && battlemapTool === 'place-enemy' && (
            <div className="rounded-lg dark-glass p-2 flex items-center gap-2 text-xs">
              <select
                value={enemyPresetIdx}
                onChange={(e) => setEnemyPresetIdx(parseInt(e.target.value, 10))}
                className="bg-[#0b0d10] border border-[#242a35] rounded px-2 py-1 text-xs text-[#f3ead8]"
              >
                {ENEMY_PRESETS.map((p, idx) => (
                  <option key={p.name} value={idx}>
                    {p.name} (HP {p.hp}, AC {p.ac})
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-[11px] text-red-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={spawnHidden}
                  onChange={(e) => setSpawnHidden(e.target.checked)}
                  className="accent-red-500"
                />
                <span>Hidden (GM)</span>
              </label>
            </div>
          )}

          {effectiveGm && battlemapTool === 'place-party' && (
            <div className="rounded-lg dark-glass p-2 flex items-center gap-2 text-xs">
              <select
                value={partyPresetIdx}
                onChange={(e) => setPartyPresetIdx(parseInt(e.target.value, 10))}
                className="bg-[#0b0d10] border border-[#242a35] rounded px-2 py-1 text-xs text-[#f3ead8]"
              >
                {PARTY_PRESETS.map((p, idx) => (
                  <option key={p.name} value={idx}>
                    {p.name} (HP {p.hp}, AC {p.ac})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Bottom-Left Tactical Scale Indicator */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute bottom-3 left-3 z-20 px-3 py-2 rounded-lg dark-glass-subtle flex items-center gap-3 text-[11px] font-mono text-[#c9c3b8]"
      >
        <Compass className="w-4 h-4 text-[#d4a853]" />
        <span>1 Square = 5 ft</span>
        <span className="text-[#6d7685]">|</span>
        <span className="text-[#e5be58]">{Math.round(zoom * 100)}%</span>
        <span className="text-[#6d7685] hidden sm:inline">|</span>
        <span className="text-[#8b93a1] hidden sm:inline">
          Click doors to open/close · Drag tokens to move
        </span>
      </div>

      {/* Bottom-Right Zoom Controls */}
      <div
        data-testid="viewport-hud"
        onPointerDown={(e) => e.stopPropagation()}
        style={{ right: rightInsetPx }}
        className="absolute bottom-3 z-20 flex flex-col gap-1.5"
      >
        <button
          onClick={() => setZoom((z) => Math.min(2.2, Number((z * 1.15).toFixed(2))))}
          className="w-8 h-8 rounded-md dark-glass flex items-center justify-center text-[#d4a853] hover:text-white"
          title="Zoom In"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.35, Number((z * 0.85).toFixed(2))))}
          className="w-8 h-8 rounded-md dark-glass flex items-center justify-center text-[#d4a853] hover:text-white"
          title="Zoom Out"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const fit = Math.min((rect.width - 60) / bm.width, (rect.height - 60) / bm.height, 1.05);
            const z = Math.max(0.35, Number(fit.toFixed(2)));
            setZoom(z);
            setPan({
              x: Math.round((rect.width - bm.width * z) / 2),
              y: Math.round((rect.height - bm.height * z) / 2),
            });
          }}
          className="w-8 h-8 rounded-md dark-glass flex items-center justify-center text-[#d4a853] hover:text-white"
          title="Fit Map to Screen"
        >
          <Wand2 className="w-4 h-4" />
        </button>
      </div>

      {/* West Marches Guild Quest Board Modal */}
      <GuildQuestBoardModal />
    </div>
  );
};
