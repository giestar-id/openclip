'use client';

import React, { useState } from 'react';
import { Clip } from '@/lib/types';
import { PlusSquare, X } from 'lucide-react';

interface ManualClipModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  maxDuration: number;
  onClipCreated: (clip: Clip) => void;
}

export function ManualClipModal({
  isOpen,
  onClose,
  projectId,
  maxDuration,
  onClipCreated,
}: ManualClipModalProps) {
  const [title, setTitle] = useState('');
  const [startSec, setStartSec] = useState('0');
  const [endSec, setEndSec] = useState('30');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

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

      onClipCreated(data.clip);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Koneksi terputus');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-surface-container-low w-full max-w-sm rounded-xl border border-outline-variant/30 shadow-2xl overflow-hidden flex flex-col">
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
