'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { Project } from '@/lib/types';
import { formatDuration } from '@/lib/captions';
import {
  Plus,
  Search,
  Loader2,
  Film,
  RotateCw,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isDeleting, setIsDeleting] = useState<number | null>(null);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (data.projects) setProjects(data.projects);
    } catch {
      // Abaikan
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Hapus proyek ini dan seluruh filenya dari disk?')) return;
    setIsDeleting(id);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
      } else {
        alert('Gagal menghapus proyek');
      }
    } catch {
      alert('Koneksi terputus saat menghapus proyek');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleRetry = async (id: number) => {
    try {
      const res = await fetch(`/api/projects/${id}/retry`, { method: 'POST' });
      if (res.ok) {
        fetchProjects();
      } else {
        alert('Gagal me-retry proyek');
      }
    } catch {
      alert('Koneksi terputus');
    }
  };

  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      (p.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.source_url || '').toLowerCase().includes(search.toLowerCase());

    if (statusFilter === 'all') return matchesSearch;
    if (statusFilter === 'ready') return matchesSearch && p.status === 'ready';
    if (statusFilter === 'processing')
      return (
        matchesSearch &&
        ['queued', 'downloading', 'transcribing', 'analyzing', 'cutting'].includes(p.status)
      );
    if (statusFilter === 'error')
      return (
        matchesSearch &&
        ((p.status as string) === 'error' || (p.status as string) === 'failed')
      );
    return matchesSearch;
  });

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col select-none">
      <Header />
      <Sidebar />

      <main className="pl-16 pt-20 sm:pt-24 pb-16 flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 flex flex-col gap-6">
        {/* Top Header & New Project CTA */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface">
              Daftar Proyek Video
            </h1>
            <p className="font-body-md text-on-surface-variant text-xs">
              Kelola dan pantau seluruh pemrosesan klip AI video Anda
            </p>
          </div>

          <Link
            href="/"
            className="px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md text-xs font-semibold hover:bg-primary-container transition-colors flex items-center gap-1.5 shadow"
          >
            <Plus className="w-4 h-4" />
            Buat Proyek Baru
          </Link>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-surface-container-low p-3 rounded-xl border border-surface-container-highest/30 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
          {/* Search Input */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              type="text"
              placeholder="Cari judul atau link video..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface-container-lowest text-on-surface placeholder:text-outline pl-9 pr-3 py-1.5 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary border border-outline-variant/30"
            />
          </div>

          {/* Status Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
            {[
              { id: 'all', label: `Semua (${projects.length})` },
              {
                id: 'ready',
                label: `Siap (${projects.filter((p) => p.status === 'ready').length})`,
              },
              {
                id: 'processing',
                label: `Proses (${
                  projects.filter((p) =>
                    ['queued', 'downloading', 'transcribing', 'analyzing', 'cutting'].includes(p.status)
                  ).length
                })`,
              },
              {
                id: 'error',
                label: `Gagal (${projects.filter((p) => (p.status as string) === 'error' || (p.status as string) === 'failed').length})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Projects Grid / List */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-9 h-9 text-primary animate-spin" />
            <span className="font-label-md text-xs text-outline">Memuat daftar proyek...</span>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-surface-container-low p-12 rounded-xl border border-outline-variant/20 text-center flex flex-col items-center gap-3">
            <Film className="w-12 h-12 text-outline/40" />
            <h3 className="font-headline-sm text-on-surface font-semibold">Tidak ada proyek ditemukan</h3>
            <p className="font-body-sm text-outline text-xs max-w-sm">
              Mulai potong video panjang pertama Anda menjadi klip pendek terbaik sekarang.
            </p>
            <Link
              href="/"
              className="mt-2 px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md text-xs font-semibold hover:bg-primary-container transition-colors"
            >
              Buat Proyek Sekarang
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((p) => {
              const isReady = p.status === 'ready';
              const isProcessing = ['queued', 'downloading', 'transcribing', 'analyzing', 'cutting'].includes(
                p.status
              );
              const isError = (p.status as string) === 'error' || (p.status as string) === 'failed';

              const linkHref = isReady ? `/projects/${p.id}` : `/projects/${p.id}/processing`;

              return (
                <div
                  key={p.id}
                  className="bg-surface-container-low rounded-xl border border-surface-container-highest/40 overflow-hidden shadow-lg hover:border-outline-variant transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Thumbnail banner */}
                    <div className="relative aspect-video w-full bg-surface-container-lowest overflow-hidden">
                      {p.thumbnail_path ? (
                        <img
                          src={`/api/files/${p.thumbnail_path}`}
                          alt={p.title || 'Thumbnail'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-outline">
                          <Film className="w-9 h-9 text-outline/50" />
                        </div>
                      )}

                      {/* Status Badge */}
                      <div className="absolute top-2 left-2">
                        {isReady ? (
                          <span className="px-2 py-0.5 rounded-full bg-secondary/90 text-on-secondary font-mono text-[10px] font-bold shadow">
                            Siap Diedit
                          </span>
                        ) : isProcessing ? (
                          <span className="px-2 py-0.5 rounded-full bg-primary/90 text-on-primary font-mono text-[10px] font-bold flex items-center gap-1 shadow">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {p.status} ({p.progress ?? (p as any).progress_percent ?? 0}%)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-error/90 text-on-error font-mono text-[10px] font-bold shadow">
                            Gagal
                          </span>
                        )}
                      </div>

                      {/* Duration */}
                      {p.duration_sec && (
                        <span className="absolute bottom-2 right-2 px-1.5 py-0.2 rounded bg-black/80 font-mono text-[10px] text-on-surface">
                          {formatDuration(p.duration_sec)}
                        </span>
                      )}
                    </div>

                    {/* Metadata Content */}
                    <div className="p-3.5 flex flex-col gap-1.5">
                      <Link
                        href={linkHref}
                        className="font-headline-sm text-sm text-on-surface font-semibold hover:text-primary transition-colors line-clamp-2"
                      >
                        {p.title || p.source_url}
                      </Link>

                      <span className="text-[11px] text-outline truncate font-mono">
                        {p.source_url}
                      </span>

                      {/* Progress bar jika processing */}
                      {isProcessing && (
                        <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden mt-1">
                          <div
                            className="bg-primary h-full transition-all"
                            style={{ width: `${Math.max(5, p.progress ?? (p as any).progress_percent ?? 10)}%` }}
                          />
                        </div>
                      )}

                      {/* Error text jika gagal */}
                      {isError && (
                        <span className="text-[11px] text-error line-clamp-1 mt-1">
                          {p.error || (p as any).error_message || 'Terjadi kesalahan eksekusi pipeline'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="px-3.5 py-2.5 bg-surface-container-lowest/60 border-t border-surface-container-highest/30 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-outline font-mono">
                      #{p.id} • {new Date(p.created_at).toLocaleDateString('id-ID')}
                    </span>

                    <div className="flex items-center gap-2">
                      {isError ? (
                        <button
                          onClick={() => handleRetry(p.id)}
                          className="px-2 py-1 rounded bg-surface-container hover:bg-surface-bright text-primary font-semibold text-[11px] flex items-center gap-1"
                        >
                          <RotateCw className="w-3 h-3" />
                          Coba Lagi
                        </button>
                      ) : (
                        <Link
                          href={linkHref}
                          className="px-2.5 py-1 rounded bg-surface-container hover:bg-primary hover:text-on-primary text-on-surface font-semibold text-[11px] transition-colors"
                        >
                          {isReady ? 'Buka Editor' : 'Lihat Progres'}
                        </Link>
                      )}

                      <button
                        onClick={() => handleDelete(p.id)}
                        disabled={isDeleting === p.id}
                        className="p-1 rounded text-outline hover:text-error hover:bg-surface-container transition-colors"
                        title="Hapus proyek"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
