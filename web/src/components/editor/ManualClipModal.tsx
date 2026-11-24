'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Clip, HeatmapPoint } from '@/lib/types';
import { PlusSquare, X, Flame } from 'lucide-react';

interface ManualClipModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  maxDuration: number;
  heatmap?: HeatmapPoint[] | null;
  onClipCreated: (clip: Clip) => void;
}

function formatMmSs(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function ManualClipModal({
  isOpen,
  onClose,
  projectId,
  maxDuration,
  heatmap,
  onClipCreated,
}: ManualClipModalProps) {
  const [title, setTitle] = useState('');
  const [startSec, setStartSec] = useState('0');
  const [endSec, setEndSec] = useState('30');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  const hasHeatmap = Boolean(heatmap && heatmap.length > 1 && maxDuration > 0);

  // Hitung path SVG & top-3 puncak Most Replayed
  const heatmapData = useMemo(() => {
    if (!hasHeatmap || !heatmap) return null;
    const width = 400;
    const height = 72;
    const points = heatmap.map((pt) => {
      const mid = (pt.start_time + pt.end_time) / 2;
      const x = Math.max(0, Math.min(width, (mid / maxDuration) * width));
      const v = Math.max(0, Math.min(1, pt.value));
      const y = height - 6 - v * (height - 14);
      return { x, y, mid, value: v };
    });

    const linePath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;

    // Cari hingga 3 puncak viral yang terpisah minimal 25 detik
    const sorted = [...points].sort((a, b) => b.value - a.value);
    const peaks: Array<{ mid: number; value: number }> = [];
    for (const pt of sorted) {
      if (pt.value < 0.45) break;
      if (peaks.every((existing) => Math.abs(existing.mid - pt.mid) >= 25)) {
        peaks.push({ mid: pt.mid, value: pt.value });
        if (peaks.length >= 3) break;
      }
    }

    return { width, height, linePath, areaPath, peaks };
  }, [hasHeatmap, heatmap, maxDuration]);

  if (!isOpen) return null;

  const jumpToPeak = (centerSec: number) => {
    const curStart = parseFloat(startSec);
    const curEnd = parseFloat(endSec);
    const desiredLen = !isNaN(curStart) && !isNaN(curEnd) && curEnd > curStart
      ? Math.max(15, Math.min(90, curEnd - curStart))
      : 35;
    const s = Math.max(0, Math.min(maxDuration - 5, centerSec - desiredLen * 0.25));
    const e = Math.min(maxDuration, s + desiredLen);
    setStartSec(s.toFixed(1));
    setEndSec(e.toFixed(1));
  };

  const handleHeatmapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!maxDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    jumpToPeak(ratio * maxDuration);
  };

  const parsedStart = parseFloat(startSec);
  const parsedEnd = parseFloat(endSec);
  const selLeftPct = maxDuration > 0 && !isNaN(parsedStart) ? Math.max(0, Math.min(100, (parsedStart / maxDuration) * 100)) : 0;
  const selRightPct = maxDuration > 0 && !isNaN(parsedEnd) ? Math.max(selLeftPct, Math.min(100, (parsedEnd / maxDuration) * 100)) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const s = parseFloat(startSec);
    const eTime = parseFloat(endSec);

    if (isNaN(s) || isNaN(eTime) || s < 0 || eTime <= s) {
      setError('Rentang waktu klip tidak valid (waktu selesai harus lebih besar dari mulai).');
      return;
    }

    if (maxDuration > 0 && eTime > maxDuration + 1) {
      setError(`Waktu selesai tidak boleh melebihi durasi video (${maxDuration.toFixed(0)} detik).`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || `Klip Manual (${s.toFixed(0)}s - ${eTime.toFixed(0)}s)`,
          start_sec: s,
          end_sec: eTime,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal menambahkan klip manual');
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      setTitle('');
      onClipCreated(data.clip);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Koneksi terputus');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className={`bg-surface-container-low w-full ${hasHeatmap ? 'max-w-md' : 'max-w-sm'} rounded-xl border border-outline-variant/30 shadow-2xl overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-surface-container-highest/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlusSquare className="w-5 h-5 text-primary" />
            <h3 className="font-headline-sm text-on-surface font-semibold">
              Tambah Klip Manual
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-outline hover:text-on-surface">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* YouTube Retention Heatmap ("Most Replayed") */}
          {heatmapData && (
            <div className="bg-surface-container p-3 rounded-lg border border-amber-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5" />
                  Grafik Retensi YouTube (Most Replayed)
                </span>
                <span className="text-[10px] text-outline">Klik grafik untuk pilih momen</span>
              </div>

              <div className="relative rounded bg-surface-container-lowest border border-outline-variant/20 overflow-hidden">
                <svg
                  viewBox={`0 0 ${heatmapData.width} ${heatmapData.height}`}
                  className="w-full h-18 cursor-crosshair block"
                  preserveAspectRatio="none"
                  onClick={handleHeatmapClick}
                >
                  <defs>
                    <linearGradient id="ytHeatmapGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.6" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.05" />
                    </linearGradient>
                  </defs>
                  {/* Area jendela klip terpilih */}
                  {selRightPct > selLeftPct && (
                    <rect
                      x={(selLeftPct / 100) * heatmapData.width}
                      y={0}
                      width={((selRightPct - selLeftPct) / 100) * heatmapData.width}
                      height={heatmapData.height}
                      fill="rgba(56, 189, 248, 0.22)"
                      stroke="rgba(56, 189, 248, 0.7)"
                      strokeWidth="1"
                    />
                  )}
                  <path d={heatmapData.areaPath} fill="url(#ytHeatmapGrad)" />
                  <path d={heatmapData.linePath} fill="none" stroke="#f59e0b" strokeWidth="2" />
                </svg>
              </div>

              {heatmapData.peaks.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-outline">Puncak Viral:</span>
                  {heatmapData.peaks.map((pk, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => jumpToPeak(pk.mid)}
                      className="px-2 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/30 text-[10px] font-mono font-semibold text-amber-300 transition-colors"
                      title={`Lompat ke puncak retensi ${Math.round(pk.value * 100)}%`}
                    >
                      #{idx + 1} {formatMmSs(pk.mid)} ({Math.round(pk.value * 100)}%)
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-on-surface block mb-1">
              Judul Klip (Opsional)
            </label>
            <input
              type="text"
              placeholder="Contoh: Highlight Pertanyaan 1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-surface-container px-3 py-2 rounded text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary border border-outline-variant/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-on-surface block mb-1">
                Detik Mulai (Start)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={startSec}
                onChange={(e) => setStartSec(e.target.value)}
                className="w-full bg-surface-container px-3 py-2 rounded text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary border border-outline-variant/30 font-mono"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-on-surface block mb-1">
                Detik Selesai (End)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                value={endSec}
                onChange={(e) => setEndSec(e.target.value)}
                className="w-full bg-surface-container px-3 py-2 rounded text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary border border-outline-variant/30 font-mono"
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded bg-error-container/20 border border-error/40 text-error text-xs">
              {error}
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-surface-container text-xs hover:bg-surface-bright text-on-surface"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container transition-colors shadow"
            >
              {isSubmitting ? 'Membuat...' : 'Buat Klip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
