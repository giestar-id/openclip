'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { Project } from '@/lib/types';
import { formatDuration } from '@/lib/captions';
import {
  Link2,
  UploadCloud,
  Search,
  AlertCircle,
  Film,
  Clock,
  X,
  CheckCircle2,
  Mic,
  Laptop,
  Cloud,
  Languages,
  Brain,
  Sparkles,
  Subtitles,
  Crop,
} from 'lucide-react';

interface ProbeResult {
  title: string;
  thumbnail: string;
  duration: number;
  uploader?: string;
  width?: number;
  height?: number;
}

interface LocalFileMetadata {
  file: File;
  title: string;
  thumbnail: string;
  duration: number;
  width: number;
  height: number;
  size: number;
}

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function NewProjectPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Tab mode: 'url' atau 'upload'
  const [sourceMode, setSourceMode] = useState<'url' | 'upload'>('url');

  // URL state
  const [url, setUrl] = useState('');
  const [isProbing, setIsProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

  // Upload state
  const [localFile, setLocalFile] = useState<LocalFileMetadata | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isLocalProbing, setIsLocalProbing] = useState(false);

  // Project configuration
  const [clipDuration, setClipDuration] = useState<number>(30);
  const [clipCount, setClipCount] = useState<number>(0); // 0 = auto
  const [language, setLanguage] = useState<string>('id');
  const [transcribeMode, setTranscribeMode] = useState<'local' | 'api'>('local');
  const [activeKeys, setActiveKeys] = useState<{ groq: boolean; openai: boolean; anthropic: boolean; gemini: boolean }>({
    groq: false,
    openai: false,
    anthropic: false,
    gemini: false,
  });
  const [selectedTranscribeProvider, setSelectedTranscribeProvider] = useState<string>('groq');
  const [selectedLlmProvider, setSelectedLlmProvider] = useState<string>('auto');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [recentProjects, setRecentProjects] = useState<Project[]>([]);

  useEffect(() => {
    fetch('/api/projects')
      .then((res) => res.json())
      .then((data) => {
        if (data.projects) setRecentProjects(data.projects.slice(0, 4));
      })
      .catch(() => {});

    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.keys) {
          setActiveKeys(data.keys);
          if (data.keys.groq) setSelectedTranscribeProvider('groq');
          else if (data.keys.gemini) setSelectedTranscribeProvider('gemini');
          else if (data.keys.openai) setSelectedTranscribeProvider('openai');
        }
        if (data.settings?.transcribe_api_provider) {
          setSelectedTranscribeProvider(data.settings.transcribe_api_provider);
        }
        if (data.settings?.llm_provider) {
          setSelectedLlmProvider(data.settings.llm_provider);
        }
      })
      .catch(() => {});
  }, []);

  // Probe URL YouTube / web video
  const handleProbe = async () => {
    if (!url.trim()) return;
    setIsProbing(true);
    setProbeError(null);
    setProbeResult(null);

    try {
      const res = await fetch('/api/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setProbeError(json.error || 'Gagal memeriksa URL video.');
      } else {
        setProbeResult(json.data);
      }
    } catch (err: any) {
      setProbeError(err.message || 'Gagal menghubungi server.');
    } finally {
      setIsProbing(false);
    }
  };

  // Inspect local video file with offscreen video + canvas
  const inspectLocalFile = (file: File) => {
    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/avi', 'video/x-msvideo'];
    const validExts = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
      setSubmitError('Format file tidak didukung. Harap pilih video MP4, MOV, WEBM, atau MKV.');
      return;
    }

    setSubmitError(null);
    setIsLocalProbing(true);

    const blobUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = blobUrl;
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      const duration = video.duration || 0;
      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;

      // Seek ke 1 detik atau 10% untuk mengambil thumbnail poster
      video.currentTime = Math.min(2, Math.max(0.5, duration * 0.1));
    };

    video.onseeked = () => {
      let thumbnail = '';
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth || 640, 640);
        canvas.height = Math.round(canvas.width * ((video.videoHeight || 360) / (video.videoWidth || 640)));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnail = canvas.toDataURL('image/jpeg', 0.85);
        }
      } catch (err) {
        console.warn('Gagal membuat preview canvas:', err);
      }

      setLocalFile({
        file,
        title: file.name.replace(/\.[^/.]+$/, ''),
        thumbnail,
        duration: video.duration || 0,
        width: video.videoWidth || 1920,
        height: video.videoHeight || 1080,
        size: file.size,
      });

      URL.revokeObjectURL(blobUrl);
      setIsLocalProbing(false);
    };

    video.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      setIsLocalProbing(false);
      // Tetap izinkan file dipakai meski browser tidak bisa decode thumbnail langsung
      setLocalFile({
        file,
        title: file.name.replace(/\.[^/.]+$/, ''),
        thumbnail: '',
        duration: 0,
        width: 1920,
        height: 1080,
        size: file.size,
      });
    };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      inspectLocalFile(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      inspectLocalFile(files[0]);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (sourceMode === 'url') {
      if (!url.trim()) {
        setSubmitError('Silakan masukkan link video terlebih dahulu.');
        return;
      }
      setIsSubmitting(true);
      setSubmitError(null);

      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_url: url.trim(),
            title: probeResult?.title || null,
            thumbnail_url: probeResult?.thumbnail || null,
            clip_duration: clipDuration,
            clip_count: clipCount,
            language,
            transcribe_mode: transcribeMode,
            transcribe_config: transcribeMode === 'api' ? { provider: selectedTranscribeProvider } : null,
            llm_provider: selectedLlmProvider,
            rights_confirmed: true,
          }),
        });

        const json = await res.json();
        if (!res.ok) {
          setSubmitError(json.error || 'Gagal membuat proyek baru.');
          setIsSubmitting(false);
        } else {
          router.push(`/projects/${json.id}/processing`);
        }
      } catch (err: any) {
        setSubmitError(err.message || 'Terjadi kesalahan sistem.');
        setIsSubmitting(false);
      }
    } else {
      // Mode upload file dari perangkat
      if (!localFile) {
        setSubmitError('Silakan pilih atau seret file video dari perangkat Anda.');
        return;
      }

      setIsSubmitting(true);
      setSubmitError(null);
      setUploadProgress(0);

      const formData = new FormData();
      formData.append('file', localFile.file);
      formData.append('title', localFile.title);
      formData.append('clip_duration', String(clipDuration));
      formData.append('clip_count', String(clipCount));
      formData.append('language', language);
      formData.append('transcribe_mode', transcribeMode);
      if (transcribeMode === 'api') {
        formData.append('transcribe_config', JSON.stringify({ provider: selectedTranscribeProvider }));
      }
      formData.append('llm_provider', selectedLlmProvider);
      if (localFile.duration) formData.append('duration', String(localFile.duration));
      if (localFile.width) formData.append('width', String(localFile.width));
      if (localFile.height) formData.append('height', String(localFile.height));
      if (localFile.thumbnail) formData.append('thumbnail_data', localFile.thumbnail);

      // Gunakan XMLHttpRequest untuk upload progress bar real-time
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percent);
        }
      };

      xhr.onload = () => {
        try {
          const response = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && response.id) {
            router.push(`/projects/${response.id}/processing`);
          } else {
            setSubmitError(response.error || 'Gagal mengunggah video ke server.');
            setIsSubmitting(false);
          }
        } catch {
          setSubmitError('Respon server tidak valid saat proses upload.');
          setIsSubmitting(false);
        }
      };

      xhr.onerror = () => {
        setSubmitError('Koneksi terputus saat mengunggah video.');
        setIsSubmitting(false);
      };

      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    }
  };

  const isSubmitDisabled = isSubmitting || (sourceMode === 'url' ? !url.trim() : !localFile);

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <Header />
      <Sidebar />

      <main className="pl-16 pt-20 sm:pt-24 pb-16 w-full flex flex-col items-center">
        {/* Hero Section */}
        <div className="w-full max-w-4xl px-6 pt-2 pb-6 flex flex-col items-center text-center">
          <h1 className="text-3xl md:text-5xl font-sans font-black tracking-tight text-on-surface leading-tight">
            Ubah Video Panjang Menjadi{' '}
            <span className="text-primary">
              Klip Pendek Berkualitas
            </span>
          </h1>

          <p className="mt-3 text-sm md:text-base text-on-surface-variant max-w-2xl leading-relaxed">
            Tempel link video YouTube atau upload file langsung dari perangkat. AI otomatis mentranskrip ucapan, mendeteksi momen paling menarik, menyelaraskan teks kalimat, dan membuat preview siap edit di CapCut Dashboard.
          </p>
        </div>

        {/* Input & Form Box */}
        <div className="w-full max-w-3xl px-6">
          <form
            onSubmit={handleGenerate}
            className="bg-surface-container-low border border-surface-container-high/60 rounded-xl p-6 shadow-2xl space-y-6"
          >
            {/* Source Mode Tabs */}
            <div className="flex items-center gap-2 p-1 bg-surface-container-lowest rounded-lg border border-surface-container-high/60">
              <button
                type="button"
                onClick={() => setSourceMode('url')}
                className={`flex-1 py-2 px-3 rounded-md text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-all ${
                  sourceMode === 'url'
                    ? 'bg-surface-container-highest text-primary shadow-xs font-bold'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container/60'
                }`}
              >
                <Link2 className="w-4 h-4" />
                <span>Link Video (YouTube)</span>
              </button>

              <button
                type="button"
                onClick={() => setSourceMode('upload')}
                className={`flex-1 py-2 px-3 rounded-md text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-all ${
                  sourceMode === 'upload'
                    ? 'bg-surface-container-highest text-primary shadow-xs font-bold'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container/60'
                }`}
              >
                <UploadCloud className="w-4 h-4" />
                <span>Upload dari Perangkat</span>
              </button>
            </div>

            {/* TAB 1: URL Input Bar */}
            {sourceMode === 'url' && (
              <div className="space-y-2">
                <label className="block text-xs font-mono font-semibold text-on-surface uppercase tracking-wider">
                  Link Video Sumber
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-outline" />
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full h-11 pl-10 pr-4 rounded-lg bg-surface-container-lowest border border-surface-container-high text-on-surface placeholder:text-outline text-xs sm:text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleProbe}
                    disabled={isProbing || !url.trim()}
                    className="h-11 px-4 rounded-lg bg-surface-container-high hover:bg-surface-container-highest border border-surface-container-highest/60 text-on-surface text-xs font-mono font-semibold flex items-center gap-2 transition-all shrink-0 disabled:opacity-50"
                  >
                    {isProbing ? (
                      <>
                        <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span>Memeriksa...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 text-primary" />
                        <span>Periksa Link</span>
                      </>
                    )}
                  </button>
                </div>

                {probeError && (
                  <p className="text-xs text-error font-medium flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {probeError}
                  </p>
                )}
              </div>
            )}

            {/* TAB 2: Device File Upload Dropzone */}
            {sourceMode === 'upload' && (
              <div className="space-y-2">
                <label className="block text-xs font-mono font-semibold text-on-surface uppercase tracking-wider">
                  File Video dari Komputer / Perangkat
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/avi,.mp4,.mov,.webm,.mkv,.avi,.m4v"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {!localFile ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
                      isDragging
                        ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10 scale-[1.01]'
                        : 'border-surface-container-high/80 bg-surface-container-lowest hover:border-primary/60 hover:bg-surface-container-lowest/80'
                    }`}
                  >
                    <div className="w-14 h-14 rounded-full bg-surface-container-high flex items-center justify-center mb-3 text-primary group-hover:scale-110 transition-transform">
                      <UploadCloud className="w-7 h-7" />
                    </div>

                    <h4 className="font-sans font-bold text-sm text-on-surface">
                      Klik untuk memilih video atau seret file ke sini
                    </h4>
                    <p className="text-xs text-on-surface-variant mt-1.5 max-w-sm">
                      Mendukung format <strong className="text-on-surface">MP4, MOV, WEBM, MKV, AVI</strong> hingga 2 GB.
                    </p>

                    {isLocalProbing && (
                      <div className="mt-3 flex items-center gap-2 text-xs font-mono text-primary">
                        <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span>Menganalisis file video...</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3.5 bg-surface-container rounded-lg border border-surface-container-highest flex gap-3.5 items-center">
                    {localFile.thumbnail ? (
                      <img
                        src={localFile.thumbnail}
                        alt={localFile.title}
                        className="w-24 h-16 object-cover rounded bg-surface-container-lowest shrink-0 border border-surface-container-highest"
                      />
                    ) : (
                      <div className="w-24 h-16 rounded bg-surface-container-lowest border border-surface-container-highest flex items-center justify-center text-outline shrink-0">
                        <Film className="w-6 h-6" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h4 className="font-sans font-bold text-xs text-on-surface truncate">
                        {localFile.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] font-mono text-on-surface-variant">
                        {localFile.duration > 0 && (
                          <span className="flex items-center gap-1 text-primary">
                            <Clock className="w-3.5 h-3.5" />
                            {formatDuration(localFile.duration)}
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                          {formatBytes(localFile.size)}
                        </span>
                        {localFile.width > 0 && localFile.height > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-secondary">
                            {localFile.width}x{localFile.height}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1.5 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-[11px] font-mono font-medium transition-colors"
                      >
                        Ganti File
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocalFile(null)}
                        className="p-1.5 rounded text-outline hover:text-error hover:bg-error-container/20 transition-colors"
                        title="Hapus pilihan"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Probe Video Preview Card (jika mode URL aktif & ada hasil) */}
            {sourceMode === 'url' && probeResult && (
              <div className="p-3 bg-surface-container rounded-lg border border-surface-container-highest flex gap-3.5 items-center">
                {probeResult.thumbnail && (
                  <img
                    src={probeResult.thumbnail}
                    alt={probeResult.title}
                    className="w-24 h-16 object-cover rounded bg-surface-container-lowest shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="font-sans font-bold text-xs text-on-surface truncate">
                    {probeResult.title}
                  </h4>
                  <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-on-surface-variant">
                    {probeResult.duration && (
                      <span className="flex items-center gap-1 text-primary">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDuration(probeResult.duration)}
                      </span>
                    )}
                    {probeResult.uploader && (
                      <span className="truncate">@{probeResult.uploader}</span>
                    )}
                    {probeResult.width && probeResult.height && (
                      <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-secondary">
                        {probeResult.width}x{probeResult.height}
                      </span>
                    )}
                  </div>
                </div>
                <CheckCircle2 className="w-5 h-5 text-secondary shrink-0" />
              </div>
            )}

            {/* Configuration Grids */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
              {/* Option 1: Durasi Klip */}
              <div className="space-y-2">
                <label className="text-xs font-mono font-semibold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary" />
                  Target Durasi Klip
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { val: 30, label: '30s' },
                    { val: 60, label: '60s' },
                    { val: 120, label: '120s' },
                    { val: 0, label: 'Otomatis' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => setClipDuration(item.val)}
                      className={`h-11 px-2 rounded-lg text-xs font-mono border flex items-center justify-center transition-all ${
                        clipDuration === item.val
                          ? 'bg-primary/15 border-primary text-primary font-bold shadow-xs ring-1 ring-primary/40'
                          : 'bg-surface-container-lowest border-surface-container-high/80 text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-medium'
                      }`}
                    >
                      <span className="font-bold">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Option 2: Engine Transkrip */}
              <div className="space-y-2">
                <label className="text-xs font-mono font-semibold text-on-surface uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Mic className="w-4 h-4 text-primary" />
                    Engine Transkrip (Whisper)
                  </span>
                  {transcribeMode === 'api' && (activeKeys.groq || activeKeys.gemini || activeKeys.openai) && (
                    <span className="text-[10px] text-primary font-bold lowercase">
                      {selectedTranscribeProvider}
                    </span>
                  )}
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setTranscribeMode('local')}
                    className={`h-12 px-3 rounded-lg text-xs font-mono border flex items-center justify-center gap-2 transition-all ${
                      transcribeMode === 'local'
                        ? 'bg-primary/15 border-primary text-primary font-bold shadow-xs ring-1 ring-primary/40'
                        : 'bg-surface-container-lowest border-surface-container-high/80 text-on-surface-variant hover:text-on-surface hover:bg-surface-container hover:border-outline-variant/60 font-medium'
                    }`}
                  >
                    <Laptop className="w-4 h-4 shrink-0" />
                    <div className="flex flex-col items-start leading-tight">
                      <span className="font-bold">Lokal Whisper</span>
                      <span className="text-[10px] opacity-75">CPU/GPU • Gratis</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeKeys.groq && !activeKeys.gemini && !activeKeys.openai) {
                        alert('Belum ada Kunci API Cloud yang aktif. Silakan isi Kunci API Gemini, Groq, atau OpenAI pada menu Pengaturan terlebih dahulu.');
                        return;
                      }
                      setTranscribeMode('api');
                    }}
                    className={`h-12 px-3 rounded-lg text-xs font-mono border flex items-center justify-center gap-2 transition-all ${
                      transcribeMode === 'api'
                        ? 'bg-primary/15 border-primary text-primary font-bold shadow-xs ring-1 ring-primary/40'
                        : 'bg-surface-container-lowest border-surface-container-high/80 text-on-surface-variant hover:text-on-surface hover:bg-surface-container hover:border-outline-variant/60 font-medium'
                    }`}
                  >
                    <Cloud className="w-4 h-4 shrink-0" />
                    <div className="flex flex-col items-start leading-tight">
                      <span className="font-bold">Cloud API</span>
                      <span className="text-[10px] opacity-75">
                        {(!activeKeys.groq && !activeKeys.gemini && !activeKeys.openai)
                          ? 'Belum ada API Key'
                          : 'Groq / Gemini / OpenAI'}
                      </span>
                    </div>
                  </button>
                </div>

                {/* Dropdown pilihan provider transkrip jika mode Cloud API dipilih */}
                {transcribeMode === 'api' && (activeKeys.groq || activeKeys.gemini || activeKeys.openai) && (
                  <div className="pt-1">
                    <select
                      value={selectedTranscribeProvider}
                      onChange={(e) => setSelectedTranscribeProvider(e.target.value)}
                      className="w-full bg-surface-container-lowest border border-surface-container-high/80 px-2.5 py-1.5 rounded-lg text-xs text-on-surface font-semibold focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                    >
                      {activeKeys.groq && <option value="groq">Groq Whisper (Super Cepat)</option>}
                      {activeKeys.gemini && <option value="gemini">Google Gemini Audio (Multimodal STT)</option>}
                      {activeKeys.openai && <option value="openai">OpenAI Whisper Audio</option>}
                    </select>
                  </div>
                )}
              </div>

              {/* Option 3: Jumlah Klip */}
              <div className="space-y-2">
                <label className="text-xs font-mono font-semibold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                  <Film className="w-4 h-4 text-primary" />
                  Jumlah Klip
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: 0, label: 'Otomatis' },
                    { val: 5, label: '5 Klip' },
                    { val: 10, label: '10 Klip' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => setClipCount(item.val)}
                      className={`h-11 px-2 rounded-lg text-xs font-mono border flex items-center justify-center transition-all ${
                        clipCount === item.val
                          ? 'bg-primary/15 border-primary text-primary font-bold shadow-xs ring-1 ring-primary/40'
                          : 'bg-surface-container-lowest border-surface-container-high/80 text-on-surface-variant hover:text-on-surface hover:bg-surface-container hover:border-outline-variant/60 font-medium'
                      }`}
                    >
                      <span className="font-bold">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Option 4: Bahasa */}
              <div className="space-y-2">
                <label className="text-xs font-mono font-semibold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                  <Languages className="w-4 h-4 text-primary" />
                  Bahasa Video
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: 'id', label: 'Indonesia' },
                    { val: 'en', label: 'English' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => setLanguage(item.val)}
                      className={`h-11 px-3 rounded-lg text-xs font-mono border flex items-center justify-center transition-all ${
                        language === item.val
                          ? 'bg-primary/15 border-primary text-primary font-bold shadow-xs ring-1 ring-primary/40'
                          : 'bg-surface-container-lowest border-surface-container-high/80 text-on-surface-variant hover:text-on-surface hover:bg-surface-container hover:border-outline-variant/60 font-medium'
                      }`}
                    >
                      <span className="font-bold">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Option 5: AI Analisis Klip Viral */}
              <div className="space-y-2 md:col-span-2 bg-surface-container-low/50 p-3 rounded-lg border border-surface-container-high/60">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono font-semibold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                    <Brain className="w-4 h-4 text-primary" />
                    AI Analisis Klip
                  </label>
                  <span className="text-[10px] text-outline">
                    Penyedia tanpa API key disembunyikan otomatis
                  </span>
                </div>
                <select
                  value={selectedLlmProvider}
                  onChange={(e) => setSelectedLlmProvider(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-surface-container-high/80 px-3 py-2 rounded-lg text-xs text-on-surface font-semibold focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  {(activeKeys.gemini || activeKeys.openai || activeKeys.groq || activeKeys.anthropic) && (
                    <option value="auto">Otomatis (Pilih AI Cloud Terbaik yang Tersedia)</option>
                  )}
                  {activeKeys.gemini && <option value="gemini">Google Gemini (Flash Multimodal AI)</option>}
                  {activeKeys.groq && <option value="groq">Groq (Llama 3.3 70B — Super Cepat)</option>}
                  {activeKeys.openai && <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>}
                  {activeKeys.anthropic && <option value="anthropic">Claude 3.5 / 4.5 Sonnet</option>}
                  <option value="heuristic">Heuristik Offline (Tanpa API Key — Analisis Audio &amp; Kata)</option>
                </select>
              </div>
            </div>

            {/* Upload Progress Bar (jika sedang upload file lokal) */}
            {isSubmitting && sourceMode === 'upload' && (
              <div className="space-y-2 p-3 bg-surface-container rounded-lg border border-surface-container-highest">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-on-surface flex items-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span>
                      {uploadProgress < 100
                        ? `Mengunggah video ke server (${uploadProgress}%)...`
                        : 'Menyimpan video & menyiapkan worker pipeline...'}
                    </span>
                  </span>
                  <span className="text-primary font-bold">{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-container-lowest overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-150 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {submitError && (
              <div className="p-3 bg-error-container/40 border border-error/40 rounded-lg text-error text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-primary-container via-primary to-secondary hover:brightness-110 text-on-primary-container font-mono text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-on-primary-container border-t-transparent rounded-full animate-spin" />
                    <span>
                      {sourceMode === 'upload'
                        ? uploadProgress < 100
                          ? `Mengunggah (${uploadProgress}%)...`
                          : 'Memproses Proyek...'
                        : 'Membuat Proyek Baru...'}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>Generate Klip</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Feature Highlights Grid */}
        <div className="w-full max-w-4xl px-6 mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container-high/40 flex flex-col gap-2">
            <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Brain className="w-4 h-4" />
            </span>
            <h3 className="font-sans font-bold text-sm text-on-surface">Analisis Hook 3 Detik</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Algoritma AI menganalisis hook kalimat pembuka, emosi ucapan, dan punchline penutup untuk memastikan klip memicu interaksi penonton.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container-high/40 flex flex-col gap-2">
            <span className="w-8 h-8 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center">
              <Subtitles className="w-4 h-4" />
            </span>
            <h3 className="font-sans font-bold text-sm text-on-surface">Auto-Caption Karaoke</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Subtitle otomatis tersinkronisasi kata per kata dengan animasi pop dan highlight warna dinamis, identik di preview browser maupun render MP4.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container-high/40 flex flex-col gap-2">
            <span className="w-8 h-8 rounded-lg bg-tertiary/10 text-tertiary flex items-center justify-center">
              <Crop className="w-4 h-4" />
            </span>
            <h3 className="font-sans font-bold text-sm text-on-surface">CapCut-Style Editor</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Dashboard editor pro dengan preview 9:16 real-time, timeline waveform audio, trim in/out handles, dan autosave draf otomatis.
            </p>
          </div>
        </div>

        {/* Recent Projects List */}
        {recentProjects.length > 0 && (
          <div className="w-full max-w-4xl px-6 mt-12 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-xs font-bold text-on-surface uppercase tracking-wider">
                Proyek Terbaru
              </h2>
              <Link href="/projects" className="text-xs font-mono text-primary hover:underline">
                Lihat Semua &rarr;
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {recentProjects.map((proj) => (
                <Link
                  key={proj.id}
                  href={proj.status === 'ready' ? `/projects/${proj.id}` : `/projects/${proj.id}/processing`}
                  className="group p-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container border border-surface-container-high/60 transition-all flex flex-col justify-between"
                >
                  <div className="aspect-video w-full rounded bg-surface-container-lowest overflow-hidden relative mb-2">
                    {proj.thumbnail_path ? (
                      <img
                        src={proj.thumbnail_path.startsWith('http') ? proj.thumbnail_path : `/api/files/${proj.thumbnail_path}`}
                        alt={proj.title || 'Project thumbnail'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-outline">
                        <Film className="w-6 h-6" />
                      </div>
                    )}
                    <span className={`absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                      proj.status === 'ready'
                        ? 'bg-secondary/90 text-on-secondary'
                        : proj.status === 'failed'
                        ? 'bg-error/90 text-on-error'
                        : 'bg-primary/90 text-on-primary animate-pulse'
                    }`}>
                      {proj.status}
                    </span>
                  </div>

                  <span className="font-sans font-semibold text-xs text-on-surface truncate block">
                    {proj.title || `Project #${proj.id}`}
                  </span>
                  <span className="text-[10px] font-mono text-outline mt-1 block">
                    {proj.duration_sec ? formatDuration(proj.duration_sec) : '-'} • {proj.clip_duration}s
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
