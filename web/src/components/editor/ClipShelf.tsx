'use client';

import React, { useState, useRef } from 'react';
import { Clip } from '@/lib/types';
import { formatDuration } from '@/lib/captions';
import {
  Film,
  TrendingUp,
  Star,
  ChevronLeft,
  ChevronRight,
  Plus,
  Download,
  Trash2,
  Layers,
} from 'lucide-react';

interface ClipShelfProps {
  clips: Clip[];
  selectedClipId: number | null;
  onSelectClip: (clip: Clip) => void;
  onToggleFavorite: (clipId: number, isFav: boolean) => void;
  onDeleteClip: (clipId: number) => void;
  onOpenManualClip: () => void;
  onOpenBatchExport?: () => void;
}

export function ClipShelf({
  clips,
  selectedClipId,
  onSelectClip,
  onToggleFavorite,
  onDeleteClip,
  onOpenManualClip,
  onOpenBatchExport,
}: ClipShelfProps) {
  const [filter, setFilter] = useState<'all' | 'viral' | 'fav'>('all');
  const rowRef = useRef<HTMLDivElement>(null);

  // Mouse Drag-to-Scroll state
  const [isMouseDown, setIsMouseDown] = useState(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasDraggedRef = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!rowRef.current) return;
    setIsMouseDown(true);
    hasDraggedRef.current = false;
    startXRef.current = e.pageX - rowRef.current.offsetLeft;
    scrollLeftRef.current = rowRef.current.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDown || !rowRef.current) return;
    const x = e.pageX - rowRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.3;
    if (Math.abs(walk) > 4) {
      hasDraggedRef.current = true;
    }
    rowRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const handleMouseUpOrLeave = () => {
    setIsMouseDown(false);
  };

  // Mouse wheel horizontal scroll
  const handleWheel = (e: React.WheelEvent) => {
    if (rowRef.current && e.deltaY !== 0) {
      rowRef.current.scrollLeft += e.deltaY;
    }
  };

  const filteredClips = clips.filter((c) => {
    if (filter === 'viral') return c.viral_score >= 80;
    if (filter === 'fav') return Boolean(c.is_favorite);
    return true;
  });

  return (
    <div className="h-44 min-h-[176px] max-h-[176px] flex flex-col justify-between bg-surface-container-low rounded-lg p-2.5 border border-surface-container-highest/30 shadow-md select-none overflow-hidden">
      {/* Shelf Header & Filter Tabs */}
      <div className="flex items-center justify-between mb-1.5 shrink-0 h-6.5">
        {/* Grup Filter Kiri (Semua, Viral, Favorit) */}
        <div className="flex items-center gap-1 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setFilter('all')}
            className={`h-6.5 px-2.5 rounded text-[11px] font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
              filter === 'all'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
            }`}
          >
            <Film className="w-3 h-3" />
            <span>Semua ({clips.length})</span>
          </button>
          <button
            onClick={() => setFilter('viral')}
            className={`h-6.5 px-2.5 rounded text-[11px] font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
              filter === 'viral'
                ? 'bg-secondary text-on-secondary shadow-xs'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            <span>Top &gt;80</span>
          </button>
          <button
            onClick={() => setFilter('fav')}
            className={`h-6.5 px-2.5 rounded text-[11px] font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
              filter === 'fav'
                ? 'bg-tertiary text-on-tertiary shadow-xs'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
            }`}
          >
            <Star className="w-3 h-3 fill-current" />
            <span>Favorit</span>
          </button>
        </div>

        {/* Grup Aksi Kanan (Panah Geser & Klip Manual) */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Scroll Navigation Arrows */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => rowRef.current?.scrollBy({ left: -260, behavior: 'smooth' })}
              className="h-6.5 w-6.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors border border-outline-variant/20 shadow-xs"
              title="Geser klip ke kiri"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => rowRef.current?.scrollBy({ left: 260, behavior: 'smooth' })}
              className="h-6.5 w-6.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors border border-outline-variant/20 shadow-xs"
              title="Geser klip ke kanan"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add Manual Clip Button */}
          <button
            onClick={onOpenManualClip}
            className="h-6.5 px-2 bg-surface-container-high hover:bg-surface-bright text-on-surface hover:text-primary rounded font-semibold text-[11px] flex items-center gap-1.5 transition-colors border border-outline-variant/20 shadow-xs shrink-0"
            title="Tambah klip secara manual"
          >
            <Plus className="w-3 h-3 text-primary" />
            <span>Klip Manual</span>
          </button>

          {/* Export All Button */}
          {onOpenBatchExport && (
            <button
              type="button"
              onClick={onOpenBatchExport}
              className="h-6.5 px-2.5 bg-primary/15 hover:bg-primary/25 text-primary rounded font-semibold text-[11px] flex items-center gap-1.5 transition-colors border border-primary/30 shadow-xs shrink-0"
              title="Ekspor seluruh klip sekaligus (Batch Export MP4)"
            >
              <Layers className="w-3 h-3" />
              <span>Ekspor Semua</span>
            </button>
          )}
        </div>
      </div>

      {/* Horizontal Scrollable Clips Row (Terkunci overflow-y-hidden agar TIDAK PERLU scroll atas-bawah) */}
      <div
        ref={rowRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        className={`flex-1 flex items-center gap-2.5 overflow-x-auto overflow-y-hidden px-1 py-0.5 scrollbar-thin select-none ${
          isMouseDown ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {filteredClips.map((clip) => {
          const isSelected = clip.id === selectedClipId;
          const dur = (clip.end_sec - clip.start_sec) || 30;
          const thumbUrl = clip.thumbnail_path ? `/api/files/${clip.thumbnail_path}` : '';

          return (
            <div
              key={clip.id}
              onClick={() => {
                if (!hasDraggedRef.current) {
                  onSelectClip(clip);
                }
              }}
              className={`relative flex-shrink-0 w-32 rounded-md overflow-hidden bg-surface-container cursor-pointer transition-all duration-150 border ${
                isSelected
                  ? 'border-primary ring-2 ring-primary/50 shadow-md'
                  : 'border-outline-variant/30 hover:border-outline-variant/70'
              }`}
            >
              {/* Thumbnail Stage */}
              <div className="relative aspect-video w-full bg-surface-container-highest overflow-hidden">
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={clip.title || 'Clip Thumbnail'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-outline">
                    <Film className="w-4 h-4 text-outline/60" />
                  </div>
                )}

                {/* Score Pill Badge */}
                <div
                  className={`absolute top-0.5 left-0.5 px-1 py-0.2 rounded font-mono text-[8px] font-bold shadow flex items-center gap-0.5 ${
                    clip.viral_score >= 80
                      ? 'bg-secondary text-on-secondary'
                      : clip.viral_score >= 60
                      ? 'bg-tertiary text-on-tertiary'
                      : 'bg-surface-container-highest text-on-surface'
                  }`}
                >
                  <Star className="w-2.5 h-2.5 fill-current" />
                  <span>{clip.viral_score}</span>
                </div>

                {/* Duration Badge */}
                <div className="absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded bg-black/80 font-mono text-[8px] text-on-surface">
                  {formatDuration(dur)}
                </div>

                {/* Favorite Star Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(clip.id, !clip.is_favorite);
                  }}
                  className={`absolute top-0.5 right-0.5 p-0.5 rounded bg-black/50 hover:bg-black/80 transition-colors ${
                    clip.is_favorite ? 'text-tertiary' : 'text-outline hover:text-on-surface'
                  }`}
                  title={clip.is_favorite ? 'Hapus dari favorit' : 'Tandai favorit'}
                >
                  <Star
                    className={`w-3 h-3 ${clip.is_favorite ? 'fill-current text-tertiary' : 'text-outline'}`}
                  />
                </button>
              </div>

              {/* Title & Actions Bar */}
              <div className="p-1 flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-0.5">
                  <span className="font-label-md text-[10px] text-on-surface truncate font-semibold flex-1 leading-tight">
                    {clip.title || `Klip #${clip.id}`}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {(clip.export_path || clip.preview_path) && (
                      <a
                        href={`/api/files/${clip.export_path || clip.preview_path}`}
                        download={`${(clip.title || `clip_${clip.id}`).replace(/[^\w\s-]/g, '')}_1080p.mp4`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-outline hover:text-secondary p-0.5 transition-colors"
                        title="Download Klip HD 1080p (MP4)"
                      >
                        <Download className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Hapus klip ini?')) onDeleteClip(clip.id);
                      }}
                      className="text-outline hover:text-error p-0.5 transition-colors"
                      title="Hapus klip"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[8px] text-outline font-mono leading-none">
                  <span>
                    {clip.start_sec.toFixed(0)}s - {clip.end_sec.toFixed(0)}s
                  </span>
                  {clip.is_manual ? (
                    <span className="text-primary font-sans font-medium">Manual</span>
                  ) : (
                    <span className="text-secondary font-sans font-medium">AI</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

          {filteredClips.length === 0 && (
            <div className="py-4 px-4 text-center text-outline w-full text-xs">
              Tidak ada klip pada filter ini.
            </div>
          )}
        </div>
      </div>
  );
}
