'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Clip } from '@/lib/types';
import { formatDuration } from '@/lib/captions';
import {
  Layers,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Zap,
  Clock,
  Film,
  TrendingUp,
  Sparkles,
  Check,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';

interface BatchExportItem {
  id: number;
  clip_id: number;
  project_id: number;
  resolution: string;
  file_path: string | null;
  status: 'queued' | 'rendering' | 'done' | 'failed';
  progress: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  clip_title?: string;
  viral_score?: number;
  start_sec?: number;
  end_sec?: number;
  thumbnail_path?: string | null;
}

interface BatchExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  projectTitle?: string | null;
  clips: Clip[];
  currentClip: Clip | null;
  onExportSuccess?: (exportedClipsCount: number) => void;
}

export function BatchExportModal({
  isOpen,
  onClose,
  projectId,
  projectTitle,
  clips,
  currentClip,
  onExportSuccess,
}: BatchExportModalProps) {
  const [resolution, setResolution] = useState<'1080p' | '720p'>('1080p');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [applyCurrentStyle, setApplyCurrentStyle] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Monitoring view state
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [exportsList, setExportsList] = useState<BatchExportItem[]>([]);
  const [summary, setSummary] = useState<{
    total: number;
    queued: number;
    rendering: number;
    done: number;
    failed: number;
  }>({ total: 0, queued: 0, rendering: 0, done: 0, failed: 0 });

  // Periksa apakah ada antrean export yang sedang berjalan pada project ini
  const checkExistingExports = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/exports`);
      if (res.ok) {
        const data = await res.json();
        if (data.exports && data.exports.length > 0) {
          setExportsList(data.exports);
          setSummary(data.summary);
          const hasActive = data.summary.queued > 0 || data.summary.rendering > 0;
          if (hasActive) {
            setIsMonitoring(true);
          }
        }
      }
    } catch {
      // Abaikan kesalahan polling awal
    }
  }, [projectId]);

  // Inisialisasi pilihan klip: secara default pilih seluruh klip
  useEffect(() => {
    if (clips.length > 0) {
      setSelectedIds(clips.map((c) => c.id));
      checkExistingExports();
    }
  }, [clips, checkExistingExports]);

  // Polling status saat mode monitoring aktif
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isOpen && isMonitoring) {
      const fetchStatus = async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}/exports`);
          if (res.ok) {
            const data = await res.json();
            setExportsList(data.exports || []);
            setSummary(data.summary || { total: 0, queued: 0, rendering: 0, done: 0, failed: 0 });

            if (data.summary && data.summary.queued === 0 && data.summary.rendering === 0) {
              // Semua sudah selesai
              onExportSuccess?.(data.summary.done);
            }
          }
        } catch {}
      };

      fetchStatus();
      timer = setInterval(fetchStatus, 1500);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isOpen, isMonitoring, projectId, onExportSuccess]);

  // Hitung persentase keseluruhan
  const overallPercentage = useMemo(() => {
    if (!exportsList.length) return 0;
    const totalProgress = exportsList.reduce((acc, curr) => {
      if (curr.status === 'done') return acc + 100;
      if (curr.status === 'failed') return acc + 100;
      if (curr.status === 'rendering') return acc + (curr.progress || 10);
      return acc + 0;
    }, 0);
    return Math.min(100, Math.round(totalProgress / exportsList.length));
  }, [exportsList]);

  const allFinished = summary.total > 0 && summary.queued === 0 && summary.rendering === 0;

  const handleToggleSelectAll = () => {
    if (selectedIds.length === clips.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(clips.map((c) => c.id));
    }
  };

  const handleSelectViralOnly = () => {
    const viralIds = clips.filter((c) => c.viral_score >= 80).map((c) => c.id);
    setSelectedIds(viralIds.length > 0 ? viralIds : clips.map((c) => c.id));
  };

  const handleToggleClip = (clipId: number) => {
    setSelectedIds((prev) =>
      prev.includes(clipId) ? prev.filter((id) => id !== clipId) : [...prev, clipId]
    );
  };

  const handleStartBatchExport = async () => {
    if (selectedIds.length === 0) {
      setError('Silakan pilih setidaknya 1 klip untuk diekspor.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/export-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clip_ids: selectedIds,
          resolution,
          apply_current_style: applyCurrentStyle,
          current_clip_id: currentClip?.id || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal memulai batch export.');
        setIsSubmitting(false);
        return;
      }

      setIsMonitoring(true);
      setIsSubmitting(false);
      checkExistingExports();
    } catch (err: any) {
      setError(err.message || 'Koneksi terputus saat request batch export.');
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-surface-container-low w-full max-w-2xl rounded-2xl border border-outline-variant/30 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-surface-container-highest/40 flex items-center justify-between bg-surface-container-lowest/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Layers className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-headline-sm text-sm sm:text-base text-on-surface font-semibold flex items-center gap-2">
                <span>Ekspor Semua Klip (Batch Export)</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-container-high text-primary border border-primary/25">
                  {clips.length} Klip
                </span>
              </h3>
              <p className="text-[11px] text-outline truncate max-w-md">
                {projectTitle || `Proyek #${projectId}`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors"
            title="Tutup dialog"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 scrollbar-thin">
          {error && (
            <div className="p-3 rounded-lg bg-error-container/20 border border-error/40 text-error text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* VIEW 1: Konfigurasi Batch Export (Sebelum / Pengaturan Ekspor) */}
          {!isMonitoring && (
            <div className="space-y-4">
              {/* Opsi Resolusi */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-on-surface block">
                  Pilih Resolusi Video Output
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResolution('1080p')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      resolution === '1080p'
                        ? 'bg-surface-container-highest border-primary ring-1 ring-primary/40 text-primary'
                        : 'bg-surface-container border-outline-variant/20 text-on-surface hover:border-outline-variant'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm block">1080p Full HD</span>
                      {resolution === '1080p' && <Check className="w-4 h-4 text-primary" />}
                    </div>
                    <span className="text-[11px] text-outline block mt-0.5">
                      Kualitas terbaik untuk Reels, TikTok & Shorts (~3x GPU Cepat)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResolution('720p')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      resolution === '720p'
                        ? 'bg-surface-container-highest border-primary ring-1 ring-primary/40 text-primary'
                        : 'bg-surface-container border-outline-variant/20 text-on-surface hover:border-outline-variant'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm block">720p HD</span>
                      {resolution === '720p' && <Check className="w-4 h-4 text-primary" />}
                    </div>
                    <span className="text-[11px] text-outline block mt-0.5">
                      Render ultra kilat & ukuran file lebih hemat
                    </span>
                  </button>
                </div>
              </div>

              {/* Opsi Terapkan Template Gaya Seragam */}
              {currentClip && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-container border border-outline-variant/20 cursor-pointer hover:border-outline-variant transition-colors">
                  <input
                    type="checkbox"
                    checked={applyCurrentStyle}
                    onChange={(e) => setApplyCurrentStyle(e.target.checked)}
                    className="mt-0.5 rounded text-primary focus:ring-primary w-4 h-4"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-on-surface flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-secondary" />
                      <span>Terapkan template gaya klip saat ini ke seluruh klip yang dipilih</span>
                    </span>
                    <p className="text-[11px] text-outline mt-0.5 leading-relaxed">
                      Warna subtitle, font, posisi watermark, rasio crop, dan pengaturan audio dari klip{' '}
                      <span className="font-semibold text-on-surface">&quot;{currentClip.title || `Klip #${currentClip.id}`}&quot;</span>{' '}
                      akan otomatis diseragamkan ke semua klip terpilih sebelum dirender.
                    </p>
                  </div>
                </label>
              )}

              {/* Pemilihan Klip */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-on-surface">
                    Pilih Klip yang Akan Diekspor ({selectedIds.length}/{clips.length})
                  </label>
                  <div className="flex items-center gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="px-2 py-0.5 rounded bg-surface-container hover:bg-surface-container-high text-primary text-[11px] font-semibold transition-colors border border-outline-variant/20"
                    >
                      {selectedIds.length === clips.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectViralOnly}
                      className="px-2 py-0.5 rounded bg-surface-container hover:bg-surface-container-high text-secondary text-[11px] font-semibold transition-colors border border-outline-variant/20 flex items-center gap-1"
                    >
                      <TrendingUp className="w-3 h-3" />
                      <span>Top Klip (&gt;80)</span>
                    </button>
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5 p-1 rounded-xl bg-surface-container-lowest border border-outline-variant/20 scrollbar-thin">
                  {clips.map((clip, idx) => {
                    const isSelected = selectedIds.includes(clip.id);
                    const dur = (clip.end_sec - clip.start_sec) || 30;
                    return (
                      <div
                        key={clip.id}
                        onClick={() => handleToggleClip(clip.id)}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border ${
                          isSelected
                            ? 'bg-surface-container border-primary/40 ring-1 ring-primary/20'
                            : 'bg-surface-container-lowest border-transparent opacity-60 hover:opacity-90'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // dikontrol oleh container onClick
                            className="rounded text-primary focus:ring-primary w-4 h-4 shrink-0"
                          />
                          <div className="w-6 h-6 rounded bg-surface-container-high flex items-center justify-center text-outline text-[11px] font-mono shrink-0">
                            {idx + 1}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-xs text-on-surface truncate block">
                              {clip.title || `Klip #${clip.id}`}
                            </span>
                            <div className="flex items-center gap-2 text-[10px] text-outline font-mono">
                              <span>{formatDuration(dur)}</span>
                              <span>•</span>
                              <span>Skor: {clip.viral_score}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              clip.viral_score >= 80
                                ? 'bg-secondary/15 text-secondary border border-secondary/30'
                                : 'bg-surface-container-high text-outline'
                            }`}
                          >
                            {clip.viral_score}
                          </span>
                          {clip.export_path && (
                            <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-0.5 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              <span className="hidden sm:inline">Terekspor</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 2: Monitoring Progress Batch Export (Saat Sedang / Selesai Merender) */}
          {isMonitoring && (
            <div className="space-y-4">
              {/* Header Status & Overall Progress Bar */}
              <div className="p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/30 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {allFinished ? (
                      <CheckCircle2 className="w-5 h-5 text-secondary shrink-0" />
                    ) : (
                      <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                    )}
                    <div>
                      <span className="font-bold text-sm text-on-surface block">
                        {allFinished
                          ? 'Batch Export Selesai!'
                          : `Sedang Merender Klip (${summary.done}/${summary.total} Selesai)`}
                      </span>
                      <span className="text-[11px] text-outline">
                        {summary.rendering > 0 && `${summary.rendering} klip aktif di GPU • `}
                        {summary.queued > 0 && `${summary.queued} dalam antrean • `}
                        {summary.done} berhasil
                        {summary.failed > 0 && ` • ${summary.failed} gagal`}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-primary font-bold text-base">
                    {overallPercentage}%
                  </span>
                </div>

                {/* Main Progress Bar */}
                <div className="w-full bg-surface-container h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      allFinished ? 'bg-secondary' : 'bg-primary'
                    }`}
                    style={{ width: `${overallPercentage}%` }}
                  />
                </div>
              </div>

              {/* List Klip yang Sedang / Sudah Diekspor */}
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
                {exportsList.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-surface-container border border-outline-variant/20 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-6 h-6 rounded bg-surface-container-high flex items-center justify-center text-outline text-[11px] font-mono shrink-0">
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-on-surface truncate block">
                          {item.clip_title || `Klip #${item.clip_id}`}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-outline font-mono">
                          <span>{item.resolution}</span>
                          <span>•</span>
                          {item.status === 'rendering' ? (
                            <span className="text-primary font-bold">
                              Merender FFmpeg GPU ({item.progress || 10}%)
                            </span>
                          ) : item.status === 'queued' ? (
                            <span className="text-outline">Dalam antrean</span>
                          ) : item.status === 'done' ? (
                            <span className="text-secondary font-semibold">Selesai 100%</span>
                          ) : (
                            <span className="text-error font-semibold">Gagal: {item.error || 'Unknown'}</span>
                          )}
                        </div>

                        {/* Sub-progress bar saat sedang render */}
                        {item.status === 'rendering' && (
                          <div className="w-full bg-surface-container-high h-1 rounded-full overflow-hidden mt-1.5">
                            <div
                              className="bg-primary h-full transition-all duration-300"
                              style={{ width: `${item.progress || 15}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.status === 'done' && (
                        <CheckCircle2 className="w-4 h-4 text-secondary" />
                      )}
                      {item.status === 'rendering' && (
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                      )}
                      {item.status === 'queued' && (
                        <Clock className="w-4 h-4 text-outline" />
                      )}
                      {item.status === 'failed' && (
                        <AlertCircle className="w-4 h-4 text-error" />
                      )}

                      {/* Download direct MP4 link if done */}
                      {item.status === 'done' && item.file_path && (
                        <a
                          href={`/api/files/${item.file_path}`}
                          download={`${item.clip_title || `clip_${item.clip_id}`}_${item.resolution}.mp4`}
                          className="p-1.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary transition-colors"
                          title="Unduh MP4 klip ini secara individual"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-surface-container-highest/40 bg-surface-container-lowest/70 flex items-center justify-between shrink-0">
          {!isMonitoring ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold transition-colors"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleStartBatchExport}
                disabled={isSubmitting || selectedIds.length === 0}
                className="h-9 px-5 rounded-xl bg-primary text-on-primary hover:bg-primary/90 text-xs font-semibold flex items-center gap-2 transition-all shadow-md disabled:opacity-50 active:scale-95"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyiapkan Antrean...</span>
                  </>
                ) : (
                  <>
                    <Layers className="w-4 h-4" />
                    <span>Mulai Ekspor Semua ({selectedIds.length} Klip)</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsMonitoring(false)}
                className="h-9 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Kembali ke konfigurasi pilihan klip"
              >
                <RefreshCw className="w-3.5 h-3.5 text-outline" />
                <span>Atur Ulang Klip</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold transition-colors"
                >
                  Tutup (Latar Belakang Tetap Jalan)
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
