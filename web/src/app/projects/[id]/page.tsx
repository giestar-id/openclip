'use client';

import React, { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { CanvasViewport } from '@/components/editor/CanvasViewport';
import { InspectorPanel } from '@/components/editor/InspectorPanel';
import { TimelineTrack } from '@/components/editor/TimelineTrack';
import { ClipShelf } from '@/components/editor/ClipShelf';
import { ExportModal } from '@/components/editor/ExportModal';
import { BatchExportModal } from '@/components/editor/BatchExportModal';
import { ManualClipModal } from '@/components/editor/ManualClipModal';
import { Project, Clip, CaptionSegment, CaptionStyle, FrameSettings, AudioSettings } from '@/lib/types';
import { DEFAULT_STYLE, DEFAULT_FRAME, DEFAULT_AUDIO } from '@/lib/captions';
import {
  Loader2,
  AlertCircle,
  Video,
  Film,
  Scissors,
  Undo2,
  Redo2,
  Download,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';

interface HistoryState {
  clipId: number;
  startSec: number;
  endSec: number;
  clips: Clip[];
  captionSegments: CaptionSegment[];
  style: CaptionStyle;
  frame: FrameSettings;
  audio: AudioSettings;
  actionName?: string;
  createdSplitClipId?: number;
}

function EditorContent() {
  const params = useParams();
  const projectId = params?.id as string;
  const router = useRouter();

  // Project & Clips data
  const [project, setProject] = useState<Project | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Clip Editing State
  const [captionSegments, setCaptionSegments] = useState<CaptionSegment[]>([]);
  const [style, setStyle] = useState<CaptionStyle>(DEFAULT_STYLE);
  const [frame, setFrame] = useState<FrameSettings>(DEFAULT_FRAME);
  const [audio, setAudio] = useState<AudioSettings>(DEFAULT_AUDIO);

  // Player state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [safeGuides, setSafeGuides] = useState<boolean>(false);

  // Autosave & History state
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string>('Baru saja');
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);
  const historyRef = useRef<HistoryState[]>([]);
  const historyIndexRef = useRef<number>(-1);

  // Modals & view state
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isBatchExportOpen, setIsBatchExportOpen] = useState(false);
  const [isManualClipOpen, setIsManualClipOpen] = useState(false);
  const [isCinemaMode, setIsCinemaMode] = useState(false);
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(480);
  const isResizingPanel = useRef(false);
  const [bottomView, setBottomView] = useState<'clips' | 'timeline'>('clips');

  // Load custom editor panel width preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem('clipper_panel_width');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 380 && val <= 850) {
          setLeftPanelWidth(val);
        }
      }
    } catch {}
  }, []);

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingPanel.current = true;
    const startX = e.clientX;
    const startWidth = leftPanelWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingPanel.current) return;
      const newWidth = Math.max(380, Math.min(850, startWidth + (moveEvent.clientX - startX)));
      setLeftPanelWidth(newWidth);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      if (!isResizingPanel.current) return;
      isResizingPanel.current = false;
      const finalWidth = Math.max(380, Math.min(850, startWidth + (upEvent.clientX - startX)));
      try {
        localStorage.setItem('clipper_panel_width', String(finalWidth));
      } catch {}
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Kunci zoom web (Ctrl + Wheel, Ctrl + / -) agar editor kokoh seperti CapCut Web
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
        e.preventDefault();
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // 1. Fetch initial Project & Clips
  useEffect(() => {
    let isMounted = true;
    const fetchProject = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) {
          if (res.status === 404) setError('Proyek tidak ditemukan.');
          else setError('Gagal memuat proyek');
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (!isMounted) return;

        setProject(data.project);
        setClips(data.clips || []);
        setPeaks(data.peaks || null);

        // Pilih klip pertama secara default
        if (data.clips && data.clips.length > 0) {
          const first = data.clips[0];
          setSelectedClip(first);
          loadClipState(first, data.clips);
        }
        setLoading(false);
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Gagal memuat proyek');
          setLoading(false);
        }
      }
    };

    fetchProject();
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  // Muat state klip ke editor
  const loadClipState = (clip: Clip, currentClips?: Clip[]) => {
    const segs = (clip as any).caption_segments || [];
    const st = (clip as any).style || DEFAULT_STYLE;
    const fr = (clip as any).frame || DEFAULT_FRAME;
    const au = (clip as any).audio || DEFAULT_AUDIO;

    setCaptionSegments(segs);
    setStyle(st);
    setFrame(fr);
    setAudio(au);

    const activeClips = currentClips || clips;
    const initialClips = activeClips.length > 0 ? activeClips : [clip];

    // Reset history stack untuk klip baru (State Snapshot Lengkap)
    const initial: HistoryState = {
      clipId: clip.id,
      startSec: clip.start_sec,
      endSec: clip.end_sec,
      clips: initialClips,
      captionSegments: segs,
      style: st,
      frame: fr,
      audio: au,
      actionName: 'Initial',
    };
    historyRef.current = [initial];
    historyIndexRef.current = 0;
    setCanUndo(false);
    setCanRedo(false);
    setCurrentTime(0);
    setIsPlaying(false);
  };

  // 2. Sinkronisasi event video player (timeupdate, play, pause, ended)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const cur = video.currentTime;
      setCurrentTime(cur);

      if (selectedClip) {
        const offset = selectedClip.preview_start_sec ?? 0;
        const inPoint = Math.max(0, selectedClip.start_sec - offset);
        const outPoint = Math.max(inPoint + 0.05, selectedClip.end_sec - offset);

        // Jika playback mencapai atau melewati outPoint batas akhir potongan:
        if (cur >= outPoint) {
          if (isLooping) {
            video.currentTime = inPoint;
            video.play().catch(() => {});
          } else {
            video.pause();
            video.currentTime = outPoint;
            setCurrentTime(outPoint);
            setIsPlaying(false);
          }
        } else if (cur < inPoint) {
          // Jika currentTime berada di sebelah kiri potongan:
          video.currentTime = inPoint;
          setCurrentTime(inPoint);
        }
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      if (selectedClip) {
        const inPoint = Math.max(0, selectedClip.start_sec - (selectedClip.preview_start_sec ?? 0));
        video.currentTime = inPoint;
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      if (selectedClip) {
        const inPoint = Math.max(0, selectedClip.start_sec - (selectedClip.preview_start_sec ?? 0));
        video.currentTime = inPoint;
        if (isLooping) {
          video.play().catch(() => {});
        }
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [selectedClip, isLooping]);

  // 2b. High-precision 60fps playback ticker (requestAnimationFrame)
  // Menjamin pergerakan kamera Smooth Follow, slider timeline, dan animasi subtitle karaoke
  // berjalan mulus (60fps) tanpa patah-patah oleh jeda event timeupdate bawaan browser (250ms).
  useEffect(() => {
    if (!isPlaying) return;
    const video = videoRef.current;
    if (!video) return;

    let rafId: number;
    const tick = () => {
      if (video && !video.paused) {
        const cur = video.currentTime;
        setCurrentTime(cur);

        if (selectedClip) {
          const offset = selectedClip.preview_start_sec ?? 0;
          const inPoint = Math.max(0, selectedClip.start_sec - offset);
          const outPoint = Math.max(inPoint + 0.05, selectedClip.end_sec - offset);

          if (cur >= outPoint) {
            if (isLooping) {
              video.currentTime = inPoint;
              video.play().catch(() => {});
            } else {
              video.pause();
              video.currentTime = outPoint;
              setCurrentTime(outPoint);
              setIsPlaying(false);
              return;
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, isLooping, selectedClip]);

  // 3. Play / Pause & Seeking Handlers
  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      if (selectedClip) {
        const offset = selectedClip.preview_start_sec ?? 0;
        const inPoint = Math.max(0, selectedClip.start_sec - offset);
        const outPoint = Math.max(inPoint + 0.05, selectedClip.end_sec - offset);

        // Jika playhead sudah di ujung potongan (atau di luar potongan),
        // reset ke awal potongan klip sebelum play!
        if (video.currentTime >= outPoint - 0.05 || video.currentTime < inPoint) {
          video.currentTime = inPoint;
          setCurrentTime(inPoint);
        }
      }
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [selectedClip]);

  const handleSeek = useCallback(
    (time: number) => {
      if (!videoRef.current) return;
      let target = time;
      if (selectedClip) {
        const offset = selectedClip.preview_start_sec ?? 0;
        const inPoint = Math.max(0, selectedClip.start_sec - offset);
        const outPoint = Math.max(inPoint + 0.05, selectedClip.end_sec - offset);
        // Batasi target seek agar selalu berada di dalam area aktif klip
        target = Math.max(inPoint, Math.min(outPoint, time));
      }
      videoRef.current.currentTime = target;
      setCurrentTime(target);
    },
    [selectedClip]
  );

  const handleStepFrame = useCallback(
    (frames: number) => {
      if (!videoRef.current) return;
      const fps = 30;
      const newTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + frames * (1 / fps)));
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration]
  );

  // Ref untuk mendeteksi perubahan dan timer autosave
  const isDirtyRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fungsi simpan edit ke database
  const saveEdits = useCallback(
    async (
      clipId: number,
      segs: CaptionSegment[],
      st: CaptionStyle,
      fr: FrameSettings,
      au: AudioSettings
    ) => {
      try {
        setSaveStatus('saving');
        const res = await fetch(`/api/clips/${clipId}/edit`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caption_segments: segs,
            style: st,
            frame: fr,
            audio: au,
          }),
        });

        if (res.ok) {
          isDirtyRef.current = false;
          setSaveStatus('saved');
          const now = new Date();
          setLastSavedTime(
            `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
          );
        } else {
          setSaveStatus('unsaved');
        }
      } catch {
        setSaveStatus('unsaved');
      }
    },
    []
  );

  // Simpan secara instan (misal saat buka modal ekspor atau ganti klip)
  const saveEditsInstantly = useCallback(async () => {
    if (!selectedClip) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    await saveEdits(selectedClip.id, captionSegments, style, frame, audio);
  }, [selectedClip, captionSegments, style, frame, audio, saveEdits]);

  // 4. History Push Helper (CapCut & OpenCut Architecture)
  const pushHistory = useCallback(
    (
      overrides?: Partial<HistoryState>,
      actionName: string = 'Edit'
    ) => {
      if (!selectedClip) return;

      // Discard any redo states ahead of the current pointer
      const discarded = historyRef.current.slice(historyIndexRef.current + 1);
      for (const st of discarded) {
        if (st.createdSplitClipId) {
          fetch(`/api/clips/${st.createdSplitClipId}`, { method: 'DELETE' }).catch(() => {});
        }
      }

      const nextStack = historyRef.current.slice(0, historyIndexRef.current + 1);

      const nextState: HistoryState = {
        clipId: overrides?.clipId ?? selectedClip.id,
        startSec: overrides?.startSec ?? selectedClip.start_sec,
        endSec: overrides?.endSec ?? selectedClip.end_sec,
        clips: overrides?.clips ?? clips,
        captionSegments: overrides?.captionSegments ?? captionSegments,
        style: overrides?.style ?? style,
        frame: overrides?.frame ?? frame,
        audio: overrides?.audio ?? audio,
        actionName,
        createdSplitClipId: overrides?.createdSplitClipId,
      };

      nextStack.push(nextState);
      if (nextStack.length > 50) nextStack.shift();

      historyRef.current = nextStack;
      historyIndexRef.current = nextStack.length - 1;
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(false);
      isDirtyRef.current = true;
      setSaveStatus('unsaved');
    },
    [selectedClip, clips, captionSegments, style, frame, audio]
  );

  // Undo (Kembalikan ke status sebelum potongan / editan)
  const handleUndo = useCallback(async () => {
    if (historyIndexRef.current > 0) {
      const currentState = historyRef.current[historyIndexRef.current];
      historyIndexRef.current -= 1;
      const target = historyRef.current[historyIndexRef.current];

      // Jika membatalkan aksi split, hapus klip split pecahan yang tersimpan di DB
      if (currentState?.createdSplitClipId) {
        fetch(`/api/clips/${currentState.createdSplitClipId}`, { method: 'DELETE' }).catch(() => {});
      }

      // 1. Restore clips array
      if (target.clips && target.clips.length > 0) {
        setClips(target.clips);
      }

      // 2. Restore clip timings (start_sec, end_sec) & clamp playhead
      if (selectedClip && (selectedClip.start_sec !== target.startSec || selectedClip.end_sec !== target.endSec)) {
        const restoredClip: Clip = {
          ...selectedClip,
          start_sec: target.startSec,
          end_sec: target.endSec,
        };
        setSelectedClip(restoredClip);

        setClips((prev) =>
          prev.map((c) => (c.id === restoredClip.id ? restoredClip : c))
        );

        // Clamp playhead ke batas rentang klip yang baru dipulihkan
        const offset = restoredClip.preview_start_sec ?? 0;
        const inPoint = Math.max(0, target.startSec - offset);
        const outPoint = Math.max(inPoint + 0.05, target.endSec - offset);
        if (videoRef.current) {
          if (videoRef.current.currentTime < inPoint) {
            videoRef.current.currentTime = inPoint;
            setCurrentTime(inPoint);
          } else if (videoRef.current.currentTime > outPoint) {
            videoRef.current.currentTime = outPoint;
            setCurrentTime(outPoint);
          }
        }

        // Sinkronisasi pemulihan waktu potongan ke database
        fetch(`/api/clips/${restoredClip.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start_sec: target.startSec, end_sec: target.endSec }),
        }).catch((e) => console.error('Gagal rollback trim ke DB:', e));
      }

      // 3. Restore captions, style, frame, audio
      setCaptionSegments(target.captionSegments);
      setStyle(target.style);
      setFrame(target.frame);
      setAudio(target.audio);

      // 4. Update status tombol Undo / Redo
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1);

      isDirtyRef.current = true;
      setSaveStatus('unsaved');
    }
  }, [selectedClip]);

  // Redo (Terapkan ulang editan / potongan)
  const handleRedo = useCallback(async () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const target = historyRef.current[historyIndexRef.current];

      // 1. Restore clips array
      if (target.clips && target.clips.length > 0) {
        setClips(target.clips);
      }

      // 2. Re-apply clip timings
      if (selectedClip && (selectedClip.start_sec !== target.startSec || selectedClip.end_sec !== target.endSec)) {
        const reAppliedClip: Clip = {
          ...selectedClip,
          start_sec: target.startSec,
          end_sec: target.endSec,
        };
        setSelectedClip(reAppliedClip);

        setClips((prev) =>
          prev.map((c) => (c.id === reAppliedClip.id ? reAppliedClip : c))
        );

        const offset = reAppliedClip.preview_start_sec ?? 0;
        const inPoint = Math.max(0, target.startSec - offset);
        const outPoint = Math.max(inPoint + 0.05, target.endSec - offset);
        if (videoRef.current) {
          if (videoRef.current.currentTime < inPoint) {
            videoRef.current.currentTime = inPoint;
            setCurrentTime(inPoint);
          } else if (videoRef.current.currentTime > outPoint) {
            videoRef.current.currentTime = outPoint;
            setCurrentTime(outPoint);
          }
        }

        // Simpan perubahan redo ke DB
        fetch(`/api/clips/${reAppliedClip.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start_sec: target.startSec, end_sec: target.endSec }),
        }).catch((e) => console.error('Gagal simpan redo trim ke DB:', e));
      }

      // 3. Restore captions, style, frame, audio
      setCaptionSegments(target.captionSegments);
      setStyle(target.style);
      setFrame(target.frame);
      setAudio(target.audio);

      // 4. Update status tombol Undo / Redo
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1);

      isDirtyRef.current = true;
      setSaveStatus('unsaved');
    }
  }, [selectedClip]);

  // 5. Debounced Autosave Effect (Mulus tanpa dibatalkan oleh perubahan saveStatus)
  useEffect(() => {
    if (!selectedClip || !isDirtyRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveEdits(selectedClip.id, captionSegments, style, frame, audio);
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [captionSegments, style, frame, audio, selectedClip, saveEdits]);

  // 6. Keyboard Shortcuts (Space, Ctrl+Z, Ctrl+Y, Arrows)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Abaikan jika fokus di input / textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleStepFrame(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleStepFrame(1);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'l' || e.key === 'L') {
        setIsLooping((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, handleStepFrame, handleUndo, handleRedo]);

  // Update handlers dari panel inspector
  const handleUpdateSegments = (newSegments: CaptionSegment[]) => {
    setCaptionSegments(newSegments);
    pushHistory({ captionSegments: newSegments }, 'Update Segments');
  };

  const handleUpdateStyle = (newStyle: CaptionStyle) => {
    setStyle(newStyle);
    pushHistory({ style: newStyle }, 'Update Style');
  };

  const handleUpdateFrame = (newFrame: FrameSettings) => {
    setFrame(newFrame);
    pushHistory({ frame: newFrame }, 'Update Frame');
  };

  const handleUpdateAudio = (newAudio: AudioSettings) => {
    setAudio(newAudio);
    pushHistory({ audio: newAudio }, 'Update Audio');
  };

  const handleUpdateClipInfo = async (title: string, description: string, hashtags?: string[]) => {
    if (!selectedClip) return;
    try {
      const payload: any = { title, description };
      if (hashtags !== undefined) payload.hashtags = hashtags;

      await fetch(`/api/clips/${selectedClip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // Update local state
      setClips((prev) =>
        prev.map((c) =>
          c.id === selectedClip.id
            ? { ...c, title, description, ...(hashtags ? { hashtags } : {}) }
            : c
        )
      );
      setSelectedClip((prev) =>
        prev
          ? { ...prev, title, description, ...(hashtags ? { hashtags } : {}) }
          : null
      );
    } catch {
      // Abaikan
    }
  };

  const handleToggleFavorite = async (clipId: number, isFav: boolean) => {
    try {
      await fetch(`/api/clips/${clipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: isFav ? 1 : 0 }),
      });
      setClips((prev) =>
        prev.map((c) => (c.id === clipId ? { ...c, is_favorite: isFav ? 1 : 0 } : c))
      );
      if (selectedClip && selectedClip.id === clipId) {
        setSelectedClip({ ...selectedClip, is_favorite: isFav ? 1 : 0 });
      }
    } catch {
      // Abaikan
    }
  };

  // Trim Klip In/Out (Preview live & clamp playhead)
  const handleTrimChange = useCallback(
    (start: number, end: number) => {
      if (!selectedClip) return;
      const updated = { ...selectedClip, start_sec: start, end_sec: end };
      setSelectedClip(updated);
      setClips((prev) => prev.map((c) => (c.id === selectedClip.id ? updated : c)));

      // Clamp playhead agar langsung menyesuaikan dengan potongan baru
      const offset = selectedClip.preview_start_sec ?? 0;
      const inPoint = Math.max(0, start - offset);
      const outPoint = Math.max(inPoint + 0.05, end - offset);
      if (videoRef.current) {
        if (videoRef.current.currentTime < inPoint) {
          videoRef.current.currentTime = inPoint;
          setCurrentTime(inPoint);
        } else if (videoRef.current.currentTime > outPoint) {
          videoRef.current.currentTime = outPoint;
          setCurrentTime(outPoint);
        }
      }
    },
    [selectedClip]
  );

  // Komit hasil trim ke Database & catat ke riwayat Undo/Redo
  const handleTrimCommit = useCallback(
    (start: number, end: number) => {
      if (!selectedClip) return;

      const currentHistory = historyRef.current[historyIndexRef.current];
      if (
        currentHistory &&
        currentHistory.startSec === start &&
        currentHistory.endSec === end
      ) {
        return;
      }

      const updated = { ...selectedClip, start_sec: start, end_sec: end };
      setSelectedClip(updated);
      const updatedClips = clips.map((c) => (c.id === selectedClip.id ? updated : c));
      setClips(updatedClips);

      // Simpan perubahan start & end ke database
      fetch(`/api/clips/${selectedClip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_sec: start, end_sec: end }),
      }).catch((e) => console.error('Gagal menyimpan trim:', e));

      // Catat ke Undo Stack
      pushHistory(
        {
          startSec: start,
          endSec: end,
          clips: updatedClips,
        },
        'Trim'
      );
    },
    [selectedClip, clips, pushHistory]
  );

  // Split Klip di Titik Playhead (CapCut Style)
  const handleSplitClip = async (splitSec: number) => {
    if (!selectedClip || !project) return;
    const oldEnd = selectedClip.end_sec;
    if (splitSec <= selectedClip.start_sec || splitSec >= oldEnd) return;

    // 1. Potong klip aktif saat ini sampai batas detik splitSec
    const updatedFirstClip = { ...selectedClip, end_sec: splitSec };
    setSelectedClip(updatedFirstClip);
    const intermediateClips = clips.map((c) => (c.id === selectedClip.id ? updatedFirstClip : c));
    setClips(intermediateClips);

    // Pause dan letakkan playhead di awal klip pertama agar video tidak tembus memutar sisa potongan
    const offset = selectedClip.preview_start_sec ?? 0;
    const inPoint = Math.max(0, selectedClip.start_sec - offset);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = inPoint;
      setCurrentTime(inPoint);
      setIsPlaying(false);
    }

    // Simpan pemotongan klip pertama ke server
    try {
      await fetch(`/api/clips/${selectedClip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ end_sec: splitSec }),
      });
    } catch (e) {
      console.error('Gagal update klip split pertama:', e);
    }

    // 2. Buat klip kedua dari splitSec sampai oldEnd melalui API clips
    try {
      const res = await fetch(`/api/projects/${project.id}/clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_sec: splitSec,
          end_sec: oldEnd,
          title: `${selectedClip.title || 'Klip'} (Bagian 2)`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.clip) {
          const finalClips = [...intermediateClips, data.clip];
          setClips(finalClips);
          pushHistory(
            {
              startSec: selectedClip.start_sec,
              endSec: splitSec,
              clips: finalClips,
              createdSplitClipId: data.clip.id,
            },
            'Split'
          );
        }
      }
    } catch (e) {
      console.error('Gagal membuat klip split kedua:', e);
    }
  };

  // Hapus Segmen Caption dari Timeline
  const handleDeleteCaptionSegment = (segmentId: string) => {
    const nextSegments = captionSegments.filter((s) => s.id !== segmentId);
    setCaptionSegments(nextSegments);
    pushHistory({ captionSegments: nextSegments }, 'Delete Caption Segment');
  };

  const handleDeleteClip = async (clipId: number) => {
    try {
      const res = await fetch(`/api/clips/${clipId}`, { method: 'DELETE' });
      if (res.ok) {
        const remaining = clips.filter((c) => c.id !== clipId);
        setClips(remaining);
        if (selectedClip?.id === clipId) {
          if (remaining.length > 0) {
            setSelectedClip(remaining[0]);
            loadClipState(remaining[0]);
          } else {
            setSelectedClip(null);
          }
        }
      }
    } catch {
      alert('Gagal menghapus klip');
    }
  };

  const handleSelectClip = async (clip: Clip) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (selectedClip && isDirtyRef.current && selectedClip.id !== clip.id) {
      await saveEdits(selectedClip.id, captionSegments, style, frame, audio);
    }
    setSelectedClip(clip);
    loadClipState(clip);
  };

  const handleClipCreated = (newClip: Clip) => {
    setClips((prev) => [newClip, ...prev]);
    setSelectedClip(newClip);
    loadClipState(newClip);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-on-surface flex flex-col">
        <Header />
        <Sidebar />
        <div className="pl-16 pt-14 flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <span className="font-label-md text-on-surface-variant">Memuat Editor OpenClip...</span>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-background text-on-surface flex flex-col">
        <Header />
        <Sidebar />
        <div className="pl-16 pt-14 flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
          <AlertCircle className="w-12 h-12 text-error" />
          <h2 className="font-headline-md text-on-surface font-semibold">{error || 'Proyek tidak ditemukan'}</h2>
          <Link
            href="/"
            className="px-4 py-2 bg-surface-container hover:bg-surface-bright text-on-surface rounded font-label-md transition-colors"
          >
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen max-h-screen overflow-hidden bg-background text-on-surface flex flex-col select-none">
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest/90 backdrop-blur-xl shadow-md border-b border-surface-container-highest/40">
        <div className="editor-toolbar-inner h-14 w-full pl-2 pr-[18px] flex items-center justify-between gap-4">
          {/* Left: Brand & File Menus */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center group-hover:scale-105 transition-transform text-on-primary shadow-xs">
                <Scissors className="w-4 h-4" />
              </div>
              <span className="editor-brand-name font-sans text-base text-on-surface tracking-tight font-bold">
                OpenClip
              </span>
            </Link>

            <div className="h-4 w-px bg-surface-container-highest mx-1" />

            {/* Autosave Status Pill */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-low text-on-surface-variant text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  saveStatus === 'saving'
                    ? 'bg-tertiary animate-pulse'
                    : saveStatus === 'saved'
                    ? 'bg-secondary'
                    : 'bg-error'
                }`}
              />
              <span className="editor-save-status font-label-sm text-[11px]">
                {saveStatus === 'saving' ? 'Menyimpan...' : `Tersimpan ${lastSavedTime}`}
              </span>
            </div>
          </div>

          {/* Center: Active Video Title & Resolution Pill */}
          <div className="flex items-center gap-3 flex-1 justify-center max-w-xl min-w-0">
            <div className="editor-title flex items-center gap-2 bg-surface-container-low px-3 py-1 rounded-lg max-w-sm w-full min-w-0 border border-outline-variant/20">
              <Film className="w-3.5 h-3.5 text-outline shrink-0" />
              <span className="truncate font-body-sm text-xs text-on-surface font-semibold">
                {selectedClip?.title || project.title || project.source_url}
              </span>
              <span className="editor-ratio font-label-sm text-[10px] text-primary px-1.5 py-0.2 rounded bg-surface-container-high flex-shrink-0 font-mono">
                {frame.ratio} • 540p
              </span>
            </div>

            {/* Undo / Redo Buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={handleUndo}
                disabled={!canUndo}
                className={`p-1.5 rounded transition-all flex items-center justify-center ${
                  canUndo
                    ? 'bg-surface-container hover:bg-surface-container-high text-on-surface cursor-pointer shadow-xs active:scale-95'
                    : 'opacity-30 text-outline cursor-not-allowed bg-surface-container/40'
                }`}
                title="Undo / Urungkan (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={!canRedo}
                className={`p-1.5 rounded transition-all flex items-center justify-center ${
                  canRedo
                    ? 'bg-surface-container hover:bg-surface-container-high text-on-surface cursor-pointer shadow-xs active:scale-95'
                    : 'opacity-30 text-outline cursor-not-allowed bg-surface-container/40'
                }`}
                title="Redo / Ulangi (Ctrl+Y / Ctrl+Shift+Z)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Right: Export Buttons */}
          <div className="editor-export-actions flex items-center gap-2 flex-shrink-0">

            <button
              onClick={async () => {
                await saveEditsInstantly();
                setIsBatchExportOpen(true);
              }}
              disabled={clips.length === 0}
              className="h-8 px-3 rounded bg-surface-container hover:bg-surface-bright text-primary font-label-md text-xs font-semibold flex items-center gap-1.5 transition-colors border border-primary/20 shadow-xs disabled:opacity-50"
              title="Ekspor seluruh klip di proyek ini sekaligus (Batch Export MP4)"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Ekspor Semua</span>
            </button>

            <button
              onClick={async () => {
                await saveEditsInstantly();
                setIsExportOpen(true);
              }}
              disabled={!selectedClip}
              className="h-8 px-3.5 rounded bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container font-label-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor MP4</span>
            </button>
          </div>
        </div>
      </header>

      {/* Vertical Left Dock Sidebar */}
      <Sidebar />

      {/* Main NLE Workspace Container: Fixed dari bawah header & samping sidebar langsung ke bottom-0 tanpa ada ruang kosong */}
      <div className="editor-workspace fixed left-16 top-14 right-0 bottom-0 flex bg-surface overflow-hidden select-none">
        {/* Left Space: Inspector Panel (Full Height all the way to bottom, not cut off by timeline!) */}
        {!isLeftPanelCollapsed && (
          <aside
            style={{ width: `${leftPanelWidth}px` }}
            className="relative h-full shrink-0 flex flex-col bg-surface-container-low border-r border-surface-container-highest/40 overflow-hidden z-20 shadow-md select-none"
          >
            <InspectorPanel
              clip={selectedClip}
              style={style}
              frame={frame}
              audio={audio}
              captionSegments={captionSegments}
              currentTime={currentTime}
              onSeek={handleSeek}
              onUpdateStyle={handleUpdateStyle}
              onUpdateFrame={handleUpdateFrame}
              onUpdateAudio={handleUpdateAudio}
              onUpdateSegments={handleUpdateSegments}
              onUpdateClipInfo={handleUpdateClipInfo}
              onClose={() => setIsLeftPanelCollapsed(true)}
            />

            {/* Draggable resize border handle */}
            <div
              onMouseDown={handleMouseDownResize}
              title="Tarik untuk mengubah lebar panel editor (380px - 850px)"
              className="absolute top-0 right-0 w-2.5 h-full cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-30 flex items-center justify-center group"
            >
              <div className="w-0.5 h-12 rounded-full bg-outline-variant/50 group-hover:bg-primary group-hover:h-20 transition-all" />
            </div>
          </aside>
        )}

        {/* Right Studio Area: Video Canvas (Top) + Timeline & Clips Dock (Bottom) */}
        <main className="flex-1 flex flex-col min-w-0 h-full p-2 gap-1.5 overflow-hidden bg-surface-dim">
          {/* Top Video Stage */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <CanvasViewport
              clip={selectedClip}
              style={style}
              frame={frame}
              audio={audio}
              captionSegments={captionSegments}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              isLooping={isLooping}
              safeGuides={safeGuides}
              videoRef={videoRef}
              onPlayPause={handlePlayPause}
              onSeek={handleSeek}
              onStepFrame={handleStepFrame}
              onToggleLoop={() => setIsLooping(!isLooping)}
              onToggleSafeGuides={() => setSafeGuides(!safeGuides)}
              onUpdateFrame={handleUpdateFrame}
              onUpdateStyle={handleUpdateStyle}
              onUpdateSegments={handleUpdateSegments}
              isCinemaMode={isCinemaMode}
              onToggleCinemaMode={() => setIsCinemaMode(!isCinemaMode)}
              isLeftPanelCollapsed={isLeftPanelCollapsed}
              onToggleLeftPanel={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
            />
          </div>

          {/* Bottom Section: Tabbed Dock (Klip AI vs Timeline) */}
          {!isCinemaMode ? (
            <div className="flex flex-col shrink-0 transition-all duration-300">
              {/* Bottom Dock Header / Tab Switcher */}
              <div className="flex items-center justify-between px-2 py-0.5 bg-surface-container-low rounded-t border border-surface-container-highest/30 mb-0.5">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setBottomView('clips')}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                      bottomView === 'clips'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                    }`}
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>Rak Klip AI ({clips.length})</span>
                  </button>

                  <button
                    onClick={() => setBottomView('timeline')}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                      bottomView === 'timeline'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Timeline & Waveform</span>
                  </button>
                </div>

                <button
                  onClick={() => setIsCinemaMode(true)}
                  className="px-2 py-0.5 rounded text-[11px] font-medium text-outline hover:text-primary hover:bg-surface-container flex items-center gap-1 transition-colors"
                  title="Sembunyikan panel bawah untuk memaksimalkan ukuran preview video"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Perbesar Layar Preview</span>
                </button>
              </div>

              {/* Bottom Panel Views */}
              <div className="flex flex-col">
                {bottomView === 'timeline' && (
                  <TimelineTrack
                    clip={selectedClip}
                    captionSegments={captionSegments}
                    peaks={peaks}
                    currentTime={currentTime}
                    duration={duration}
                    onSeek={handleSeek}
                    onTrimChange={handleTrimChange}
                    onTrimCommit={handleTrimCommit}
                    onSplitClip={handleSplitClip}
                    onDeleteCaptionSegment={handleDeleteCaptionSegment}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                  />
                )}

                {bottomView === 'clips' && (
                  <ClipShelf
                    clips={clips}
                    selectedClipId={selectedClip?.id || null}
                    onSelectClip={handleSelectClip}
                    onToggleFavorite={handleToggleFavorite}
                    onDeleteClip={handleDeleteClip}
                    onOpenManualClip={() => setIsManualClipOpen(true)}
                    onOpenBatchExport={() => setIsBatchExportOpen(true)}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end px-2 py-0.5 shrink-0">
              <button
                onClick={() => setIsCinemaMode(false)}
                className="px-3 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-primary text-xs font-semibold flex items-center gap-1.5 transition-colors border border-primary/20 shadow-sm"
                title="Buka kembali panel timeline dan klip"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Tampilkan Rak Klip & Timeline</span>
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Export Modal (Single Clip) */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        clip={selectedClip}
        frame={frame}
        style={style}
        audio={audio}
        captionSegments={captionSegments}
        onExportSuccess={(newExportPath) => {
          if (selectedClip) {
            const updated = { ...selectedClip, export_path: newExportPath };
            setSelectedClip(updated);
            setClips((prev) => prev.map((c) => (c.id === selectedClip.id ? updated : c)));
          }
        }}
      />

      {/* Batch Export Modal (All / Multiple Clips) */}
      {isBatchExportOpen && (
        <BatchExportModal
          isOpen={isBatchExportOpen}
          onClose={() => setIsBatchExportOpen(false)}
          projectId={Number(projectId)}
          projectTitle={project?.title}
          clips={clips}
          currentClip={selectedClip}
          onExportSuccess={async () => {
            try {
              const res = await fetch(`/api/projects/${projectId}`);
              if (res.ok) {
                const data = await res.json();
                if (data.clips) setClips(data.clips);
              }
            } catch {}
          }}
        />
      )}

      {/* Manual Clip Modal */}
      <ManualClipModal
        isOpen={isManualClipOpen}
        onClose={() => setIsManualClipOpen(false)}
        projectId={Number(projectId)}
        maxDuration={project.duration_sec || 0}
        onClipCreated={handleClipCreated}
      />
    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background text-on-surface flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <span className="font-label-md text-on-surface-variant">Memuat Editor OpenClip...</span>
        </div>
      }
    >
      <EditorContent />
    </Suspense>
  );
}
