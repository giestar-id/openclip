'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { Project, Clip } from '@/lib/types';
import { formatDuration } from '@/lib/captions';

const STAGES = [
  { key: 'downloading', label: 'Download', desc: 'Mengunduh video sumber & metadata yt-dlp', icon: 'download' },
  { key: 'transcribing', label: 'Transcribe', desc: 'Ekstraksi vokal & transkripsi kata Whisper', icon: 'record_voice_over' },
  { key: 'analyzing', label: 'Analyze AI', desc: 'Analisis hook, alur, & potensi konten', icon: 'psychology' },
  { key: 'cutting', label: 'Cut Preview', desc: 'Pembuatan klip 540p, thumbnail & waveform peaks', icon: 'content_cut' },
];

function ProcessingContent() {
  const params = useParams();
  const projectId = params?.id as string;
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    let isMounted = true;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError('Proyek tidak ditemukan.');
            setLoading(false);
            return;
          }
          throw new Error('Gagal mengambil status proyek');
        }
        const data = await res.json();
        if (!isMounted) return;

        setProject(data.project);
        setClips(data.clips || []);
        setLoading(false);

        // Jika status ready, langsung arahkan ke Dashboard Editor
        if (data.project.status === 'ready') {
          router.push(`/projects/${projectId}`);
          return;
        }

        // Lanjut polling tiap 1.5 detik jika masih berjalan
        if (data.project.status !== 'failed') {
          timer = setTimeout(fetchStatus, 1500);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Koneksi terputus');
          timer = setTimeout(fetchStatus, 3000);
        }
      }
    };

    fetchStatus();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [projectId, router]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/retry`, { method: 'POST' });
      if (res.ok) {
        // Polling akan otomatis melanjutkan
        window.location.reload();
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal merestart proyek');
      }
    } catch {
      alert('Gagal menghubungi server');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Batalkan dan hapus proyek ini?')) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/');
      } else {
        alert('Gagal menghapus proyek');
      }
    } catch {
      alert('Gagal menghubungi server');
    } finally {
      setIsDeleting(false);
    }
  };

  const getStageIndex = (stage: string) => {
    if (stage === 'queued') return 0;
    if (stage === 'downloading') return 0;
    if (stage === 'transcribing') return 1;
    if (stage === 'analyzing') return 2;
    if (stage === 'cutting') return 3;
    if (stage === 'ready') return 4;
    return 0;
  };

  const currentStageIndex = project ? getStageIndex(project.status) : 0;
  const progressPercent = project?.progress ?? 0;

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <Header />
      <Sidebar />

      <main className="pl-16 pt-20 sm:pt-24 pb-16 w-full flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] px-4">
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[36px] animate-spin">
              progress_activity
            </span>
            <span className="font-label-md text-on-surface-variant">Memuat data proyek #{projectId}...</span>
          </div>
        ) : error && !project ? (
          <div className="max-w-md w-full bg-surface-container-low p-6 rounded-xl border border-error/30 text-center flex flex-col items-center gap-4">
            <span className="material-symbols-outlined text-error text-[48px]">error</span>
            <h2 className="font-headline-md text-on-surface">Kesalahan Sistem</h2>
            <p className="font-body-md text-on-surface-variant">{error}</p>
            <Link
              href="/"
              className="px-4 py-2 bg-surface-container-high hover:bg-surface-bright text-on-surface rounded font-label-md transition-colors"
            >
              Kembali ke Beranda
            </Link>
          </div>
        ) : (
          <div className="w-full max-w-3xl flex flex-col gap-6">
            {/* Top Video Overview Card */}
            <div className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/30 shadow-xl flex flex-col sm:flex-row items-center gap-5">
              <div className="w-full sm:w-44 aspect-video bg-surface-container-lowest rounded-lg overflow-hidden shrink-0 relative flex items-center justify-center border border-outline-variant/20">
                {project?.thumbnail_path ? (
                  <img
                    src={`/api/files/${project.thumbnail_path}`}
                    alt={project.title || 'Video Thumbnail'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="material-symbols-outlined text-outline text-[32px]">movie</span>
                )}
                {project?.duration_sec && (
                  <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-surface-container-lowest/90 font-label-sm text-label-sm text-on-surface font-mono">
                    {formatDuration(project.duration_sec)}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-label-sm text-[11px] font-semibold uppercase tracking-wider">
                    Project #{project?.id}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-sm text-[11px]">
                    Bahasa: {project?.language || 'auto'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-sm text-[11px]">
                    Mode: {project?.transcribe_mode === 'api' ? 'Cloud Whisper API' : 'Local Whisper'}
                  </span>
                </div>
                <h1 className="font-headline-sm text-headline-sm text-on-surface font-semibold line-clamp-2 mb-2">
                  {project?.title || project?.source_url || 'Memproses video...'}
                </h1>
                <p className="font-label-sm text-outline truncate text-xs">
                  {project?.source_url}
                </p>
              </div>
            </div>

            {/* Main Progress Stepper Card */}
            <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/30 shadow-xl flex flex-col gap-6">
              {/* Status Header & Live Percentage */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {project?.status === 'failed' ? (
                    <div className="w-10 h-10 rounded-full bg-error/20 flex items-center justify-center text-error">
                      <span className="material-symbols-outlined text-[24px]">warning</span>
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary relative">
                      <span className="material-symbols-outlined text-[24px] animate-spin">
                        sync
                      </span>
                    </div>
                  )}
                  <div>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold capitalize">
                      {project?.status === 'failed'
                        ? 'Pemrosesan Terhenti'
                        : `Tahap: ${project?.status || 'Memulai'}`}
                    </h2>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {project?.progress_message || 'Menyiapkan worker pipeline...'}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-timecode-display text-[28px] font-bold text-primary font-mono">
                    {progressPercent}%
                  </span>
                </div>
              </div>

              {/* Progress Bar with Glow */}
              <div className="w-full bg-surface-container-lowest h-3 rounded-full overflow-hidden p-0.5 relative">
                <div
                  className={`h-full rounded-full transition-all duration-500 relative ${
                    project?.status === 'failed'
                      ? 'bg-error'
                      : 'bg-gradient-to-r from-primary to-secondary shadow-[0_0_12px_rgba(76,215,246,0.6)]'
                  }`}
                  style={{ width: `${Math.max(5, Math.min(100, progressPercent))}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
                </div>
              </div>

              {/* Step Flow List */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
                {STAGES.map((s, idx) => {
                  const isDone = currentStageIndex > idx;
                  const isCurrent = currentStageIndex === idx && project?.status !== 'failed';
                  const isPending = currentStageIndex < idx;

                  return (
                    <div
                      key={s.key}
                      className={`p-3 rounded-lg border transition-all flex flex-col gap-2 ${
                        isCurrent
                          ? 'bg-surface-container border-primary/50 shadow-md ring-1 ring-primary/30'
                          : isDone
                          ? 'bg-surface-container-lowest/60 border-secondary/30'
                          : 'bg-surface-container-lowest/30 border-outline-variant/10 opacity-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`material-symbols-outlined text-[20px] ${
                            isCurrent
                              ? 'text-primary animate-pulse'
                              : isDone
                              ? 'text-secondary'
                              : 'text-outline'
                          }`}
                        >
                          {isDone ? 'check_circle' : s.icon}
                        </span>
                        <span className="font-label-sm text-[10px] text-outline font-mono">
                          0{idx + 1}
                        </span>
                      </div>
                      <div>
                        <div className="font-label-md text-label-md text-on-surface font-semibold">
                          {s.label}
                        </div>
                        <div className="font-body-sm text-[11px] text-on-surface-variant line-clamp-2 leading-tight">
                          {s.desc}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Error Message Box */}
              {project?.status === 'failed' && (
                <div className="p-4 rounded-lg bg-error-container/20 border border-error/40 flex flex-col gap-3">
                  <div className="flex items-start gap-2 text-error">
                    <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5">
                      error
                    </span>
                    <div className="text-sm font-mono break-all">
                      {project.error || 'Terjadi kesalahan saat mengeksekusi pipeline worker.'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={handleRetry}
                      disabled={isRetrying}
                      className="px-4 py-2 rounded bg-primary text-on-primary font-label-md hover:bg-primary-container transition-colors flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[16px]">refresh</span>
                      {isRetrying ? 'Merestart...' : 'Coba Lagi (Retry)'}
                    </button>
                    <Link
                      href="/"
                      className="px-4 py-2 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-md transition-colors"
                    >
                      Kembali ke Beranda
                    </Link>
                  </div>
                </div>
              )}

              {/* Ready Early Clips Banner */}
              {clips.length > 0 && (
                <div className="p-4 rounded-lg bg-surface-container flex items-center justify-between border border-secondary/30">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-ping" />
                    <div>
                      <span className="font-label-md text-label-md text-secondary font-bold">
                        {clips.length} Klip Siap Dipratinjau!
                      </span>
                      <p className="font-body-sm text-[11px] text-on-surface-variant">
                        Anda dapat langsung membuka editor selagi worker menyelesaikan sisa klip.
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/projects/${projectId}`}
                    className="px-4 py-2 rounded bg-secondary text-on-secondary font-label-md hover:bg-secondary-fixed transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    <span>Buka Editor</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </Link>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between text-outline text-xs px-2">
              <span className="flex items-center gap-1 font-mono">
                <span className="material-symbols-outlined text-[14px]">terminal</span>
                Auto-refreshing status polling: 1500ms
              </span>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="hover:text-error transition-colors flex items-center gap-1 cursor-pointer font-label-sm"
              >
                <span className="material-symbols-outlined text-[14px]">delete</span>
                {isDeleting ? 'Membatalkan...' : 'Batalkan Proyek'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ProcessingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background text-on-surface flex flex-col items-center justify-center gap-3">
          <span className="material-symbols-outlined text-primary text-[36px] animate-spin">
            progress_activity
          </span>
          <span className="font-label-md text-on-surface-variant">Memuat status proyek...</span>
        </div>
      }
    >
      <ProcessingContent />
    </Suspense>
  );
}
