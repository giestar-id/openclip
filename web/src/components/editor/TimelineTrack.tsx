'use client';

import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Clip, CaptionSegment } from '@/lib/types';
import { formatTimecode } from '@/lib/captions';
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
} from 'lucide-react';

interface TimelineTrackProps {
  clip: Clip | null;
  captionSegments: CaptionSegment[];
  peaks: number[] | null;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onTrimChange: (startSec: number, endSec: number) => void;
  onTrimCommit?: (startSec: number, endSec: number) => void;
  onSplitClip?: (splitSec: number) => void;
  onDeleteCaptionSegment?: (segmentId: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function TimelineTrack({
  clip,
  captionSegments,
  peaks,
  currentTime,
  duration,
  onSeek,
  onTrimChange,
  onTrimCommit,
  onSplitClip,
  onDeleteCaptionSegment,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: TimelineTrackProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [magnet, setMagnet] = useState(true);
  const [selectedCaptionId, setSelectedCaptionId] = useState<string | null>(null);
  const [trimDrag, setTrimDrag] = useState<'in' | 'out' | null>(null);
  const [snapIndicatorTime, setSnapIndicatorTime] = useState<number | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastTrimRef = useRef<{ start: number; end: number } | null>(null);

  // Offset preview relative to original video
  const previewOffset = clip?.preview_start_sec ?? 0;
  const inPoint = Math.max(0, (clip?.start_sec ?? 0) - previewOffset);
  const outPoint = Math.min(duration || 60, (clip?.end_sec ?? (duration || 60)) - previewOffset);

  // Titik snap magnetik (OpenCut Snapping Engine)
  const snapPoints = useMemo(() => {
    const pts: number[] = [0, inPoint, outPoint];
    if (duration > 0) pts.push(duration);
    captionSegments.forEach((seg) => {
      pts.push(Math.max(0, seg.start - previewOffset));
      pts.push(Math.max(0.1, seg.end - previewOffset));
    });
    return Array.from(new Set(pts)).sort((a, b) => a - b);
  }, [inPoint, outPoint, duration, captionSegments, previewOffset]);

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
  const clipStart = clip?.start_sec ?? 0;
  const clipEnd = clip?.end_sec ?? (duration || 60);
  const canSplit = Boolean(clip && realPlayheadSec > clipStart + 0.5 && realPlayheadSec < clipEnd - 0.5);

  const handleSplitAtPlayhead = () => {
    if (!clip || !canSplit) return;
    onSplitClip?.(realPlayheadSec);
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

  // Keyboard shortcut listener (OpenCut & CapCut Pro Editing Shortcuts)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCaptionId) {
        e.preventDefault();
        onDeleteCaptionSegment?.(selectedCaptionId);
        setSelectedCaptionId(null);
      } else if (e.key === 's' || e.key === 'S' || e.key === 'c' || e.key === 'C') {
        if (canSplit) {
          e.preventDefault();
          handleSplitAtPlayhead();
        }
      } else if (e.key === '[') {
        e.preventDefault();
        handleTrimInAtPlayhead();
      } else if (e.key === ']') {
        e.preventDefault();
        handleTrimOutAtPlayhead();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setMagnet((prev) => !prev);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => Math.min(3, z + 0.25));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom((z) => Math.max(0.75, z - 0.25));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCaptionId, onDeleteCaptionSegment, canSplit, realPlayheadSec, clip, clipStart, clipEnd, duration, previewOffset, onTrimCommit]);

  // Handler mulai drag trim in/out
  const handleStartTrimDrag = (e: React.MouseEvent, type: 'in' | 'out') => {
    e.stopPropagation();
    e.preventDefault();
    setTrimDrag(type);
  };

  // Drag Trim In/Out Handle
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

  // Hitung posisi klik / scrub pada timeline canvas (dibatasi rentang inPoint dan outPoint)
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

  // Canvas-based Waveform Renderer (OpenCut AudioWaveform Engine)
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

      let amp = 0.2;
      if (peaks && peaks.length > 0) {
        const peakIdx = Math.min(peaks.length - 1, Math.floor((barTime / duration) * peaks.length));
        amp = Math.max(0.08, Math.min(1.0, peaks[peakIdx]));
      } else {
        const wave1 = Math.abs(Math.sin((barTime + previewOffset) * 4.2));
        const wave2 = Math.abs(Math.cos((barTime + previewOffset) * 1.8));
        const wave3 = Math.sin((barTime + previewOffset) * 12.0) * 0.2;
        amp = Math.max(0.12, Math.min(0.95, wave1 * 0.6 + wave2 * 0.4 + wave3));
      }

      const barHeight = Math.max(3, amp * (height - 6));
      const topY = midY - barHeight / 2;

      // Color coding:
      // Di luar rentang potongan aktif (Trimmed out): warna redup slate
      // Di dalam klip sebelum playhead (Sudah terputar): bright cyan (#4CD7F6)
      // Di dalam klip setelah playhead: secondary cyan (#38BDF8 dengan 65% opacity)
      if (barTime < inPoint || barTime > outPoint) {
        ctx.fillStyle = 'rgba(100, 116, 139, 0.22)';
      } else if (barTime <= currentTime) {
        ctx.fillStyle = '#4CD7F6';
      } else {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.65)';
      }

      ctx.beginPath();
      ctx.roundRect(x, topY, barWidth, barHeight, 1);
      ctx.fill();
    }
  }, [peaks, duration, currentTime, inPoint, outPoint, zoom, previewOffset]);

  return (
    <div className="h-44 min-h-[176px] max-h-[176px] flex flex-col bg-surface-container-lowest rounded-lg border border-surface-container-highest/30 shadow-md overflow-hidden select-none">
      {/* Timeline Toolbar Navigation & Controls (CapCut Style) */}
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
            className={`h-6 px-2 rounded text-[11px] font-medium flex items-center gap-1 transition-colors shrink-0 ${
              magnet
                ? 'bg-surface-container-highest text-primary font-semibold shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
            title="Snap magnetik otomatis"
          >
            <Magnet className="w-3.5 h-3.5" />
            <span>Magnet</span>
          </button>

          <div className="h-3.5 w-px bg-surface-container-highest mx-0.5 shrink-0" />

          {/* Split & Trim Controls */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Tombol Split (Bagi Klip di Playhead) */}
            <button
              type="button"
              onClick={handleSplitAtPlayhead}
              disabled={!canSplit}
              className={`h-6 px-2 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors border shadow-xs ${
                canSplit
                  ? 'bg-primary/15 hover:bg-primary/25 text-primary border-primary/30 cursor-pointer active:scale-95'
                  : 'bg-surface-container text-outline/40 border-transparent cursor-not-allowed'
              }`}
              title="Bagi klip video di posisi jarum playhead (CapCut Split - Shortcut: S)"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Bagi (Split)</span>
            </button>

            {/* Tombol Potong Kiri (Trim In) */}
            <button
              type="button"
              onClick={handleTrimInAtPlayhead}
              className="h-6 px-2 rounded text-[11px] font-medium bg-surface-container hover:bg-surface-bright text-on-surface flex items-center gap-1 transition-colors border border-outline-variant/20 shadow-xs active:scale-95"
              title="Potong bagian sebelum playhead (Jadikan titik awal klip)"
            >
              <ArrowRightToLine className="w-3.5 h-3.5 text-outline" />
              <span>Potong Kiri</span>
            </button>

            {/* Tombol Potong Kanan (Trim Out) */}
            <button
              type="button"
              onClick={handleTrimOutAtPlayhead}
              className="h-6 px-2 rounded text-[11px] font-medium bg-surface-container hover:bg-surface-bright text-on-surface flex items-center gap-1 transition-colors border border-outline-variant/20 shadow-xs active:scale-95"
              title="Potong bagian setelah playhead (Jadikan titik akhir klip)"
            >
              <ArrowLeftToLine className="w-3.5 h-3.5 text-outline" />
              <span>Potong Kanan</span>
            </button>
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

          {/* Tombol Hapus Caption jika ada yang dipilih */}
          {selectedCaptionId && (
            <>
              <div className="h-3.5 w-px bg-surface-container-highest mx-0.5 shrink-0" />
              <button
                type="button"
                onClick={() => {
                  onDeleteCaptionSegment?.(selectedCaptionId);
                  setSelectedCaptionId(null);
                }}
                className="h-6 px-2 rounded text-[11px] font-semibold bg-error/15 hover:bg-error/25 text-error flex items-center gap-1 transition-colors border border-error/30 shadow-xs shrink-0 cursor-pointer"
                title="Hapus baris subtitel yang sedang dipilih di timeline (Shortcut: Del / Backspace)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Subtitel</span>
              </button>
            </>
          )}
        </div>

        {/* OpenCut Keyboard Shortcuts & Zoom Controls */}
        <div className="flex items-center gap-2 text-xs text-outline shrink-0 relative">
          <button
            type="button"
            onClick={() => setShowShortcuts((s) => !s)}
            className={`h-6 px-1.5 rounded text-[10px] font-medium flex items-center gap-1 transition-colors border shadow-xs ${
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
                  className="text-outline hover:text-on-surface text-xs p-0.5 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Undo / Urungkan</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-mono text-[10px]">Ctrl + Z</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Redo / Ulangi</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-mono text-[10px]">Ctrl + Y</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Bagi Klip (Split)</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-mono text-[10px]">S / C</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Potong Kiri (Trim In)</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-mono text-[10px]">[</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Potong Kanan (Trim Out)</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-mono text-[10px]">]</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Hapus Subtitel Terpilih</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-mono text-[10px]">Del / Backspace</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Toggle Snap Magnetik</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-mono text-[10px]">M</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Zoom Timeline</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-mono text-[10px]">+ / -</kbd>
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
          <div className="h-6 bg-surface-container px-2 flex items-center justify-between text-outline font-label-sm text-[9px] font-mono">
            <span>TRACKS</span>
            <SlidersHorizontal className="w-3 h-3 text-outline" />
          </div>

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
          <div className="h-[52px] px-2 flex items-center justify-between bg-surface-container hover:bg-surface-container-high transition-colors">
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
          <div className="h-9 px-2 flex items-center justify-between bg-surface-container-low hover:bg-surface-container transition-colors">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="px-1 py-0.2 rounded bg-secondary-container/40 text-secondary font-label-sm text-[9px] font-bold">
                A1
              </span>
              <span className="font-label-sm text-[10px] text-on-surface truncate">Audio</span>
            </div>
            <AudioLines className="w-3 h-3 text-outline" />
          </div>
        </div>

        {/* Scrollable Timeline Canvas Body (Kunci overflow-y-hidden agar TIDAK PERLU scroll atas-bawah) */}
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
              {/* Playhead Flag Scrubber Top */}
              <div className="w-3 h-3 bg-primary text-on-primary flex items-center justify-center rounded-b-xs shadow-lg shadow-primary/40">
                <div className="w-1 h-1 bg-white rounded-full" />
              </div>
              {/* Laser Needle */}
              <div className="w-0.5 flex-1 bg-primary shadow-[0_0_8px_rgba(76,215,246,0.9)]" />
            </div>

            {/* Time Ruler Strip */}
            <div className="h-6 w-full bg-surface-container flex items-center px-2 select-none relative border-b border-surface-container-highest/40 font-mono text-[9px] text-outline">
              <div className="absolute inset-0 flex items-center justify-between px-3">
                <span>00:00:00</span>
                <span>{formatTimecode((duration || 60) * 0.25)}</span>
                <span className="text-primary font-bold">{formatTimecode((duration || 60) * 0.5)}</span>
                <span>{formatTimecode((duration || 60) * 0.75)}</span>
                <span>{formatTimecode(duration || 60)}</span>
              </div>
            </div>

            {/* Lane 1: Subtitle Track (T1) */}
            <div
              onClick={() => setSelectedCaptionId(null)}
              className="h-8 w-full relative flex items-center bg-surface-dim/40 border-b border-surface-container-highest/20 px-1 overflow-hidden"
            >
              {captionSegments.map((seg, idx) => {
                const segStart = Math.max(0, seg.start - previewOffset);
                const segEnd = Math.max(0.1, seg.end - previewOffset);
                const left = duration > 0 ? (segStart / duration) * 100 : 0;
                const width = duration > 0 ? ((segEnd - segStart) / duration) * 100 : 5;
                const isSelected = selectedCaptionId === seg.id;

                return (
                  <div
                    key={seg.id || idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCaptionId(seg.id);
                      onSeek(segStart);
                    }}
                    className={`absolute h-6.5 rounded px-1.5 flex items-center justify-between overflow-hidden shadow-sm transition-all text-[10px] font-mono cursor-pointer group ${
                      isSelected
                        ? 'bg-secondary/35 border-2 border-secondary ring-2 ring-secondary/50 text-white font-bold z-20 shadow-md'
                        : 'bg-tertiary/25 hover:bg-tertiary/40 border border-tertiary/40 text-tertiary-fixed hover:z-10'
                    }`}
                    style={{ left: `${left}%`, width: `${Math.max(2.5, width)}%` }}
                    title={`${seg.text} (Klik untuk pilih & hapus)`}
                  >
                    <span className="truncate flex-1">{seg.text}</span>
                    {isSelected && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteCaptionSegment?.(seg.id);
                          setSelectedCaptionId(null);
                        }}
                        className="ml-1 p-0.5 rounded hover:bg-error/30 text-error hover:text-white transition-colors"
                        title="Hapus baris caption ini"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Lane 2: Video Track (V1) With In/Out Range & Drag Trimmers */}
            <div className="h-[52px] w-full relative flex items-center bg-surface-dim/60 border-b border-surface-container-highest/20 px-0.5">
              {/* Dimmed Out-of-bounds left */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-black/50 z-10 pointer-events-none"
                style={{ width: `${inPointPercent}%` }}
              />

              {/* Active Video Clip Box */}
              <div
                className="absolute h-10 bg-primary/25 border-2 border-primary rounded overflow-hidden flex flex-col justify-between shadow-md relative group select-none"
                style={{
                  left: `${inPointPercent}%`,
                  width: `${Math.max(2, outPointPercent - inPointPercent)}%`,
                }}
              >
                {/* Drag Handle In-point (Kiri) */}
                <div
                  onMouseDown={(e) => handleStartTrimDrag(e, 'in')}
                  className="absolute left-0 top-0 bottom-0 w-2.5 bg-primary/90 hover:bg-primary cursor-ew-resize flex items-center justify-center z-20 group/handle"
                  title="Tarik untuk memotong durasi awal video (Trim In)"
                >
                  <div className="w-0.5 h-4 bg-white/90 rounded-full group-hover/handle:scale-y-110" />
                </div>

                {/* Header Klip Video / label */}
                <div className="flex items-center justify-between px-3 py-0.5 bg-primary/40 text-on-surface text-[9px] font-semibold truncate pointer-events-none">
                  <span className="truncate">{clip?.title || 'Klip Utama'}</span>
                  <span className="font-mono text-secondary ml-1 shrink-0">
                    {(outPoint - inPoint || 0).toFixed(1)}s
                  </span>
                </div>

                {/* Mock filmstrip frames */}
                <div className="flex-1 flex gap-1 p-0.5 opacity-30 overflow-hidden pointer-events-none">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="flex-1 h-full bg-surface-container-highest rounded-xs" />
                  ))}
                </div>

                {/* Drag Handle Out-point (Kanan) */}
                <div
                  onMouseDown={(e) => handleStartTrimDrag(e, 'out')}
                  className="absolute right-0 top-0 bottom-0 w-2.5 bg-primary/90 hover:bg-primary cursor-ew-resize flex items-center justify-center z-20 group/handle"
                  title="Tarik untuk memotong durasi akhir video (Trim Out)"
                >
                  <div className="w-0.5 h-4 bg-white/90 rounded-full group-hover/handle:scale-y-110" />
                </div>
              </div>

              {/* Dimmed Out-of-bounds right */}
              <div
                className="absolute top-0 bottom-0 right-0 bg-black/50 z-10 pointer-events-none"
                style={{ width: `${Math.max(0, 100 - outPointPercent)}%` }}
              />
            </div>

            {/* Lane 3: Audio Track (A1) Waveform (OpenCut Canvas Engine) */}
            <div className="h-9 w-full relative flex items-center bg-surface-container-lowest/40 px-1 overflow-hidden">
              <div className="w-full h-7 flex items-center px-1">
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
