'use client';

import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Clip, CaptionSegment, FrameSettings, EditorSelection, PeaksData } from '@/lib/types';
import {
  formatTimecode,
  getTimelineVideoBlocks,
  normalizeCutRanges,
  getEffectiveClipDuration,
} from '@/lib/captions';
import {
  Scissors,
  Magnet,
  ArrowRightToLine,
  ArrowLeftToLine,
  Trash2,
  ZoomIn,
  ZoomOut,
  SlidersHorizontal,
  Type,
  Film,
  AudioLines,
  X,
  Layers,
  Keyboard,
  Undo2,
  Redo2,
  RotateCcw,
  Sparkles,
  CopyPlus,
} from 'lucide-react';

interface TimelineTrackProps {
  clip: Clip | null;
  frame: FrameSettings;
  captionSegments: CaptionSegment[];
  peaks: PeaksData | null;
  currentTime: number;
  duration: number;
  isPlaying?: boolean;
  selectedElement?: EditorSelection;
  onSelectElement?: (sel: EditorSelection) => void;
  onDeleteSelectedElement?: () => void;
  onSeek: (time: number) => void;
  onTrimChange: (startSec: number, endSec: number) => void;
  onTrimCommit?: (startSec: number, endSec: number) => void;
  onSplitVideo?: (splitSec: number) => void;
  onSplitToNewClip?: (splitSec: number) => void;
  onDeleteVideoSegment?: (startSec: number, endSec: number) => void;
  onRestoreVideoSegment?: (startSec: number, endSec: number) => void;
  onDeleteCaptionSegment?: (segmentId: string) => void;
  onDeleteHookTitle?: () => void;
  onDeleteWatermark?: () => void;
  onUpdateFrame?: (frame: FrameSettings) => void;
  onPreviewFrame?: (frame: FrameSettings) => void;
  onCommitFrame?: (frame: FrameSettings, actionName?: string) => void;
  onPreviewSegments?: (segments: CaptionSegment[]) => void;
  onCommitSegments?: (segments: CaptionSegment[], actionName?: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function TimelineTrack({
  clip,
  frame,
  captionSegments,
  peaks,
  currentTime,
  duration,
  isPlaying = false,
  selectedElement = null,
  onSelectElement,
  onDeleteSelectedElement,
  onSeek,
  onTrimChange,
  onTrimCommit,
  onSplitVideo,
  onSplitToNewClip,
  onDeleteVideoSegment,
  onRestoreVideoSegment,
  onDeleteCaptionSegment,
  onDeleteHookTitle,
  onDeleteWatermark,
  onUpdateFrame,
  onPreviewFrame,
  onCommitFrame,
  onPreviewSegments,
  onCommitSegments,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: TimelineTrackProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [magnet, setMagnet] = useState(true);
  const [trimDrag, setTrimDrag] = useState<'in' | 'out' | null>(null);
  const [overlayTrimDrag, setOverlayTrimDrag] = useState<{
    target: 'hookTitle' | 'watermark';
    edge: 'start' | 'end';
  } | null>(null);
  const [captionTrimDrag, setCaptionTrimDrag] = useState<{
    segId: string;
    edge: 'start' | 'end';
  } | null>(null);
  const [snapIndicatorTime, setSnapIndicatorTime] = useState<number | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastTrimRef = useRef<{ start: number; end: number } | null>(null);
  const latestFrameRef = useRef<FrameSettings>(frame);
  const latestSegmentsRef = useRef<CaptionSegment[]>(captionSegments);
  const overlayMovedRef = useRef(false);
  const captionMovedRef = useRef(false);

  useEffect(() => {
    latestFrameRef.current = frame;
  }, [frame]);
  useEffect(() => {
    latestSegmentsRef.current = captionSegments;
  }, [captionSegments]);

  // Offset preview relative to original video
  const previewOffset = clip?.preview_start_sec ?? 0;
  const clipStart = clip?.start_sec ?? 0;
  const clipEnd = clip?.end_sec ?? (duration || 60);
  const inPoint = Math.max(0, clipStart - previewOffset);
  const outPoint = Math.min(duration || 60, clipEnd - previewOffset);
  const clipDuration = Math.max(0.1, outPoint - inPoint);

  // Multi-segment V1 blocks (Split & Non-Destructive Cut Ranges ala OpenCut)
  const videoBlocks = useMemo(
    () => getTimelineVideoBlocks(clipStart, clipEnd, frame.splitPoints, frame.cutRanges),
    [clipStart, clipEnd, frame.splitPoints, frame.cutRanges]
  );

  const normalizedCuts = useMemo(
    () => normalizeCutRanges(clipStart, clipEnd, frame.cutRanges),
    [clipStart, clipEnd, frame.cutRanges]
  );

  const effectiveDur = useMemo(
    () => getEffectiveClipDuration(clipStart, clipEnd, frame.cutRanges),
    [clipStart, clipEnd, frame.cutRanges]
  );

  const hasOverlays = Boolean(
    (frame.hookTitle?.enabled && frame.hookTitle.text?.trim()) ||
    (frame.watermark?.enabled && frame.watermark.text?.trim())
  );

  // Titik snap magnetik (OpenCut Snapping Engine)
  const snapPoints = useMemo(() => {
    const pts: number[] = [0, inPoint, outPoint];
    if (duration > 0) pts.push(duration);
    for (const sp of frame.splitPoints || []) {
      pts.push(Math.max(0, sp - previewOffset));
    }
    captionSegments.forEach((seg) => {
      pts.push(Math.max(0, seg.start - previewOffset));
      pts.push(Math.max(0.1, seg.end - previewOffset));
    });
    return Array.from(new Set(pts)).sort((a, b) => a - b);
  }, [inPoint, outPoint, duration, captionSegments, previewOffset, frame.splitPoints]);

  // Helper fungsi kalkulasi snapping magnetik (Threshold ~10px)
  const resolveSnapTime = (rawTime: number, excludeTime?: number): number => {
    if (!magnet || !timelineRef.current || !duration) {
      setSnapIndicatorTime(null);
      return rawTime;
    }
    const rect = timelineRef.current.getBoundingClientRect();
    const timelineWidth = Math.max(200, rect.width * zoom);
    const thresholdSec = (10 / timelineWidth) * duration;

    let closest: number | null = null;
    let minDist = Infinity;

    for (const sp of snapPoints) {
      if (excludeTime !== undefined && Math.abs(sp - excludeTime) < 0.05) continue;
      const dist = Math.abs(rawTime - sp);
      if (dist <= thresholdSec && dist < minDist) {
        minDist = dist;
        closest = sp;
      }
    }

    if (closest !== null) {
      setSnapIndicatorTime(closest);
      return closest;
    } else {
      setSnapIndicatorTime(null);
      return rawTime;
    }
  };

  // Posisi playhead dalam detik real video asli
  const realPlayheadSec = previewOffset + currentTime;
  const canSplit = Boolean(clip && realPlayheadSec > clipStart + 0.15 && realPlayheadSec < clipEnd - 0.15);

  const handleSplitAtPlayhead = () => {
    if (!clip || !canSplit) return;
    onSplitVideo?.(realPlayheadSec);
  };

  const handleTrimInAtPlayhead = () => {
    if (!clip) return;
    const newStart = Math.max(0, Math.min(clipEnd - 1, realPlayheadSec));
    onTrimChange(newStart, clipEnd);
    onTrimCommit?.(newStart, clipEnd);
  };

  const handleTrimOutAtPlayhead = () => {
    if (!clip) return;
    const newEnd = Math.max(clipStart + 1, Math.min(duration + previewOffset, realPlayheadSec));
    onTrimChange(clipStart, newEnd);
    onTrimCommit?.(clipStart, newEnd);
  };

  // Shortcut khusus timeline (Magnet M & Zoom +/-). Shortcut global (Delete/S/[/]/Space/Ctrl+Z) ditangani terpusat di page.tsx!
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setMagnet((prev) => !prev);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => Math.min(4, z + 0.5));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom((z) => Math.max(1, z - 0.5));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handler mulai drag trim in/out
  const handleStartTrimDrag = (e: React.MouseEvent, type: 'in' | 'out') => {
    e.stopPropagation();
    e.preventDefault();
    setTrimDrag(type);
  };

  // Drag Trim In/Out Handle pada V1
  useEffect(() => {
    if (!trimDrag) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current || !duration || !clip) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left + timelineRef.current.scrollLeft;
      const totalWidth = rect.width * zoom;
      const rawTime = Math.max(0, Math.min(duration, (clickX / totalWidth) * duration));

      if (trimDrag === 'in') {
        const snappedTime = resolveSnapTime(rawTime, outPoint);
        const realSec = previewOffset + snappedTime;
        const newStart = Math.max(0, Math.min(clipEnd - 1, realSec));
        lastTrimRef.current = { start: newStart, end: clipEnd };
        onTrimChange(newStart, clipEnd);
        onSeek(snappedTime);
      } else {
        const snappedTime = resolveSnapTime(rawTime, inPoint);
        const realSec = previewOffset + snappedTime;
        const newEnd = Math.max(clipStart + 1, Math.min(duration + previewOffset, realSec));
        lastTrimRef.current = { start: clipStart, end: newEnd };
        onTrimChange(clipStart, newEnd);
        onSeek(snappedTime);
      }
    };

    const handleMouseUp = () => {
      if (lastTrimRef.current) {
        onTrimCommit?.(lastTrimRef.current.start, lastTrimRef.current.end);
        lastTrimRef.current = null;
      }
      setTrimDrag(null);
      setSnapIndicatorTime(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [trimDrag, duration, zoom, previewOffset, clip, clipStart, clipEnd, onTrimChange, onTrimCommit, onSeek, inPoint, outPoint, snapPoints, magnet]);

  // Drag Trim Start/End Handle untuk Overlay (O1: Hook Title / Watermark) — Commit-on-Release!
  useEffect(() => {
    const liveFr = onPreviewFrame || onUpdateFrame;
    const commitFr = onCommitFrame || onUpdateFrame;
    if (!overlayTrimDrag || !liveFr) return;
    overlayMovedRef.current = false;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current || !duration) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left + timelineRef.current.scrollLeft;
      const totalWidth = rect.width * zoom;
      const rawPreviewTime = Math.max(inPoint, Math.min(outPoint, (clickX / totalWidth) * duration));
      const snappedPreview = resolveSnapTime(rawPreviewTime);
      const clampedPreview = Math.max(inPoint, Math.min(outPoint, snappedPreview));
      const relSec = Math.max(0, Math.min(clipDuration, Number((clampedPreview - inPoint).toFixed(2))));

      const curFrame = latestFrameRef.current;
      if (overlayTrimDrag.target === 'hookTitle' && curFrame.hookTitle) {
        const curStart = curFrame.hookTitle.startSec ?? 0;
        const curEnd = curFrame.hookTitle.endSec ?? clipDuration;
        const nextFrame: FrameSettings =
          overlayTrimDrag.edge === 'start'
            ? { ...curFrame, hookTitle: { ...curFrame.hookTitle, startSec: Math.min(curEnd - 0.3, relSec) } }
            : { ...curFrame, hookTitle: { ...curFrame.hookTitle, endSec: Math.max(curStart + 0.3, relSec) } };
        overlayMovedRef.current = true;
        latestFrameRef.current = nextFrame;
        liveFr(nextFrame);
      } else if (overlayTrimDrag.target === 'watermark' && curFrame.watermark) {
        const curStart = curFrame.watermark.startSec ?? 0;
        const curEnd = curFrame.watermark.endSec ?? clipDuration;
        const nextFrame: FrameSettings =
          overlayTrimDrag.edge === 'start'
            ? { ...curFrame, watermark: { ...curFrame.watermark, startSec: Math.min(curEnd - 0.3, relSec) } }
            : { ...curFrame, watermark: { ...curFrame.watermark, endSec: Math.max(curStart + 0.3, relSec) } };
        overlayMovedRef.current = true;
        latestFrameRef.current = nextFrame;
        liveFr(nextFrame);
      }
    };

    const handleMouseUp = () => {
      if (overlayMovedRef.current && commitFr) {
        commitFr(latestFrameRef.current, 'Trim Overlay Duration');
      }
      overlayMovedRef.current = false;
      setOverlayTrimDrag(null);
      setSnapIndicatorTime(null);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [overlayTrimDrag, duration, zoom, inPoint, outPoint, clipDuration, onUpdateFrame, onPreviewFrame, onCommitFrame, snapPoints, magnet]);

  // Drag Trim Start/End Handle untuk Subtitle (T1) — OpenCut-style Commit-on-Release!
  useEffect(() => {
    if (!captionTrimDrag || (!onPreviewSegments && !onCommitSegments)) return;
    captionMovedRef.current = false;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current || !duration) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left + timelineRef.current.scrollLeft;
      const totalWidth = rect.width * zoom;
      const rawPreviewTime = Math.max(0, Math.min(duration, (clickX / totalWidth) * duration));
      const curSegs = latestSegmentsRef.current;
      const idx = curSegs.findIndex((s) => s.id === captionTrimDrag.segId);
      if (idx === -1) return;

      const target = curSegs[idx];
      const excludePreview = Math.max(0, (captionTrimDrag.edge === 'start' ? target.start : target.end) - previewOffset);
      const snappedPreview = resolveSnapTime(rawPreviewTime, excludePreview);
      const realSec = previewOffset + snappedPreview;

      const prevEnd = idx > 0 ? curSegs[idx - 1].end : clipStart;
      const nextStart = idx + 1 < curSegs.length ? curSegs[idx + 1].start : clipEnd;

      let newStart = target.start;
      let newEnd = target.end;
      if (captionTrimDrag.edge === 'start') {
        newStart = Number(Math.max(prevEnd, Math.min(target.end - 0.25, realSec)).toFixed(3));
      } else {
        newEnd = Number(Math.min(nextStart, Math.max(target.start + 0.25, realSec)).toFixed(3));
      }

      if (Math.abs(newStart - target.start) < 0.01 && Math.abs(newEnd - target.end) < 0.01) return;

      const toks = target.words && target.words.length > 0
        ? target.words
        : (target.text || '').split(/\s+/).filter(Boolean).map((w) => ({ w, s: newStart, e: newEnd, hl: false }));
      const newDur = Math.max(0.15, newEnd - newStart);
      const step = newDur / Math.max(1, toks.length);
      const rescaledWords = toks.map((w, wIdx) => ({
        ...w,
        s: Number((newStart + wIdx * step).toFixed(3)),
        e: Number((newStart + (wIdx + 1) * step).toFixed(3)),
      }));

      const nextSegs = [...curSegs];
      nextSegs[idx] = {
        ...target,
        start: newStart,
        end: newEnd,
        words: rescaledWords,
      };
      captionMovedRef.current = true;
      latestSegmentsRef.current = nextSegs;
      onPreviewSegments?.(nextSegs);
    };

    const handleMouseUp = () => {
      if (captionMovedRef.current) {
        onCommitSegments?.(latestSegmentsRef.current, 'Trim Subtitle Timing');
      }
      captionMovedRef.current = false;
      setCaptionTrimDrag(null);
      setSnapIndicatorTime(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [captionTrimDrag, duration, zoom, previewOffset, clipStart, clipEnd, onPreviewSegments, onCommitSegments, snapPoints, magnet]);

  // Hitung posisi klik / scrub pada timeline canvas
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + timelineRef.current.scrollLeft;
    const totalWidth = rect.width * zoom;
    const rawTime = Math.max(0, Math.min(duration, (clickX / totalWidth) * duration));
    const snappedTime = resolveSnapTime(rawTime);
    const targetTime = Math.max(inPoint, Math.min(outPoint, snappedTime));
    onSeek(targetTime);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Jangan mulai scrubbing jika user mengklik elemen atau tombol di dalam track
    const targetEl = e.target as HTMLElement;
    if (targetEl.closest('[data-timeline-item]') || targetEl.closest('button')) return;
    onSelectElement?.(null);
    setIsScrubbing(true);
    handleTimelineClick(e);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isScrubbing || !timelineRef.current || !duration) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left + timelineRef.current.scrollLeft;
      const totalWidth = rect.width * zoom;
      const rawTime = Math.max(0, Math.min(duration, (clickX / totalWidth) * duration));
      const snappedTime = resolveSnapTime(rawTime);
      const targetTime = Math.max(inPoint, Math.min(outPoint, snappedTime));
      onSeek(targetTime);
    };

    const handleMouseUp = () => {
      setIsScrubbing(false);
      setSnapIndicatorTime(null);
    };

    if (isScrubbing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, duration, zoom, onSeek, inPoint, outPoint, snapPoints, magnet]);

  // Posisi playhead dalam persentase
  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const inPointPercent = duration > 0 ? (inPoint / duration) * 100 : 0;
  const outPointPercent = duration > 0 ? (outPoint / duration) * 100 : 100;

  // Auto-scroll timeline mengikuti playhead saat Zoom > 1x (OpenCut Follow Playhead)
  useEffect(() => {
    if (!isPlaying || zoom <= 1 || isScrubbing || trimDrag || overlayTrimDrag || captionTrimDrag) return;
    const container = timelineRef.current;
    if (!container || !duration) return;
    const viewportW = container.clientWidth;
    const totalW = viewportW * zoom;
    const playheadX = (currentTime / duration) * totalW;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + viewportW;

    if (playheadX > viewRight - viewportW * 0.12 || playheadX < viewLeft) {
      container.scrollLeft = Math.max(0, playheadX - viewportW * 0.2);
    }
  }, [currentTime, duration, zoom, isPlaying, isScrubbing, trimDrag, overlayTrimDrag, captionTrimDrag]);

  // Normalisasi struktur peaks.json ({ peaks: number[], rate: 25 } maupun number[])
  const normalizedPeaksInfo = useMemo(() => {
    if (!peaks) return null;
    const arr = Array.isArray(peaks) ? peaks : Array.isArray(peaks.peaks) ? peaks.peaks : null;
    if (!arr || arr.length === 0) return null;
    const rate = !Array.isArray(peaks) && peaks.rate ? peaks.rate : 25;
    let maxVal = !Array.isArray(peaks) && peaks.max ? peaks.max : 0;
    if (!maxVal) {
      for (let i = 0; i < arr.length; i += Math.max(1, Math.floor(arr.length / 500))) {
        if (arr[i] > maxVal) maxVal = arr[i];
      }
    }
    const scale = maxVal > 1.5 ? maxVal : 1.0;
    return { arr, rate, isSourceTimed: !Array.isArray(peaks), scale };
  }, [peaks]);

  // Canvas-based Real Audio Waveform Renderer (menghormati Trim In/Out DAN Cut Ranges!)
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !duration) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width <= 0 || height <= 0) return;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const barWidth = 2;
    const barGap = 1.5;
    const barStep = barWidth + barGap;
    const totalBars = Math.floor(width / barStep);
    const midY = height / 2;

    for (let i = 0; i < totalBars; i++) {
      const x = i * barStep;
      const barTime = (x / width) * duration;
      const realBarTime = previewOffset + barTime;

      let amp = 0.2;
      if (normalizedPeaksInfo) {
        const { arr, rate, isSourceTimed, scale } = normalizedPeaksInfo;
        const peakIdx = isSourceTimed
          ? Math.min(arr.length - 1, Math.max(0, Math.floor(realBarTime * rate)))
          : Math.min(arr.length - 1, Math.max(0, Math.floor((barTime / duration) * arr.length)));
        amp = Math.max(0.06, Math.min(1.0, (arr[peakIdx] || 0) / scale));
      } else {
        const wave1 = Math.abs(Math.sin(realBarTime * 4.2));
        const wave2 = Math.abs(Math.cos(realBarTime * 1.8));
        const wave3 = Math.sin(realBarTime * 12.0) * 0.2;
        amp = Math.max(0.12, Math.min(0.95, wave1 * 0.6 + wave2 * 0.4 + wave3));
      }

      const barHeight = Math.max(3, amp * (height - 4));
      const topY = midY - barHeight / 2;

      const isInCut = normalizedCuts.some((c) => realBarTime >= c.start && realBarTime <= c.end);

      if (barTime < inPoint || barTime > outPoint) {
        ctx.fillStyle = 'rgba(100, 116, 139, 0.2)';
      } else if (isInCut) {
        ctx.fillStyle = 'rgba(244, 63, 94, 0.28)';
      } else if (barTime <= currentTime) {
        ctx.fillStyle = '#4CD7F6';
      } else {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.65)';
      }

      ctx.beginPath();
      ctx.roundRect(x, topY, barWidth, barHeight, 1);
      ctx.fill();
    }
  }, [normalizedPeaksInfo, duration, currentTime, inPoint, outPoint, zoom, previewOffset, normalizedCuts]);

  // Label tombol hapus universal di toolbar sesuai elemen terpilih
  const deleteActionLabel = useMemo(() => {
    if (!selectedElement) return null;
    if (selectedElement.type === 'hookTitle') return 'Hapus Teks';
    if (selectedElement.type === 'watermark') return 'Hapus Watermark';
    if (selectedElement.type === 'caption') return 'Hapus Subtitel';
    if (selectedElement.type === 'videoSegment') {
      return selectedElement.isCut ? 'Pulihkan Video' : 'Hapus Bagian Video';
    }
    return 'Hapus Elemen';
  }, [selectedElement]);

  return (
    <div className="h-48 min-h-[192px] max-h-[192px] flex flex-col bg-surface-container-lowest rounded-lg border border-surface-container-highest/30 shadow-md overflow-hidden select-none">
      {/* Timeline Toolbar Navigation & Controls (OpenCut / CapCut Pro Style) */}
      <div className="h-8 px-2.5 bg-surface-container-high/80 flex items-center justify-between shrink-0 border-b border-surface-container-highest/40 gap-1.5">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <span className="font-label-sm text-xs font-semibold text-primary flex items-center gap-1.5 shrink-0">
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Timeline</span>
          </span>

          <div className="h-3.5 w-px bg-surface-container-highest mx-0.5 shrink-0" />

          {/* Magnet Button */}
          <button
            type="button"
            onClick={() => setMagnet(!magnet)}
            className={`h-6 px-2 rounded text-[11px] font-medium flex items-center gap-1 transition-colors shrink-0 cursor-pointer ${
              magnet
                ? 'bg-surface-container-highest text-primary font-semibold shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
            title="Snap magnetik otomatis (Shortcut: M)"
          >
            <Magnet className="w-3.5 h-3.5" />
            <span>Magnet</span>
          </button>

          <div className="h-3.5 w-px bg-surface-container-highest mx-0.5 shrink-0" />

          {/* Split & Trim Controls */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Tombol Split Non-Destruktif di V1 (OpenCut style) */}
            <button
              type="button"
              onClick={handleSplitAtPlayhead}
              disabled={!canSplit}
              className={`h-6 px-2 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors border shadow-xs ${
                canSplit
                  ? 'bg-primary/15 hover:bg-primary/25 text-primary border-primary/30 cursor-pointer active:scale-95'
                  : 'bg-surface-container text-outline/40 border-transparent cursor-not-allowed'
              }`}
              title="Bagi blok video di playhead agar bagian tengah bisa diklik & dihapus (Shortcut: S / C)"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Bagi (Split)</span>
            </button>

            {/* Tombol Potong Kiri (Trim In) */}
            <button
              type="button"
              onClick={handleTrimInAtPlayhead}
              className="h-6 px-2 rounded text-[11px] font-medium bg-surface-container hover:bg-surface-bright text-on-surface flex items-center gap-1 transition-colors border border-outline-variant/20 shadow-xs active:scale-95 cursor-pointer"
              title="Potong bagian sebelum playhead (Shortcut: [)"
            >
              <ArrowRightToLine className="w-3.5 h-3.5 text-outline" />
              <span>Potong Kiri</span>
            </button>

            {/* Tombol Potong Kanan (Trim Out) */}
            <button
              type="button"
              onClick={handleTrimOutAtPlayhead}
              className="h-6 px-2 rounded text-[11px] font-medium bg-surface-container hover:bg-surface-bright text-on-surface flex items-center gap-1 transition-colors border border-outline-variant/20 shadow-xs active:scale-95 cursor-pointer"
              title="Potong bagian setelah playhead (Shortcut: ])"
            >
              <ArrowLeftToLine className="w-3.5 h-3.5 text-outline" />
              <span>Potong Kanan</span>
            </button>

            {/* Tombol Opsional: Pecah ke Klip Baru di Rak Klip */}
            {onSplitToNewClip && (
              <button
                type="button"
                onClick={() => canSplit && onSplitToNewClip(realPlayheadSec)}
                disabled={!canSplit}
                className={`h-6 px-1.5 rounded text-[10px] font-medium flex items-center gap-1 transition-colors border ${
                  canSplit
                    ? 'bg-surface-container hover:bg-surface-bright text-on-surface-variant hover:text-on-surface border-outline-variant/20 cursor-pointer'
                    : 'bg-surface-container/40 text-outline/30 border-transparent cursor-not-allowed'
                }`}
                title="Pecah bagian kanan playhead menjadi Klip baru terpisah di Rak Klip AI"
              >
                <CopyPlus className="w-3 h-3" />
                <span className="hidden lg:inline">Klip Baru</span>
              </button>
            )}
          </div>

          <div className="h-3.5 w-px bg-surface-container-highest mx-0.5 shrink-0" />

          {/* Undo / Redo Controls on Timeline */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={`h-6 px-2 rounded text-[11px] font-medium flex items-center gap-1 transition-all border shadow-xs ${
                canUndo
                  ? 'bg-surface-container hover:bg-surface-bright text-on-surface border-outline-variant/30 cursor-pointer active:scale-95'
                  : 'bg-surface-container/40 text-outline/30 border-transparent cursor-not-allowed'
              }`}
              title="Urungkan perubahan (Undo - Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Undo</span>
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className={`h-6 px-2 rounded text-[11px] font-medium flex items-center gap-1 transition-all border shadow-xs ${
                canRedo
                  ? 'bg-surface-container hover:bg-surface-bright text-on-surface border-outline-variant/30 cursor-pointer active:scale-95'
                  : 'bg-surface-container/40 text-outline/30 border-transparent cursor-not-allowed'
              }`}
              title="Ulangi perubahan (Redo - Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Redo</span>
            </button>
          </div>

          {/* Universal Delete / Restore Button untuk Elemen Terpilih (OpenCut Timeline Toolbar!) */}
          {selectedElement && deleteActionLabel && (
            <>
              <div className="h-3.5 w-px bg-surface-container-highest mx-0.5 shrink-0" />
              <button
                type="button"
                onClick={() => onDeleteSelectedElement?.()}
                className={`h-6 px-2 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors border shadow-xs shrink-0 cursor-pointer active:scale-95 ${
                  selectedElement.type === 'videoSegment' && selectedElement.isCut
                    ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                    : 'bg-error/15 hover:bg-error/25 text-error border-error/30'
                }`}
                title="Hapus atau pulihkan elemen yang sedang dipilih (Shortcut: Delete / Backspace)"
              >
                {selectedElement.type === 'videoSegment' && selectedElement.isCut ? (
                  <RotateCcw className="w-3.5 h-3.5" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{deleteActionLabel}</span>
              </button>
            </>
          )}
        </div>

        {/* OpenCut Keyboard Shortcuts & Zoom Controls */}
        <div className="flex items-center gap-2 text-xs text-outline shrink-0 relative">
          {normalizedCuts.length > 0 && (
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 hidden md:inline"
              title="Durasi efektif setelah pemotongan bagian tengah"
            >
              Efektif: {effectiveDur.toFixed(1)}s ({normalizedCuts.length} cut)
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowShortcuts((s) => !s)}
            className={`h-6 px-1.5 rounded text-[10px] font-medium flex items-center gap-1 transition-colors border shadow-xs cursor-pointer ${
              showShortcuts
                ? 'bg-primary/20 text-primary border-primary/40 font-semibold'
                : 'bg-surface-container border-outline-variant/30 text-outline hover:text-on-surface hover:bg-surface-bright'
            }`}
            title="Daftar Pintasan Keyboard (Editor Shortcuts)"
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Shortcuts</span>
          </button>

          {/* Floating Shortcuts Modal Popover */}
          {showShortcuts && (
            <div className="absolute right-0 bottom-full mb-2 z-50 w-64 bg-surface-container p-3 rounded-lg border border-outline-variant/40 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 text-on-surface">
              <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20 mb-2">
                <div className="flex items-center gap-1.5 font-bold text-xs text-primary">
                  <Keyboard className="w-4 h-4" />
                  <span>Pintasan Keyboard Editor</span>
                </div>
                <button
                  onClick={() => setShowShortcuts(false)}
                  className="text-outline hover:text-on-surface text-xs p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Hapus Elemen Terpilih</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-mono text-[10px]">Del / Backspace</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Bagi Video (Split V1)</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-mono text-[10px]">S / C</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Undo / Redo</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-mono text-[10px]">Ctrl + Z / Y</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Potong Kiri / Kanan</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-mono text-[10px]">[ / ]</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Awal / Akhir Klip</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-mono text-[10px]">Home / End</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Toggle Snap Magnetik</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-mono text-[10px]">M</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Layar Penuh / Loop</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-mono text-[10px]">F / L</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Play / Pause</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-mono text-[10px]">Space</kbd>
                </div>
              </div>
            </div>
          )}

          {/* Zoom Controls */}
          <div className="flex items-center gap-1.5">
            <button onClick={() => setZoom(Math.max(1, zoom - 0.5))} className="hover:text-on-surface p-0.5 cursor-pointer" title="Zoom Out (-)">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min="1"
              max="4"
              step="0.5"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-16 h-1 accent-primary bg-surface-container-high rounded cursor-pointer"
            />
            <button onClick={() => setZoom(Math.min(4, zoom + 0.5))} className="hover:text-on-surface p-0.5 cursor-pointer" title="Zoom In (+)">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[9px] w-5 text-right">{zoom}x</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Track Headers + Tracks Canvas */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Fixed Track Headers Column */}
        <div className="w-28 sm:w-32 bg-surface-container-low shrink-0 flex flex-col divide-y divide-surface-container-highest/40 z-20 shadow-md border-r border-surface-container-highest/40 text-[10px]">
          {/* Header Corner Cell */}
          <div className="h-5 bg-surface-container px-2 flex items-center justify-between text-outline font-label-sm text-[9px] font-mono">
            <span>TRACKS</span>
            <SlidersHorizontal className="w-3 h-3 text-outline" />
          </div>

          {/* O1 Overlay Header (Teks Tambahan & Watermark) */}
          {hasOverlays && (
            <div className="h-6 px-2 flex items-center justify-between bg-surface-container-low hover:bg-surface-container transition-colors">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="px-1 py-0.2 rounded bg-violet-500/25 text-violet-300 font-label-sm text-[9px] font-bold">
                  O1
                </span>
                <span className="font-label-sm text-[10px] text-on-surface truncate">Overlay</span>
              </div>
              <Sparkles className="w-3 h-3 text-violet-400" />
            </div>
          )}

          {/* T1 Subtitle Header */}
          <div className="h-8 px-2 flex items-center justify-between bg-surface-container-low hover:bg-surface-container transition-colors">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="px-1 py-0.2 rounded bg-tertiary-container/30 text-tertiary font-label-sm text-[9px] font-bold">
                T1
              </span>
              <span className="font-label-sm text-[10px] text-on-surface truncate">Subtitel</span>
            </div>
            <Type className="w-3 h-3 text-outline" />
          </div>

          {/* V1 Video Header */}
          <div className="flex-1 min-h-[46px] px-2 flex items-center justify-between bg-surface-container hover:bg-surface-container-high transition-colors">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="px-1 py-0.2 rounded bg-primary text-on-primary font-label-sm text-[9px] font-bold">
                V1
              </span>
              <span className="font-label-sm text-[10px] text-on-surface font-semibold truncate">
                Video Klip
              </span>
            </div>
            <Film className="w-3 h-3 text-outline" />
          </div>

          {/* A1 Audio Header */}
          <div className="h-8 px-2 flex items-center justify-between bg-surface-container-low hover:bg-surface-container transition-colors">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="px-1 py-0.2 rounded bg-secondary-container/40 text-secondary font-label-sm text-[9px] font-bold">
                A1
              </span>
              <span className="font-label-sm text-[10px] text-on-surface truncate">Audio</span>
            </div>
            <AudioLines className="w-3 h-3 text-outline" />
          </div>
        </div>

        {/* Scrollable Timeline Canvas Body */}
        <div
          ref={timelineRef}
          onMouseDown={handleMouseDown}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-surface-dim cursor-pointer"
        >
          <div
            className="h-full flex flex-col relative"
            style={{ width: `${Math.max(100, zoom * 100)}%` }}
          >
            {/* OpenCut Magnetic Snap Guide Line */}
            {snapIndicatorTime !== null && duration > 0 && (
              <div
                className="absolute top-0 bottom-0 z-35 pointer-events-none flex flex-col items-center transition-all duration-75"
                style={{ left: `${(snapIndicatorTime / duration) * 100}%` }}
              >
                <div className="w-2.5 h-2.5 bg-yellow-400 rotate-45 -mt-1 shadow-[0_0_8px_rgba(250,204,21,1)]" />
                <div className="w-0.5 flex-1 bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.9)]" />
                <div className="w-2 h-2 bg-yellow-400 rotate-45 -mb-0.5 shadow-[0_0_8px_rgba(250,204,21,1)]" />
              </div>
            )}

            {/* Playhead Laser Needle Line */}
            <div
              className="absolute top-0 bottom-0 z-30 pointer-events-none flex flex-col items-center transition-all duration-75"
              style={{ left: `${playheadPercent}%` }}
            >
              <div className="w-3 h-3 bg-primary text-on-primary flex items-center justify-center rounded-b-xs shadow-lg shadow-primary/40">
                <div className="w-1 h-1 bg-white rounded-full" />
              </div>
              <div className="w-0.5 flex-1 bg-primary shadow-[0_0_8px_rgba(76,215,246,0.9)]" />
            </div>

            {/* Time Ruler Strip */}
            <div className="h-5 w-full bg-surface-container flex items-center px-2 select-none relative border-b border-surface-container-highest/40 font-mono text-[9px] text-outline shrink-0">
              <div className="absolute inset-0 flex items-center justify-between px-3">
                <span>00:00:00</span>
                <span>{formatTimecode((duration || 60) * 0.25)}</span>
                <span className="text-primary font-bold">{formatTimecode((duration || 60) * 0.5)}</span>
                <span>{formatTimecode((duration || 60) * 0.75)}</span>
                <span>{formatTimecode(duration || 60)}</span>
              </div>
            </div>

            {/* Lane O1: Overlay Track (Hook Title & Watermark dengan durasi & hapus langsung) */}
            {hasOverlays && (
              <div className="h-6 w-full relative flex items-center bg-violet-950/15 border-b border-surface-container-highest/20 px-1 overflow-hidden shrink-0">
                {frame.hookTitle?.enabled && frame.hookTitle.text?.trim() && (() => {
                  const htStart = inPoint + (frame.hookTitle.startSec ?? 0);
                  const htEnd = inPoint + (frame.hookTitle.endSec ?? clipDuration);
                  const leftPct = duration > 0 ? (htStart / duration) * 100 : 0;
                  const widthPct = duration > 0 ? ((htEnd - htStart) / duration) * 100 : 20;
                  const isSel = selectedElement?.type === 'hookTitle';
                  return (
                    <div
                      data-timeline-item
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectElement?.({ type: 'hookTitle' });
                      }}
                      className={`absolute h-5 rounded px-2 flex items-center justify-between overflow-hidden text-[9px] font-semibold cursor-pointer ${
                        isSel
                          ? 'bg-violet-500/45 border-2 border-violet-300 ring-1 ring-violet-400 text-white z-20'
                          : 'bg-violet-500/25 hover:bg-violet-500/35 border border-violet-400/50 text-violet-100 z-10'
                      }`}
                      style={{ left: `${leftPct}%`, width: `${Math.max(4, widthPct)}%` }}
                      title={`Teks: ${frame.hookTitle.text} (Klik untuk pilih, Del untuk hapus, seret ujung untuk atur durasi)`}
                    >
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setOverlayTrimDrag({ target: 'hookTitle', edge: 'start' });
                        }}
                        className="absolute left-0 top-0 bottom-0 w-1.5 bg-violet-300/80 cursor-ew-resize"
                      />
                      <span className="truncate flex-1 pl-1">T+ {frame.hookTitle.text}</span>
                      {isSel && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteHookTitle?.();
                          }}
                          className="ml-1 p-0.5 rounded hover:bg-error/40 text-rose-200 hover:text-white cursor-pointer z-20"
                          title="Hapus Teks Tambahan (Del)"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setOverlayTrimDrag({ target: 'hookTitle', edge: 'end' });
                        }}
                        className="absolute right-0 top-0 bottom-0 w-1.5 bg-violet-300/80 cursor-ew-resize"
                      />
                    </div>
                  );
                })()}

                {frame.watermark?.enabled && frame.watermark.text?.trim() && (() => {
                  const wmStart = inPoint + (frame.watermark.startSec ?? 0);
                  const wmEnd = inPoint + (frame.watermark.endSec ?? clipDuration);
                  const leftPct = duration > 0 ? (wmStart / duration) * 100 : 0;
                  const widthPct = duration > 0 ? ((wmEnd - wmStart) / duration) * 100 : 20;
                  const isSel = selectedElement?.type === 'watermark';
                  const hasHt = Boolean(frame.hookTitle?.enabled && frame.hookTitle.text?.trim());
                  return (
                    <div
                      data-timeline-item
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectElement?.({ type: 'watermark' });
                      }}
                      className={`absolute rounded px-2 flex items-center justify-between overflow-hidden text-[9px] font-semibold cursor-pointer ${
                        hasHt ? 'h-3 bottom-0' : 'h-5'
                      } ${
                        isSel
                          ? 'bg-emerald-500/45 border border-emerald-300 ring-1 ring-emerald-400 text-white z-25'
                          : 'bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-400/50 text-emerald-100 z-15'
                      }`}
                      style={{ left: `${leftPct}%`, width: `${Math.max(4, widthPct)}%` }}
                      title={`Watermark: ${frame.watermark.text} (Klik untuk pilih, Del untuk hapus)`}
                    >
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setOverlayTrimDrag({ target: 'watermark', edge: 'start' });
                        }}
                        className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-300/80 cursor-ew-resize"
                      />
                      <span className="truncate flex-1 pl-1">@{frame.watermark.text.replace(/^@/, '')}</span>
                      {isSel && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteWatermark?.();
                          }}
                          className="ml-1 p-0.5 rounded hover:bg-error/40 text-rose-200 hover:text-white cursor-pointer z-20"
                          title="Hapus Watermark (Del)"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setOverlayTrimDrag({ target: 'watermark', edge: 'end' });
                        }}
                        className="absolute right-0 top-0 bottom-0 w-1.5 bg-emerald-300/80 cursor-ew-resize"
                      />
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Lane 1: Subtitle Track (T1) — OpenCut Edge Trim + Anti-scrub-conflict! */}
            <div className="h-8 w-full relative flex items-center bg-surface-dim/40 border-b border-surface-container-highest/20 px-1 overflow-hidden shrink-0">
              {captionSegments.map((seg, idx) => {
                const segStart = Math.max(0, seg.start - previewOffset);
                const segEnd = Math.max(0.1, seg.end - previewOffset);
                const left = duration > 0 ? (segStart / duration) * 100 : 0;
                const width = duration > 0 ? ((segEnd - segStart) / duration) * 100 : 5;
                const isSelected =
                  selectedElement?.type === 'caption' && selectedElement.segmentId === seg.id;
                const segMidReal = (seg.start + seg.end) / 2;
                const isOutsideOrCut =
                  seg.end <= clipStart ||
                  seg.start >= clipEnd ||
                  normalizedCuts.some((c) => segMidReal >= c.start && segMidReal <= c.end);

                return (
                  <div
                    key={seg.id || idx}
                    data-timeline-item
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectElement?.({ type: 'caption', segmentId: seg.id });
                      onSeek(segStart);
                    }}
                    className={`absolute h-6 rounded px-1.5 flex items-center justify-between overflow-hidden shadow-sm transition-all text-[10px] font-mono cursor-pointer group ${
                      isSelected
                        ? 'bg-secondary/35 border-2 border-secondary ring-2 ring-secondary/50 text-white font-bold z-20 shadow-md'
                        : isOutsideOrCut
                        ? 'bg-surface-container/30 border border-outline-variant/25 text-outline/50 opacity-45'
                        : 'bg-tertiary/25 hover:bg-tertiary/40 border border-tertiary/40 text-tertiary-fixed hover:z-10'
                    }`}
                    style={{ left: `${left}%`, width: `${Math.max(2.5, width)}%` }}
                    title={`${seg.text} (Klik untuk pilih, seret tepi untuk atur waktu, tekan Delete untuk hapus)`}
                  >
                    {isSelected && (onPreviewSegments || onCommitSegments) && (
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setCaptionTrimDrag({ segId: seg.id, edge: 'start' });
                        }}
                        className="absolute left-0 top-0 bottom-0 w-1.5 bg-secondary cursor-ew-resize z-30"
                        title="Tarik tepi kiri untuk mengatur waktu mulai subtitel"
                      />
                    )}
                    <span className={`truncate flex-1 ${isSelected ? 'pl-1' : ''}`}>{seg.text}</span>
                    {isSelected && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteCaptionSegment?.(seg.id);
                        }}
                        className="ml-1 p-0.5 rounded hover:bg-error/30 text-error hover:text-white transition-colors cursor-pointer z-30"
                        title="Hapus baris caption ini (Del)"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                    {isSelected && (onPreviewSegments || onCommitSegments) && (
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setCaptionTrimDrag({ segId: seg.id, edge: 'end' });
                        }}
                        className="absolute right-0 top-0 bottom-0 w-1.5 bg-secondary cursor-ew-resize z-30"
                        title="Tarik tepi kanan untuk mengatur waktu selesai subtitel"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Lane 2: Video Track (V1) Multi-Segment Blocks + In/Out Trimmers */}
            <div className="flex-1 min-h-[46px] w-full relative flex items-center bg-surface-dim/60 border-b border-surface-container-highest/20 px-0.5">
              {/* Dimmed Out-of-bounds left */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-black/50 z-10 pointer-events-none"
                style={{ width: `${inPointPercent}%` }}
              />

              {/* Render setiap segmen blok video V1 (bisa diklik & dihapus dengan Delete!) */}
              {videoBlocks.map((blk, idx) => {
                const blkStartPrev = Math.max(0, blk.start - previewOffset);
                const blkEndPrev = Math.min(duration || 60, blk.end - previewOffset);
                const leftPct = duration > 0 ? (blkStartPrev / duration) * 100 : 0;
                const widthPct = duration > 0 ? ((blkEndPrev - blkStartPrev) / duration) * 100 : 100;
                const isFirst = idx === 0;
                const isLast = idx === videoBlocks.length - 1;
                const isSelected =
                  selectedElement?.type === 'videoSegment' &&
                  Math.abs(selectedElement.start - blk.start) < 0.05 &&
                  Math.abs(selectedElement.end - blk.end) < 0.05;

                return (
                  <div
                    key={blk.id}
                    data-timeline-item
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectElement?.({
                        type: 'videoSegment',
                        start: blk.start,
                        end: blk.end,
                        isCut: blk.isCut,
                      });
                    }}
                    className={`absolute h-9 rounded overflow-hidden flex flex-col justify-between shadow-md select-none cursor-pointer transition-all ${
                      blk.isCut
                        ? isSelected
                          ? 'bg-rose-950/60 border-2 border-dashed border-rose-400 ring-2 ring-rose-400/40 z-20'
                          : 'bg-rose-950/35 border border-dashed border-rose-500/50 hover:border-rose-400 opacity-75 z-10'
                        : isSelected
                        ? 'bg-primary/35 border-2 border-white ring-2 ring-primary/70 z-20'
                        : 'bg-primary/25 border-2 border-primary hover:bg-primary/30 z-10'
                    }`}
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(1.5, widthPct)}%`,
                    }}
                    title={
                      blk.isCut
                        ? `Bagian dibuang (${(blk.end - blk.start).toFixed(1)}s) — Klik lalu tekan Del / Pulihkan untuk mengembalikan`
                        : `Bagian Video ${idx + 1} (${(blk.end - blk.start).toFixed(1)}s) — Klik lalu tekan Delete untuk membuang bagian ini`
                    }
                  >
                    {/* Drag Handle In-point (Kiri — hanya di blok pertama) */}
                    {isFirst && (
                      <div
                        onMouseDown={(e) => handleStartTrimDrag(e, 'in')}
                        className="absolute left-0 top-0 bottom-0 w-2.5 bg-primary/90 hover:bg-primary cursor-ew-resize flex items-center justify-center z-25 group/handle"
                        title="Tarik untuk memotong durasi awal video (Trim In)"
                      >
                        <div className="w-0.5 h-4 bg-white/90 rounded-full group-hover/handle:scale-y-110" />
                      </div>
                    )}

                    {/* Header label blok video */}
                    <div
                      className={`flex items-center justify-between px-2.5 py-0.5 text-[9px] font-semibold truncate ${
                        blk.isCut ? 'bg-rose-900/50 text-rose-200' : 'bg-primary/40 text-on-surface'
                      }`}
                    >
                      <span className="truncate pointer-events-none">
                        {blk.isCut
                          ? `Dihapus`
                          : videoBlocks.length > 1
                          ? `Bagian ${idx + 1}`
                          : clip?.title || 'Klip Utama'}
                      </span>
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        <span className="font-mono text-[8px] opacity-90 pointer-events-none">
                          {(blk.end - blk.start).toFixed(1)}s
                        </span>
                        {isSelected && !blk.isCut && videoBlocks.length > 1 && (
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteVideoSegment?.(blk.start, blk.end);
                            }}
                            className="p-0.5 rounded bg-rose-500/80 hover:bg-rose-500 text-white cursor-pointer z-30"
                            title="Hapus bagian video ini (Del)"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        )}
                        {blk.isCut && (
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRestoreVideoSegment?.(blk.start, blk.end);
                            }}
                            className="p-0.5 rounded bg-emerald-500/80 hover:bg-emerald-500 text-white cursor-pointer z-30"
                            title="Pulihkan bagian video ini"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Visual filmstrip / hatched cut pattern */}
                    {blk.isCut ? (
                      <div
                        className="flex-1 opacity-40 pointer-events-none"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(45deg, rgba(244,63,94,0.35), rgba(244,63,94,0.35) 4px, transparent 4px, transparent 8px)',
                        }}
                      />
                    ) : (
                      <div className="flex-1 flex gap-1 p-0.5 opacity-25 overflow-hidden pointer-events-none">
                        {Array.from({ length: Math.max(3, Math.round(widthPct / 8)) }).map((_, i) => (
                          <div key={i} className="flex-1 h-full bg-surface-container-highest rounded-xs" />
                        ))}
                      </div>
                    )}

                    {/* Drag Handle Out-point (Kanan — hanya di blok terakhir) */}
                    {isLast && (
                      <div
                        onMouseDown={(e) => handleStartTrimDrag(e, 'out')}
                        className="absolute right-0 top-0 bottom-0 w-2.5 bg-primary/90 hover:bg-primary cursor-ew-resize flex items-center justify-center z-25 group/handle"
                        title="Tarik untuk memotong durasi akhir video (Trim Out)"
                      >
                        <div className="w-0.5 h-4 bg-white/90 rounded-full group-hover/handle:scale-y-110" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Dimmed Out-of-bounds right */}
              <div
                className="absolute top-0 bottom-0 right-0 bg-black/50 z-10 pointer-events-none"
                style={{ width: `${Math.max(0, 100 - outPointPercent)}%` }}
              />
            </div>

            {/* Lane 3: Audio Track (A1) Waveform */}
            <div className="h-8 w-full relative flex items-center bg-surface-container-lowest/40 px-1 overflow-hidden shrink-0">
              <div className="w-full h-6 flex items-center px-1">
                <canvas
                  ref={waveformCanvasRef}
                  className="w-full h-full block"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
