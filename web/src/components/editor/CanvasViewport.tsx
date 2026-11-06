'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Clip, CaptionStyle, FrameSettings, AudioSettings, CaptionSegment } from '@/lib/types';
import { buildGroups, formatTimecode, getVideoFilterCss } from '@/lib/captions';
import { PlatformGuidesOverlay } from './PlatformGuidesOverlay';
import {
  PanelLeftClose,
  PanelLeft,
  ChevronDown,
  Download,
  Grid3X3,
  Film,
  Sparkles,
  RotateCw,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Monitor,
  Repeat,
  Maximize,
  Minimize,
  Users,
  Gauge,
  Layers,
  Maximize2,
  GripHorizontal,
  GripVertical,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface CanvasViewportProps {
  clip: Clip | null;
  style: CaptionStyle;
  frame: FrameSettings;
  audio: AudioSettings;
  captionSegments: CaptionSegment[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isLooping: boolean;
  safeGuides: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onStepFrame: (frames: number) => void;
  onToggleLoop: () => void;
  onToggleSafeGuides: () => void;
  onUpdateFrame: (frame: FrameSettings) => void;
  onUpdateStyle?: (style: CaptionStyle) => void;
  onUpdateSegments?: (segments: CaptionSegment[]) => void;
  isCinemaMode?: boolean;
  onToggleCinemaMode?: () => void;
  isLeftPanelCollapsed?: boolean;
  onToggleLeftPanel?: () => void;
}

export function CanvasViewport({
  clip,
  style,
  frame,
  audio,
  captionSegments,
  currentTime,
  duration,
  isPlaying,
  isLooping,
  safeGuides,
  videoRef,
  onPlayPause,
  onSeek,
  onStepFrame,
  onToggleLoop,
  onToggleSafeGuides,
  onUpdateFrame,
  onUpdateStyle = () => {},
  onUpdateSegments,
  isCinemaMode = false,
  onToggleCinemaMode,
  isLeftPanelCollapsed = false,
  onToggleLeftPanel,
}: CanvasViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const captionDragRef = useRef<{
    mode: 'move' | 'resize' | 'rotate';
    pointerId: number;
    startX: number;
    startY: number;
    startPositionY: number;
    startFontSize: number;
    startRotation: number;
    centerScreenX: number;
    centerScreenY: number;
  } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<'fit' | '75%' | '100%' | '125%' | '150%'>('fit');
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [captionSelected, setCaptionSelected] = useState(false);
  const [activeSnapGuides, setActiveSnapGuides] = useState<{
    y?: { position: number; label: string };
  } | null>(null);
  const [isEditingInPlace, setIsEditingInPlace] = useState(false);
  const [inPlaceEditText, setInPlaceEditText] = useState('');
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const splitBottomVideoRef = useRef<HTMLVideoElement>(null);

  // Timeline Scrubber State (OpenCut & CapCut Style Video Scrubber)
  const scrubberTrackRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPct, setScrubPct] = useState<number | null>(null);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState(0);

  const previewOffset = clip?.preview_start_sec ?? 0;
  const inPoint = clip ? Math.max(0, (clip.start_sec || 0) - previewOffset) : 0;
  const outPoint = clip ? Math.max(inPoint + 0.1, (clip.end_sec || 0) - previewOffset) : (duration || 60);
  const clipDuration = Math.max(0.1, outPoint - inPoint);
  const relativeTime = Math.max(0, Math.min(clipDuration, currentTime - inPoint));
  const progressPct = Math.min(100, Math.max(0, (relativeTime / clipDuration) * 100));

  // displayPct & displayTime selalu menyatu dan 100% sinkron baik saat playback maupun saat user menggeser kursor
  const displayPct = isScrubbing && scrubPct !== null ? scrubPct : progressPct;
  const displayTime = isScrubbing && scrubPct !== null ? (scrubPct / 100) * clipDuration : relativeTime;

  const handleScrubberSeekFromEvent = (e: React.PointerEvent<HTMLDivElement> | PointerEvent) => {
    if (!scrubberTrackRef.current) return;
    const rect = scrubberTrackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const pct100 = pct * 100;
    setScrubPct(pct100);
    const targetTime = inPoint + pct * clipDuration;
    onSeek(targetTime);
  };

  const handleScrubberPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsScrubbing(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    handleScrubberSeekFromEvent(e);
  };

  const handleScrubberPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubberTrackRef.current) return;
    const rect = scrubberTrackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPct(pct * 100);
    setHoverTime(pct * clipDuration);

    if (isScrubbing) {
      handleScrubberSeekFromEvent(e);
    }
  };

  const handleScrubberPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbing) {
      setIsScrubbing(false);
      setScrubPct(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleScrubberPointerLeave = () => {
    if (!isScrubbing) {
      setHoverPct(null);
    }
  };

  // Sync background duplicate video (Fit + Blur) and bottom video (Podcast Split)
  useEffect(() => {
    if (frame.mode !== 'fit_blur' && frame.mode !== 'split') return;
    const mainEl = videoRef.current;
    const bgEl = bgVideoRef.current;
    const splitEl = splitBottomVideoRef.current;
    if (!mainEl) return;

    const syncEl = (el: HTMLVideoElement | null) => {
      if (!el) return;
      if (Math.abs(el.currentTime - mainEl.currentTime) > 0.08) {
        el.currentTime = mainEl.currentTime;
      }
    };

    const syncTime = () => {
      if (frame.mode === 'fit_blur') syncEl(bgEl);
      if (frame.mode === 'split') syncEl(splitEl);
    };

    const handlePlay = () => {
      if (frame.mode === 'fit_blur' && bgEl) {
        bgEl.currentTime = mainEl.currentTime;
        bgEl.play().catch(() => {});
      }
      if (frame.mode === 'split' && splitEl) {
        splitEl.currentTime = mainEl.currentTime;
        splitEl.play().catch(() => {});
      }
    };

    const handlePause = () => {
      if (bgEl) {
        bgEl.pause();
        bgEl.currentTime = mainEl.currentTime;
      }
      if (splitEl) {
        splitEl.pause();
        splitEl.currentTime = mainEl.currentTime;
      }
    };

    const handleSeeking = () => {
      if (bgEl) bgEl.currentTime = mainEl.currentTime;
      if (splitEl) splitEl.currentTime = mainEl.currentTime;
    };

    const handleRateChange = () => {
      if (bgEl) bgEl.playbackRate = mainEl.playbackRate;
      if (splitEl) splitEl.playbackRate = mainEl.playbackRate;
    };

    mainEl.addEventListener('play', handlePlay);
    mainEl.addEventListener('pause', handlePause);
    mainEl.addEventListener('seeking', handleSeeking);
    mainEl.addEventListener('seeked', handleSeeking);
    mainEl.addEventListener('timeupdate', syncTime);
    mainEl.addEventListener('ratechange', handleRateChange);

    // Initial state sync
    if (frame.mode === 'fit_blur' && bgEl) {
      bgEl.currentTime = mainEl.currentTime;
      if (!mainEl.paused) bgEl.play().catch(() => {});
      else bgEl.pause();
    }
    if (frame.mode === 'split' && splitEl) {
      splitEl.currentTime = mainEl.currentTime;
      if (!mainEl.paused) splitEl.play().catch(() => {});
      else splitEl.pause();
    }

    return () => {
      mainEl.removeEventListener('play', handlePlay);
      mainEl.removeEventListener('pause', handlePause);
      mainEl.removeEventListener('seeking', handleSeeking);
      mainEl.removeEventListener('seeked', handleSeeking);
      mainEl.removeEventListener('timeupdate', syncTime);
      mainEl.removeEventListener('ratechange', handleRateChange);
    };
  }, [videoRef, frame.mode, clip]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateCanvasSize = () => {
      const bounds = stage.getBoundingClientRect();
      const availableWidth = Math.max(0, bounds.width - 12);
      const availableHeight = Math.max(0, bounds.height - 12);
      const [ratioWidth, ratioHeight] = frame.ratio.split(':').map(Number);
      const ratio = ratioWidth / ratioHeight;
      if (!availableWidth || !availableHeight || !Number.isFinite(ratio)) return;

      const height = Math.min(availableHeight, availableWidth / ratio);
      const next = { width: Math.round(height * ratio), height: Math.round(height) };
      setCanvasSize((current) =>
        current.width === next.width && current.height === next.height ? current : next
      );
    };

    const observer = new ResizeObserver(updateCanvasSize);
    observer.observe(stage);
    updateCanvasSize();
    return () => observer.disconnect();
  }, [frame.ratio]);

  const beginCaptionDrag = (event: React.PointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    if (!canvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    setCaptionSelected(true);

    const targetEl = event.target as HTMLElement;
    let mode: 'move' | 'resize' | 'rotate' = 'move';
    if (targetEl.closest('[data-caption-rotate]')) {
      mode = 'rotate';
    } else if (targetEl.closest('[data-caption-resize]')) {
      mode = 'resize';
    }

    const overlayEl = (event.currentTarget as HTMLElement).closest('[data-caption-overlay]');
    const bounds = overlayEl?.getBoundingClientRect();
    const centerScreenX = bounds ? bounds.left + bounds.width / 2 : event.clientX;
    const centerScreenY = bounds ? bounds.top + bounds.height / 2 : event.clientY;

    captionDragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPositionY: style.positionY ?? 72,
      startFontSize: style.fontSize || 84,
      startRotation: style.rotation ?? 0,
      centerScreenX,
      centerScreenY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateCaptionDrag = (event: React.PointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    const drag = captionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !canvasRef.current) return;

    if (drag.mode === 'rotate') {
      const dx = event.clientX - drag.centerScreenX;
      const dy = event.clientY - drag.centerScreenY;
      const angleRad = Math.atan2(dy, dx);
      let angleDeg = Math.round((angleRad * 180) / Math.PI + 90);
      if (angleDeg > 180) angleDeg -= 360;
      if (angleDeg < -180) angleDeg += 360;
      // Snap magnetik ke 0° (datar rata air) jika dalam toleransi ±2.5°
      if (Math.abs(angleDeg) <= 2.5) {
        angleDeg = 0;
      }
      const clamped = Math.max(-35, Math.min(35, angleDeg));
      onUpdateStyle?.({ ...style, rotation: clamped });
    } else if (drag.mode === 'move') {
      const height = canvasRef.current.getBoundingClientRect().height;
      if (!height) return;
      let rawPosY = drag.startPositionY + ((event.clientY - drag.startY) / height) * 100;
      rawPosY = Math.max(8, Math.min(92, rawPosY));

      // Snap guides titik penting vertikal (OpenCut Magnetic Snap)
      const snapPoints = [
        { val: 50, label: 'Tengah Layar (50%)' },
        { val: 72, label: 'Lower Third (72%)' },
        { val: 80, label: 'Area Bawah (80%)' },
        { val: 25, label: 'Area Atas (25%)' },
      ];
      let snappedY: number = rawPosY;
      let activeGuide: { position: number; label: string } | undefined;

      for (const sp of snapPoints) {
        if (Math.abs(rawPosY - sp.val) <= 1.5) {
          snappedY = sp.val;
          activeGuide = { position: sp.val, label: sp.label };
          break;
        }
      }

      setActiveSnapGuides(activeGuide ? { y: activeGuide } : null);
      onUpdateStyle?.({ ...style, positionY: Math.round(snappedY) });
    } else {
      const referenceHeight = canvasSize.height || 640;
      const delta = Math.max(event.clientX - drag.startX, event.clientY - drag.startY);
      const fontSize = Math.max(40, Math.min(140, drag.startFontSize + (delta * 1920 / referenceHeight) * 0.45));
      onUpdateStyle?.({ ...style, fontSize: Math.round(fontSize) });
    }
  };

  const finishCaptionDrag = (event: React.PointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    if (captionDragRef.current?.pointerId === event.pointerId) {
      captionDragRef.current = null;
      setActiveSnapGuides(null);
    }
  };

  // Drag Video Logic (Geser Video Menggunakan Kursor di Kanvas)
  const videoDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
    startSplitTopX?: number;
    startSplitBotX?: number;
    startSplitTopY?: number;
    startSplitBotY?: number;
    isSplitTop?: boolean;
    hasMoved: boolean;
  } | null>(null);
  const [isVideoDragging, setIsVideoDragging] = useState(false);

  const beginVideoDrag = (event: React.PointerEvent<HTMLVideoElement | HTMLDivElement>, splitTarget?: 'top' | 'bottom') => {
    const target = event.target as HTMLElement;
    if (
      target.closest('[data-caption-overlay]') ||
      target.closest('[data-watermark-overlay]') ||
      target.closest('[data-headline-overlay]') ||
      target.closest('[data-zoom-handle]') ||
      target.closest('button') ||
      target.closest('textarea') ||
      target.closest('input')
    ) {
      return;
    }

    event.preventDefault();
    videoDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: frame.offsetX || 0,
      startOffsetY: frame.offsetY || 0,
      startSplitTopX: frame.splitTopOffsetX ?? -25,
      startSplitBotX: frame.splitBottomOffsetX ?? 25,
      startSplitTopY: frame.splitTopOffsetY ?? 0,
      startSplitBotY: frame.splitBottomOffsetY ?? 0,
      isSplitTop: splitTarget === 'top',
      hasMoved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateVideoDrag = (event: React.PointerEvent<HTMLVideoElement | HTMLDivElement>) => {
    const drag = videoDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !canvasRef.current) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.hasMoved && Math.hypot(dx, dy) > 3) {
      drag.hasMoved = true;
      setIsVideoDragging(true);
    }

    if (!drag.hasMoved) return;

    const bounds = canvasRef.current.getBoundingClientRect();
    const width = bounds.width || 360;
    const height = bounds.height || 640;

    const pctX = (dx / width) * 100;
    const pctY = (dy / height) * 100;

    if (frame.mode === 'fit_blur' || frame.mode === 'fit') {
      const nextX = Math.max(-85, Math.min(85, Math.round(drag.startOffsetX + pctX)));
      const nextY = Math.max(-60, Math.min(60, Math.round(drag.startOffsetY + pctY)));
      onUpdateFrame({ ...frame, offsetX: nextX, offsetY: nextY });
    } else if (frame.mode === 'social') {
      const nextX = Math.max(-85, Math.min(85, Math.round(drag.startOffsetX + pctX)));
      const nextY = Math.max(-60, Math.min(60, Math.round(drag.startOffsetY + pctY)));
      onUpdateFrame({ ...frame, offsetX: nextX, offsetY: nextY });
    } else if (frame.mode === 'crop') {
      const nextX = Math.max(-85, Math.min(85, Math.round(drag.startOffsetX - pctX)));
      const nextY = Math.max(-60, Math.min(60, Math.round(drag.startOffsetY + pctY)));
      onUpdateFrame({ ...frame, offsetX: nextX, offsetY: nextY });
    } else if (frame.mode === 'split') {
      if (drag.isSplitTop) {
        const nextX = Math.max(-85, Math.min(85, Math.round((drag.startSplitTopX ?? -25) + pctX)));
        const nextY = Math.max(-60, Math.min(60, Math.round((drag.startSplitTopY ?? 0) + pctY)));
        onUpdateFrame({ ...frame, splitTopOffsetX: nextX, splitTopOffsetY: nextY });
      } else {
        const nextX = Math.max(-85, Math.min(85, Math.round((drag.startSplitBotX ?? 25) + pctX)));
        const nextY = Math.max(-60, Math.min(60, Math.round((drag.startSplitBotY ?? 0) + pctY)));
        onUpdateFrame({ ...frame, splitBottomOffsetX: nextX, splitBottomOffsetY: nextY });
      }
    }
  };

  const finishVideoDrag = (event: React.PointerEvent<HTMLVideoElement | HTMLDivElement>) => {
    const drag = videoDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (!drag.hasMoved) {
      onPlayPause();
    }

    videoDragRef.current = null;
    setIsVideoDragging(false);
  };

  // Drag Watermark Logic (Geser Watermark di Kanvas)
  const watermarkDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);
  const [isWatermarkDragging, setIsWatermarkDragging] = useState(false);

  const beginWatermarkDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const currX = frame.watermark?.positionX ?? (frame.watermark?.position?.includes('left') ? 15 : 85);
    const currY = frame.watermark?.positionY ?? (frame.watermark?.position?.includes('top') ? 6 : 92);

    watermarkDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosX: currX,
      startPosY: currY,
    };
    setIsWatermarkDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateWatermarkDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = watermarkDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !canvasRef.current) return;

    const bounds = canvasRef.current.getBoundingClientRect();
    const width = bounds.width || 360;
    const height = bounds.height || 640;

    const newX = Math.max(5, Math.min(95, Math.round(((event.clientX - bounds.left) / width) * 100)));
    const newY = Math.max(4, Math.min(96, Math.round(((event.clientY - bounds.top) / height) * 100)));

    onUpdateFrame({
      ...frame,
      watermark: {
        ...frame.watermark!,
        position: 'custom',
        positionX: newX,
        positionY: newY,
      },
    });
  };

  const finishWatermarkDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = watermarkDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    watermarkDragRef.current = null;
    setIsWatermarkDragging(false);
  };

  // Drag Headline / Hook Title Logic (Geser Headline Menggunakan Kursor di Kanvas tanpa Slider)
  const headlineDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);
  const [isHeadlineDragging, setIsHeadlineDragging] = useState(false);

  const beginHeadlineDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    const currX = frame.hookTitle?.positionX ?? 50;
    const currY = frame.hookTitle?.positionY ?? 6;

    headlineDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosX: currX,
      startPosY: currY,
    };
    setIsHeadlineDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateHeadlineDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = headlineDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !canvasRef.current) return;

    const bounds = canvasRef.current.getBoundingClientRect();
    const width = bounds.width || 360;
    const height = bounds.height || 640;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    let newX = Math.max(8, Math.min(92, Math.round(drag.startPosX + (deltaX / width) * 100)));
    let newY = Math.max(2, Math.min(92, Math.round(drag.startPosY + (deltaY / height) * 100)));

    // Magnet snap horizontal ke tengah persis (50%)
    if (Math.abs(newX - 50) <= 2.5) {
      newX = 50;
    }
    // Magnet snap vertikal ke titik populer (6% atas, 12% atas, 50% tengah, 85% bawah)
    if (Math.abs(newY - 6) <= 1.5) newY = 6;
    else if (Math.abs(newY - 12) <= 1.5) newY = 12;
    else if (Math.abs(newY - 50) <= 1.5) newY = 50;
    else if (Math.abs(newY - 85) <= 1.5) newY = 85;

    onUpdateFrame({
      ...frame,
      hookTitle: {
        ...frame.hookTitle!,
        positionX: newX,
        positionY: newY,
      },
    });
  };

  const finishHeadlineDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = headlineDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    headlineDragRef.current = null;
    setIsHeadlineDragging(false);
  };

  // Aspect ratio state for the video (default 16/9)
  const [videoAspect, setVideoAspect] = useState<number>(16 / 9);

  useEffect(() => {
    if (videoRef.current && videoRef.current.videoWidth && videoRef.current.videoHeight) {
      setVideoAspect(videoRef.current.videoWidth / videoRef.current.videoHeight);
    }
  }, [clip]);

  // Drag Resize / Zoom Logic for fit_blur, fit, social, and split modes (Seret Sudut Video)
  const zoomResizeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    centerX: number;
    centerY: number;
    initialDistance: number;
    startZoom: number;
    target?: 'main' | 'splitTop' | 'splitBottom';
  } | null>(null);
  const [isZoomResizing, setIsZoomResizing] = useState(false);
  const [zoomTarget, setZoomTarget] = useState<'main' | 'splitTop' | 'splitBottom'>('main');

  const beginZoomResize = (
    event: React.PointerEvent<HTMLDivElement>,
    _corner: 'tl' | 'tr' | 'bl' | 'br',
    target: 'main' | 'splitTop' | 'splitBottom' = 'main'
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canvasRef.current) return;

    let centerX: number;
    let centerY: number;
    let startZoom: number = frame.zoom || 1.0;

    if (target === 'splitTop' && videoRef.current) {
      const vBounds = videoRef.current.getBoundingClientRect();
      centerX = vBounds.left + vBounds.width / 2;
      centerY = vBounds.top + vBounds.height / 2;
      startZoom = frame.splitTopZoom ?? frame.zoom ?? 1.0;
    } else if (target === 'splitBottom' && splitBottomVideoRef.current) {
      const vBounds = splitBottomVideoRef.current.getBoundingClientRect();
      centerX = vBounds.left + vBounds.width / 2;
      centerY = vBounds.top + vBounds.height / 2;
      startZoom = frame.splitBottomZoom ?? frame.zoom ?? 1.0;
    } else if (videoRef.current) {
      const vBounds = videoRef.current.getBoundingClientRect();
      centerX = vBounds.left + vBounds.width / 2;
      centerY = vBounds.top + vBounds.height / 2;
      startZoom = frame.zoom || 1.0;
    } else {
      const bounds = canvasRef.current.getBoundingClientRect();
      const width = bounds.width || 360;
      const height = bounds.height || 640;
      centerX = bounds.left + width / 2 + (width * (frame.offsetX || 0)) / 100;
      centerY = bounds.top + height / 2 + (height * (frame.offsetY || 0)) / 100;
      startZoom = frame.zoom || 1.0;
    }

    const initialDistance = Math.hypot(event.clientX - centerX, event.clientY - centerY);

    zoomResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      centerX,
      centerY,
      initialDistance: Math.max(15, initialDistance),
      startZoom,
      target,
    };

    setIsZoomResizing(true);
    setZoomTarget(target);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateZoomResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = zoomResizeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const currentDistance = Math.hypot(event.clientX - drag.centerX, event.clientY - drag.centerY);
    const scaleFactor = currentDistance / drag.initialDistance;

    const nextZoom = Math.min(3.0, Math.max(0.4, drag.startZoom * scaleFactor));
    const rounded = Math.round(nextZoom * 100) / 100;

    if (drag.target === 'splitTop') {
      const current = frame.splitTopZoom ?? frame.zoom ?? 1.0;
      if (Math.abs(rounded - current) >= 0.01) {
        onUpdateFrame({
          ...frame,
          splitTopZoom: rounded,
        });
      }
    } else if (drag.target === 'splitBottom') {
      const current = frame.splitBottomZoom ?? frame.zoom ?? 1.0;
      if (Math.abs(rounded - current) >= 0.01) {
        onUpdateFrame({
          ...frame,
          splitBottomZoom: rounded,
        });
      }
    } else {
      if (Math.abs(rounded - (frame.zoom || 1.0)) >= 0.01) {
        onUpdateFrame({
          ...frame,
          zoom: rounded,
        });
      }
    }
  };

  const finishZoomResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = zoomResizeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    zoomResizeRef.current = null;
    setIsZoomResizing(false);
  };

  // Drag Resize Divider for Podcast Split Mode (Tarik Garis Pembatas Pembicara 1 & 2)
  const splitDividerDragRef = useRef<{
    pointerId: number;
    startY: number;
    canvasHeight: number;
    startRatio: number;
  } | null>(null);
  const [isSplitDividerDragging, setIsSplitDividerDragging] = useState(false);

  const beginSplitDividerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canvasRef.current) return;
    const bounds = canvasRef.current.getBoundingClientRect();
    splitDividerDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      canvasHeight: bounds.height || 640,
      startRatio: frame.splitRatio ?? 50,
    };
    setIsSplitDividerDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateSplitDividerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = splitDividerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaY = event.clientY - drag.startY;
    const deltaYPct = (deltaY / drag.canvasHeight) * 100;
    const nextRatio = Math.max(20, Math.min(80, Math.round(drag.startRatio + deltaYPct)));
    if (nextRatio !== (frame.splitRatio ?? 50)) {
      onUpdateFrame({
        ...frame,
        splitRatio: nextRatio,
      });
    }
  };

  const finishSplitDividerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = splitDividerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    splitDividerDragRef.current = null;
    setIsSplitDividerDragging(false);
  };

  // Drag Resize Frame Divider for Social Mode (Tarik Garis Pembatas Atas / Bawah / Kiri / Kanan)
  const socialDividerDragRef = useRef<{
    pointerId: number;
    divider: 'top' | 'bottom' | 'left' | 'right';
    startX: number;
    startY: number;
    canvasWidth: number;
    canvasHeight: number;
    startHeaderPosY: number;
    startFooterPosY: number;
    startPadding: number;
  } | null>(null);
  const [isSocialDividerDragging, setIsSocialDividerDragging] = useState<false | 'top' | 'bottom' | 'left' | 'right'>(false);

  const beginSocialDividerDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    divider: 'top' | 'bottom' | 'left' | 'right'
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canvasRef.current) return;
    const bounds = canvasRef.current.getBoundingClientRect();
    const sp = frame.socialProfile ?? {
      accountName: '@username',
      accountHandle: 'Content Creator',
      avatarUrl: '',
      bgColor: '#FFFFFF',
      textColor: '#000000',
      handleColor: '#4B5563',
      accentColor: '#0095F6',
      verifiedBadgeColor: '#0095F6',
      headerHeight: 18,
      footerHeight: 8,
      headerGap: 16,
      footerGap: 16,
      headerPosY: 6,
      footerPosY: 91,
      headerBarHeight: 48,
      footerBarHeight: 34,
      headerPaddingX: 0,
      videoFrameHeight: 66,
      videoFrameOffsetY: 0,
      footerText: 'Follow for more! 🔥',
      showVerifiedBadge: true,
      showFollowButton: false,
      cardStyle: 'flat',
      videoFrameBg: '#000000',
      framePadding: 0,
      frameBorderRadius: 0,
    };

    const currentHdrPosY = sp.headerPosY ?? 6;
    const currentFtrPosY = sp.footerPosY ?? 91;

    socialDividerDragRef.current = {
      pointerId: event.pointerId,
      divider,
      startX: event.clientX,
      startY: event.clientY,
      canvasWidth: bounds.width || 360,
      canvasHeight: bounds.height || 640,
      startHeaderPosY: currentHdrPosY,
      startFooterPosY: currentFtrPosY,
      startPadding: sp.framePadding ?? 0,
    };
    setIsSocialDividerDragging(divider);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateSocialDividerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = socialDividerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const sp = frame.socialProfile ?? {
      accountName: '@username',
      accountHandle: 'Content Creator',
      avatarUrl: '',
      bgColor: '#FFFFFF',
      textColor: '#000000',
      handleColor: '#4B5563',
      accentColor: '#0095F6',
      verifiedBadgeColor: '#0095F6',
      headerHeight: 18,
      footerHeight: 8,
      headerGap: 16,
      footerGap: 16,
      headerPosY: 6,
      footerPosY: 91,
      headerBarHeight: 48,
      footerBarHeight: 34,
      headerPaddingX: 0,
      videoFrameHeight: 66,
      videoFrameOffsetY: 0,
      footerText: 'Follow for more! 🔥',
      showVerifiedBadge: true,
      showFollowButton: false,
      cardStyle: 'flat',
      videoFrameBg: '#000000',
      framePadding: 0,
      frameBorderRadius: 0,
    };

    if (drag.divider === 'top') {
      // Tarik ke atas (-) = Header naik (headerPosY mengecil)
      // Tarik ke bawah (+) = Header turun (headerPosY membesar)
      const deltaYPct = (deltaY / drag.canvasHeight) * 100;
      const nextHdrY = Math.max(0, Math.min(35, Math.round(drag.startHeaderPosY + deltaYPct)));
      if (nextHdrY !== (sp.headerPosY ?? 6)) {
        onUpdateFrame({
          ...frame,
          socialProfile: {
            ...sp,
            headerPosY: nextHdrY,
          },
        });
      }
    } else if (drag.divider === 'bottom') {
      // Tarik ke atas (-) = Footer naik (footerPosY mengecil)
      // Tarik ke bawah (+) = Footer turun (footerPosY membesar)
      const deltaYPct = (deltaY / drag.canvasHeight) * 100;
      const nextFtrY = Math.max(65, Math.min(96, Math.round(drag.startFooterPosY + deltaYPct)));
      if (nextFtrY !== (sp.footerPosY ?? 91)) {
        onUpdateFrame({
          ...frame,
          socialProfile: {
            ...sp,
            footerPosY: nextFtrY,
          },
        });
      }
    } else if (drag.divider === 'left') {
      // Tarik garis kiri: geser ke kanan (+) = padding bertambah (frame menyempit), geser ke kiri (-) = melebar
      const nextPad = Math.max(0, Math.min(48, Math.round(drag.startPadding + deltaX)));
      if (nextPad !== (sp.framePadding ?? 0)) {
        onUpdateFrame({
          ...frame,
          socialProfile: {
            ...sp,
            framePadding: nextPad,
          },
        });
      }
    } else if (drag.divider === 'right') {
      // Tarik garis kanan: geser ke kiri (-) = padding bertambah (frame menyempit), geser ke kanan (+) = melebar
      const nextPad = Math.max(0, Math.min(48, Math.round(drag.startPadding - deltaX)));
      if (nextPad !== (sp.framePadding ?? 0)) {
        onUpdateFrame({
          ...frame,
          socialProfile: {
            ...sp,
            framePadding: nextPad,
          },
        });
      }
    }
  };

  const finishSocialDividerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = socialDividerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    socialDividerDragRef.current = null;
    setIsSocialDividerDragging(false);
  };

  // Touchpad Pinch-to-zoom & Mouse Wheel Zoom (Pinch mousepad laptop untuk zoom)
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const handleWheel = (e: WheelEvent) => {
      // Aktif pada mode fit_blur, fit, social, dan split (zoom dengan cursor scroll / pinch touchpad)
      if (frame.mode !== 'fit_blur' && frame.mode !== 'fit' && frame.mode !== 'social' && frame.mode !== 'split') return;

      // Cegah default zoom halaman browser
      e.preventDefault();

      let zoomDelta = 0;
      if (e.ctrlKey) {
        // Trackpad pinch gesture (dua jari mencubit / melebarkan di mousepad)
        zoomDelta = -e.deltaY * 0.008;
      } else {
        // Wheel mouse biasa atau scroll 2 jari
        zoomDelta = -Math.sign(e.deltaY) * 0.04;
      }

      if (frame.mode === 'split') {
        const bounds = canvasEl.getBoundingClientRect();
        const splitRatio = (frame.splitRatio ?? 50) / 100;
        const dividerY = bounds.top + bounds.height * splitRatio;
        const isTop = e.clientY < dividerY;

        if (isTop) {
          const currentZoom = frame.splitTopZoom ?? frame.zoom ?? 1.0;
          const nextZoom = Math.min(3.0, Math.max(0.4, currentZoom + zoomDelta));
          const rounded = Math.round(nextZoom * 100) / 100;
          if (Math.abs(rounded - currentZoom) >= 0.01) {
            onUpdateFrame({ ...frame, splitTopZoom: rounded });
          }
        } else {
          const currentZoom = frame.splitBottomZoom ?? frame.zoom ?? 1.0;
          const nextZoom = Math.min(3.0, Math.max(0.4, currentZoom + zoomDelta));
          const rounded = Math.round(nextZoom * 100) / 100;
          if (Math.abs(rounded - currentZoom) >= 0.01) {
            onUpdateFrame({ ...frame, splitBottomZoom: rounded });
          }
        }
        return;
      }

      const currentZoom = frame.zoom ?? 1.0;
      const nextZoom = Math.min(2.5, Math.max(0.4, currentZoom + zoomDelta));
      const rounded = Math.round(nextZoom * 100) / 100;

      if (Math.abs(rounded - currentZoom) >= 0.01) {
        onUpdateFrame({
          ...frame,
          zoom: rounded,
        });
      }
    };

    canvasEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvasEl.removeEventListener('wheel', handleWheel);
    };
  }, [frame, onUpdateFrame]);

  // Dynamic Real-Time Active Tracking Offset X (Active Speaker & Smooth Follow)
  const activeTracking = useMemo(() => {
    // Pada mode social, fit, dan fit_blur, gunakan manual frame.offsetX agar video bisa digeser bebas ke kiri/kanan
    if (frame.faceTracking === false || frame.mode === 'social' || frame.mode === 'fit' || frame.mode === 'fit_blur') {
      return {
        offsetX: frame.offsetX || 0,
        badgeText: null,
      };
    }

    // Hitung waktu playback relatif terhadap awal klip (start 0.0s)
    const inPoint = clip ? Math.max(0, (clip.start_sec || 0) - (clip.preview_start_sec ?? 0)) : 0;
    const clipTime = Math.max(0, currentTime - inPoint);

    // 1. Mode Auto-Switch (Podcast Multi-Cam Cuts)
    if (frame.trackingMode === 'auto_switch' && frame.speakerShots && frame.speakerShots.length > 0) {
      const activeShot = frame.speakerShots.find(
        (s) => clipTime >= s.start && clipTime < s.end
      ) || frame.speakerShots[frame.speakerShots.length - 1];

      let chosenOffsetX = activeShot.offsetX;
      if (frame.detectedSpeakers && frame.detectedSpeakers.length > 0) {
        const matchingSpk = frame.detectedSpeakers.find((s) => s.id === activeShot.speakerId);
        if (matchingSpk && matchingSpk.offset_x !== undefined) {
          chosenOffsetX = matchingSpk.offset_x;
        }
      }

      // Safety Gate: Jika offset shot berada di tengah-tengah kosong (|chosenOffsetX| < 8%)
      // dan ada 2 pembicara di samping, jangan biarkan kamera menyorot tengah kosong!
      if (frame.mode === 'crop' && frame.detectedSpeakers && frame.detectedSpeakers.length >= 2) {
        const spks = frame.detectedSpeakers;
        if (Math.abs(spks[0].offset_x - spks[spks.length - 1].offset_x) > 16) {
          if (Math.abs(chosenOffsetX) < 8) {
            const prim = spks.find((s) => s.is_primary) || spks[0];
            chosenOffsetX = prim.offset_x;
          }
        }
      }

      return {
        offsetX: chosenOffsetX,
        badgeText: `🎯 Multi-Cam Cut: ${activeShot.label} (${chosenOffsetX > 0 ? `+${Math.round(chosenOffsetX)}` : Math.round(chosenOffsetX)}%)`,
      };
    }

    // 2. Mode Smooth Follow (Presenter Bergerak / Pelacakan Wajah Dinamis dengan Catmull-Rom Spline)
    if (frame.trackingMode === 'smooth_follow' && frame.trackingKeyframes && frame.trackingKeyframes.length > 1) {
      const kfs = frame.trackingKeyframes;
      let interpX = kfs[0].offsetX;
      if (clipTime <= kfs[0].time) {
        interpX = kfs[0].offsetX;
      } else if (clipTime >= kfs[kfs.length - 1].time) {
        interpX = kfs[kfs.length - 1].offsetX;
      } else {
        for (let i = 0; i < kfs.length - 1; i++) {
          if (clipTime >= kfs[i].time && clipTime <= kfs[i + 1].time) {
            const t0 = kfs[i].time;
            const t1 = kfs[i + 1].time;
            const p1 = kfs[i].offsetX;
            const p2 = kfs[i + 1].offsetX;
            const diff = Math.abs(p2 - p1);

            if (diff > 18.0) {
              // Lompatan antar orang berbeda: POTONG LANGSUNG (Instant Cut) di titik tengah!
              // Jangan pernah meluncur perlahan melintasi ruang kosong / meja di tengah!
              interpX = (clipTime - t0) >= (t1 - t0) * 0.5 ? p2 : p1;
            } else {
              let p0 = i > 0 ? kfs[i - 1].offsetX : p1;
              let p3 = i + 2 < kfs.length ? kfs[i + 2].offsetX : p2;

              // Clamp tangents jika segmen tetangga adalah cut
              if (Math.abs(p1 - p0) > 18.0) p0 = p1;
              if (Math.abs(p3 - p2) > 18.0) p3 = p2;

              const dt = Math.max(0.001, t1 - t0);
              const u = Math.max(0, Math.min(1, (clipTime - t0) / dt));

              // Catmull-Rom polynomial coefficients
              const c0 = p1;
              const c1 = 0.5 * (p2 - p0);
              const c2 = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
              const c3 = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;

              interpX = c0 + u * (c1 + u * (c2 + u * c3));
            }
            break;
          }
        }
      }

      // Safety Gate: Jika multi-speaker di mana pembicara hanya di kiri & kanan,
      // jangan biarkan kamera jatuh ke tengah kosong (0%)
      if (frame.isMultiSpeaker && frame.detectedSpeakers && frame.detectedSpeakers.length >= 2) {
        const noCenterSpeaker = frame.detectedSpeakers.every((s) => Math.abs(s.offset_x) > 12);
        if (noCenterSpeaker && Math.abs(interpX) < 10) {
          const prim = frame.detectedSpeakers.find((s) => s.is_primary) || frame.detectedSpeakers[0];
          interpX = prim.offset_x;
        }
      }

      return {
        offsetX: interpX,
        badgeText: `🎥 Smooth Follow: ${interpX > 0 ? `+${Math.round(interpX)}` : Math.round(interpX)}%`,
      };
    }

    // 3. Mode Static Lock
    let off = frame.offsetX || 0;
    // Anti-Empty-Center Gate: Jika 2 pembicara terdeteksi di kiri & kanan dan kamera di tengah (|off| < 8%),
    // arahkan secara otomatis ke salah satu wajah pembicara (bukan meja kosong di tengah!)
    if (frame.mode === 'crop' && (frame.isMultiSpeaker || (frame.detectedSpeakers && frame.detectedSpeakers.length >= 2))) {
      const spks = frame.detectedSpeakers || [];
      if (spks.length >= 2 && Math.abs(spks[0].offset_x - spks[spks.length - 1].offset_x) > 16) {
        if (Math.abs(off) < 8) {
          const prim = spks.find((s) => s.is_primary) || spks[0];
          off = prim.offset_x;
        }
      }
    }

    return {
      offsetX: off,
      badgeText: Math.abs(off) > 1.5 ? `🔒 AI Lock: ${off > 0 ? `Kanan +${Math.round(off)}` : `Kiri ${Math.round(off)}`}%` : null,
    };
  }, [frame, currentTime, clip]);

  // Hitung timestamp real di video asli untuk sinkronisasi teks subtitle
  const realTime = useMemo(() => {
    if (!clip) return 0;
    const offset = clip.preview_start_sec ?? 0;
    return offset + currentTime;
  }, [clip, currentTime]);

  // Siapkan kelompok kata subtitle
  const groups = useMemo(() => {
    return buildGroups(captionSegments, style.wordsPerLine || 3);
  }, [captionSegments, style.wordsPerLine]);

  // Cari kelompok kata yang aktif pada timestamp detik ini
  const activeGroup = useMemo(() => {
    return groups.find((g) => realTime >= g.start && realTime <= g.end) || null;
  }, [groups, realTime]);

  // OpenCut In-Place Caption Editing Logic
  const handleCaptionDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!activeGroup) return;
    const currentText = activeGroup.words.map((w) => w.w).join(' ');
    setInPlaceEditText(currentText);
    setIsEditingInPlace(true);
  };

  const commitInPlaceEdit = () => {
    if (!isEditingInPlace) return;
    setIsEditingInPlace(false);
    const trimmed = inPlaceEditText.trim();
    if (!trimmed || !activeGroup) return;

    // Temukan segmen transkrip asal yang mencakup kelompok kata ini
    const groupStart = activeGroup.start;
    const groupEnd = activeGroup.end;
    const segIdx = captionSegments.findIndex(
      (s) => s.start <= groupEnd + 0.15 && s.end >= groupStart - 0.15
    );

    if (segIdx !== -1) {
      const seg = captionSegments[segIdx];
      const toks = trimmed.split(/\s+/).filter(Boolean);
      const dur = Math.max(0.1, seg.end - seg.start);
      const step = dur / toks.length;
      const newWords = toks.map((w, idx) => ({
        w,
        s: seg.start + idx * step,
        e: seg.start + (idx + 1) * step,
        hl: false,
      }));

      const nextSegments = [...captionSegments];
      nextSegments[segIdx] = {
        ...seg,
        text: trimmed,
        words: newWords,
      };
      onUpdateSegments?.(nextSegments);
    }
  };

  // Sync volume & mute audio ke video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = Math.min(1.0, Math.max(0, audio.volume));
      videoRef.current.muted = audio.muted;
    }
  }, [audio, videoRef]);

  // Sync playback speed (OpenCut Retime) ke elemen video
  useEffect(() => {
    const sp = frame.speed || 1.0;
    if (videoRef.current) videoRef.current.playbackRate = sp;
    if (bgVideoRef.current) bgVideoRef.current.playbackRate = sp;
    if (splitBottomVideoRef.current) splitBottomVideoRef.current.playbackRate = sp;
  }, [frame.speed, videoRef]);

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Ambil URL file video preview dari storage
  const videoSrc = useMemo(() => {
    if (!clip) return '';
    const path = clip.preview_path || clip.export_path;
    return path ? `/api/files/${path}` : '';
  }, [clip]);

  // Rasio container canvas dinamis & responsif (mengisi maksimal area stage)
  const getRatioClass = () => {
    switch (frame.ratio) {
      case '9:16':
        return 'aspect-[9/16] h-full max-h-full max-w-full w-auto';
      case '1:1':
        return 'aspect-square h-full max-h-full max-w-full w-auto';
      case '16:9':
        return 'aspect-video w-full max-w-full max-h-full h-auto';
      default:
        return 'aspect-[9/16] h-full max-h-full max-w-full w-auto';
    }
  };

  const getRatioStyle = (): React.CSSProperties => {
    const scaleMap: Record<string, number> = {
      '75%': 0.75,
      '100%': 1.0,
      '125%': 1.25,
      '150%': 1.5,
    };
    if (zoomLevel === 'fit') {
      return { transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)' };
    }
    const scale = scaleMap[zoomLevel] || 1;
    return {
      transform: `scale(${scale})`,
      transformOrigin: 'center center',
      transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    };
  };

  return (
    <section
      ref={containerRef}
      className="flex-1 flex flex-col bg-surface-container-lowest rounded-lg shadow-inner overflow-hidden relative select-none"
    >
      {/* Player Header Toolbar */}
      <div className="video-player-toolbar h-8.5 px-2.5 flex items-center justify-between bg-surface-container-low/70 border-b border-surface-container-highest/30 gap-2 shrink-0">
        <div className="video-player-tools flex items-center gap-2">
          {/* Toggle Left Editor Panel */}
          {onToggleLeftPanel && (
            <button
              type="button"
              onClick={onToggleLeftPanel}
              className={`h-7 px-2.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors border shadow-sm ${
                !isLeftPanelCollapsed
                  ? 'bg-surface-container-high text-on-surface hover:bg-surface-bright border-outline-variant/20'
                  : 'bg-primary text-on-primary border-primary shadow-primary/20 hover:brightness-105'
              }`}
              title={isLeftPanelCollapsed ? 'Buka Panel Editor (Teks & Style)' : 'Sembunyikan Panel Editor'}
            >
              {isLeftPanelCollapsed ? (
                <PanelLeft className="w-3.5 h-3.5" />
              ) : (
                <PanelLeftClose className="w-3.5 h-3.5" />
              )}
              <span>Panel</span>
            </button>
          )}

          {/* Aspect Ratio Selector */}
          <div className="relative group flex items-center h-7">
            <select
              aria-label="Aspect Ratio"
              value={frame.ratio}
              onChange={(e) => onUpdateFrame({ ...frame, ratio: e.target.value as any })}
              className="h-7 bg-surface-container-highest/90 text-on-surface text-xs font-semibold pl-2.5 pr-6 rounded-md cursor-pointer hover:bg-surface-bright transition-colors border border-outline-variant/20 outline-none appearance-none shadow-sm"
            >
              <option value="9:16">9:16 (Shorts/TikTok)</option>
              <option value="1:1">1:1 (Square Feed)</option>
              <option value="16:9">16:9 (Landscape)</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-outline absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Zoom / Ukuran Preview Selector */}
          <div className="h-7 flex items-center bg-surface-container px-1 rounded-md text-xs border border-outline-variant/20 shadow-sm gap-0.5">
            <span className="text-outline px-1 text-[10px] uppercase font-bold tracking-wider">Zoom:</span>
            {(['fit', '100%', '125%', '150%'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setZoomLevel(level)}
                className={`h-5.5 px-2 rounded text-[11px] font-semibold transition-colors ${
                  zoomLevel === level
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
                title={level === 'fit' ? 'Fit otomatis maksimal (mengisi layar secara proporsional)' : `Ukuran ${level}`}
              >
                {level === 'fit' ? 'Fit' : level}
              </button>
            ))}
          </div>
        </div>

        <div className="video-player-actions flex items-center gap-2">
          {/* Direct Download HD Button */}
          {videoSrc && (
            <a
              href={videoSrc}
              download={`${clip?.title || 'clip'}_HD_1080p.mp4`}
              className="h-7 px-2.5 rounded-md bg-secondary/15 hover:bg-secondary/25 text-secondary text-xs font-semibold flex items-center gap-1.5 transition-colors border border-secondary/30 shadow-sm"
              title="Download video preview klip ini langsung dalam Full HD (1080p MP4)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download HD</span>
            </a>
          )}

          {/* Safe Guides / Platform Overlay Button */}
          {onToggleSafeGuides && (
            <button
              type="button"
              onClick={onToggleSafeGuides}
              className={`h-7 px-2.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors border shadow-sm ${
                safeGuides
                  ? 'bg-primary/20 text-primary border-primary/40 font-bold'
                  : 'bg-surface-container text-outline hover:text-on-surface hover:bg-surface-bright border-outline-variant/20'
              }`}
              title="Panduan Area Aman Konten (Safe Zone - TikTok / Reels / Shorts)"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              <span>Safe Zone</span>
            </button>
          )}

          {/* Kecepatan Video Active Badge */}
          {frame.speed && frame.speed !== 1.0 && (
            <span
              className="h-7 px-2 rounded-md bg-amber-500/15 text-amber-400 font-mono text-[11px] font-bold flex items-center gap-1 border border-amber-500/30 shadow-sm"
              title={`Kecepatan Putar Aktif: ${frame.speed}x (Pitch Preserved)`}
            >
              <Gauge className="w-3 h-3 text-amber-400" />
              {frame.speed}x
            </span>
          )}

          </div>
      </div>

      {/* Video Canvas Stage */}
      <div ref={stageRef} className="video-canvas-stage flex-1 flex items-center justify-center relative p-1 sm:p-2 overflow-hidden bg-surface-dim">
        {/* Subtle Canvas Ambient Glow Backdrop */}
        <div className="absolute w-72 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        {/* Video Bounding Frame */}
        <div
          ref={canvasRef}
          onClick={(event) => {
            if (!(event.target as HTMLElement).closest('[data-caption-overlay]')) {
              setCaptionSelected(false);
            }
          }}
          style={{
            ...getRatioStyle(),
            ...(canvasSize.width && canvasSize.height
              ? { width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }
              : {}),
            ...(frame.mode === 'fit' ? { backgroundColor: frame.fitColor || '#000000' } : {}),
          }}
          className={`relative ${getRatioClass()} ${frame.mode === 'fit' ? '' : 'bg-black'} shadow-2xl rounded overflow-hidden flex items-center justify-center border border-outline-variant/30 group`}
        >
          {videoSrc ? (
            frame.mode === 'split' ? (
              /* DUAL-SPEAKER PODCAST SPLIT (ATAS - BAWAH) */
              <div className="relative z-10 w-full h-full flex flex-col overflow-hidden bg-black select-none">
                {/* Box Atas: Pembicara 1 */}
                <div
                  className="w-full relative overflow-hidden shrink-0 group/top cursor-grab active:cursor-grabbing bg-neutral-950"
                  style={{ height: `${frame.splitRatio ?? 50}%` }}
                  onPointerDown={(e) => beginVideoDrag(e, 'top')}
                  onPointerMove={updateVideoDrag}
                  onPointerUp={finishVideoDrag}
                  onPointerCancel={finishVideoDrag}
                >
                  {/* Blurred background video for when zoom < 1.55 (Fit Mode Utuh) */}
                  <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none opacity-40">
                    <video
                      src={videoSrc}
                      className="w-full h-full object-cover scale-125 filter blur-xl brightness-50"
                      muted
                      playsInline
                    />
                  </div>

                  {/* Main Video (object-contain: frame video 100% utuh tidak pernah terpotong permanen) */}
                  <video
                    ref={videoRef}
                    src={videoSrc}
                    className="relative z-10 w-full h-full object-contain pointer-events-none select-none drop-shadow-2xl"
                    style={{
                      transform: `translate(${frame.splitTopOffsetX ?? 0}%, ${frame.splitTopOffsetY ?? 0}%) scale(${frame.splitTopZoom ?? frame.zoom ?? 1.0})`,
                      transformOrigin: 'center center',
                      filter: getVideoFilterCss(frame),
                      transition: isVideoDragging || isZoomResizing ? 'none' : 'transform 0.15s cubic-bezier(0.2, 0, 0, 1)',
                    }}
                    playsInline
                  />
                  <div className="absolute top-2 left-2 z-20 pointer-events-none px-2 py-0.5 rounded bg-black/70 backdrop-blur-md border border-white/15 text-[10px] text-primary font-medium flex items-center gap-1 shadow-sm">
                    <Users className="w-3 h-3 text-primary" />
                    <span>Pembicara 1 (Atas)</span>
                  </div>

                  {/* Corner Resize Handles for Pembicara 1 (Atas) */}
                  <div
                    className={`absolute inset-0 pointer-events-none select-none transition-opacity duration-150 ${
                      isZoomResizing && zoomTarget === 'splitTop' ? 'opacity-100' : 'opacity-85 hover:opacity-100'
                    }`}
                  >
                    <div
                      className={`w-full h-full relative transition-all duration-100 ${
                        isZoomResizing && zoomTarget === 'splitTop'
                          ? 'border-2 border-primary ring-2 ring-primary/40 shadow-[0_0_20px_rgba(56,189,248,0.5)]'
                          : 'border border-primary/40 group-hover/top:border-primary/80'
                      }`}
                    >
                      {/* Top-Left Corner */}
                      <div
                        data-zoom-handle
                        onPointerDown={(e) => beginZoomResize(e, 'tl', 'splitTop')}
                        onPointerMove={updateZoomResize}
                        onPointerUp={finishZoomResize}
                        onPointerCancel={finishZoomResize}
                        className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-primary border-2 border-white shadow-md cursor-nwse-resize pointer-events-auto hover:scale-125 active:scale-110 transition-transform z-30"
                        title="Tarik sudut untuk zoom Pembicara 1"
                      />
                      {/* Top-Right Corner */}
                      <div
                        data-zoom-handle
                        onPointerDown={(e) => beginZoomResize(e, 'tr', 'splitTop')}
                        onPointerMove={updateZoomResize}
                        onPointerUp={finishZoomResize}
                        onPointerCancel={finishZoomResize}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary border-2 border-white shadow-md cursor-nesw-resize pointer-events-auto hover:scale-125 active:scale-110 transition-transform z-30"
                        title="Tarik sudut untuk zoom Pembicara 1"
                      />
                      {/* Bottom-Left Corner */}
                      <div
                        data-zoom-handle
                        onPointerDown={(e) => beginZoomResize(e, 'bl', 'splitTop')}
                        onPointerMove={updateZoomResize}
                        onPointerUp={finishZoomResize}
                        onPointerCancel={finishZoomResize}
                        className="absolute -bottom-1.5 -left-1.5 w-4 h-4 rounded-full bg-primary border-2 border-white shadow-md cursor-nesw-resize pointer-events-auto hover:scale-125 active:scale-110 transition-transform z-30"
                        title="Tarik sudut untuk zoom Pembicara 1"
                      />
                      {/* Bottom-Right Corner */}
                      <div
                        data-zoom-handle
                        onPointerDown={(e) => beginZoomResize(e, 'br', 'splitTop')}
                        onPointerMove={updateZoomResize}
                        onPointerUp={finishZoomResize}
                        onPointerCancel={finishZoomResize}
                        className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary border-2 border-white shadow-md cursor-nwse-resize pointer-events-auto hover:scale-125 active:scale-110 transition-transform z-30"
                        title="Tarik sudut untuk zoom Pembicara 1"
                      />

                      {/* Live Scale Badge while Resizing Top Video */}
                      {isZoomResizing && zoomTarget === 'splitTop' && (
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-primary text-black font-mono font-bold text-[10px] px-2 py-0.5 rounded shadow-lg pointer-events-none flex items-center gap-1 z-40">
                          <Maximize2 className="w-3 h-3" />
                          <span>P1 Zoom: {Math.round((frame.splitTopZoom ?? frame.zoom ?? 1.0) * 100)}% ({Number(frame.splitTopZoom ?? frame.zoom ?? 1.0).toFixed(2)}x)</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Garis Pemisah Interaktif Pembicara 1 & 2 (Drag Divider Line) */}
                <div
                  onPointerDown={beginSplitDividerDrag}
                  onPointerMove={updateSplitDividerDrag}
                  onPointerUp={finishSplitDividerDrag}
                  onPointerCancel={finishSplitDividerDrag}
                  className="w-full shrink-0 relative z-30 cursor-row-resize group/split-divider flex items-center justify-center select-none touch-none h-4 -my-2"
                  title="Tarik ke atas atau ke bawah untuk mengatur perbandingan layar Podcast (20% - 80%)"
                >
                  <div
                    className={`w-full transition-all duration-150 ${
                      isSplitDividerDragging
                        ? 'h-1 bg-primary shadow-[0_0_12px_rgba(76,215,246,1)]'
                        : 'h-[2px] bg-sky-400 group-hover/split-divider:h-[3px] group-hover/split-divider:bg-primary shadow-sm'
                    }`}
                    style={{
                      backgroundColor: isSplitDividerDragging ? undefined : (frame.splitDividerColor || '#38BDF8'),
                    }}
                  />
                  <div
                    className={`absolute px-2 py-0.5 rounded-full text-[9px] font-mono font-bold transition-all duration-150 flex items-center gap-1 shadow-md pointer-events-none ${
                      isSplitDividerDragging
                        ? 'bg-primary text-on-primary scale-105'
                        : 'bg-black/80 text-primary border border-primary/40 opacity-0 group-hover/split-divider:opacity-100'
                    }`}
                  >
                    <GripHorizontal className="w-2.5 h-2.5" />
                    <span>{frame.splitRatio ?? 50} : {100 - (frame.splitRatio ?? 50)}</span>
                  </div>
                </div>

                {/* Floating Ratio Badge saat drag divider berlangsung */}
                {isSplitDividerDragging && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/90 backdrop-blur-md text-white border border-primary/60 px-3.5 py-1.5 rounded-xl shadow-2xl flex items-center gap-2 z-50 pointer-events-none">
                    <Users className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-xs font-mono font-bold text-primary">
                      Atas: {frame.splitRatio ?? 50}% • Bawah: {100 - (frame.splitRatio ?? 50)}%
                    </span>
                  </div>
                )}

                {/* Box Bawah: Pembicara 2 */}
                <div
                  className="w-full flex-1 relative overflow-hidden group/bot cursor-grab active:cursor-grabbing bg-neutral-950"
                  onPointerDown={(e) => beginVideoDrag(e, 'bottom')}
                  onPointerMove={updateVideoDrag}
                  onPointerUp={finishVideoDrag}
                  onPointerCancel={finishVideoDrag}
                >
                  {/* Blurred background video for when zoom < 1.55 (Fit Mode Utuh) */}
                  <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none opacity-40">
                    <video
                      src={videoSrc}
                      className="w-full h-full object-cover scale-125 filter blur-xl brightness-50"
                      muted
                      playsInline
                    />
                  </div>

                  {/* Main Video (object-contain: frame video 100% utuh tidak pernah terpotong permanen) */}
                  <video
                    ref={splitBottomVideoRef}
                    src={videoSrc}
                    className="relative z-10 w-full h-full object-contain pointer-events-none select-none drop-shadow-2xl"
                    style={{
                      transform: `translate(${frame.splitBottomOffsetX ?? 0}%, ${frame.splitBottomOffsetY ?? 0}%) scale(${frame.splitBottomZoom ?? frame.zoom ?? 1.0})`,
                      transformOrigin: 'center center',
                      filter: getVideoFilterCss(frame),
                      transition: isVideoDragging || isZoomResizing ? 'none' : 'transform 0.15s cubic-bezier(0.2, 0, 0, 1)',
                    }}
                    muted
                    playsInline
                  />
                  <div className="absolute bottom-2 left-2 z-20 pointer-events-none px-2 py-0.5 rounded bg-black/70 backdrop-blur-md border border-white/15 text-[10px] text-secondary font-medium flex items-center gap-1 shadow-sm">
                    <Users className="w-3 h-3 text-secondary" />
                    <span>Pembicara 2 (Bawah)</span>
                  </div>

                  {/* Corner Resize Handles for Pembicara 2 (Bawah) */}
                  <div
                    className={`absolute inset-0 pointer-events-none select-none transition-opacity duration-150 ${
                      isZoomResizing && zoomTarget === 'splitBottom' ? 'opacity-100' : 'opacity-85 hover:opacity-100'
                    }`}
                  >
                    <div
                      className={`w-full h-full relative transition-all duration-100 ${
                        isZoomResizing && zoomTarget === 'splitBottom'
                          ? 'border-2 border-emerald-400 ring-2 ring-emerald-400/40 shadow-[0_0_20px_rgba(52,211,153,0.5)]'
                          : 'border border-emerald-400/40 group-hover/bot:border-emerald-400/80'
                      }`}
                    >
                      {/* Top-Left Corner */}
                      <div
                        data-zoom-handle
                        onPointerDown={(e) => beginZoomResize(e, 'tl', 'splitBottom')}
                        onPointerMove={updateZoomResize}
                        onPointerUp={finishZoomResize}
                        onPointerCancel={finishZoomResize}
                        className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-md cursor-nwse-resize pointer-events-auto hover:scale-125 active:scale-110 transition-transform z-30"
                        title="Tarik sudut untuk zoom Pembicara 2"
                      />
                      {/* Top-Right Corner */}
                      <div
                        data-zoom-handle
                        onPointerDown={(e) => beginZoomResize(e, 'tr', 'splitBottom')}
                        onPointerMove={updateZoomResize}
                        onPointerUp={finishZoomResize}
                        onPointerCancel={finishZoomResize}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-md cursor-nesw-resize pointer-events-auto hover:scale-125 active:scale-110 transition-transform z-30"
                        title="Tarik sudut untuk zoom Pembicara 2"
                      />
                      {/* Bottom-Left Corner */}
                      <div
                        data-zoom-handle
                        onPointerDown={(e) => beginZoomResize(e, 'bl', 'splitBottom')}
                        onPointerMove={updateZoomResize}
                        onPointerUp={finishZoomResize}
                        onPointerCancel={finishZoomResize}
                        className="absolute -bottom-1.5 -left-1.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-md cursor-nesw-resize pointer-events-auto hover:scale-125 active:scale-110 transition-transform z-30"
                        title="Tarik sudut untuk zoom Pembicara 2"
                      />
                      {/* Bottom-Right Corner */}
                      <div
                        data-zoom-handle
                        onPointerDown={(e) => beginZoomResize(e, 'br', 'splitBottom')}
                        onPointerMove={updateZoomResize}
                        onPointerUp={finishZoomResize}
                        onPointerCancel={finishZoomResize}
                        className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-md cursor-nwse-resize pointer-events-auto hover:scale-125 active:scale-110 transition-transform z-30"
                        title="Tarik sudut untuk zoom Pembicara 2"
                      />

                      {/* Live Scale Badge while Resizing Bottom Video */}
                      {isZoomResizing && zoomTarget === 'splitBottom' && (
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-emerald-600 text-white font-mono font-bold text-[10px] px-2 py-0.5 rounded shadow-lg pointer-events-none flex items-center gap-1 z-40">
                          <Maximize2 className="w-3 h-3" />
                          <span>P2 Zoom: {Math.round((frame.splitBottomZoom ?? frame.zoom ?? 1.0) * 100)}% ({Number(frame.splitBottomZoom ?? frame.zoom ?? 1.0).toFixed(2)}x)</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : frame.mode === 'social' ? (() => {
              const sp = frame.socialProfile ?? {
                accountName: '@username',
                accountHandle: 'Content Creator',
                avatarUrl: '',
                bgColor: '#FFFFFF',
                textColor: '#000000',
                handleColor: '#4B5563',
                accentColor: '#0095F6',
      verifiedBadgeColor: '#0095F6',
                headerHeight: 18,
                footerHeight: 8,
                videoFrameHeight: 66,
                videoFrameOffsetY: 0,
                footerText: 'Follow for more! 🔥',
                showVerifiedBadge: true,
                showFollowButton: false,
                cardStyle: 'flat' as const,
              };

              // Card style CSS classes and inline styles
              const headerBg = (() => {
                switch (sp.cardStyle) {
                  case 'glass':
                    return {
                      background: `${sp.bgColor}CC`,
                      backdropFilter: 'blur(16px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                      borderBottom: `1px solid ${sp.accentColor}30`,
                    };
                  case 'gradient':
                    return {
                      background: `linear-gradient(135deg, ${sp.bgColor} 0%, ${sp.accentColor}40 100%)`,
                      borderBottom: `1px solid ${sp.accentColor}40`,
                    };
                  case 'neon':
                    return {
                      background: `${sp.bgColor}F0`,
                      borderBottom: `2px solid ${sp.accentColor}`,
                      boxShadow: `0 4px 20px ${sp.accentColor}40, inset 0 -1px 0 ${sp.accentColor}60`,
                    };
                  default: // flat
                    return {
                      background: sp.bgColor,
                    };
                }
              })();

              const footerBg = (() => {
                switch (sp.cardStyle) {
                  case 'glass':
                    return {
                      background: `${sp.bgColor}CC`,
                      backdropFilter: 'blur(12px)',
                      borderTop: `1px solid ${sp.accentColor}30`,
                    };
                  case 'gradient':
                    return {
                      background: `linear-gradient(135deg, ${sp.accentColor}30 0%, ${sp.bgColor} 100%)`,
                      borderTop: `1px solid ${sp.accentColor}30`,
                    };
                  case 'neon':
                    return {
                      background: `${sp.bgColor}F0`,
                      borderTop: `2px solid ${sp.accentColor}`,
                      boxShadow: `0 -4px 20px ${sp.accentColor}40`,
                    };
                  default:
                    return {
                      background: sp.bgColor,
                    };
                }
              })();

              const headerPosYVal = sp.headerPosY ?? 6;
              const footerPosYVal = sp.footerPosY ?? 91;
              const videoFrameHeightVal = sp.videoFrameHeight ?? 66;
              const videoFrameOffsetYVal = sp.videoFrameOffsetY ?? 0;
              const headerBarHeight = sp.headerBarHeight ?? 48;
              const footerBarHeight = sp.footerBarHeight ?? 34;
              const headerPaddingX = sp.headerPaddingX ?? 0;

              return (
                <div className="relative z-10 w-full h-full flex flex-col justify-center items-center overflow-hidden select-none" style={{ backgroundColor: sp.bgColor }}>
                  {/* ═══ TOP: Header Profil Bar (Posisi Sumbu Vertikal Y) ═══ */}
                  <div
                    className="w-full absolute left-0 right-0 z-20 flex flex-col items-center justify-start transition-all"
                    style={{
                      top: `${headerPosYVal}%`,
                      paddingLeft: `${headerPaddingX}px`,
                      paddingRight: `${headerPaddingX}px`,
                    }}
                  >
                    {/* Header Bar (Bisa diklik & ditarik langsung untuk geser posisi vertikal tanpa garis melintang) */}
                    <div
                      onPointerDown={(e) => beginSocialDividerDrag(e, 'top')}
                      onPointerMove={updateSocialDividerDrag}
                      onPointerUp={finishSocialDividerDrag}
                      onPointerCancel={finishSocialDividerDrag}
                      className="w-full flex items-center px-3.5 gap-2.5 relative transition-all cursor-move select-none group/social-header hover:ring-1 hover:ring-violet-400/40 shadow-sm"
                      title="Klik & tarik ke atas/bawah untuk memindahkan posisi vertikal Header"
                      style={{
                        height: `${headerBarHeight}px`,
                        borderRadius: sp.frameBorderRadius ? `${Math.min(16, sp.frameBorderRadius)}px` : undefined,
                        ...headerBg,
                      }}
                    >
                      {/* Subtle Top Grab Handle Indicator */}
                      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-violet-400/50 opacity-0 group-hover/social-header:opacity-100 transition-opacity flex items-center justify-center pointer-events-none" />

                      {/* Neon glow ring behind avatar */}
                      {sp.cardStyle === 'neon' && (
                        <div
                          className="absolute rounded-full blur-md opacity-60"
                          style={{
                            width: `${headerBarHeight - 10}px`,
                            height: `${headerBarHeight - 10}px`,
                            left: '10px',
                            backgroundColor: sp.accentColor,
                          }}
                        />
                      )}
                      {/* Avatar */}
                      <div
                        className="relative shrink-0 rounded-full overflow-hidden flex items-center justify-center shadow-md transition-all border border-black/10"
                        style={{
                          width: `${Math.max(22, Math.min(52, headerBarHeight - 12))}px`,
                          height: `${Math.max(22, Math.min(52, headerBarHeight - 12))}px`,
                          boxShadow: sp.cardStyle === 'neon' ? `0 0 12px ${sp.accentColor}80` : undefined,
                        }}
                      >
                        {sp.avatarUrl ? (
                          <img src={sp.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: `${sp.accentColor || '#0095F6'}25`, color: sp.accentColor || '#0095F6' }}>
                            {(sp.accountName ? sp.accountName.replace('@', '').trim().charAt(0) : 'U').toUpperCase() || 'U'}
                          </div>
                        )}
                      </div>

                      {/* Name + Handle */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex items-center gap-1.5 leading-none">
                          <span
                            className="font-bold truncate leading-tight tracking-tight"
                            style={{ color: sp.textColor, fontSize: `${Math.max(10, Math.min(15, Math.round(headerBarHeight * 0.26)))}px` }}
                          >
                            {sp.accountName || '@username'}
                          </span>
                          {sp.showVerifiedBadge && (
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              className="shrink-0 select-none inline-block drop-shadow-xs"
                              style={{
                                width: `${Math.max(12, Math.min(16, Math.round(headerBarHeight * 0.28)))}px`,
                                height: `${Math.max(12, Math.min(16, Math.round(headerBarHeight * 0.28)))}px`,
                              }}
                              aria-label="Verified"
                            >
                              <path
                                fill={sp.verifiedBadgeColor || '#0095F6'}
                                d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.67-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"
                              />
                              <path
                                fill="#FFFFFF"
                                d="M10.54 16.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"
                              />
                            </svg>
                          )}
                        </div>
                        <span
                          className="truncate block leading-tight mt-0.5"
                          style={{ color: sp.handleColor, fontSize: `${Math.max(8, Math.min(12, Math.round(headerBarHeight * 0.22)))}px` }}
                        >
                          {sp.accountHandle || 'Content Creator'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ═══ MIDDLE: Video Content / Frame Box ═══ */}
                  <div
                    className={`w-full relative flex items-center justify-center select-none shrink-0 ${
                      isSocialDividerDragging ? 'transition-none' : 'transition-all duration-150'
                    }`}
                    style={{
                      top: `${videoFrameOffsetYVal}%`,
                      height: `${videoFrameHeightVal}%`,
                      paddingLeft: `${sp.framePadding || 0}px`,
                      paddingRight: `${sp.framePadding || 0}px`,
                    }}
                  >
                    {/* Frame Container (overflow-visible agar divider & handle sudut TIDAK terpotong!) */}
                    <div className="w-full h-full relative overflow-visible group/social-video select-none touch-none">
                      {/* Video Clipped Inner Box */}
                      <div
                        className="w-full h-full relative overflow-hidden cursor-grab active:cursor-grabbing transition-colors duration-150 shadow-md"
                        style={{
                          backgroundColor: sp.videoFrameBg || '#000000',
                          borderRadius: sp.frameBorderRadius ? `${sp.frameBorderRadius}px` : undefined,
                        }}
                        onPointerDown={beginVideoDrag}
                        onPointerMove={updateVideoDrag}
                        onPointerUp={finishVideoDrag}
                        onPointerCancel={finishVideoDrag}
                      >
                        {/* Indicator Geser Video X/Y saat di-drag di Social Mode */}
                        {isVideoDragging && (
                          <div className="absolute top-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-violet-600 text-white font-mono font-bold text-[10px] px-2.5 py-0.5 rounded-full shadow-lg pointer-events-none flex items-center gap-1.5 z-40 animate-in fade-in duration-100">
                            <span>Geser X: {frame.offsetX || 0}%</span>
                            <span>|</span>
                            <span>Y: {frame.offsetY || 0}%</span>
                            <span>|</span>
                            <span>Zoom: {Math.round((frame.zoom || 1) * 100)}%</span>
                          </div>
                        )}

                        {/* Blurred background video duplicate for when zoom < 1.35 (Fit Mode Utuh ala Podcast) */}
                        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none opacity-40">
                          <video
                            src={videoSrc}
                            className="w-full h-full object-cover scale-125 filter blur-xl brightness-50"
                            muted
                            playsInline
                          />
                        </div>

                        {/* Main Video (object-contain: frame video 100% utuh tidak pernah terpotong permanen) */}
                        <video
                          ref={videoRef}
                          src={videoSrc}
                          onLoadedMetadata={(e) => {
                            const v = e.currentTarget;
                            if (v.videoWidth && v.videoHeight) {
                              setVideoAspect(v.videoWidth / v.videoHeight);
                            }
                          }}
                          className="relative z-10 w-full h-full object-contain select-none pointer-events-none drop-shadow-2xl"
                          style={{
                            filter: getVideoFilterCss(frame),
                            transform: `translate(${frame.offsetX || 0}%, ${frame.offsetY || 0}%) scale(${frame.zoom || 1})`,
                            transformOrigin: 'center center',
                            transition: isVideoDragging || isZoomResizing
                              ? 'none'
                              : 'transform 0.15s cubic-bezier(0.2, 0, 0, 1)',
                          }}
                          playsInline
                        />
                      </div>

                      {/* Left Divider Handle (Tarik Garis Kiri untuk Melebarkan / Menyempitkan Bingkai) */}
                      <div
                        onPointerDown={(e) => beginSocialDividerDrag(e, 'left')}
                        onPointerMove={updateSocialDividerDrag}
                        onPointerUp={finishSocialDividerDrag}
                        onPointerCancel={finishSocialDividerDrag}
                        className="absolute top-0 bottom-0 left-0 w-6 -translate-x-1/2 z-40 cursor-ew-resize group/left-divider flex items-center justify-center select-none pointer-events-auto"
                        title="Tarik ke kiri atau kanan untuk melebarkan/menyempitkan bingkai video"
                      >
                        <div
                          className={`h-full transition-all duration-150 ${
                            isSocialDividerDragging === 'left'
                              ? 'w-1 bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,1)]'
                              : 'w-0.5 opacity-0 group-hover/left-divider:opacity-100 group-hover/left-divider:bg-violet-400'
                          }`}
                        />
                        <div
                          className={`absolute px-2 py-0.5 rounded-full text-[9px] font-mono font-bold transition-all duration-150 flex items-center gap-1 shadow-md pointer-events-none whitespace-nowrap ${
                            isSocialDividerDragging === 'left'
                              ? 'bg-violet-600 text-white border border-violet-400 scale-105'
                              : 'bg-black/80 text-violet-300 border border-violet-500/40 opacity-0 group-hover/left-divider:opacity-100'
                          }`}
                        >
                          <GripVertical className="w-2.5 h-2.5" />
                          <span>Sisi Kiri</span>
                        </div>
                      </div>

                      {/* Right Divider Handle (Tarik Garis Kanan untuk Melebarkan / Menyempitkan Bingkai) */}
                      <div
                        onPointerDown={(e) => beginSocialDividerDrag(e, 'right')}
                        onPointerMove={updateSocialDividerDrag}
                        onPointerUp={finishSocialDividerDrag}
                        onPointerCancel={finishSocialDividerDrag}
                        className="absolute top-0 bottom-0 right-0 w-6 translate-x-1/2 z-40 cursor-ew-resize group/right-divider flex items-center justify-center select-none pointer-events-auto"
                        title="Tarik ke kiri atau kanan untuk melebarkan/menyempitkan bingkai video"
                      >
                        <div
                          className={`h-full transition-all duration-150 ${
                            isSocialDividerDragging === 'right'
                              ? 'w-1 bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,1)]'
                              : 'w-0.5 opacity-0 group-hover/right-divider:opacity-100 group-hover/right-divider:bg-violet-400'
                          }`}
                        />
                        <div
                          className={`absolute px-2 py-0.5 rounded-full text-[9px] font-mono font-bold transition-all duration-150 flex items-center gap-1 shadow-md pointer-events-none whitespace-nowrap ${
                            isSocialDividerDragging === 'right'
                              ? 'bg-violet-600 text-white border border-violet-400 scale-105'
                              : 'bg-black/80 text-violet-300 border border-violet-500/40 opacity-0 group-hover/right-divider:opacity-100'
                          }`}
                        >
                          <GripVertical className="w-2.5 h-2.5" />
                          <span>Sisi Kanan</span>
                        </div>
                      </div>

                      {/* Social Mode Interactive Bounding Box & 4 Corner Resize Handles */}
                      <div
                        className={`absolute inset-0 pointer-events-none select-none transition-opacity duration-150 ${
                          isZoomResizing ? 'opacity-100' : 'opacity-85 hover:opacity-100'
                        }`}
                      >
                        <div
                          className={`w-full h-full relative transition-all duration-100 ${
                            isZoomResizing
                              ? 'border-2 border-violet-400 ring-2 ring-violet-400/40 shadow-[0_0_20px_rgba(167,139,250,0.5)]'
                              : 'border border-violet-400/40 group-hover/social-video:border-violet-400/80'
                          }`}
                        >
                          {/* Top-Left Corner Handle */}
                          <div
                            data-zoom-handle
                            onPointerDown={(e) => beginZoomResize(e, 'tl')}
                            onPointerMove={updateZoomResize}
                            onPointerUp={finishZoomResize}
                            onPointerCancel={finishZoomResize}
                            className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-violet-500 border-2 border-white shadow-md cursor-nwse-resize pointer-events-auto hover:scale-125 active:scale-110 transition-transform z-40"
                            title="Tarik sudut untuk zoom (perbesar/perkecil video)"
                          />
                          {/* Top-Right Corner Handle */}
                          <div
                            data-zoom-handle
                            onPointerDown={(e) => beginZoomResize(e, 'tr')}
                            onPointerMove={updateZoomResize}
                            onPointerUp={finishZoomResize}
                            onPointerCancel={finishZoomResize}
                            className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-violet-500 border-2 border-white shadow-md cursor-nesw-resize pointer-events-auto hover:scale-125 active:scale-110 transition-transform z-40"
                            title="Tarik sudut untuk zoom (perbesar/perkecil video)"
                          />
                          {/* Bottom-Left Corner Handle */}
                          <div
                            data-zoom-handle
                            onPointerDown={(e) => beginZoomResize(e, 'bl')}
                            onPointerMove={updateZoomResize}
                            onPointerUp={finishZoomResize}
                            onPointerCancel={finishZoomResize}
                            className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-violet-500 border-2 border-white shadow-md cursor-nesw-resize pointer-events-auto hover:scale-125 active:scale-110 transition-transform z-40"
                            title="Tarik sudut untuk zoom (perbesar/perkecil video)"
                          />
                          {/* Bottom-Right Corner Handle */}
                          <div
                            data-zoom-handle
                            onPointerDown={(e) => beginZoomResize(e, 'br')}
                            onPointerMove={updateZoomResize}
                            onPointerUp={finishZoomResize}
                            onPointerCancel={finishZoomResize}
                            className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-violet-500 border-2 border-white shadow-md cursor-nwse-resize pointer-events-auto hover:scale-125 active:scale-110 transition-transform z-40"
                            title="Tarik sudut untuk zoom (perbesar/perkecil video)"
                          />

                          {/* Live Scale Badge while Dragging Corner */}
                          {isZoomResizing && (
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-violet-600 text-white font-mono font-bold text-[10px] px-2 py-0.5 rounded shadow-lg pointer-events-none flex items-center gap-1 z-40">
                              <Maximize2 className="w-3 h-3" />
                              <span>Zoom: {Math.round((frame.zoom || 1.0) * 100)}% ({Number(frame.zoom || 1.0).toFixed(2)}x)</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Live Frame Dimension Badge while Dragging Dividers */}
                      {isSocialDividerDragging && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/90 backdrop-blur-md text-white border border-violet-500/60 px-3.5 py-2 rounded-xl shadow-2xl flex items-center gap-2.5 z-50 pointer-events-none">
                          <Maximize2 className="w-4 h-4 text-violet-400 shrink-0" />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-violet-200">
                              {isSocialDividerDragging === 'left' || isSocialDividerDragging === 'right'
                                ? `Jarak Samping (Inset): ${sp.framePadding || 0}px`
                                : isSocialDividerDragging === 'top'
                                ? `Posisi Vertikal Header: ${headerPosYVal}% (Sumbu Y)`
                                : `Posisi Vertikal Footer: ${footerPosYVal}% (Sumbu Y)`}
                            </span>
                            <span className="text-[10px] text-neutral-300 font-mono">
                              {isSocialDividerDragging === 'left' || isSocialDividerDragging === 'right'
                                ? `Lebar Efektif: ~${Math.round(100 - ((sp.framePadding || 0) * 2 / 3.6))}% • Sudut: ${sp.frameBorderRadius || 0}px`
                                : `Tinggi Video: ${videoFrameHeightVal}% (Tetap Stabil)`}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ═══ BOTTOM: Footer CTA Bar (Posisi Sumbu Vertikal Y) ═══ */}
                  <div
                    className="w-full absolute left-0 right-0 z-20 flex flex-col items-center justify-start transition-all"
                    style={{
                      top: `${footerPosYVal}%`,
                      paddingLeft: `${headerPaddingX}px`,
                      paddingRight: `${headerPaddingX}px`,
                    }}
                  >
                    {/* Bottom Divider Handle (Tarik Garis untuk Geser Posisi Footer Naik / Turun) */}
                    <div
                      onPointerDown={(e) => beginSocialDividerDrag(e, 'bottom')}
                      onPointerMove={updateSocialDividerDrag}
                      onPointerUp={finishSocialDividerDrag}
                      onPointerCancel={finishSocialDividerDrag}
                      className="w-full h-4 -mt-2 relative z-30 cursor-ns-resize group/bot-divider flex items-center justify-center select-none"
                      title="Tarik ke atas atau ke bawah untuk mengatur posisi vertikal Footer"
                    >
                      <div
                        className={`w-full transition-all duration-150 ${
                          isSocialDividerDragging === 'bottom'
                            ? 'h-0.5 bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,1)]'
                            : 'h-px opacity-0 group-hover/bot-divider:opacity-100 group-hover/bot-divider:bg-violet-400'
                        }`}
                      />
                      <div
                        className={`absolute px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold transition-all duration-150 flex items-center gap-1 shadow-md pointer-events-none ${
                          isSocialDividerDragging === 'bottom'
                            ? 'bg-violet-600 text-white border border-violet-400 scale-105'
                            : 'bg-black/75 text-violet-300 border border-violet-500/40 opacity-0 group-hover/bot-divider:opacity-100'
                        }`}
                      >
                        <GripHorizontal className="w-2.5 h-2.5" />
                        <span>Posisi Footer (Y)</span>
                      </div>
                    </div>

                    {/* Footer CTA Bar */}
                    {sp.footerText && (
                      <div
                        className="w-full flex items-center justify-center px-3 transition-all"
                        style={{
                          height: `${footerBarHeight}px`,
                          borderRadius: sp.frameBorderRadius ? `${Math.min(16, sp.frameBorderRadius)}px` : undefined,
                          ...footerBg,
                        }}
                      >
                        <span
                          className="font-semibold text-center truncate"
                          style={{
                            color: sp.textColor,
                            fontSize: `${Math.max(8, Math.min(15, Math.round(footerBarHeight * 0.36)))}px`,
                            textShadow: sp.cardStyle === 'neon' ? `0 0 8px ${sp.accentColor}60` : undefined,
                          }}
                        >
                          {sp.footerText}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })() : (
              <>
                {/* Fit-blur background video duplicate: STRICTLY z-0, behind main video, constrained inside overflow-hidden */}
                {frame.mode === 'fit_blur' && (
                  <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
                    <div
                      className="w-full h-full scale-125"
                      style={{
                        filter: `blur(${frame.blur || 24}px) brightness(0.72)`,
                      }}
                    >
                      <video
                        ref={bgVideoRef}
                        src={videoSrc}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                      />
                    </div>
                    {/* Subtle darkening vignette */}
                    <div className="absolute inset-0 bg-black/25 pointer-events-none" />
                  </div>
                )}

                <video
                  ref={videoRef}
                  src={videoSrc}
                  onPointerDown={beginVideoDrag}
                  onPointerMove={updateVideoDrag}
                  onPointerUp={finishVideoDrag}
                  onPointerCancel={finishVideoDrag}
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    if (v.videoWidth && v.videoHeight) {
                      setVideoAspect(v.videoWidth / v.videoHeight);
                    }
                  }}
                  className={`relative z-10 w-full h-full select-none touch-none ${
                    isVideoDragging ? 'cursor-grabbing' : 'cursor-grab'
                  } ${
                    frame.mode === 'crop' ? 'object-cover' : 'object-contain drop-shadow-2xl'
                  }`}
                  style={{
                    filter: getVideoFilterCss(frame),
                    ...(frame.mode === 'crop'
                      ? (() => {
                          const rawX = activeTracking.offsetX;
                          const baseOffX = Math.max(-50, Math.min(50, rawX));
                          const extraOffX = rawX < -50 ? (rawX + 50) : rawX > 50 ? (rawX - 50) : 0;
                          const offY = (frame.offsetY || 0) / 100;
                          const effZoom = Math.max(frame.zoom || 1, 1.0 + 2.05 * Math.abs(offY));
                          return {
                            objectPosition: `${50 + baseOffX}% 50%`,
                            transform: `translate(${extraOffX}%, ${frame.offsetY || 0}%) scale(${effZoom})`,
                            transformOrigin: 'center center',
                            transition: isVideoDragging
                              ? 'none'
                              : frame.trackingMode === 'auto_switch'
                              ? 'none'
                              : frame.trackingMode === 'smooth_follow'
                              ? (isPlaying ? 'none' : 'object-position 0.15s cubic-bezier(0.2, 0, 0, 1), transform 0.15s ease')
                              : 'object-position 0.25s cubic-bezier(0.2, 0, 0, 1), transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
                          };
                        })()
                      : {
                          transform: `translate(${frame.offsetX || 0}%, ${frame.offsetY || 0}%) scale(${frame.zoom || 1})`,
                          transformOrigin: 'center center',
                          transition: isVideoDragging || isZoomResizing
                            ? 'none'
                            : 'transform 0.15s cubic-bezier(0.2, 0, 0, 1)',
                        }),
                  }}
                  playsInline
                />

                {/* Fit Blur / Fit Interactive Transform Box & 4 Corner Resize Handles */}
                {(frame.mode === 'fit_blur' || frame.mode === 'fit') && (
                  <div
                    className={`absolute z-25 pointer-events-none select-none transition-opacity duration-150 ${
                      isZoomResizing ? 'opacity-100' : 'opacity-85 hover:opacity-100'
                    }`}
                    style={{
                      left: `calc(50% + ${frame.offsetX || 0}%)`,
                      top: `calc(50% + ${frame.offsetY || 0}%)`,
                      width: `${Math.round((canvasSize.width || 360) * (frame.zoom || 1.0))}px`,
                      height: `${Math.round(((canvasSize.width || 360) / (videoAspect || 1.778)) * (frame.zoom || 1.0))}px`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    {/* Bounding Box Border */}
                    <div
                      className={`w-full h-full relative transition-all duration-100 ${
                        isZoomResizing
                          ? 'border-2 border-primary ring-2 ring-primary/40 shadow-[0_0_20px_rgba(56,189,248,0.5)]'
                          : 'border border-primary/40 hover:border-primary'
                      }`}
                    >
                      {/* Top-Left Corner Handle */}
                      <div
                        data-zoom-handle
                        onPointerDown={(e) => beginZoomResize(e, 'tl')}
                        onPointerMove={updateZoomResize}
                        onPointerUp={finishZoomResize}
                        onPointerCancel={finishZoomResize}
                        className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-primary border-2 border-white shadow-md cursor-nwse-resize pointer-events-auto hover:scale-125 active:scale-110 transition-transform z-30"
                        title="Tarik sudut untuk zoom (perbesar/perkecil)"
                      />
                      {/* Top-Right Corner Handle */}
                      <div
                        data-zoom-handle
                        onPointerDown={(e) => beginZoomResize(e, 'tr')}
                        onPointerMove={updateZoomResize}
                        onPointerUp={finishZoomResize}
                        onPointerCancel={finishZoomResize}
                        className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-primary border-2 border-white shadow-md cursor-nesw-resize pointer-events-auto hover:scale-125 active:scale-110 transition-transform z-30"
                        title="Tarik sudut untuk zoom (perbesar/perkecil)"
                      />
                      {/* Bottom-Left Corner Handle */}
                      <div
                        data-zoom-handle
                        onPointerDown={(e) => beginZoomResize(e, 'bl')}
                        onPointerMove={updateZoomResize}
                        onPointerUp={finishZoomResize}
                        onPointerCancel={finishZoomResize}
                        className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-primary border-2 border-white shadow-md cursor-nesw-resize pointer-events-auto hover:scale-125 active:scale-110 transition-transform z-30"
                        title="Tarik sudut untuk zoom (perbesar/perkecil)"
                      />
                      {/* Bottom-Right Corner Handle */}
                      <div
                        data-zoom-handle
                        onPointerDown={(e) => beginZoomResize(e, 'br')}
                        onPointerMove={updateZoomResize}
                        onPointerUp={finishZoomResize}
                        onPointerCancel={finishZoomResize}
                        className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-primary border-2 border-white shadow-md cursor-nwse-resize pointer-events-auto hover:scale-125 active:scale-110 transition-transform z-30"
                        title="Seret sudut untuk zoom (perbesar/perkecil)"
                      />

                      {/* Live Scale Badge while Dragging Corner */}
                      {isZoomResizing && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-primary text-on-primary font-mono font-bold text-[10px] px-2 py-0.5 rounded shadow-lg pointer-events-none flex items-center gap-1 z-40">
                          <Maximize2 className="w-3 h-3" />
                          <span>Zoom: {Math.round((frame.zoom || 1.0) * 100)}% ({Number(frame.zoom || 1.0).toFixed(2)}x)</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* AI Face Tracking Floating Badge (Active Speaker / Smooth Follow / Static Lock) */}
                {frame.mode === 'crop' && activeTracking.badgeText && (
                  <div className="absolute top-3 left-3 z-30 pointer-events-none flex items-center gap-1.5 bg-surface-container-lowest/85 backdrop-blur-md px-2.5 py-1 rounded-full border border-primary/30 shadow-md text-[10px] text-primary font-medium animate-in fade-in duration-200">
                    <Sparkles className="w-3 h-3 text-primary animate-pulse" />
                    <span>{activeTracking.badgeText}</span>
                  </div>
                )}
              </>
            )
          ) : (
            <div className="flex flex-col items-center gap-2 text-outline">
              <Film className="w-9 h-9 text-outline/60 stroke-[1.5]" />
              <span className="font-label-sm text-xs">Pilih atau buat klip untuk memutar</span>
            </div>
          )}


          {/* Vignette Filter Overlay (OpenCut inspired) */}
          {frame.vignette && (
            <div
              className="absolute inset-0 pointer-events-none z-15 transition-opacity duration-300"
              style={{
                background: 'radial-gradient(circle at center, transparent 40%, rgba(0, 0, 0, 0.45) 75%, rgba(0, 0, 0, 0.85) 100%)',
              }}
            />
          )}

          {/* OpenCut Cinematic Bars (Letterbox Black Bars Mask) */}
          {frame.cinematicBars && (
            <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between overflow-hidden">
              <div
                className="w-full bg-black transition-all duration-150 shadow-md"
                style={{ height: `${frame.cinematicBarsHeight ?? 12}%` }}
              />
              <div
                className="w-full bg-black transition-all duration-150 shadow-md"
                style={{ height: `${frame.cinematicBarsHeight ?? 12}%` }}
              />
            </div>
          )}

          {/* Dynamic Snap Guides Overlay (OpenCut Magnetic Snapping) */}
          {activeSnapGuides?.y && (
            <div
              className="absolute left-0 right-0 z-25 pointer-events-none flex items-center justify-center transition-all duration-75"
              style={{ top: `${activeSnapGuides.y.position}%` }}
            >
              <div className="w-full h-px bg-primary shadow-[0_0_8px_rgba(76,215,246,0.9)]" />
              <span className="absolute bg-primary text-on-primary text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg font-mono">
                {activeSnapGuides.y.label}
              </span>
            </div>
          )}

          {/* Dynamic Real-time CSS Caption Overlay */}
          {activeGroup && style.enabled !== false && (
            <div
              className="absolute left-0 right-0 z-30 px-[3%] flex items-center justify-center pointer-events-none"
              style={{
                top: `${style.positionY ?? 72}%`,
                transform: `translateY(-50%) rotate(${style.rotation || 0}deg)`,
                transformOrigin: 'center center',
              }}
            >
              <div
                data-caption-overlay
                onPointerDown={!isEditingInPlace ? beginCaptionDrag : undefined}
                onPointerMove={!isEditingInPlace ? updateCaptionDrag : undefined}
                onPointerUp={!isEditingInPlace ? finishCaptionDrag : undefined}
                onPointerCancel={!isEditingInPlace ? finishCaptionDrag : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  setCaptionSelected(true);
                }}
                onDoubleClick={handleCaptionDoubleClick}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setCaptionSelected(false);
                    setIsEditingInPlace(false);
                  }
                }}
                role="group"
                aria-label="Caption preview. Seret untuk mengubah posisi. Double click untuk edit teks."
                tabIndex={0}
                className={`relative inline-flex flex-wrap items-center justify-center transition-[font-size] duration-100 ${
                  captionSelected && !isEditingInPlace
                    ? 'cursor-move pointer-events-auto touch-none'
                    : isEditingInPlace
                    ? 'pointer-events-auto cursor-text'
                    : 'pointer-events-auto cursor-pointer'
                }`}
                style={{
                  fontFamily: style.fontFamily || 'Montserrat',
                  fontSize: `${(style.fontSize || 84) * ((canvasSize.height || 640) / 1920)}px`,
                  fontWeight: style.bold !== false ? 800 : 400,
                  fontStyle: style.italic ? 'italic' : 'normal',
                  textDecoration: style.underline ? 'underline' : 'none',
                  textAlign: style.textAlign || 'center',
                  textTransform: style.uppercase ? 'uppercase' : 'none',
                  letterSpacing: `${(style.letterSpacing ?? 0) * ((canvasSize.height || 640) / 1920)}px`,
                  lineHeight: style.lineHeight ?? 1.25,
                  gap: `${Math.max(
                    3,
                    (style.fontSize || 84) * ((canvasSize.height || 640) / 1920) * 0.22
                  )}px ${Math.max(
                    3,
                    (style.fontSize || 84) *
                      ((canvasSize.height || 640) / 1920) *
                      0.22 *
                      (style.wordSpacing ?? 1.0)
                  )}px`,
                  padding: style.background
                    ? `${(style.backgroundPaddingY ?? 10) * ((canvasSize.height || 640) / 1920)}px ${(style.backgroundPaddingX ?? 20) * ((canvasSize.height || 640) / 1920)}px`
                    : '4px 6px',
                  borderRadius: style.background
                    ? `${(style.backgroundCornerRadius ?? 16) * ((canvasSize.height || 640) / 1920)}px`
                    : `${(style.fontSize || 84) * ((canvasSize.height || 640) / 1920) * 0.16}px`,
                  backgroundColor: style.background
                    ? `${style.backgroundColor || '#000000'}${Math.round(
                        (style.backgroundOpacity ?? 0.7) * 255
                      )
                        .toString(16)
                        .padStart(2, '0')}`
                    : 'transparent',
                  WebkitTextStroke:
                    (style.outlineWidth ?? 0) > 0
                      ? `${(style.outlineWidth ?? 7) * ((canvasSize.height || 640) / 1920)}px ${
                          style.outlineColor || '#000000'
                        }`
                      : 'none',
                  textShadow: style.shadow
                    ? `0px ${(style.shadowDepth ?? 4) * ((canvasSize.height || 640) / 1920)}px ${(style.shadowBlur ?? 4) * ((canvasSize.height || 640) / 1920)}px ${
                        style.shadowColor || '#000000'
                      }`
                    : 'none',
                }}
              >
                {/* Mode 1: In-Place Text Editing (OpenCut TextEditOverlay) */}
                {isEditingInPlace ? (
                  <div
                    className="relative flex flex-col items-center justify-center p-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <textarea
                      autoFocus
                      rows={Math.max(1, Math.ceil(inPlaceEditText.length / 22))}
                      value={inPlaceEditText}
                      onChange={(e) => setInPlaceEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          commitInPlaceEdit();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setIsEditingInPlace(false);
                        }
                      }}
                      onBlur={commitInPlaceEdit}
                      className="bg-black/90 text-center resize-none outline-none border-2 border-primary rounded-md shadow-2xl px-3 py-1 font-bold text-white tracking-wide"
                      style={{
                        fontFamily: style.fontFamily || 'Montserrat',
                        fontSize: `${(style.fontSize || 84) * ((canvasSize.height || 640) / 1920)}px`,
                        color: style.textColor || '#FFFFFF',
                        textTransform: style.uppercase ? 'uppercase' : 'none',
                        lineHeight: 1.25,
                        minWidth: '200px',
                        maxWidth: '90vw',
                      }}
                    />
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-surface-container-highest/95 text-[10px] text-on-surface px-2 py-0.5 rounded shadow pointer-events-none flex items-center gap-1 border border-outline-variant/30">
                      <span>Enter:</span>
                      <span className="text-primary font-bold">Simpan</span>
                      <span className="text-outline">•</span>
                      <span>Esc:</span>
                      <span className="text-outline">Batal</span>
                    </div>
                  </div>
                ) : (
                  /* Mode 2: Word Tokens Normal Display */
                  activeGroup.words.map((w, idx) => {
                    const isActive = realTime >= w.s && realTime <= w.e;
                    const isKeyword = Boolean(w.hl);

                    let wordColor = style.textColor || '#FFFFFF';
                    if (isActive) {
                      wordColor = style.activeColor || '#FFD43B';
                    } else if (isKeyword && style.highlightKeywords) {
                      wordColor = style.keywordColor || '#4CD7F6';
                    }

                    let animationClass = '';
                    let wordShadow = '';
                    if (isActive) {
                      if (style.animation === 'pop') {
                        animationClass = 'scale-106 transform transition-transform duration-100 origin-center z-10';
                      } else if (style.animation === 'karaoke') {
                        animationClass = 'scale-103 transform transition-transform duration-75 origin-center z-10';
                        wordShadow = `0 0 10px ${style.activeColor || '#FFE600'}`;
                      } else if (style.animation === 'fade') {
                        animationClass = 'opacity-100 transition-opacity duration-150';
                      }
                    }

                    return (
                      <span
                        key={idx}
                        className={`inline-block whitespace-pre transition-colors duration-75 ${animationClass}`}
                        style={{
                          color: wordColor,
                          ...(wordShadow ? { filter: `drop-shadow(${wordShadow})` } : {}),
                        }}
                      >
                        {w.w}
                      </span>
                    );
                  })
                )}

                {/* Bounding Box Transform Handles (OpenCut CapCut-Style 8-Handle Overlay) */}
                {captionSelected && !isEditingInPlace && (
                  <>
                    {/* Bounding Box Outline */}
                    <div className="absolute -inset-1.5 border border-primary/80 ring-1 ring-primary/20 pointer-events-none rounded-xs shadow-xs" />

                    {/* Corner Handles (Resize Font Size) */}
                    <button
                      type="button"
                      data-caption-resize="tl"
                      aria-label="Ubah ukuran kiri-atas"
                      onPointerDown={beginCaptionDrag}
                      className="absolute -left-2 -top-2 z-40 h-3.5 w-3.5 rounded-full border-2 border-surface bg-primary shadow-md cursor-nwse-resize touch-none hover:scale-125 transition-transform"
                    />
                    <button
                      type="button"
                      data-caption-resize="tr"
                      aria-label="Ubah ukuran kanan-atas"
                      onPointerDown={beginCaptionDrag}
                      className="absolute -right-2 -top-2 z-40 h-3.5 w-3.5 rounded-full border-2 border-surface bg-primary shadow-md cursor-nesw-resize touch-none hover:scale-125 transition-transform"
                    />
                    <button
                      type="button"
                      data-caption-resize="bl"
                      aria-label="Ubah ukuran kiri-bawah"
                      onPointerDown={beginCaptionDrag}
                      className="absolute -left-2 -bottom-2 z-40 h-3.5 w-3.5 rounded-full border-2 border-surface bg-primary shadow-md cursor-nesw-resize touch-none hover:scale-125 transition-transform"
                    />
                    <button
                      type="button"
                      data-caption-resize="br"
                      aria-label="Ubah ukuran kanan-bawah"
                      onPointerDown={beginCaptionDrag}
                      className="absolute -right-2 -bottom-2 z-40 h-3.5 w-3.5 rounded-full border-2 border-surface bg-primary shadow-md cursor-nwse-resize touch-none hover:scale-125 transition-transform"
                    />

                    {/* Top Rotation Handle & Stem (OpenCut Rotation Handle) */}
                    <div
                      className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto z-40 group/rot"
                      data-caption-rotate
                      onPointerDown={beginCaptionDrag}
                      title="Tarik untuk memutar kemiringan caption (-35° s/d +35°)"
                    >
                      <button
                        type="button"
                        className="w-4 h-4 rounded-full bg-white border-2 border-primary shadow-md flex items-center justify-center cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
                      >
                        <RotateCw className="w-2.5 h-2.5 text-primary group-hover/rot:rotate-45 transition-transform" />
                      </button>
                      <div className="w-px h-3 bg-primary/80 pointer-events-none" />
                    </div>

                    {/* Rotasi Info Badge */}
                    {style.rotation ? (
                      <div className="absolute -top-11 left-1/2 -translate-x-1/2 bg-surface-container-highest/95 backdrop-blur-sm text-[10px] text-primary px-2 py-0.5 rounded-full font-mono border border-primary/30 shadow-md pointer-events-none whitespace-nowrap">
                        Rotasi: {style.rotation}°
                      </div>
                    ) : null}

                    {/* Quick Double Click Edit Hint */}
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/75 backdrop-blur-sm text-[9px] text-on-surface-variant px-1.5 py-0.5 rounded shadow pointer-events-none border border-outline-variant/20">
                      Double-click untuk edit teks
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Teks Tambahan / Add Text Overlay (Bebas Dipindah ke Mana Saja) */}
          {frame.hookTitle?.enabled && frame.hookTitle.text?.trim() && (() => {
            const ht = frame.hookTitle;
            const preset = ht.stylePreset || 'pill';

            // Skalabilitas ukuran font ala OpenCut (relatif terhadap canvas height):
            let rawFontSize = ht.fontSize ?? 4.5;
            if (rawFontSize > 16) {
              // Kompatibilitas mundur nilai lama (14-36)
              rawFontSize = Math.max(1.5, Math.min(14, rawFontSize / 4.5));
            }
            const refH = canvasSize.height || 640;
            const calcFontSize = Math.max(8, Math.round(rawFontSize * (refH / 100)));

            const formatHeadlineText = (text: string, textCase?: string, uppercase?: boolean): string => {
              if (!text) return '';
              if (textCase === 'uppercase' || (textCase === undefined && uppercase === true)) {
                return text.toUpperCase();
              }
              if (textCase === 'lowercase') {
                return text.toLowerCase();
              }
              if (textCase === 'titlecase') {
                return text.toLowerCase().replace(/(?:^|\s|[-_])\p{L}/gu, (match) => match.toUpperCase());
              }
              return text;
            };

            const displayText = formatHeadlineText(ht.text, ht.textCase, ht.uppercase);
            const fontFamily = ht.fontFamily || 'Montserrat, sans-serif';

            const weightMap: Record<string, number> = {
              normal: 400,
              medium: 500,
              bold: 700,
              black: 900,
            };
            const chosenWeight = ht.fontWeight ? (weightMap[ht.fontWeight] || 700) : (preset === 'clean-no-bg' ? 600 : 800);

            let innerStyle: React.CSSProperties = {
              fontSize: `${calcFontSize}px`,
              fontFamily,
              fontWeight: chosenWeight,
              color: ht.textColor || '#FFFFFF',
              textAlign: ht.textAlign || 'center',
              textTransform:
                ht.textCase === 'uppercase' || (ht.textCase === undefined && ht.uppercase === true)
                  ? 'uppercase'
                  : ht.textCase === 'lowercase'
                  ? 'lowercase'
                  : ht.textCase === 'titlecase'
                  ? 'capitalize'
                  : 'none',
              padding: preset === 'clean-no-bg' || preset === 'glow-no-bg' ? '2px 6px' : '0.35em 0.8em',
            };

            switch (preset) {
              case 'clean-no-bg':
                innerStyle = {
                  ...innerStyle,
                  backgroundColor: 'transparent',
                  border: 'none',
                  boxShadow: 'none',
                  textShadow: '0 2px 6px rgba(0, 0, 0, 0.45)',
                  letterSpacing: '0.02em',
                  padding: '2px 4px',
                };
                break;

              case 'glow-no-bg':
                innerStyle = {
                  ...innerStyle,
                  backgroundColor: 'transparent',
                  border: 'none',
                  boxShadow: 'none',
                  textShadow: `0 0 12px ${ht.bgColor || '#38BDF8'}, 0 0 24px ${ht.bgColor || '#38BDF8'}80, 0 2px 6px rgba(0,0,0,0.95)`,
                  letterSpacing: '0.04em',
                  padding: '2px 4px',
                };
                break;

              case 'glass':
                innerStyle = {
                  ...innerStyle,
                  backgroundColor: 'rgba(255, 255, 255, 0.12)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.55)',
                  borderRadius: `${Math.max(4, Math.round(calcFontSize * 0.4))}px`,
                  textShadow: '0 2px 6px rgba(0,0,0,0.6)',
                };
                break;

              case 'marker':
                innerStyle = {
                  ...innerStyle,
                  backgroundColor: ht.bgColor || '#FACC15',
                  color: ht.textColor || '#000000',
                  borderRadius: '3px',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
                  transform: 'rotate(-0.8deg)',
                  border: 'none',
                };
                break;

              case 'outline':
                innerStyle = {
                  ...innerStyle,
                  backgroundColor: 'rgba(0, 0, 0, 0.65)',
                  border: `${Math.max(1.5, Math.round(calcFontSize * 0.08))}px solid ${ht.bgColor || '#38BDF8'}`,
                  borderRadius: `${Math.max(4, Math.round(calcFontSize * 0.25))}px`,
                  boxShadow: '0 4px 18px rgba(0,0,0,0.65)',
                  textShadow: '0 2px 4px rgba(0,0,0,0.7)',
                };
                break;

              case 'luxury':
                innerStyle = {
                  ...innerStyle,
                  backgroundColor: '#0F172A',
                  color: ht.textColor || '#F59E0B',
                  border: `${Math.max(1, Math.round(calcFontSize * 0.06))}px solid #F59E0B`,
                  borderRadius: `${Math.max(4, Math.round(calcFontSize * 0.2))}px`,
                  boxShadow: '0 6px 22px rgba(0,0,0,0.85), 0 0 14px rgba(245,158,11,0.25)',
                  letterSpacing: '0.04em',
                };
                break;

              case 'badge':
                innerStyle = {
                  ...innerStyle,
                  backgroundColor: ht.bgColor || '#EF4444',
                  borderRadius: `${Math.max(3, Math.round(calcFontSize * 0.15))}px`,
                  border: `${Math.max(1.5, Math.round(calcFontSize * 0.08))}px solid #FFFFFF`,
                  boxShadow: '0 6px 20px rgba(0,0,0,0.75)',
                  letterSpacing: '0.05em',
                };
                break;

              case 'pill':
              default:
                innerStyle = {
                  ...innerStyle,
                  backgroundColor: ht.bgColor || '#EF4444',
                  borderRadius: '9999px',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.65)',
                  textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                };
                break;
            }

            return (
              <div
                data-headline-overlay
                onPointerDown={beginHeadlineDrag}
                onPointerMove={updateHeadlineDrag}
                onPointerUp={finishHeadlineDrag}
                onPointerCancel={finishHeadlineDrag}
                className={`absolute z-32 select-none touch-none cursor-grab active:cursor-grabbing transition-shadow duration-75 flex items-center justify-center group/ht ${
                  isHeadlineDragging
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-black scale-[1.02] z-40'
                    : 'hover:ring-1 hover:ring-primary/60'
                }`}
                style={{
                  left: `${ht.positionX ?? 50}%`,
                  top: `${ht.positionY ?? 6}%`,
                  transform: 'translateX(-50%)',
                  maxWidth: '92%',
                }}
                title="Klik dan seret (drag) langsung teks di kanvas untuk memindahkannya ke mana saja"
              >
                <div
                  className="text-center flex items-center justify-center transition-all duration-150 leading-tight"
                  style={innerStyle}
                >
                  {displayText}
                </div>
                {/* Indicator koordinat saat di-drag atau di-hover */}
                <div
                  className={`absolute -bottom-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/85 backdrop-blur-sm border border-primary/30 text-[9px] text-primary font-mono whitespace-nowrap pointer-events-none transition-opacity duration-150 ${
                    isHeadlineDragging ? 'opacity-100' : 'opacity-0 group-hover/ht:opacity-100'
                  }`}
                >
                  Y: {ht.positionY ?? 6}% {ht.positionX !== undefined && ht.positionX !== 50 ? `| X: ${ht.positionX}%` : ''}
                </div>
              </div>
            );
          })()}

          {/* Dynamic Retention Progress Bar */}
          {frame.progressBar?.enabled && (
            <div
              className={`absolute left-0 right-0 z-35 pointer-events-none ${
                frame.progressBar.position === 'top' ? 'top-0' : 'bottom-0'
              }`}
              style={{
                height: `${frame.progressBar.height || 4}px`,
                backgroundColor: 'rgba(0, 0, 0, 0.45)',
              }}
            >
              <div
                className="h-full transition-all duration-75 ease-linear"
                style={{
                  width: `${Math.min(100, Math.max(0, (currentTime / (duration || 1)) * 100))}%`,
                  backgroundColor: frame.progressBar.color || '#38BDF8',
                  boxShadow: `0 0 10px ${frame.progressBar.color || '#38BDF8'}`,
                }}
              />
            </div>
          )}

          {/* Creator Watermark / Handle Branding (Interactive Draggable Badge) */}
          {frame.watermark?.enabled && frame.watermark.text?.trim() && (
            <div
              data-watermark-overlay
              onPointerDown={beginWatermarkDrag}
              onPointerMove={updateWatermarkDrag}
              onPointerUp={finishWatermarkDrag}
              onPointerCancel={finishWatermarkDrag}
              className={`absolute z-32 select-none touch-none cursor-move transition-transform duration-100 group/wm ${
                isWatermarkDragging ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-black scale-105 z-40' : 'hover:ring-1 hover:ring-emerald-400/70'
              }`}
              style={{
                left: `${frame.watermark.positionX ?? (frame.watermark.position === 'top-left' || frame.watermark.position === 'bottom-left' ? 12 : 88)}%`,
                top: `${frame.watermark.positionY ?? (frame.watermark.position === 'top-left' || frame.watermark.position === 'top-right' ? 5 : 92)}%`,
                transform: 'translate(-50%, -50%)',
                opacity: frame.watermark.opacity ?? 0.85,
              }}
              title="Klik dan seret (drag) untuk memindahkan posisi watermark"
            >
              <div
                className={`flex items-center gap-1.5 transition-all shadow-lg ${
                  frame.watermark.stylePreset === 'minimal'
                    ? 'bg-transparent px-1 py-0.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]'
                    : frame.watermark.stylePreset === 'glow'
                    ? 'bg-black/50 backdrop-blur-md border border-primary/60 shadow-[0_0_12px_rgba(56,189,248,0.4)] rounded-full px-3 py-1'
                    : frame.watermark.stylePreset === 'marker'
                    ? 'bg-amber-400 !text-slate-950 font-black rounded-md px-2.5 py-0.5 shadow-md'
                    : frame.watermark.stylePreset === 'outline'
                    ? 'bg-black/30 backdrop-blur-sm border-2 border-white/80 rounded-lg px-2.5 py-1'
                    : frame.watermark.stylePreset === 'glass'
                    ? 'bg-white/15 backdrop-blur-lg border border-white/30 rounded-full px-3 py-1 shadow-xl'
                    : 'bg-black/60 backdrop-blur-md border border-white/20 rounded-full px-3 py-1 shadow-md'
                }`}
                style={{
                  fontFamily: frame.watermark.fontFamily || 'Inter',
                  fontSize: `${Math.max(10, (frame.watermark.fontSize || 13) * ((canvasSize.height || 640) / 1080 * 1.5))}px`,
                  color: frame.watermark.stylePreset === 'marker' ? '#0F172A' : (frame.watermark.textColor || '#FFFFFF'),
                  textTransform: frame.watermark.uppercase ? 'uppercase' : 'none',
                }}
              >
                {/* Prefix Icon */}
                {frame.watermark.prefixIcon === 'verified' ? (
                  <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-sky-500 text-white text-[9px] font-bold">✓</span>
                ) : frame.watermark.prefixIcon === 'sparkle' ? (
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                ) : frame.watermark.prefixIcon === 'video' ? (
                  <Film className="w-3.5 h-3.5 text-primary" />
                ) : frame.watermark.prefixIcon === 'none' ? null : (
                  <span className="opacity-75 font-mono text-[11px]">@</span>
                )}
                <span className="font-semibold tracking-wide whitespace-nowrap">
                  {frame.watermark.prefixIcon === 'at' && frame.watermark.text.startsWith('@')
                    ? frame.watermark.text.substring(1)
                    : frame.watermark.text}
                </span>
              </div>

              {/* Real-time Drag Tooltip */}
              {isWatermarkDragging && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-emerald-500 text-black font-mono font-bold text-[9px] px-1.5 py-0.5 rounded shadow pointer-events-none">
                  X: {frame.watermark.positionX ?? 85}% • Y: {frame.watermark.positionY ?? 92}%
                </div>
              )}
            </div>
          )}

          {/* Safe Guides Overlay (TikTok, Reels, Shorts, Rule of Thirds Grid) */}
          {safeGuides && (
            <PlatformGuidesOverlay
              preset={frame.safeZonePreset || 'tiktok'}
              showGridSafe={safeGuides}
            />
          )}
        </div>
      </div>

      {/* ═══ VIDEO TIMELINE SCRUBBER & TRANSPORT BAR (OPENCUT & CAPCUT STYLE) ═══ */}
      <div className="bg-surface-container-low/95 border-t border-surface-container-highest/40 shrink-0 px-3 pt-2 pb-1.5 select-none space-y-1.5 z-30">
        {/* Scrubber Track Bar (Berjalan Sesuai Waktu Video) */}
        <div
          ref={scrubberTrackRef}
          onPointerDown={handleScrubberPointerDown}
          onPointerMove={handleScrubberPointerMove}
          onPointerUp={handleScrubberPointerUp}
          onPointerLeave={handleScrubberPointerLeave}
          className="relative w-full h-4 flex items-center cursor-pointer group/scrubber touch-none select-none"
          title="Klik atau geser timeline untuk melompat ke detik video"
        >
          {/* Base Background Track */}
          <div className="w-full h-1.5 group-hover/scrubber:h-2 rounded-full bg-surface-container-highest/80 relative overflow-hidden transition-[height] duration-150">
            {/* Subtitle Segment Ticks (Sentence Boundaries) */}
            {captionSegments.map((seg, idx) => {
              const segStartRel = Math.max(0, seg.start - previewOffset - inPoint);
              const tickPct = (segStartRel / clipDuration) * 100;
              if (tickPct <= 0.5 || tickPct >= 99.5) return null;
              return (
                <div
                  key={idx}
                  style={{ left: `${tickPct}%` }}
                  className="absolute top-0 bottom-0 w-[1.5px] bg-white/20 pointer-events-none z-10"
                />
              );
            })}

            {/* Active Progress Fill Bar (TANPA transition width agar 100% sinkron dan menyatu dengan bulatan) */}
            <div
              style={{ width: `${displayPct}%` }}
              className="h-full bg-gradient-to-r from-primary via-violet-400 to-primary-container rounded-l-full shadow-[0_0_8px_rgba(139,92,246,0.5)]"
            />
          </div>

          {/* Hover Ghost Scrubber Line & Timecode Tooltip */}
          {hoverPct !== null && (
            <div
              style={{ left: `${hoverPct}%` }}
              className="absolute top-0 bottom-0 w-0.5 bg-white/60 pointer-events-none z-20 flex flex-col items-center"
            >
              <div className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded bg-black/90 backdrop-blur-md border border-white/20 text-[10px] font-mono font-bold text-white shadow-xl whitespace-nowrap pointer-events-none">
                {formatTimecode(hoverTime)}
              </div>
            </div>
          )}

          {/* Draggable Playhead Scrubber Head (Knob Bulat yang Selalu Menempel Pas di Ujung Garis Loading) */}
          <div
            style={{ left: `${displayPct}%` }}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none transition-transform duration-100 flex items-center justify-center ${
              isScrubbing ? 'scale-125' : 'group-hover/scrubber:scale-125 scale-100'
            }`}
          >
            <div className="w-3.5 h-3.5 rounded-full bg-white shadow-md border-2 border-primary flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            </div>
          </div>
        </div>

        {/* Lower Row: Timecode, Playback Controls, and View Options */}
        <div className="flex items-center justify-between text-xs">
          {/* Left: Playhead Timecode Counters */}
          <div className="flex items-center gap-1.5 font-mono select-none">
            <span className="font-timecode-display text-[12px] text-primary font-bold">
              {formatTimecode(displayTime)}
            </span>
            <span className="text-[11px] text-outline">/</span>
            <span className="font-timecode-display text-[11px] text-on-surface-variant font-medium">
              {formatTimecode(clipDuration)}
            </span>
          </div>

          {/* Center: Playback Controls */}
          <div className="flex items-center gap-1">
            {/* Jump to start */}
            <button
              onClick={() => onSeek(inPoint)}
              className="p-1.5 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
              title="Kembali ke Awal Klip (Home)"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            {/* Step 1 Frame Back */}
            <button
              onClick={() => onStepFrame(-1)}
              className="p-1.5 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
              title="Mundur 1 Frame (Arrow Left)"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {/* Master Play / Pause */}
            <button
              onClick={onPlayPause}
              className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-transform cursor-pointer"
              title="Play / Pause (Space)"
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              )}
            </button>

            {/* Step 1 Frame Forward */}
            <button
              onClick={() => onStepFrame(1)}
              className="p-1.5 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
              title="Maju 1 Frame (Arrow Right)"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            {/* Jump to end */}
            <button
              onClick={() => onSeek(Math.max(inPoint, outPoint - 0.05))}
              className="p-1.5 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
              title="Ke Akhir Klip (End)"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right: View Options */}
          <div className="flex items-center gap-1">
            {/* Cinema / Focus Mode Toggle */}
            {onToggleCinemaMode && (
              <button
                onClick={onToggleCinemaMode}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  isCinemaMode ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                }`}
                title={isCinemaMode ? 'Tampilkan Timeline (Keluar Mode Fokus)' : 'Perbesar Preview / Mode Fokus (Sembunyikan Timeline)'}
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Loop Playback */}
            <button
              onClick={onToggleLoop}
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                isLooping ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
              title="Loop Putar Klip (L)"
            >
              <Repeat className="w-3.5 h-3.5" />
            </button>

            {/* Fullscreen Viewport */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              title="Layar Penuh (F)"
            >
              {isFullscreen ? (
                <Minimize className="w-3.5 h-3.5" />
              ) : (
                <Maximize className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
