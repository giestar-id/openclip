'use client';

import React, { useState, useEffect } from 'react';
import { Clip, FrameSettings, ExportRecord, CaptionStyle, AudioSettings, CaptionSegment } from '@/lib/types';
import { exportSrt, exportAss, DEFAULT_STYLE } from '@/lib/captions';
import {
  Film,
  X,
  CheckCircle2,
  Subtitles,
  FileText,
  Sparkles,
  AlertCircle,
  Loader2,
  Download,
  AlertTriangle,
  Rocket,
  Zap,
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  clip: Clip | null;
  frame: FrameSettings;
  style?: CaptionStyle;
  audio?: AudioSettings;
  captionSegments?: CaptionSegment[];
  onExportSuccess?: (exportPath: string) => void;
}

export function ExportModal({
  isOpen,
  onClose,
  clip,
  frame,
  style,
  audio,
  captionSegments,
  onExportSuccess,
}: ExportModalProps) {
  const [resolution, setResolution] = useState<'1080p' | '720p'>('1080p');
  const [isExporting, setIsExporting] = useState(false);
  const [exportRecord, setExportRecord] = useState<ExportRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Polling export progress saat sedang rendering
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (exportRecord && exportRecord.status !== 'done' && exportRecord.status !== 'failed') {
      timer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/exports/${exportRecord.id}`);
          if (res.ok) {
            const data = await res.json();
            setExportRecord(data.export);
            if (data.export.status === 'done' || data.export.status === 'failed') {
              setIsExporting(false);
              if (data.export.status === 'done' && data.export.file_path) {
                onExportSuccess?.(data.export.file_path);
              }
            }
          }
        } catch {
          // Abaikan kesalahan polling sementara
        }
      }, 1200);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [exportRecord, onExportSuccess]);

  if (!isOpen || !clip) return null;

  const handleStartExport = async () => {
    setIsExporting(true);
    setError(null);

    try {
      const res = await fetch(`/api/clips/${clip.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolution,
          caption_segments: captionSegments,
          style,
          frame,
          audio,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal memulai render ekspor');
        setIsExporting(false);
        return;
      }

      setExportRecord({
        id: data.export_id,
        clip_id: clip.id,
        project_id: clip.project_id,
        resolution,
        file_path: null,
        status: 'rendering',
        progress: 10,
        error: null,
        created_at: new Date().toISOString(),
        finished_at: null,
      });
    } catch (err: any) {
      setError(err.message || 'Koneksi terputus saat request render');
      setIsExporting(false);
    }
  };

  const handleDownloadSrt = () => {
    if (!clip || !captionSegments) return;
    const offset = clip.preview_start_sec ?? 0;
    const content = exportSrt(captionSegments, offset);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clip.title || 'clip'}_subtitles.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAss = () => {
    if (!clip || !captionSegments) return;
    const offset = clip.preview_start_sec ?? 0;
    const currentStyle = style || DEFAULT_STYLE;
    const content = exportAss(captionSegments, currentStyle, 1080, 1920, offset);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clip.title || 'clip'}_subtitles.ass`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-surface-container-low w-full max-w-md rounded-xl border border-outline-variant/30 shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-surface-container-highest/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-primary" />
            <h3 className="font-headline-sm text-on-surface font-semibold">
              Ekspor Klip Final (MP4)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-outline hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {/* Target Info */}
          <div className="bg-surface-container p-3 rounded-lg border border-outline-variant/20 flex flex-col gap-1">
            <span className="font-label-md text-xs font-semibold text-on-surface truncate">
              {clip.title || `Klip #${clip.id}`}
            </span>
            <div className="flex items-center gap-2 text-[11px] text-outline font-mono">
              <span>Rasio: {frame.ratio}</span>
              <span>•</span>
              <span>Mode: {frame.mode === 'fit_blur' ? 'Fit + Blur' : frame.mode === 'split' ? 'Podcast Split' : frame.mode === 'social' ? 'Social Profile' : frame.mode === 'fit' ? 'Fit Hitam' : 'Center Crop'}</span>
              <span>•</span>
              <span>Caption: {style?.enabled !== false ? 'Aktif' : 'Nonaktif'}</span>
              <span>•</span>
              <span>Durasi: {((clip.end_sec - clip.start_sec) || 30).toFixed(1)}s</span>
            </div>
          </div>

          {/* Resolution Options */}
          {!exportRecord && (
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-on-surface block">
                Pilih Resolusi Video
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setResolution('1080p')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    resolution === '1080p'
                      ? 'bg-surface-container-highest border-primary ring-1 ring-primary/40 text-primary'
                      : 'bg-surface-container border-outline-variant/20 text-on-surface hover:border-outline-variant'
                  }`}
                >
                  <span className="font-bold text-sm block">1080p Full HD</span>
                  <span className="text-[10px] text-outline block">
                    Kualitas jernih untuk Reels / TikTok / Shorts (~3x lebih cepat)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setResolution('720p')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    resolution === '720p'
                      ? 'bg-surface-container-highest border-primary ring-1 ring-primary/40 text-primary'
                      : 'bg-surface-container border-outline-variant/20 text-on-surface hover:border-outline-variant'
                  }`}
                >
                  <span className="font-bold text-sm block">720p HD</span>
                  <span className="text-[10px] text-outline block">
                    Render ultra kilat & ukuran file super hemat
                  </span>
                </button>
              </div>

              {/* Subtitle burn-in note */}
              <div className="p-2 rounded bg-surface-container-lowest text-xs text-outline flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
                <span>Subtitle ASS & gaya karaoke diburn-in otomatis ke MP4</span>
              </div>

              {/* Subtitle Exporter Section (OpenCut Subtitle Engine) */}
              <div className="pt-2.5 mt-2 border-t border-surface-container-highest/40 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-on-surface flex items-center gap-1.5">
                    <Subtitles className="w-4 h-4 text-primary" />
                    <span>Download File Subtitel</span>
                  </span>
                  <span className="text-[10px] text-outline font-mono">Untuk CapCut PC / Premiere</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-0.5">
                  <button
                    type="button"
                    onClick={handleDownloadSrt}
                    disabled={!captionSegments || captionSegments.length === 0}
                    className="h-8.5 px-2.5 rounded-lg bg-surface-container hover:bg-surface-bright border border-outline-variant/30 text-on-surface text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 active:scale-95 shadow-xs"
                    title="Unduh subtitel standar format SubRip (.srt)"
                  >
                    <FileText className="w-3.5 h-3.5 text-primary" />
                    <span>Unduh .SRT</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadAss}
                    disabled={!captionSegments || captionSegments.length === 0}
                    className="h-8.5 px-2.5 rounded-lg bg-surface-container hover:bg-surface-bright border border-outline-variant/30 text-on-surface text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 active:scale-95 shadow-xs"
                    title="Unduh subtitel beranimasi format ASS (.ass)"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-secondary" />
                    <span>Unduh .ASS</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Rendering Progress View */}
          {exportRecord && (
            <div className="p-4 rounded-lg bg-surface-container-lowest border border-outline-variant/30 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-on-surface flex items-center gap-1.5">
                  {exportRecord.status === 'done' ? (
                    <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
                  ) : exportRecord.status === 'failed' ? (
                    <AlertCircle className="w-4 h-4 text-error shrink-0" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                  )}
                  {exportRecord.status === 'done'
                    ? 'Render Berhasil Selesai!'
                    : exportRecord.status === 'failed'
                    ? 'Render Gagal'
                    : 'Sedang Merender Video FFmpeg...'}
                </span>
                <span className="font-mono text-primary font-bold">
                  {exportRecord.status === 'done' ? '100%' : `${exportRecord.progress || 50}%`}
                </span>
              </div>

              <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    exportRecord.status === 'failed'
                      ? 'bg-error'
                      : exportRecord.status === 'done'
                      ? 'bg-secondary'
                      : 'bg-primary'
                  }`}
                  style={{
                    width: `${
                      exportRecord.status === 'done' ? 100 : Math.max(10, exportRecord.progress || 30)
                    }%`,
                  }}
                />
              </div>

              {exportRecord.status === 'done' && exportRecord.file_path && (
                <div className="pt-2 flex flex-col gap-2">
                  <a
                    href={`/api/files/${exportRecord.file_path}`}
                    download={`${clip.title || 'clip'}_${resolution}.mp4`}
                    className="w-full h-9 bg-secondary text-on-secondary rounded-lg font-bold text-center text-xs hover:bg-secondary-fixed transition-colors flex items-center justify-center gap-1.5 shadow"
                  >
                    <Download className="w-4 h-4" />
                    Download Video MP4 ({resolution})
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="p-3 rounded bg-error-container/20 border border-error/40 text-error text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-surface-container-highest/40 bg-surface-container-low flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-surface-container hover:bg-surface-bright text-on-surface text-xs font-semibold transition-colors"
          >
            {exportRecord?.status === 'done' ? 'Tutup' : 'Batal'}
          </button>

          {!exportRecord && (
            <button
              onClick={handleStartExport}
              disabled={isExporting}
              className="px-4 py-2 rounded bg-primary hover:bg-primary-container text-on-primary font-semibold text-xs transition-colors flex items-center gap-1.5 shadow"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Rocket className="w-4 h-4" />
              )}
              {isExporting ? 'Memulai...' : 'Mulai Render'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
