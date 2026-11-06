'use client';

import React, { useState, useEffect } from 'react';
import { Clip, CaptionStyle, FrameSettings, AudioSettings, CaptionSegment, SpeakerShot } from '@/lib/types';
import { STYLE_PRESETS, AVAILABLE_FONTS, getActivePresetId, FILTER_PRESETS, exportAss, generateSrtContent, downloadBlob } from '@/lib/captions';
import {
  SlidersHorizontal,
  ChevronLeft,
  Type,
  Palette,
  Crop,
  Volume2,
  Sparkles,
  FileText,
  Scissors,
  Trash2,
  FileQuestion,
  Wand2,
  Download,
  Film,
  Mic,
  Activity,
  Layers,
  Ban,
  ScanFace,
  Maximize2,
  Cpu,
  CheckCircle2,
  RotateCcw,
  Brain,
  Copy,
  Check,
  Users,
  ArrowUpDown,
  SunMedium,
  Contrast,
  Flame,
  Gauge,
  AtSign,
  Zap,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Plus,
  X,
  RefreshCw,
  Share2,
  Hash,
  Eye,
  EyeOff,
  UserCheck,
  AlertCircle,
  Play,
  Clock,
} from 'lucide-react';

interface InspectorPanelProps {
  clip: Clip | null;
  style: CaptionStyle;
  frame: FrameSettings;
  audio: AudioSettings;
  captionSegments: CaptionSegment[];
  currentTime?: number;
  onSeek?: (time: number) => void;
  onUpdateStyle: (style: CaptionStyle) => void;
  onUpdateFrame: (frame: FrameSettings) => void;
  onUpdateAudio: (audio: AudioSettings) => void;
  onUpdateSegments: (segments: CaptionSegment[]) => void;
  onUpdateClipInfo: (title: string, description: string, hashtags?: string[]) => void;
  onClose?: () => void;
}

// Font yang secara tipografi hanya menyediakan glif huruf besar (All-Caps fonts)
const ALL_CAPS_FONTS = new Set(['Bangers', 'Bebas Neue', 'Anton', 'Bungee', 'Russo One']);

// Komponen Input Warna Tunggal Format HEX (#FFFFFF / #000000)
function HexColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) {
  const normalized = value?.startsWith('#') ? value : `#${value || 'FFFFFF'}`;
  const validHex7 = /^#[0-9A-Fa-f]{6}$/.test(normalized) ? normalized : '#FFFFFF';

  return (
    <div className="flex items-center justify-between">
      <span className="text-outline text-xs">{label}</span>
      <div className="flex items-center gap-1.5">
        <label
          className="relative w-6 h-6 rounded cursor-pointer border border-outline-variant/40 shadow-xs shrink-0 flex items-center justify-center overflow-hidden"
          title="Klik untuk memilih warna"
        >
          <input
            type="color"
            value={validHex7}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute -inset-2 w-10 h-10 cursor-pointer opacity-0"
          />
          <div className="w-full h-full rounded" style={{ backgroundColor: normalized }} />
        </label>
        <input
          type="text"
          value={value || '#FFFFFF'}
          onChange={(e) => {
            let v = e.target.value.trim();
            if (!v.startsWith('#') && v.length > 0) v = `#${v}`;
            onChange(v.toUpperCase());
          }}
          placeholder="#FFFFFF"
          maxLength={7}
          className="w-22 px-2 py-0.5 rounded bg-surface-container font-mono text-[11px] font-semibold text-on-surface border border-outline-variant/30 uppercase focus:outline-none focus:ring-1 focus:ring-primary text-center tracking-wider"
        />
      </div>
    </div>
  );
}

export function InspectorPanel({
  clip,
  style,
  frame,
  audio,
  captionSegments,
  currentTime = 0,
  onSeek,
  onUpdateStyle,
  onUpdateFrame,
  onUpdateAudio,
  onUpdateSegments,
  onUpdateClipInfo,
  onClose,
}: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<'caption' | 'style' | 'text' | 'frame' | 'filter' | 'audio' | 'info'>('caption');
  const [copiedTags, setCopiedTags] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [clipTitle, setClipTitle] = useState(clip?.title || '');
  const [clipDesc, setClipDesc] = useState(clip?.description || '');
  const [clipHashtags, setClipHashtags] = useState<string[]>(clip?.hashtags || []);
  const [newTagInput, setNewTagInput] = useState('');
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedTitle, setCopiedTitle] = useState(false);
  const [copiedDesc, setCopiedDesc] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiTone, setAiTone] = useState<'viral_hook' | 'question_curiosity' | 'story_emotion' | 'education_action'>('viral_hook');
  const [altTitles, setAltTitles] = useState<string[]>([]);
  const [presetCategory, setPresetCategory] = useState<'all' | 'pro' | 'natural' | 'solid' | 'minimal' | 'boxed' | 'neon' | 'creative'>('all');
  const [isRetracking, setIsRetracking] = useState(false);
  const [retrackMessage, setRetrackMessage] = useState<string | null>(null);

  const handleRetrackFaces = async () => {
    if (!clip?.id || isRetracking) return;
    setIsRetracking(true);
    setRetrackMessage(null);
    try {
      const res = await fetch(`/api/clips/${clip.id}/retrack`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.frame) {
        onUpdateFrame({
          ...frame,
          ...data.frame,
        });
        setRetrackMessage('✓ AI Tersinkron!');
        setTimeout(() => setRetrackMessage(null), 3000);
      } else {
        setRetrackMessage(data.error || 'Gagal analisis');
        setTimeout(() => setRetrackMessage(null), 3500);
      }
    } catch (err: any) {
      setRetrackMessage(err?.message || 'Gagal koneksi');
      setTimeout(() => setRetrackMessage(null), 3500);
    } finally {
      setIsRetracking(false);
    }
  };

  useEffect(() => {
    setClipTitle(clip?.title || '');
    setClipDesc(clip?.description || '');
    setClipHashtags(clip?.hashtags || []);
    setAltTitles([]);
  }, [clip?.id, clip?.title, clip?.description, clip?.hashtags]);

  // Salin seluruh transkrip subtitle sebagai teks polos
  const handleCopyTranscript = () => {
    if (!captionSegments || captionSegments.length === 0) return;
    const text = captionSegments.map((s) => s.text.trim()).filter(Boolean).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  // Unduh file subtitle SRT (SubRip)
  const handleDownloadSrt = () => {
    if (!captionSegments || captionSegments.length === 0) return;
    const srt = generateSrtContent(captionSegments);
    const fname = `clip-${clip?.id || 'export'}-subtitles.srt`;
    downloadBlob(srt, fname, 'text/plain');
  };

  // Unduh file subtitle ASS (Advanced SubStation Alpha)
  const handleDownloadAss = () => {
    if (!captionSegments || captionSegments.length === 0) return;
    const ass = exportAss(captionSegments, style);
    const fname = `clip-${clip?.id || 'export'}-styled.ass`;
    downloadBlob(ass, fname, 'text/plain');
  };

  // Update text segmen caption
  const handleSegmentTextChange = (id: string, newText: string) => {
    const updated = captionSegments.map((seg) => {
      if (seg.id !== id) return seg;
      // Bagi ulang kata-kata agar seimbang dengan durasi
      const words = newText.split(/\s+/).filter(Boolean);
      const dur = Math.max(0.1, seg.end - seg.start);
      const step = dur / Math.max(1, words.length);
      const wordItems = words.map((w, idx) => ({
        w,
        s: seg.start + idx * step,
        e: seg.start + (idx + 1) * step,
        hl: false,
      }));
      return { ...seg, text: newText, words: wordItems };
    });
    onUpdateSegments(updated);
  };

  // Hapus segmen
  const handleDeleteSegment = (id: string) => {
    const updated = captionSegments.filter((seg) => seg.id !== id);
    onUpdateSegments(updated);
  };

  // Split segmen menjadi dua
  const handleSplitSegment = (id: string) => {
    const idx = captionSegments.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const target = captionSegments[idx];
    const words = target.words || [];
    if (words.length <= 1) return;

    const mid = Math.ceil(words.length / 2);
    const leftWords = words.slice(0, mid);
    const rightWords = words.slice(mid);

    const leftEnd = leftWords[leftWords.length - 1].e;
    const rightStart = rightWords[0].s;

    const leftSeg: CaptionSegment = {
      id: `${target.id}_1`,
      start: target.start,
      end: leftEnd,
      text: leftWords.map((w) => w.w).join(' '),
      words: leftWords,
    };

    const rightSeg: CaptionSegment = {
      id: `${target.id}_2`,
      start: rightStart,
      end: target.end,
      text: rightWords.map((w) => w.w).join(' '),
      words: rightWords,
    };

    const updated = [...captionSegments];
    updated.splice(idx, 1, leftSeg, rightSeg);
    onUpdateSegments(updated);
  };

  // ═══ MULTI-CAM AUTO-SWITCH ENGINE (SPEECH-SYNCED & CADENCE) ═══
  const generateSpeechSyncedShots = (pace: 'fast' | 'balanced' | 'relaxed' = 'balanced') => {
    if (!clip) return;
    const dur = Math.max(3, clip.end_sec - clip.start_sec);
    const targetMinDur = pace === 'fast' ? 2.5 : pace === 'balanced' ? 4.0 : 6.5;
    const targetMaxDur = pace === 'fast' ? 4.5 : pace === 'balanced' ? 7.0 : 10.5;

    const spks = (frame.detectedSpeakers && frame.detectedSpeakers.length >= 2)
      ? frame.detectedSpeakers
      : [
          { id: 1, label: 'Pembicara Kiri', offset_x: -25.0, is_primary: true },
          { id: 2, label: 'Pembicara Kanan', offset_x: 25.0, is_primary: false },
        ];

    const shots: SpeakerShot[] = [];
    const inPoint = clip.start_sec;

    // Filter subtitle segments yang berada dalam rentang klip
    const validSegs = (captionSegments || [])
      .map((s) => ({
        start: Math.max(0, s.start - inPoint),
        end: Math.min(dur, s.end - inPoint),
        text: s.text,
      }))
      .filter((s) => s.end > s.start && s.start < dur);

    if (validSegs.length > 0) {
      let currentShotStart = 0;
      let spkIndex = 0;

      for (let i = 0; i < validSegs.length; i++) {
        const seg = validSegs[i];
        const nextSeg = validSegs[i + 1];
        const shotLen = seg.end - currentShotStart;

        const hasPauseAfter = nextSeg ? (nextSeg.start - seg.end >= 0.35) : true;
        const hasTerminal = /[.!?…]+$/.test(seg.text.trim());

        const shouldCut =
          (shotLen >= targetMinDur && (hasPauseAfter || hasTerminal)) ||
          shotLen >= targetMaxDur;

        if (shouldCut || i === validSegs.length - 1) {
          const cutEnd = i === validSegs.length - 1 ? dur : Math.round(seg.end * 10) / 10;
          const choice = spks[spkIndex % spks.length];
          shots.push({
            start: Math.round(currentShotStart * 10) / 10,
            end: cutEnd,
            speakerId: choice.id,
            label: choice.label,
            offsetX: choice.offset_x,
          });
          currentShotStart = cutEnd;
          spkIndex++;
        }
      }
    } else {
      const interval = pace === 'fast' ? 3.2 : pace === 'balanced' ? 4.8 : 7.5;
      let t = 0;
      let turn = 0;
      while (t < dur) {
        const nextT = Math.min(dur, Math.round((t + interval) * 10) / 10);
        const choice = spks[turn % spks.length];
        shots.push({
          start: Math.round(t * 10) / 10,
          end: nextT,
          speakerId: choice.id,
          label: choice.label,
          offsetX: choice.offset_x,
        });
        t = nextT;
        turn++;
      }
    }

    if (shots.length > 0) {
      shots[0].start = 0.0;
      shots[shots.length - 1].end = Math.round(dur * 10) / 10;
      for (let i = 0; i < shots.length - 1; i++) {
        shots[i].end = shots[i + 1].start;
      }
    }

    onUpdateFrame({
      ...frame,
      trackingMode: 'auto_switch',
      speakerShots: shots,
      faceTracking: true,
    });
  };

  const handleAddCutAtCurrentTime = () => {
    if (!clip) return;
    const dur = Math.max(3, clip.end_sec - clip.start_sec);
    const inPoint = Math.max(0, clip.start_sec - (clip.preview_start_sec ?? 0));
    const relT = Math.round(Math.max(0.4, Math.min(dur - 0.4, currentTime - inPoint)) * 10) / 10;

    const currentShots = [...(frame.speakerShots || [])];
    const spks = (frame.detectedSpeakers && frame.detectedSpeakers.length >= 2)
      ? frame.detectedSpeakers
      : [
          { id: 1, label: 'Pembicara Kiri', offset_x: -25.0 },
          { id: 2, label: 'Pembicara Kanan', offset_x: 25.0 },
        ];

    if (currentShots.length === 0) {
      const s1 = spks[0];
      const s2 = spks[1] || spks[0];
      onUpdateFrame({
        ...frame,
        trackingMode: 'auto_switch',
        speakerShots: [
          { start: 0, end: relT, speakerId: s1.id, label: s1.label, offsetX: s1.offset_x },
          { start: relT, end: Math.round(dur * 10) / 10, speakerId: s2.id, label: s2.label, offsetX: s2.offset_x },
        ],
      });
      return;
    }

    const shotIdx = currentShots.findIndex((s) => relT > s.start + 0.25 && relT < s.end - 0.25);
    if (shotIdx === -1) {
      return;
    }

    const targetShot = currentShots[shotIdx];
    const otherSpk = spks.find((s) => s.id !== targetShot.speakerId) || spks[0];

    const firstHalf: SpeakerShot = {
      ...targetShot,
      end: relT,
    };
    const secondHalf: SpeakerShot = {
      start: relT,
      end: targetShot.end,
      speakerId: otherSpk.id,
      label: otherSpk.label,
      offsetX: otherSpk.offset_x,
    };

    const newShots = [
      ...currentShots.slice(0, shotIdx),
      firstHalf,
      secondHalf,
      ...currentShots.slice(shotIdx + 1),
    ];

    onUpdateFrame({
      ...frame,
      trackingMode: 'auto_switch',
      speakerShots: newShots,
    });
  };

  const handleDeleteShot = (idx: number) => {
    const currentShots = [...(frame.speakerShots || [])];
    if (currentShots.length <= 1) return;

    if (idx === 0) {
      currentShots[1].start = 0.0;
      currentShots.splice(0, 1);
    } else {
      currentShots[idx - 1].end = currentShots[idx].end;
      currentShots.splice(idx, 1);
    }

    onUpdateFrame({
      ...frame,
      speakerShots: currentShots,
    });
  };

  const handleChangeShotSpeaker = (idx: number, newSpkId: number) => {
    const currentShots = [...(frame.speakerShots || [])];
    if (!currentShots[idx]) return;

    const spks = frame.detectedSpeakers || [];
    const foundSpk = spks.find((s) => s.id === newSpkId);

    const label = foundSpk ? foundSpk.label : (newSpkId === 1 ? 'Pembicara Kiri' : 'Pembicara Kanan');
    const offset = foundSpk ? foundSpk.offset_x : (newSpkId === 1 ? -25.0 : 25.0);

    currentShots[idx] = {
      ...currentShots[idx],
      speakerId: newSpkId,
      label,
      offsetX: offset,
    };

    onUpdateFrame({
      ...frame,
      speakerShots: currentShots,
    });
  };

  const handleUpdateSpeakerOffset = (spkId: number, newOffset: number) => {
    const newSpks = (frame.detectedSpeakers || []).map((s) => {
      if (s.id === spkId) {
        return { ...s, offset_x: newOffset };
      }
      return s;
    });

    const newShots = (frame.speakerShots || []).map((sh) => {
      if (sh.speakerId === spkId) {
        return { ...sh, offsetX: newOffset };
      }
      return sh;
    });

    onUpdateFrame({
      ...frame,
      detectedSpeakers: newSpks,
      speakerShots: newShots,
    });
  };

  // Salin seluruh format siap posting (Judul + Caption + Hashtags)
  const handleCopyReadyToPost = () => {
    if (!clipTitle && !clipDesc && clipHashtags.length === 0) return;
    const tagsString = clipHashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
    const fullText = [clipTitle, clipDesc, tagsString].filter(Boolean).join('\n\n');
    navigator.clipboard.writeText(fullText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2200);
  };

  // Salin judul saja
  const handleCopyTitle = () => {
    if (!clipTitle) return;
    navigator.clipboard.writeText(clipTitle);
    setCopiedTitle(true);
    setTimeout(() => setCopiedTitle(false), 2000);
  };

  // Salin deskripsi saja
  const handleCopyDesc = () => {
    if (!clipDesc) return;
    navigator.clipboard.writeText(clipDesc);
    setCopiedDesc(true);
    setTimeout(() => setCopiedDesc(false), 2000);
  };

  // Salin semua hashtag ke clipboard
  const handleCopyHashtags = () => {
    if (!clipHashtags || clipHashtags.length === 0) return;
    const text = clipHashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
    navigator.clipboard.writeText(text);
    setCopiedTags(true);
    setTimeout(() => setCopiedTags(false), 2000);
  };

  // Tambah hashtag kustom
  const handleAddHashtag = (e?: React.KeyboardEvent<HTMLInputElement>) => {
    if (!e || e.key === 'Enter') {
      if (e) e.preventDefault();
      const raw = newTagInput.trim().replace(/^#+/, '').replace(/\s+/g, '');
      if (raw) {
        const formatted = `#${raw}`;
        if (!clipHashtags.includes(formatted)) {
          const updated = [...clipHashtags, formatted];
          setClipHashtags(updated);
          onUpdateClipInfo(clipTitle, clipDesc, updated);
        }
        setNewTagInput('');
      }
    }
  };

  // Hapus hashtag
  const handleRemoveHashtag = (tagToRemove: string) => {
    const updated = clipHashtags.filter((t) => t !== tagToRemove);
    setClipHashtags(updated);
    onUpdateClipInfo(clipTitle, clipDesc, updated);
  };

  // Tulis ulang copy & tags dengan AI
  const handleGenerateAiCopy = async () => {
    if (!clip?.id) return;
    setIsGeneratingAi(true);
    try {
      const res = await fetch(`/api/clips/${clip.id}/ai-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone: aiTone }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setClipTitle(data.title);
        setClipDesc(data.description);
        setClipHashtags(data.hashtags || []);
        if (Array.isArray(data.alternative_titles)) {
          setAltTitles(data.alternative_titles);
        }
        onUpdateClipInfo(data.title, data.description, data.hashtags);
      }
    } catch (err) {
      console.warn('Gagal generate copy AI:', err);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Handler memilih preset secara bersih tanpa kebocoran style lama
  const handleSelectPreset = (preset: (typeof STYLE_PRESETS)[0]) => {
    const cleanStyle: CaptionStyle = {
      template: preset.id,
      fontFamily: preset.style.fontFamily || 'Inter',
      fontSize: preset.style.fontSize ?? 74,
      bold: preset.style.bold ?? true,
      italic: preset.style.italic ?? false,
      underline: preset.style.underline ?? false,
      textAlign: preset.style.textAlign ?? 'center',
      lineHeight: preset.style.lineHeight ?? 1.25,
      uppercase: preset.style.uppercase ?? false,
      textColor: preset.style.textColor || '#FFFFFF',
      activeColor: preset.style.activeColor || '#FFFFFF',
      keywordColor: preset.style.keywordColor || '#38BDF8',
      outlineWidth: preset.style.outlineWidth ?? 0,
      outlineColor: preset.style.outlineColor || '#000000',
      shadow: preset.style.shadow ?? false,
      shadowColor: preset.style.shadowColor || '#000000',
      shadowDepth: preset.style.shadowDepth ?? 0,
      shadowBlur: preset.style.shadowBlur ?? 4,
      background: preset.style.background ?? false,
      backgroundColor: preset.style.backgroundColor || '#000000',
      backgroundOpacity: preset.style.backgroundOpacity ?? 0.8,
      backgroundCornerRadius: preset.style.backgroundCornerRadius ?? 16,
      backgroundPaddingX: preset.style.backgroundPaddingX ?? 20,
      backgroundPaddingY: preset.style.backgroundPaddingY ?? 10,
      letterSpacing: preset.style.letterSpacing ?? 0,
      wordSpacing: preset.style.wordSpacing ?? 1.0,
      positionY: style.positionY ?? 72,
      wordsPerLine: preset.style.wordsPerLine ?? style.wordsPerLine ?? 3,
      animation: preset.style.animation || 'karaoke',
      highlightKeywords: preset.style.highlightKeywords ?? true,
    };
    onUpdateStyle(cleanStyle);
  };

  return (
    <section className="w-full h-full flex flex-col bg-surface-container-low overflow-hidden select-none">
      {/* Panel Top Title Bar */}
      <div className="h-10 px-3 bg-surface-container-high/90 flex items-center justify-between shrink-0 border-b border-surface-container-highest/40">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-primary" />
          <span className="font-label-md text-xs font-bold text-on-surface uppercase tracking-wider">
            Panel Editor
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded text-outline hover:text-on-surface hover:bg-surface-container transition-colors"
            title="Sembunyikan Panel"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Inspector Tabs */}
      <div className="flex items-center bg-surface-container-high/50 px-2 pt-1.5 gap-1 border-b border-surface-container-highest/40 overflow-x-auto shrink-0 scrollbar-none">
        <button
          id="inspector-caption-tab"
          onClick={() => setActiveTab('caption')}
          className={`px-2.5 py-1.5 rounded-t font-label-md text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            activeTab === 'caption'
              ? 'bg-surface-container-low text-primary'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Caption
        </button>
        <button
          id="inspector-style-tab"
          onClick={() => setActiveTab('style')}
          className={`px-2.5 py-1.5 rounded-t font-label-md text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            activeTab === 'style'
              ? 'bg-surface-container-low text-primary'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <Palette className="w-3.5 h-3.5" />
          Style
        </button>
        <button
          id="inspector-text-tab"
          onClick={() => setActiveTab('text')}
          className={`px-2.5 py-1.5 rounded-t font-label-md text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            activeTab === 'text'
              ? 'bg-surface-container-low text-primary'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <Type className="w-3.5 h-3.5 text-primary" />
          Teks
          {(frame.hookTitle?.enabled || frame.watermark?.enabled) && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          )}
        </button>
        <button
          id="inspector-frame-tab"
          onClick={() => setActiveTab('frame')}
          className={`px-2.5 py-1.5 rounded-t font-label-md text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            activeTab === 'frame'
              ? 'bg-surface-container-low text-primary'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <Crop className="w-3.5 h-3.5" />
          Frame
        </button>
        <button
          id="inspector-filter-tab"
          onClick={() => setActiveTab('filter')}
          className={`px-2.5 py-1.5 rounded-t font-label-md text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            activeTab === 'filter'
              ? 'bg-surface-container-low text-primary'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <Wand2 className="w-3.5 h-3.5 text-primary" />
          Filter & Efek
          {((frame.filterPreset && frame.filterPreset !== 'none') || (frame.videoBlur ?? 0) > 0 || frame.vignette) && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          )}
        </button>
        <button
          id="inspector-audio-tab"
          onClick={() => setActiveTab('audio')}
          className={`px-2.5 py-1.5 rounded-t font-label-md text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            activeTab === 'audio'
              ? 'bg-surface-container-low text-primary'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <Volume2 className="w-3.5 h-3.5" />
          Audio
        </button>
        <button
          id="inspector-info-tab"
          onClick={() => setActiveTab('info')}
          className={`px-2.5 py-1.5 rounded-t font-label-md text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            activeTab === 'info'
              ? 'bg-surface-container-low text-primary'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI Analyze
        </button>
      </div>

      {/* Properties Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-surface-container-low text-label-sm font-label-sm">
        {/* TAB 1: CAPTION SEGMENTS EDITOR */}
        {activeTab === 'caption' && (
          <div className="space-y-3">
            {/* TOGGLE STATUS CAPTION (SIMPEL TANPA DESKRIPSI & KOTAK STATUS) */}
            <div className="bg-surface-container px-3 py-2 rounded-lg border border-outline-variant/30 flex items-center justify-between shadow-xs">
              <span className="font-semibold text-xs text-on-surface flex items-center gap-2">
                {style.enabled !== false ? (
                  <Eye className="w-4 h-4 text-primary" />
                ) : (
                  <EyeOff className="w-4 h-4 text-outline" />
                )}
                Subtitle Video
              </span>

              <button
                type="button"
                id="toggle-caption-status-btn"
                onClick={() => onUpdateStyle({ ...style, enabled: style.enabled === false ? true : false })}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer ${
                  style.enabled !== false
                    ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
                title={style.enabled !== false ? 'Klik untuk mematikan subtitle' : 'Klik untuk mengaktifkan subtitle'}
              >
                {style.enabled !== false ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Nonaktifkan</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Aktifkan</span>
                  </>
                )}
              </button>
            </div>

            {/* OPENCUT FEATURE: SUBTITLE EXPORT & CADENCE SUITE */}
            <div className="bg-surface-container p-3 rounded-lg border border-outline-variant/30 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-on-surface flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-primary" />
                  Alat & Ekspor Subtitle
                </span>
                <span className="text-[10px] text-primary/80 font-mono">SRT & ASS Ready</span>
              </div>

              {/* Action Buttons: Download SRT, Download ASS, Copy Text */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={handleDownloadSrt}
                  className="py-1.5 px-2 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface border border-outline-variant/30 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors shadow-xs"
                  title="Unduh file subtitle .SRT standar industri"
                >
                  <FileText className="w-3 h-3 text-secondary" />
                  <span>Unduh .SRT</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadAss}
                  className="py-1.5 px-2 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface border border-outline-variant/30 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors shadow-xs"
                  title="Unduh file subtitle .ASS dengan styling lengkap"
                >
                  <Sparkles className="w-3 h-3 text-primary" />
                  <span>Unduh .ASS</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyTranscript}
                  className="py-1.5 px-2 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface border border-outline-variant/30 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors shadow-xs"
                  title="Salin transkrip dialog lengkap ke clipboard"
                >
                  {copiedTranscript ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400 font-bold">Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-outline" />
                      <span>Salin Teks</span>
                    </>
                  )}
                </button>
              </div>

              {/* Cadence / Chunking Preset Buttons */}
              <div className="pt-2 border-t border-outline-variant/20 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-outline">
                  <span>Irama Kata (Kata per Tampilan):</span>
                  <span className="font-mono font-semibold text-on-surface">{style.wordsPerLine || 3} Kata</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { count: 1, label: '1 Kata', desc: 'Karaoke' },
                    { count: 2, label: '2 Kata', desc: 'Punchy' },
                    { count: 3, label: '3 Kata', desc: 'Standar' },
                    { count: 4, label: '4 Kata', desc: 'Sinema' },
                  ].map((cad) => (
                    <button
                      key={cad.count}
                      type="button"
                      onClick={() => onUpdateStyle({ ...style, wordsPerLine: cad.count })}
                      className={`py-1 px-1 rounded text-[10px] font-medium flex flex-col items-center justify-center transition-all border ${
                        (style.wordsPerLine || 3) === cad.count
                          ? 'bg-primary/20 text-primary border-primary font-bold shadow-xs'
                          : 'bg-surface-container-lowest text-outline hover:text-on-surface border-outline-variant/20 hover:bg-surface-container-high'
                      }`}
                    >
                      <span>{cad.label}</span>
                      <span className="text-[8px] opacity-75 font-mono">{cad.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-label-md text-on-surface font-semibold flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-primary" />
                Daftar Baris Subtitle ({captionSegments.length})
              </span>
              <span className="text-[10px] text-outline font-mono">Sync per kata</span>
            </div>

            <div className="space-y-2 pr-1">
              {captionSegments.map((seg, idx) => (
                <div
                  key={seg.id || idx}
                  className="bg-surface-container p-2.5 rounded-lg border border-outline-variant/20 flex flex-col gap-1.5 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center justify-between text-outline text-[11px] font-mono">
                    <span className="text-secondary font-semibold">
                      {seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleSplitSegment(seg.id)}
                        className="p-1 hover:text-primary transition-colors"
                        title="Pisahkan baris ini menjadi dua"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSegment(seg.id)}
                        className="p-1 hover:text-error transition-colors"
                        title="Hapus baris ini"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={seg.text}
                    onChange={(e) => handleSegmentTextChange(seg.id, e.target.value)}
                    className="w-full bg-surface-container-lowest px-2 py-1.5 rounded text-on-surface text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary border border-outline-variant/30"
                  />
                </div>
              ))}
              {captionSegments.length === 0 && (
                <div className="text-center py-6 text-outline flex flex-col items-center">
                  <FileQuestion className="w-7 h-7 text-outline/60 mb-1" />
                  <p className="text-xs">Tidak ada segmen subtitle untuk klip ini.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: STYLE (CAPCUT TEMPLATES, FONTS, COLORS, ANIMATIONS) */}
        {activeTab === 'style' && (
          <div className="space-y-4">
            {/* Status Caption Banner di Tab Style (Simpel) */}
            {style.enabled === false && (
              <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-300 shadow-xs">
                <span className="font-medium text-amber-200 flex items-center gap-2">
                  <EyeOff className="w-4 h-4 text-amber-400 shrink-0" />
                  Subtitle Nonaktif
                </span>
                <button
                  type="button"
                  onClick={() => onUpdateStyle({ ...style, enabled: true })}
                  className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0 cursor-pointer transition-colors"
                >
                  Aktifkan
                </button>
              </div>
            )}

            {/* Header & Categories Filter */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-label-md text-on-surface font-semibold flex items-center gap-1.5">
                  <Wand2 className="w-4 h-4 text-primary" />
                  Template Subtitle CapCut
                </span>
                <span className="text-[10px] text-outline font-mono">{STYLE_PRESETS.length} Gaya</span>
              </div>

              {/* Filter Kategori */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                {[
                  { id: 'all', label: 'Semua' },
                  { id: 'pro', label: '🔥 Pro Studio' },
                  { id: 'natural', label: '🌿 Natural' },
                  { id: 'solid', label: '💎 Solid Modern' },
                  { id: 'minimal', label: '✨ Clean Minimal' },
                  { id: 'boxed', label: '⬛ Box Pill' },
                  { id: 'neon', label: '⚡ Neon' },
                  { id: 'creative', label: '🎨 Kreatif' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setPresetCategory(cat.id as any)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                      presetCategory === cat.id
                        ? 'bg-primary text-on-primary font-bold shadow-xs'
                        : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Presets Grid with Live Mini Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[380px] overflow-y-auto pr-1">
                {(presetCategory === 'all'
                  ? STYLE_PRESETS
                  : STYLE_PRESETS.filter((p) => p.category === presetCategory)
                ).map((preset) => {
                  const isSelected = getActivePresetId(style.template) === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => handleSelectPreset(preset)}
                      className={`p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between group relative overflow-hidden ${
                        isSelected
                          ? 'bg-primary/10 border-primary shadow-sm ring-1 ring-primary/40'
                          : 'bg-surface-container border-outline-variant/20 hover:border-outline-variant/60 hover:bg-surface-container-high'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="font-bold text-xs text-on-surface group-hover:text-primary transition-colors">
                          {preset.name}
                        </span>
                        <span className="text-[9px] uppercase px-1.5 py-0.2 rounded font-semibold bg-surface-container-highest text-secondary border border-outline-variant/20">
                          {preset.badge}
                        </span>
                      </div>

                      {/* Live Visual Mini Preview Box */}
                      <div className="w-full bg-black/75 rounded py-2 px-1 flex items-center justify-center my-1.5 border border-white/5 overflow-hidden shadow-inner">
                        <div
                          className="flex items-center gap-1.5 px-2 py-0.5 rounded transition-transform group-hover:scale-105 duration-150"
                          style={{
                            fontFamily: preset.style.fontFamily || 'Montserrat',
                            backgroundColor: preset.style.background
                              ? `${preset.style.backgroundColor || '#000000'}${Math.round(
                                  (preset.style.backgroundOpacity ?? 0.8) * 255
                                )
                                  .toString(16)
                                  .padStart(2, '0')}`
                              : 'transparent',
                            textTransform: preset.style.uppercase ? 'uppercase' : 'none',
                            fontWeight: 800,
                          }}
                        >
                          <span
                            style={{
                              color: preset.style.textColor || '#FFFFFF',
                              WebkitTextStroke:
                                (preset.style.outlineWidth ?? 0) > 0
                                  ? `1px ${preset.style.outlineColor || '#000000'}`
                                  : 'none',
                              textShadow: preset.style.shadow
                                ? '0 1px 2px rgba(0,0,0,0.8)'
                                : 'none',
                            }}
                            className="text-[12px] tracking-wide"
                          >
                            {preset.previewSample.text}
                          </span>
                          <span
                            style={{
                              color: preset.style.activeColor || '#FFE600',
                              WebkitTextStroke:
                                (preset.style.outlineWidth ?? 0) > 0
                                  ? `1px ${preset.style.outlineColor || '#000000'}`
                                  : 'none',
                              textShadow: preset.style.shadow
                                ? '0 1px 2px rgba(0,0,0,0.8)'
                                : 'none',
                            }}
                            className="text-[12px] tracking-wide"
                          >
                            {preset.previewSample.activeWord}
                          </span>
                        </div>
                      </div>

                      {/* Selected Indicator dot */}
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Typography */}
            <div className="bg-surface-container-lowest p-2.5 rounded-lg space-y-2.5">
              <span className="font-label-md text-on-surface font-semibold block">Tipografi</span>

              {/* Font Family */}
              <div className="flex items-center justify-between">
                <span className="text-outline">Font</span>
                <select
                  aria-label="Font Family"
                  value={style.fontFamily}
                  onChange={(e) => onUpdateStyle({ ...style, fontFamily: e.target.value })}
                  style={{ fontFamily: style.fontFamily }}
                  className="bg-surface-container text-on-surface px-2.5 py-1.5 rounded text-xs border border-outline-variant/30 focus:outline-none font-bold max-w-[190px]"
                >
                  {AVAILABLE_FONTS.map((font) => (
                    <option key={font} value={font} style={{ fontFamily: font }}>
                      {font}
                    </option>
                  ))}
                </select>
              </div>

              {/* Font Size */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-outline w-16">Ukuran</span>
                <input
                  aria-label="Font Size"
                  type="range"
                  min="40"
                  max="140"
                  value={style.fontSize}
                  onChange={(e) => onUpdateStyle({ ...style, fontSize: Number(e.target.value) })}
                  className="flex-1 accent-primary h-1 bg-surface-container-high rounded"
                />
                <span className="text-xs font-mono w-10 text-right">{style.fontSize}px</span>
              </div>
              <p className="text-[10px] leading-relaxed text-outline">
                Klik caption di preview lalu seret untuk memindahkan posisi.
              </p>

              {/* TYPOGRAPHY FORMATTING TOOLBAR */}
              <div className="space-y-1.5 pt-2 border-t border-outline-variant/15">
                <span className="text-outline text-xs block">Format & Penataan Teks</span>
                <div className="flex items-center gap-1 flex-wrap">
                  {/* Bold Button */}
                  <button
                    type="button"
                    onClick={() => onUpdateStyle({ ...style, bold: style.bold === false ? true : false })}
                    className={`h-7 px-2.5 rounded font-bold text-xs flex items-center justify-center transition-colors border ${
                      style.bold !== false
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container text-outline hover:text-on-surface border-outline-variant/30'
                    }`}
                    title="Tebal / Bold (B)"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>

                  {/* Italic Button */}
                  <button
                    type="button"
                    onClick={() => onUpdateStyle({ ...style, italic: !style.italic })}
                    className={`h-7 px-2.5 rounded text-xs flex items-center justify-center transition-colors border ${
                      style.italic
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container text-outline hover:text-on-surface border-outline-variant/30'
                    }`}
                    title="Miring / Italic (I)"
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </button>

                  {/* Underline Button */}
                  <button
                    type="button"
                    onClick={() => onUpdateStyle({ ...style, underline: !style.underline })}
                    className={`h-7 px-2.5 rounded text-xs flex items-center justify-center transition-colors border ${
                      style.underline
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container text-outline hover:text-on-surface border-outline-variant/30'
                    }`}
                    title="Garis Bawah / Underline (U)"
                  >
                    <Underline className="w-3.5 h-3.5" />
                  </button>

                  {/* All Caps Button */}
                  <button
                    type="button"
                    onClick={() => onUpdateStyle({ ...style, uppercase: !style.uppercase })}
                    className={`h-7 px-2.5 rounded font-bold text-[11px] flex items-center justify-center transition-colors border ${
                      style.uppercase
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container text-outline hover:text-on-surface border-outline-variant/30'
                    }`}
                    title="Huruf Kapital Semua (ALL CAPS)"
                  >
                    AA
                  </button>

                  <div className="h-4 w-px bg-outline-variant/30 mx-0.5" />

                  {/* Text Align Left */}
                  <button
                    type="button"
                    onClick={() => onUpdateStyle({ ...style, textAlign: 'left' })}
                    className={`h-7 px-2 rounded text-xs flex items-center justify-center transition-colors border ${
                      style.textAlign === 'left'
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container text-outline hover:text-on-surface border-outline-variant/30'
                    }`}
                    title="Rata Kiri"
                  >
                    <AlignLeft className="w-3.5 h-3.5" />
                  </button>

                  {/* Text Align Center */}
                  <button
                    type="button"
                    onClick={() => onUpdateStyle({ ...style, textAlign: 'center' })}
                    className={`h-7 px-2 rounded text-xs flex items-center justify-center transition-colors border ${
                      !style.textAlign || style.textAlign === 'center'
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container text-outline hover:text-on-surface border-outline-variant/30'
                    }`}
                    title="Rata Tengah"
                  >
                    <AlignCenter className="w-3.5 h-3.5" />
                  </button>

                  {/* Text Align Right */}
                  <button
                    type="button"
                    onClick={() => onUpdateStyle({ ...style, textAlign: 'right' })}
                    className={`h-7 px-2 rounded text-xs flex items-center justify-center transition-colors border ${
                      style.textAlign === 'right'
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container text-outline hover:text-on-surface border-outline-variant/30'
                    }`}
                    title="Rata Kanan"
                  >
                    <AlignRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Line Height (Jarak Antar Baris Teks) */}
              <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                <span className="text-outline w-28">Tinggi Baris</span>
                <input
                  aria-label="Line Height"
                  type="range"
                  min="1.0"
                  max="1.6"
                  step="0.05"
                  value={style.lineHeight ?? 1.25}
                  onChange={(e) => onUpdateStyle({ ...style, lineHeight: Number(e.target.value) })}
                  className="flex-1 accent-primary h-1 bg-surface-container-high rounded"
                />
                <span className="font-mono text-xs w-8 text-right">{(style.lineHeight ?? 1.25).toFixed(2)}x</span>
              </div>

              {/* Words Per Line */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-outline w-28 text-xs">Kata per Baris</span>
                <input
                  aria-label="Words Per Line"
                  type="range"
                  min="1"
                  max="5"
                  value={style.wordsPerLine || 3}
                  onChange={(e) => onUpdateStyle({ ...style, wordsPerLine: Number(e.target.value) })}
                  className="flex-1 accent-primary h-1 bg-surface-container-high rounded"
                />
                <span className="text-xs font-mono w-6 text-right">{style.wordsPerLine || 3}</span>
              </div>

              {/* Word Spacing (Jarak Antar Kata) */}
              <div className="space-y-1.5 pt-2 border-t border-outline-variant/15">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-outline">Jarak Antar Kata (Spasi)</span>
                  <span className="font-mono text-on-surface font-semibold">
                    {Math.round((style.wordSpacing ?? 1.0) * 100)}%
                  </span>
                </div>
                <input
                  aria-label="Word Spacing"
                  type="range"
                  min="0.6"
                  max="1.6"
                  step="0.05"
                  value={style.wordSpacing ?? 1.0}
                  onChange={(e) => onUpdateStyle({ ...style, wordSpacing: Number(e.target.value) })}
                  className="w-full accent-primary h-1 bg-surface-container-high rounded"
                />
              </div>

              {/* Letter Tracking (Spasi Antar Huruf) */}
              <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-outline-variant/15 text-xs">
                <span className="text-outline w-28">Jarak Huruf</span>
                <input
                  aria-label="Letter Tracking"
                  type="range"
                  min="-1"
                  max="4"
                  step="0.5"
                  value={style.letterSpacing ?? 0}
                  onChange={(e) => onUpdateStyle({ ...style, letterSpacing: Number(e.target.value) })}
                  className="flex-1 accent-primary h-1 bg-surface-container-high rounded"
                />
                <span className="font-mono text-xs w-8 text-right">{style.letterSpacing ?? 0}px</span>
              </div>

              {/* Posisi Vertikal Y */}
              <div className="space-y-1.5 pt-2 border-t border-outline-variant/15 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-outline">Posisi Vertikal (Y)</span>
                  <span className="font-mono text-on-surface font-semibold">{style.positionY ?? 72}%</span>
                </div>
                <input
                  aria-label="Posisi Vertikal"
                  type="range"
                  min="10"
                  max="90"
                  value={style.positionY ?? 72}
                  onChange={(e) => onUpdateStyle({ ...style, positionY: Number(e.target.value) })}
                  className="w-full accent-primary h-1 bg-surface-container-high rounded"
                />
              </div>

              {/* Rotasi / Kemiringan Teks */}
              <div className="space-y-1.5 pt-2 border-t border-outline-variant/15 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-outline">Rotasi / Kemiringan</span>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="text-on-surface font-semibold">{style.rotation ?? 0}°</span>
                    {style.rotation !== 0 && (
                      <button
                        type="button"
                        onClick={() => onUpdateStyle({ ...style, rotation: 0 })}
                        className="text-[10px] text-primary hover:underline"
                        title="Reset rotasi ke 0° (datar)"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
                <input
                  aria-label="Rotasi Teks"
                  type="range"
                  min="-30"
                  max="30"
                  step="1"
                  value={style.rotation ?? 0}
                  onChange={(e) => onUpdateStyle({ ...style, rotation: Number(e.target.value) })}
                  className="w-full accent-primary h-1 bg-surface-container-high rounded"
                />
              </div>
            </div>

            {/* Colors & Highlight */}
            <div className="bg-surface-container-lowest p-2.5 rounded-lg space-y-2.5">
              <span className="font-label-md text-on-surface font-semibold block">Warna & Highlight</span>

              <HexColorPicker
                label="Teks Normal"
                value={style.textColor || '#FFFFFF'}
                onChange={(val) => onUpdateStyle({ ...style, textColor: val })}
              />

              <HexColorPicker
                label="Karaoke Aktif"
                value={style.activeColor || '#FFE600'}
                onChange={(val) => onUpdateStyle({ ...style, activeColor: val })}
              />

              <HexColorPicker
                label="Kata Kunci AI"
                value={style.keywordColor || '#00F0FF'}
                onChange={(val) => onUpdateStyle({ ...style, keywordColor: val })}
              />
            </div>

            {/* Subtitle Animation */}
            <div className="bg-surface-container-lowest p-2.5 rounded-lg space-y-2">
              <span className="font-label-md text-on-surface font-semibold block">Animasi Kata</span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'karaoke', label: 'Karaoke', icon: Mic },
                  { id: 'pop', label: 'Pop Bounce', icon: Activity },
                  { id: 'fade', label: 'Fade In', icon: Layers },
                  { id: 'none', label: 'Statis', icon: Ban },
                ].map((anim) => {
                  const AnimIcon = anim.icon;
                  return (
                    <button
                      key={anim.id}
                      onClick={() => onUpdateStyle({ ...style, animation: anim.id as any })}
                      className={`px-2 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                        (style.animation || 'karaoke') === anim.id
                          ? 'bg-primary text-on-primary shadow-sm font-semibold'
                          : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-bright'
                      }`}
                    >
                      <AnimIcon className="w-3.5 h-3.5" />
                      {anim.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Outline & Shadow */}
            <div className="bg-surface-container-lowest p-2.5 rounded-lg space-y-2.5">
              <span className="font-label-md text-on-surface font-semibold block">Outline & Bayangan</span>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-outline text-xs w-20">Tebal Outline</span>
                  <input
                    aria-label="Outline Width"
                    type="range"
                    min="0"
                    max="14"
                    value={style.outlineWidth ?? 0}
                    onChange={(e) => onUpdateStyle({ ...style, outlineWidth: Number(e.target.value) })}
                    className="flex-1 accent-primary h-1 bg-surface-container-high rounded"
                  />
                  <span className="text-xs font-mono w-8 text-right">{style.outlineWidth ?? 0}px</span>
                </div>

                {(style.outlineWidth ?? 0) > 0 && (
                  <HexColorPicker
                    label="Warna Outline"
                    value={style.outlineColor || '#000000'}
                    onChange={(val) => onUpdateStyle({ ...style, outlineColor: val })}
                  />
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-outline">Bayangan 3D (Shadow)</span>
                <input
                  aria-label="Shadow Toggle"
                  type="checkbox"
                  checked={style.shadow}
                  onChange={(e) => onUpdateStyle({ ...style, shadow: e.target.checked })}
                  className="accent-primary w-4 h-4 cursor-pointer"
                />
              </div>

              {style.shadow && (
                <div className="pt-2 border-t border-outline-variant/20 space-y-2">
                  <HexColorPicker
                    label="Warna Bayangan"
                    value={style.shadowColor || '#000000'}
                    onChange={(val) => onUpdateStyle({ ...style, shadowColor: val })}
                  />
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-outline w-24">Jarak Bayangan</span>
                    <input
                      aria-label="Shadow Depth"
                      type="range"
                      min="1"
                      max="16"
                      value={style.shadowDepth ?? 4}
                      onChange={(e) => onUpdateStyle({ ...style, shadowDepth: Number(e.target.value) })}
                      className="flex-1 accent-primary h-1 bg-surface-container-high rounded"
                    />
                    <span className="font-mono text-xs w-8 text-right">{style.shadowDepth ?? 4}px</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-outline w-24">Blur Bayangan</span>
                    <input
                      aria-label="Shadow Blur"
                      type="range"
                      min="0"
                      max="20"
                      value={style.shadowBlur ?? 4}
                      onChange={(e) => onUpdateStyle({ ...style, shadowBlur: Number(e.target.value) })}
                      className="flex-1 accent-primary h-1 bg-surface-container-high rounded"
                    />
                    <span className="font-mono text-xs w-8 text-right">{style.shadowBlur ?? 4}px</span>
                  </div>
                </div>
              )}

              {/* Background Box Toggle & Options */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-outline">Kotak Latar Belakang</span>
                <input
                  aria-label="Background Box Toggle"
                  type="checkbox"
                  checked={style.background}
                  onChange={(e) => onUpdateStyle({ ...style, background: e.target.checked })}
                  className="accent-primary w-4 h-4 cursor-pointer"
                />
              </div>

              {style.background && (
                <div className="pt-2 border-t border-outline-variant/20 space-y-2.5">
                  <HexColorPicker
                    label="Warna Kotak"
                    value={style.backgroundColor || '#000000'}
                    onChange={(val) => onUpdateStyle({ ...style, backgroundColor: val })}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-outline text-xs">Opasitas</span>
                    <input
                      aria-label="Background Opacity"
                      type="range"
                      min="0.2"
                      max="1"
                      step="0.05"
                      value={style.backgroundOpacity ?? 0.8}
                      onChange={(e) => onUpdateStyle({ ...style, backgroundOpacity: Number(e.target.value) })}
                      className="flex-1 accent-primary h-1 bg-surface-container-high rounded"
                    />
                    <span className="text-xs font-mono w-10 text-right">
                      {Math.round((style.backgroundOpacity ?? 0.8) * 100)}%
                    </span>
                  </div>

                  {/* OPENCUT FEATURE: CORNER RADIUS & PADDING */}
                  <div className="space-y-1 pt-1 border-t border-outline-variant/15">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-outline">Kebulatan Sudut (Pill Radius)</span>
                      <span className="font-mono text-on-surface font-semibold">{style.backgroundCornerRadius ?? 16}px</span>
                    </div>
                    <input
                      aria-label="Background Corner Radius"
                      type="range"
                      min="0"
                      max="32"
                      step="2"
                      value={style.backgroundCornerRadius ?? 16}
                      onChange={(e) => onUpdateStyle({ ...style, backgroundCornerRadius: Number(e.target.value) })}
                      className="w-full accent-primary h-1 bg-surface-container-high rounded"
                    />
                  </div>

                  {/* Padding Horizontal & Vertical */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-outline-variant/15 text-xs">
                    <div className="space-y-1">
                      <div className="flex justify-between text-outline text-[10px]">
                        <span>Padding Samping</span>
                        <span className="font-mono text-on-surface">{style.backgroundPaddingX ?? 20}px</span>
                      </div>
                      <input
                        aria-label="Padding Horizontal"
                        type="range"
                        min="8"
                        max="36"
                        step="2"
                        value={style.backgroundPaddingX ?? 20}
                        onChange={(e) => onUpdateStyle({ ...style, backgroundPaddingX: Number(e.target.value) })}
                        className="w-full accent-primary h-1 bg-surface-container-high rounded"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-outline text-[10px]">
                        <span>Padding Atas-Bawah</span>
                        <span className="font-mono text-on-surface">{style.backgroundPaddingY ?? 10}px</span>
                      </div>
                      <input
                        aria-label="Padding Vertical"
                        type="range"
                        min="4"
                        max="24"
                        step="2"
                        value={style.backgroundPaddingY ?? 10}
                        onChange={(e) => onUpdateStyle({ ...style, backgroundPaddingY: Number(e.target.value) })}
                        className="w-full accent-primary h-1 bg-surface-container-high rounded"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: TEKS (HEADLINE VIRAL BANNER, WATERMARK BRANDING, & CAPTIONS) */}
        {activeTab === 'text' && (
          <div className="space-y-4">
            {/* Header Ringkasan Status Teks */}
            <div className="flex items-center justify-between">
              <span className="font-label-md text-on-surface font-semibold flex items-center gap-2">
                <Type className="w-4 h-4 text-primary" />
                Menu Teks & Overlay Video
              </span>
              <span className="text-[10px] text-outline font-mono">
                {[
                  frame.hookTitle?.enabled ? 'Teks' : null,
                  frame.watermark?.enabled ? 'Watermark' : null,
                  style.enabled !== false ? 'Caption' : null,
                ].filter(Boolean).length || 0} Aktif
              </span>
            </div>

            {/* SEKSI 1: TEKS TAMBAHAN / ADD TEXT OVERLAY */}
            <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-primary/20 text-primary flex items-center justify-center font-bold text-[11px]">
                    T+
                  </div>
                  <div>
                    <span className="font-semibold text-xs text-on-surface block leading-tight">
                      Teks Tambahan (Add Text)
                    </span>
                    <span className="text-[10px] text-outline block leading-tight">
                      Tambahkan teks bebas, judul, atau catatan overlay pada video
                    </span>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(frame.hookTitle?.enabled)}
                    onChange={(e) =>
                      onUpdateFrame({
                        ...frame,
                        hookTitle: {
                          enabled: e.target.checked,
                          text: frame.hookTitle?.text || 'Rahasia Sukses di 2026 🤫',
                          bgColor: frame.hookTitle?.bgColor || '#EF4444',
                          textColor: frame.hookTitle?.textColor || '#FFFFFF',
                          fontSize: frame.hookTitle?.fontSize ?? 4.5,
                          fontWeight: frame.hookTitle?.fontWeight || 'bold',
                          textAlign: frame.hookTitle?.textAlign || 'center',
                          positionX: frame.hookTitle?.positionX ?? 50,
                          positionY: frame.hookTitle?.positionY ?? 6,
                          stylePreset: frame.hookTitle?.stylePreset || 'pill',
                          textCase: frame.hookTitle?.textCase || 'original',
                          uppercase: false,
                        },
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {frame.hookTitle?.enabled && (
                <div className="space-y-2.5 pt-2 border-t border-surface-container-high/30">
                  {/* Teks Input & Format Huruf (Casing) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-outline text-[11px]">Isi Teks:</span>
                      <span className="text-[10px] text-outline font-medium">Ubah Huruf</span>
                    </div>
                    <input
                      type="text"
                      value={frame.hookTitle?.text || ''}
                      onChange={(e) => {
                        onUpdateFrame({
                          ...frame,
                          hookTitle: {
                            ...frame.hookTitle!,
                            text: e.target.value,
                          },
                        });
                      }}
                      placeholder="Tulis teks di sini... (misal: Rahasia sukses di 2026 🤫)"
                      className="w-full bg-surface-container px-2.5 py-1.5 rounded text-on-surface text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary border border-outline-variant/30"
                    />

                    {/* Selector Format Huruf (Casing) */}
                    <div className="grid grid-cols-4 gap-1 p-0.5 bg-surface-container-high rounded-md border border-outline-variant/20">
                      {[
                        { id: 'original', label: 'Bebas', desc: 'Sesuai ketikan Anda', sample: 'Aa' },
                        { id: 'uppercase', label: 'BESAR', desc: 'Huruf kapital semua', sample: 'AA' },
                        { id: 'titlecase', label: 'Awal', desc: 'Huruf besar tiap kata', sample: 'Ab' },
                        { id: 'lowercase', label: 'kecil', desc: 'Huruf kecil semua', sample: 'aa' },
                      ].map((c) => {
                        const currentCase = frame.hookTitle?.textCase || (frame.hookTitle?.uppercase === true ? 'uppercase' : 'original');
                        const isSelected = currentCase === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              const currText = frame.hookTitle?.text || '';
                              let transformed = currText;
                              let currentFont = frame.hookTitle?.fontFamily || 'Montserrat';

                              if (c.id === 'uppercase') {
                                transformed = currText.toUpperCase();
                              } else if (c.id === 'lowercase') {
                                transformed = currText.toLowerCase();
                                if (ALL_CAPS_FONTS.has(currentFont)) {
                                  currentFont = 'Montserrat';
                                }
                              } else if (c.id === 'titlecase') {
                                transformed = currText.toLowerCase().replace(/(?:^|\s|[-_])\p{L}/gu, (m) => m.toUpperCase());
                                if (ALL_CAPS_FONTS.has(currentFont)) {
                                  currentFont = 'Montserrat';
                                }
                              } else if (c.id === 'original') {
                                // Jika teks saat ini ALL CAPS, ubah ke natural Title Case agar langsung terlihat efeknya
                                if (currText === currText.toUpperCase() && currText.length > 2) {
                                  transformed = currText.toLowerCase().replace(/(?:^|\s|[-_])\p{L}/gu, (m) => m.toUpperCase());
                                }
                                if (ALL_CAPS_FONTS.has(currentFont)) {
                                  currentFont = 'Montserrat';
                                }
                              }

                              onUpdateFrame({
                                ...frame,
                                hookTitle: {
                                  ...frame.hookTitle!,
                                  text: transformed,
                                  fontFamily: currentFont,
                                  textCase: c.id as any,
                                  uppercase: c.id === 'uppercase',
                                },
                              });
                            }}
                            className={`py-1 px-1 rounded text-center transition-all ${
                              isSelected
                                ? 'bg-primary text-black font-bold shadow-xs'
                                : 'text-outline hover:text-on-surface hover:bg-surface-container'
                            }`}
                            title={`${c.label} (${c.desc})`}
                          >
                            <span className="font-mono text-[11px] block leading-tight">{c.sample}</span>
                            <span className="text-[9px] block leading-tight opacity-90">{c.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Pilihan Gaya / Style Preset Teks */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-outline text-[10px]">Gaya Teks Overlay:</span>
                      <span className="text-rose-400 font-mono text-[9px] font-bold">
                        {(() => {
                          const p = frame.hookTitle?.stylePreset || 'pill';
                          if (p === 'clean-no-bg') return '✨ Tanpa Background';
                          if (p === 'glow-no-bg') return '⚡ Neon Tanpa BG';
                          if (p === 'glass') return '🧊 Frosted Glass';
                          if (p === 'marker') return '🖍 Stabilo';
                          if (p === 'outline') return '🔲 Stroke Outline';
                          if (p === 'luxury') return '👑 Luxury Gold';
                          if (p === 'badge') return '🏷 Sticker Tag';
                          return '💊 Kapsul Solid';
                        })()}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: 'pill', label: '💊 Kapsul Solid', desc: 'Pill Klasik' },
                        { id: 'clean-no-bg', label: '✨ Teks Polos', desc: 'Tanpa Background' },
                        { id: 'glow-no-bg', label: '⚡ Neon Glow', desc: 'Glow Tanpa BG' },
                        { id: 'glass', label: '🧊 Liquid Glass', desc: 'Frosted Glass' },
                        { id: 'marker', label: '🖍 Stabilo', desc: 'Highlight Bold' },
                        { id: 'outline', label: '🔲 Stroke', desc: 'Garis Tepi' },
                        { id: 'luxury', label: '👑 Luxury Gold', desc: 'Dark & Emas' },
                        { id: 'badge', label: '🏷 Sticker Tag', desc: 'Badge Kontras' },
                      ].map((item) => {
                        const isSelected = (frame.hookTitle?.stylePreset || 'pill') === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() =>
                              onUpdateFrame({
                                ...frame,
                                hookTitle: {
                                  ...frame.hookTitle!,
                                  stylePreset: item.id as any,
                                  ...(item.id === 'marker' ? { bgColor: '#FACC15', textColor: '#000000' } : {}),
                                  ...(item.id === 'luxury' ? { bgColor: '#0F172A', textColor: '#F59E0B' } : {}),
                                  ...(item.id === 'clean-no-bg' ? { textColor: '#FFFFFF' } : {}),
                                  ...(item.id === 'glow-no-bg' ? { bgColor: '#38BDF8', textColor: '#FFFFFF' } : {}),
                                },
                              })
                            }
                            className={`p-1.5 rounded text-left transition-all border ${
                              isSelected
                                ? 'bg-primary/20 text-primary border-primary/50 shadow-sm'
                                : 'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-bright'
                            }`}
                          >
                            <div className="text-[10px] font-bold leading-tight truncate">{item.label}</div>
                            <div className="text-[8.5px] opacity-70 leading-tight truncate">{item.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Warna Latar Banner (atau Pilihan Glow jika glow-no-bg) */}
                  {!(frame.hookTitle?.stylePreset === 'clean-no-bg' || frame.hookTitle?.stylePreset === 'glow-no-bg') ? (
                    <div className="space-y-1">
                      <span className="text-outline text-[10px]">Warna Latar Banner:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                          { label: 'Merah Neon', hex: '#EF4444' },
                          { label: 'Kuning Bold', hex: '#FACC15' },
                          { label: 'Biru Elektrik', hex: '#3B82F6' },
                          { label: 'Hitam Solid', hex: '#000000' },
                          { label: 'Ungu CapCut', hex: '#8B5CF6' },
                          { label: 'Hijau Segar', hex: '#10B981' },
                          { label: 'Putih', hex: '#FFFFFF' },
                        ].map((c) => (
                          <button
                            key={c.hex}
                            type="button"
                            onClick={() =>
                              onUpdateFrame({
                                ...frame,
                                hookTitle: { ...frame.hookTitle!, bgColor: c.hex },
                              })
                            }
                            className={`w-6 h-6 rounded-full border-2 transition-transform ${
                              frame.hookTitle?.bgColor === c.hex ? 'scale-110 border-primary' : 'border-outline/40'
                            }`}
                            style={{ backgroundColor: c.hex }}
                            title={c.label}
                          />
                        ))}
                      </div>
                      <HexColorPicker
                        label="Custom Warna Latar"
                        value={frame.hookTitle?.bgColor || '#EF4444'}
                        onChange={(val) =>
                          onUpdateFrame({
                            ...frame,
                            hookTitle: { ...frame.hookTitle!, bgColor: val },
                          })
                        }
                      />
                    </div>
                  ) : frame.hookTitle?.stylePreset === 'glow-no-bg' ? (
                    <div className="space-y-1">
                      <span className="text-outline text-[10px]">Warna Efek Cahaya Glow:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                          { label: 'Cyan Glow', hex: '#38BDF8' },
                          { label: 'Emas Glow', hex: '#FACC15' },
                          { label: 'Neon Rose', hex: '#F43F5E' },
                          { label: 'Hijau Neon', hex: '#4ADE80' },
                          { label: 'Ungu Neon', hex: '#C084FC' },
                        ].map((c) => (
                          <button
                            key={c.hex}
                            type="button"
                            onClick={() =>
                              onUpdateFrame({
                                ...frame,
                                hookTitle: { ...frame.hookTitle!, bgColor: c.hex },
                              })
                            }
                            className={`w-6 h-6 rounded-full border-2 transition-transform ${
                              frame.hookTitle?.bgColor === c.hex ? 'scale-110 border-primary ring-2 ring-primary/40' : 'border-outline/40'
                            }`}
                            style={{ backgroundColor: c.hex }}
                            title={c.label}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 rounded bg-primary/10 border border-primary/20 text-[10px] text-primary flex items-center gap-1.5">
                      <span>✨</span>
                      <span>Mode Tanpa Background aktif: Teks tampil bersih dengan bayangan tajam kontras di atas video.</span>
                    </div>
                  )}

                  {/* Jenis Font & Warna Teks */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-surface-container-high/20">
                    <div>
                      <span className="text-outline text-[10px] block mb-1">Jenis Font:</span>
                      <select
                        value={frame.hookTitle?.fontFamily || 'Montserrat'}
                        onChange={(e) =>
                          onUpdateFrame({
                            ...frame,
                            hookTitle: { ...frame.hookTitle!, fontFamily: e.target.value },
                          })
                        }
                        className="w-full bg-surface-container border border-outline-variant/30 text-on-surface text-[11px] font-semibold px-2 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {AVAILABLE_FONTS.map((font) => (
                          <option key={font} value={font} style={{ fontFamily: font }}>
                            {font} {ALL_CAPS_FONTS.has(font) ? '🔠 (Kapital Saja)' : ''}
                          </option>
                        ))}
                      </select>
                      {ALL_CAPS_FONTS.has(frame.hookTitle?.fontFamily || '') && (
                        <p className="text-[10px] text-amber-400 font-medium flex items-center gap-1 mt-1 leading-tight">
                          <span>⚠️</span>
                          <span>Font {frame.hookTitle?.fontFamily} hanya glif kapital. Pilih Montserrat/Inter untuk huruf kecil.</span>
                        </p>
                      )}
                    </div>
                    <div>
                      <HexColorPicker
                        label="Warna Teks"
                        value={frame.hookTitle?.textColor || '#FFFFFF'}
                        onChange={(val) =>
                          onUpdateFrame({
                            ...frame,
                            hookTitle: { ...frame.hookTitle!, textColor: val },
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Ketebalan Huruf (Font Weight) & Perataan (Text Align) */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <span className="block text-outline text-[10px]">Ketebalan (Weight)</span>
                      <div className="grid grid-cols-4 gap-0.5 p-0.5 bg-surface-container-high rounded-md border border-outline-variant/20">
                        {[
                          { id: 'normal', label: 'Tipis', weight: 400 },
                          { id: 'medium', label: 'Sedang', weight: 500 },
                          { id: 'bold', label: 'Tebal', weight: 700 },
                          { id: 'black', label: 'Ekstra', weight: 900 },
                        ].map((w) => {
                          const active = (frame.hookTitle?.fontWeight || 'bold') === w.id;
                          return (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() =>
                                onUpdateFrame({
                                  ...frame,
                                  hookTitle: { ...frame.hookTitle!, fontWeight: w.id as any },
                                })
                              }
                              className={`py-1 text-[10px] rounded transition-all text-center ${
                                active
                                  ? 'bg-primary text-black font-bold shadow-sm'
                                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                              }`}
                              style={{ fontWeight: w.weight }}
                              title={`${w.label} (${w.weight})`}
                            >
                              {w.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="block text-outline text-[10px]">Perataan Teks</span>
                      <div className="grid grid-cols-3 gap-0.5 p-0.5 bg-surface-container-high rounded-md border border-outline-variant/20">
                        {[
                          { id: 'left', label: 'Kiri' },
                          { id: 'center', label: 'Tengah' },
                          { id: 'right', label: 'Kanan' },
                        ].map((al) => {
                          const active = (frame.hookTitle?.textAlign || 'center') === al.id;
                          return (
                            <button
                              key={al.id}
                              type="button"
                              onClick={() =>
                                onUpdateFrame({
                                  ...frame,
                                  hookTitle: { ...frame.hookTitle!, textAlign: al.id as any },
                                })
                              }
                              className={`py-1 text-[10px] rounded transition-all text-center ${
                                active
                                  ? 'bg-primary text-black font-bold shadow-sm'
                                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                              }`}
                            >
                              {al.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Slider Ukuran Font Skala OpenCut & Posisi Y */}
                  {(() => {
                    const rawSize = frame.hookTitle?.fontSize ?? 4.5;
                    const displayFontSize = rawSize > 16 ? Math.max(1.5, Math.min(14, +(rawSize / 4.5).toFixed(1))) : rawSize;
                    const sizeLabel = displayFontSize <= 2.5 ? 'Kecil' : displayFontSize <= 5.0 ? 'Sedang' : displayFontSize <= 8.5 ? 'Besar' : 'Ekstra';

                    return (
                      <div className="space-y-2 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <div className="flex justify-between text-outline text-[10px]">
                              <span>Ukuran Font</span>
                              <span className="font-mono text-on-surface font-semibold">
                                {sizeLabel} ({displayFontSize.toFixed(1)})
                              </span>
                            </div>
                            <input
                              type="range"
                              min="1.5"
                              max="14"
                              step="0.5"
                              value={displayFontSize}
                              onChange={(e) =>
                                onUpdateFrame({
                                  ...frame,
                                  hookTitle: { ...frame.hookTitle!, fontSize: Number(e.target.value) },
                                })
                              }
                              className="w-full accent-primary h-1 bg-surface-container-high rounded cursor-pointer"
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-outline text-[10px]">
                              <span>Posisi Vertikal (Y)</span>
                              <span className="font-mono text-on-surface font-semibold">{frame.hookTitle?.positionY ?? 6}%</span>
                            </div>
                            <input
                              type="range"
                              min="2"
                              max="92"
                              step="1"
                              value={frame.hookTitle?.positionY ?? 6}
                              onChange={(e) =>
                                onUpdateFrame({
                                  ...frame,
                                  hookTitle: { ...frame.hookTitle!, positionY: Number(e.target.value) },
                                })
                              }
                              className="w-full accent-primary h-1 bg-surface-container-high rounded cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="p-2 rounded bg-primary/10 border border-primary/20 text-[10px] text-primary flex items-start gap-1.5 leading-relaxed">
                    <span className="shrink-0 text-xs">👆</span>
                    <span><strong>Geser Bebas dengan Kursor:</strong> Klik &amp; drag langsung teks di kanvas ke posisi mana saja (atas, tengah, bawah, kiri, kanan) secara bebas tanpa harus bergantung pada slider!</span>
                  </div>
                </div>
              )}
            </div>

            {/* SEKSI 2: WATERMARK & BRANDING KREATOR */}
            <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-violet-500/20 text-violet-400 flex items-center justify-center font-bold text-[11px]">
                    @
                  </div>
                  <div>
                    <span className="font-semibold text-xs text-on-surface block leading-tight">
                      Watermark & Branding Channel
                    </span>
                    <span className="text-[10px] text-outline block leading-tight">
                      Label @username atau branding kreator di video
                    </span>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(frame.watermark?.enabled)}
                    onChange={(e) =>
                      onUpdateFrame({
                        ...frame,
                        watermark: {
                          enabled: e.target.checked,
                          text: frame.watermark?.text || 'namachannel',
                          prefixIcon: frame.watermark?.prefixIcon || 'at',
                          stylePreset: frame.watermark?.stylePreset || 'pill',
                          opacity: frame.watermark?.opacity ?? 0.85,
                          fontSize: frame.watermark?.fontSize ?? 14,
                          position: frame.watermark?.position || 'bottom-right',
                          positionX: frame.watermark?.positionX ?? 85,
                          positionY: frame.watermark?.positionY ?? 92,
                          fontFamily: frame.watermark?.fontFamily || style.fontFamily,
                          textColor: frame.watermark?.textColor || '#FFFFFF',
                          uppercase: frame.watermark?.uppercase ?? false,
                        },
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {frame.watermark?.enabled && (
                <div className="space-y-2.5 pt-2 border-t border-surface-container-high/30">
                  {/* Teks Input & CAPS button */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-outline text-[11px]">Teks / Handle Kreator:</span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateFrame({
                            ...frame,
                            watermark: {
                              ...frame.watermark!,
                              uppercase: !frame.watermark?.uppercase,
                            },
                          })
                        }
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                          frame.watermark?.uppercase
                            ? 'bg-primary/20 text-primary border border-primary/40'
                            : 'bg-surface-container text-outline hover:text-on-surface'
                        }`}
                        title="Ubah huruf besar semua (UPPERCASE)"
                      >
                        CAPS
                      </button>
                    </div>
                    <input
                      type="text"
                      value={frame.watermark?.text || ''}
                      onChange={(e) =>
                        onUpdateFrame({
                          ...frame,
                          watermark: { ...frame.watermark!, text: e.target.value },
                        })
                      }
                      placeholder="Misal: username / nama channel"
                      className="w-full bg-surface-container px-2.5 py-1.5 rounded text-on-surface text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary border border-outline-variant/30"
                    />
                  </div>

                  {/* Pilihan Prefix Ikon */}
                  <div className="space-y-1">
                    <span className="text-outline text-[10px]">Ikon Prefix:</span>
                    <div className="grid grid-cols-5 gap-1">
                      {[
                        { id: 'at', label: '@ At' },
                        { id: 'verified', label: '✓ Verified' },
                        { id: 'sparkle', label: '✨ Sparkle' },
                        { id: 'video', label: '🎬 Video' },
                        { id: 'none', label: 'Polos' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            onUpdateFrame({
                              ...frame,
                              watermark: { ...frame.watermark!, prefixIcon: item.id as any },
                            })
                          }
                          className={`py-1 px-1 rounded text-[10px] font-medium border text-center transition-colors truncate ${
                            (frame.watermark?.prefixIcon || 'at') === item.id
                              ? 'border-primary bg-primary/20 text-primary font-bold'
                              : 'border-outline-variant/30 text-outline hover:text-on-surface bg-surface-container'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Gaya Tampilan Watermark */}
                  <div className="space-y-1">
                    <span className="text-outline text-[10px]">Gaya Desain Badge:</span>
                    <div className="grid grid-cols-3 gap-1">
                      {[
                        { id: 'pill', label: 'Pill Kaca' },
                        { id: 'marker', label: 'Stabilo Kuning' },
                        { id: 'minimal', label: 'Minimalis' },
                        { id: 'glow', label: 'Neon Glow' },
                        { id: 'outline', label: 'Outline' },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            onUpdateFrame({
                              ...frame,
                              watermark: { ...frame.watermark!, stylePreset: p.id as any },
                            })
                          }
                          className={`py-1 px-1.5 rounded text-[10px] font-medium border transition-colors ${
                            (frame.watermark?.stylePreset || 'pill') === p.id
                              ? 'border-primary bg-primary/20 text-primary font-bold'
                              : 'border-outline-variant/30 text-outline hover:text-on-surface bg-surface-container'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Posisi Pojok Cepat */}
                  <div className="space-y-1">
                    <span className="text-outline text-[10px]">Posisi Penempatan:</span>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { id: 'bottom-right', label: 'Kanan Bawah' },
                        { id: 'bottom-left', label: 'Kiri Bawah' },
                        { id: 'top-right', label: 'Kanan Atas' },
                        { id: 'top-left', label: 'Kiri Atas' },
                      ].map((pos) => (
                        <button
                          key={pos.id}
                          type="button"
                          onClick={() =>
                            onUpdateFrame({
                              ...frame,
                              watermark: {
                                ...frame.watermark!,
                                position: pos.id as any,
                                positionX: pos.id.includes('right') ? 85 : 15,
                                positionY: pos.id.includes('bottom') ? 92 : 8,
                              },
                            })
                          }
                          className={`py-1 px-1 rounded text-[10px] font-medium border transition-colors text-center truncate ${
                            frame.watermark?.position === pos.id
                              ? 'border-primary bg-primary/20 text-primary font-bold'
                              : 'border-outline-variant/30 text-outline hover:text-on-surface bg-surface-container'
                          }`}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Slider Opasitas & Ukuran */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <div className="flex justify-between text-outline text-[10px]">
                        <span>Transparansi</span>
                        <span className="font-mono text-on-surface">
                          {Math.round((frame.watermark?.opacity ?? 0.85) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="100"
                        step="5"
                        value={Math.round((frame.watermark?.opacity ?? 0.85) * 100)}
                        onChange={(e) =>
                          onUpdateFrame({
                            ...frame,
                            watermark: {
                              ...frame.watermark!,
                              opacity: Number(e.target.value) / 100,
                            },
                          })
                        }
                        className="w-full accent-primary h-1 bg-surface-container-high rounded cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-outline text-[10px]">
                        <span>Ukuran Font</span>
                        <span className="font-mono text-on-surface">{frame.watermark?.fontSize || 14}px</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="26"
                        step="1"
                        value={frame.watermark?.fontSize || 14}
                        onChange={(e) =>
                          onUpdateFrame({
                            ...frame,
                            watermark: {
                              ...frame.watermark!,
                              fontSize: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full accent-primary h-1 bg-surface-container-high rounded cursor-pointer"
                      />
                    </div>
                  </div>
                  {/* Font Family & Warna Teks Watermark */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-surface-container-high/20">
                    <div>
                      <span className="text-outline text-[10px] block mb-1">Jenis Font:</span>
                      <select
                        value={frame.watermark?.fontFamily || 'Inter'}
                        onChange={(e) =>
                          onUpdateFrame({
                            ...frame,
                            watermark: { ...frame.watermark!, fontFamily: e.target.value },
                          })
                        }
                        className="w-full bg-surface-container border border-outline-variant/30 text-on-surface text-[11px] font-semibold px-2 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {AVAILABLE_FONTS.map((font) => (
                          <option key={font} value={font} style={{ fontFamily: font }}>
                            {font}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <HexColorPicker
                        label="Warna Teks Watermark"
                        value={frame.watermark?.textColor || '#FFFFFF'}
                        onChange={(val) =>
                          onUpdateFrame({
                            ...frame,
                            watermark: { ...frame.watermark!, textColor: val },
                          })
                        }
                      />
                    </div>
                  </div>

                  <p className="text-[10px] text-outline/80 leading-relaxed">
                    💡 Tip: Watermark ini juga bisa digeser/drag posisinya secara bebas di layar preview kanvas.
                  </p>
                </div>
              )}
            </div>

            {/* SEKSI 3: AKSES CEPAT CAPTION SUBTITLE */}
            <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[11px]">
                    CC
                  </div>
                  <div>
                    <span className="font-semibold text-xs text-on-surface block leading-tight">
                      Subtitle / Caption Otomatis
                    </span>
                    <span className="text-[10px] text-outline block leading-tight">
                      {style.enabled !== false ? 'Sedang aktif menampilkan kata' : 'Status: Dinonaktifkan'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('caption')}
                  className="px-2.5 py-1 rounded text-[11px] font-bold bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 transition-colors flex items-center gap-1"
                >
                  <FileText className="w-3 h-3" />
                  Buka Transkrip
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-surface-container-high/20">
                <button
                  type="button"
                  onClick={() => setActiveTab('style')}
                  className="py-1.5 px-2 rounded text-xs font-medium bg-surface-container border border-outline-variant/30 text-on-surface hover:bg-surface-bright flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Palette className="w-3.5 h-3.5 text-primary" />
                  Ganti Template & Font
                </button>

                <button
                  type="button"
                  onClick={() => onUpdateStyle({ ...style, enabled: style.enabled === false ? true : false })}
                  className={`py-1.5 px-2 rounded text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors ${
                    style.enabled !== false
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
                      : 'bg-surface-container text-outline border-outline-variant/30'
                  }`}
                >
                  {style.enabled !== false ? '✓ Subtitle Aktif' : 'Nyalakan Subtitle'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: FRAME & REFRAME */}
        {activeTab === 'frame' && (
          <div className="space-y-4">
            <span className="font-label-md text-on-surface font-semibold block">
              Reframing & Transform
            </span>

            <div className="bg-surface-container-lowest p-2.5 rounded-lg space-y-3">
              {/* Aspect Ratio */}
              <div>
                <span className="text-outline block mb-1.5">Rasio Kanvas</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['9:16', '1:1', '16:9'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => onUpdateFrame({ ...frame, ratio: r })}
                      className={`py-1.5 rounded text-xs font-semibold transition-colors ${
                        frame.ratio === r
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container text-on-surface hover:bg-surface-bright'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode Crop vs Fit Blur vs Fit Letterbox vs Podcast Split vs Social Profile */}
              <div>
                <span className="text-outline block mb-1.5">Mode Penyesuaian</span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => {
                      const spks = frame.detectedSpeakers || [];
                      const prim = spks.find((s) => s.is_primary) || spks[0];
                      const targetX = (spks.length >= 2 && Math.abs(frame.offsetX || 0) < 8 && prim)
                        ? prim.offset_x
                        : (frame.offsetX || 0);
                      onUpdateFrame({ ...frame, mode: 'crop', offsetX: targetX, faceTracking: true });
                    }}
                    className={`py-1.5 px-2 rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                      frame.mode === 'crop'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'bg-surface-container text-on-surface hover:bg-surface-bright'
                    }`}
                  >
                    <ScanFace className="w-3.5 h-3.5" />
                    <span>Face Crop</span>
                  </button>
                  <button
                    onClick={() =>
                      onUpdateFrame({
                        ...frame,
                        mode: 'split',
                        splitTopOffsetX: frame.splitTopOffsetX ?? -25,
                        splitBottomOffsetX: frame.splitBottomOffsetX ?? 25,
                        splitRatio: frame.splitRatio ?? 50,
                        splitDividerWidth: frame.splitDividerWidth ?? 2,
                        splitDividerColor: frame.splitDividerColor || '#38BDF8',
                      })
                    }
                    className={`py-1.5 px-2 rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                      frame.mode === 'split'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'bg-surface-container text-on-surface hover:bg-surface-bright'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Podcast</span>
                  </button>
                  <button
                    onClick={() =>
                      onUpdateFrame({
                        ...frame,
                        mode: 'social',
                        socialProfile: frame.socialProfile ?? {
                          accountName: '@username',
                          accountHandle: 'Content Creator',
                          avatarUrl: '',
                          bgColor: '#FFFFFF',
                          textColor: '#000000',
                          handleColor: '#4B5563',
                          accentColor: '#0095F6',
                          verifiedBadgeColor: '#0095F6',
                          headerHeight: 18,
                          footerHeight: 8,
                          headerPosY: 6,
                          footerPosY: 91,
                          videoFrameHeight: 66,
                          videoFrameOffsetY: 0,
                          footerText: 'Follow for more! 🔥',
                          showVerifiedBadge: true,
                          showFollowButton: false,
                          cardStyle: 'flat',
                        },
                      })
                    }
                    className={`py-1.5 px-2 rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                      frame.mode === 'social'
                        ? 'bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30'
                        : 'bg-surface-container text-on-surface hover:bg-surface-bright'
                    }`}
                  >
                    <AtSign className="w-3.5 h-3.5" />
                    <span>Social</span>
                  </button>
                  <button
                    onClick={() => onUpdateFrame({ ...frame, mode: 'fit_blur' })}
                    className={`py-1.5 px-2 rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                      frame.mode === 'fit_blur'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'bg-surface-container text-on-surface hover:bg-surface-bright'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Fit + Blur</span>
                  </button>
                  <button
                    onClick={() => onUpdateFrame({ ...frame, mode: 'fit' })}
                    className={`py-1.5 px-2 rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                      frame.mode === 'fit'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'bg-surface-container text-on-surface hover:bg-surface-bright'
                    }`}
                    title="Tampilkan video utuh dengan warna latar kustom"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Fit Warna</span>
                  </button>
                </div>
              </div>

              {/* PODCAST DUAL-SPEAKER SPLIT SCREEN SETTINGS (ATAS - BAWAH) */}
              {frame.mode === 'split' && (
                <div className="space-y-3 pt-2 border-t border-surface-container-high/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                      <Users className="w-4 h-4" />
                      <span>Podcast Dual-Speaker Split (Atas-Bawah)</span>
                    </div>
                    <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-mono font-semibold">
                      9:16 Stacked
                    </span>
                  </div>

                  <p className="text-outline text-[11px] leading-relaxed">
                    Layar portrait 9:16 dibagi dua: pembicara pertama di atas dan pembicara kedua di bawah secara bersamaan.
                  </p>

                  {/* Quick Preset Buttons */}
                  <div className="space-y-1">
                    <span className="text-outline text-[11px]">Preset Cepat Posisi Pembicara:</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateFrame({
                            ...frame,
                            splitTopOffsetX: -25,
                            splitBottomOffsetX: 25,
                          })
                        }
                        className={`py-1.5 px-2 rounded text-[11px] font-medium transition-colors border ${
                          (frame.splitTopOffsetX ?? -25) === -25 && (frame.splitBottomOffsetX ?? 25) === 25
                            ? 'bg-primary/20 text-primary border-primary/40 shadow-xs'
                            : 'bg-surface-container border-outline-variant/30 text-on-surface hover:bg-surface-bright'
                        }`}
                      >
                        Host Kiri | Guest Kanan
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateFrame({
                            ...frame,
                            splitTopOffsetX: 25,
                            splitBottomOffsetX: -25,
                          })
                        }
                        className={`py-1.5 px-2 rounded text-[11px] font-medium transition-colors border ${
                          (frame.splitTopOffsetX ?? -25) === 25 && (frame.splitBottomOffsetX ?? 25) === -25
                            ? 'bg-primary/20 text-primary border-primary/40 shadow-xs'
                            : 'bg-surface-container border-outline-variant/30 text-on-surface hover:bg-surface-bright'
                        }`}
                      >
                        Host Kanan | Guest Kiri
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateFrame({
                            ...frame,
                            splitTopOffsetX: frame.splitBottomOffsetX ?? 25,
                            splitBottomOffsetX: frame.splitTopOffsetX ?? -25,
                            splitTopOffsetY: frame.splitBottomOffsetY ?? 0,
                            splitBottomOffsetY: frame.splitTopOffsetY ?? 0,
                            splitTopZoom: frame.splitBottomZoom ?? frame.zoom ?? 1.0,
                            splitBottomZoom: frame.splitTopZoom ?? frame.zoom ?? 1.0,
                          })
                        }
                        className="py-1 px-2 rounded text-[11px] font-medium bg-surface-container hover:bg-surface-bright text-tertiary border border-outline-variant/30 flex items-center justify-center gap-1 transition-colors"
                        title="Tukar posisi pembicara atas dan bawah"
                      >
                        <ArrowUpDown className="w-3.5 h-3.5" />
                        <span>Tukar Atas ⇄ Bawah</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateFrame({
                            ...frame,
                            splitTopOffsetX: 0,
                            splitBottomOffsetX: 0,
                            splitTopOffsetY: 0,
                            splitBottomOffsetY: 0,
                          })
                        }
                        className="py-1 px-2 rounded text-[11px] font-medium bg-surface-container hover:bg-surface-bright text-on-surface border border-outline-variant/30 transition-colors"
                      >
                        Center (0% | 0%)
                      </button>
                    </div>
                  </div>

                  {/* ═══ PEMBICARA 1 (ATAS) CONTROLS ═══ */}
                  <div className="space-y-2.5 pt-2 border-t border-surface-container-high/40 bg-surface-container-low/40 p-2.5 rounded-lg border border-primary/20">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-primary flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>Pembicara 1 (Atas)</span>
                      </span>
                      <span className="text-[10px] bg-primary/20 text-primary font-mono font-bold px-1.5 py-0.5 rounded">
                        {Number(frame.splitTopZoom ?? frame.zoom ?? 1.0).toFixed(2)}x
                      </span>
                    </div>

                    {/* Zoom Pembicara 1 */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-outline text-[11px]">
                        <span>Zoom / Skala</span>
                        <span className="font-mono text-on-surface font-semibold">
                          {Math.round((frame.splitTopZoom ?? frame.zoom ?? 1.0) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.5"
                        step="0.05"
                        value={frame.splitTopZoom ?? frame.zoom ?? 1.0}
                        onChange={(e) => onUpdateFrame({ ...frame, splitTopZoom: Number(e.target.value) })}
                        className="w-full accent-primary h-1 bg-surface-container-high rounded"
                      />
                    </div>

                    {/* Pan Horizontal (X) Pembicara 1 */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-outline text-[11px]">
                        <span>Pan Horizontal (Kiri - Kanan)</span>
                        <span className="font-mono text-on-surface font-semibold">
                          {(frame.splitTopOffsetX ?? -25) > 0 ? `+${Math.round(frame.splitTopOffsetX ?? -25)}` : Math.round(frame.splitTopOffsetX ?? -25)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-85"
                        max="85"
                        step="1"
                        value={frame.splitTopOffsetX ?? -25}
                        onChange={(e) => onUpdateFrame({ ...frame, splitTopOffsetX: Number(e.target.value) })}
                        className="w-full accent-primary h-1 bg-surface-container-high rounded"
                      />
                    </div>

                    {/* Pan Vertikal (Y) Pembicara 1 */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-outline text-[11px]">
                        <span>Pan Vertikal (Atas - Bawah)</span>
                        <span className="font-mono text-on-surface font-semibold">
                          {(frame.splitTopOffsetY ?? 0) > 0 ? `+${Math.round(frame.splitTopOffsetY ?? 0)}` : Math.round(frame.splitTopOffsetY ?? 0)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-60"
                        max="60"
                        step="1"
                        value={frame.splitTopOffsetY ?? 0}
                        onChange={(e) => onUpdateFrame({ ...frame, splitTopOffsetY: Number(e.target.value) })}
                        className="w-full accent-primary h-1 bg-surface-container-high rounded"
                      />
                    </div>
                  </div>

                  {/* ═══ PEMBICARA 2 (BAWAH) CONTROLS ═══ */}
                  <div className="space-y-2.5 pt-2 border-t border-surface-container-high/40 bg-surface-container-low/40 p-2.5 rounded-lg border border-secondary/20">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-secondary flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>Pembicara 2 (Bawah)</span>
                      </span>
                      <span className="text-[10px] bg-secondary/20 text-secondary font-mono font-bold px-1.5 py-0.5 rounded">
                        {Number(frame.splitBottomZoom ?? frame.zoom ?? 1.0).toFixed(2)}x
                      </span>
                    </div>

                    {/* Zoom Pembicara 2 */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-outline text-[11px]">
                        <span>Zoom / Skala</span>
                        <span className="font-mono text-on-surface font-semibold">
                          {Math.round((frame.splitBottomZoom ?? frame.zoom ?? 1.0) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.5"
                        step="0.05"
                        value={frame.splitBottomZoom ?? frame.zoom ?? 1.0}
                        onChange={(e) => onUpdateFrame({ ...frame, splitBottomZoom: Number(e.target.value) })}
                        className="w-full accent-secondary h-1 bg-surface-container-high rounded"
                      />
                    </div>

                    {/* Pan Horizontal (X) Pembicara 2 */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-outline text-[11px]">
                        <span>Pan Horizontal (Kiri - Kanan)</span>
                        <span className="font-mono text-on-surface font-semibold">
                          {(frame.splitBottomOffsetX ?? 25) > 0 ? `+${Math.round(frame.splitBottomOffsetX ?? 25)}` : Math.round(frame.splitBottomOffsetX ?? 25)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-85"
                        max="85"
                        step="1"
                        value={frame.splitBottomOffsetX ?? 25}
                        onChange={(e) => onUpdateFrame({ ...frame, splitBottomOffsetX: Number(e.target.value) })}
                        className="w-full accent-secondary h-1 bg-surface-container-high rounded"
                      />
                    </div>

                    {/* Pan Vertikal (Y) Pembicara 2 */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-outline text-[11px]">
                        <span>Pan Vertikal (Atas - Bawah)</span>
                        <span className="font-mono text-on-surface font-semibold">
                          {(frame.splitBottomOffsetY ?? 0) > 0 ? `+${Math.round(frame.splitBottomOffsetY ?? 0)}` : Math.round(frame.splitBottomOffsetY ?? 0)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-60"
                        max="60"
                        step="1"
                        value={frame.splitBottomOffsetY ?? 0}
                        onChange={(e) => onUpdateFrame({ ...frame, splitBottomOffsetY: Number(e.target.value) })}
                        className="w-full accent-secondary h-1 bg-surface-container-high rounded"
                      />
                    </div>
                  </div>

                  {/* Proporsi Tinggi Split (Ratio) */}
                  <div className="space-y-1 pt-1 border-t border-surface-container-high/30">
                    <div className="flex justify-between text-outline text-xs">
                      <span>Proporsi Pembagian Layar</span>
                      <span className="font-mono text-on-surface font-semibold">
                        {frame.splitRatio ?? 50} : {100 - (frame.splitRatio ?? 50)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { ratio: 50, label: '50:50 (Seimbang)' },
                        { ratio: 60, label: '60:40 (Atas Fokus)' },
                        { ratio: 40, label: '40:60 (Bawah Fokus)' },
                      ].map((p) => (
                        <button
                          key={p.ratio}
                          type="button"
                          onClick={() => onUpdateFrame({ ...frame, splitRatio: p.ratio })}
                          className={`py-1 px-1 rounded text-[10px] font-medium transition-colors border ${
                            (frame.splitRatio ?? 50) === p.ratio
                              ? 'bg-primary/20 text-primary border-primary/40 font-bold'
                              : 'bg-surface-container border-outline-variant/30 text-on-surface hover:bg-surface-bright'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Garis Pemisah (Divider Line) */}
                  <div className="space-y-2 pt-1 border-t border-surface-container-high/30">
                    <div className="flex items-center justify-between text-xs text-outline">
                      <span>Garis Pemisah Tengah (Divider)</span>
                      <span className="font-mono text-on-surface font-semibold">{frame.splitDividerWidth ?? 2}px</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { w: 0, label: 'Tanpa Garis' },
                        { w: 2, label: 'Tipis (2px)' },
                        { w: 4, label: 'Tebal (4px)' },
                      ].map((item) => (
                        <button
                          key={item.w}
                          type="button"
                          onClick={() => onUpdateFrame({ ...frame, splitDividerWidth: item.w })}
                          className={`py-1 rounded text-[11px] font-medium transition-colors ${
                            (frame.splitDividerWidth ?? 2) === item.w
                              ? 'bg-primary text-on-primary'
                              : 'bg-surface-container text-on-surface hover:bg-surface-bright'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    {(frame.splitDividerWidth ?? 2) > 0 && (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-outline">Warna Garis</span>
                        <div className="flex items-center gap-1.5">
                          {[
                            { hex: '#38BDF8', label: 'Sky Blue' },
                            { hex: '#FFFFFF', label: 'Putih' },
                            { hex: '#F59E0B', label: 'Emas' },
                            { hex: '#22C55E', label: 'Hijau' },
                            { hex: '#0F172A', label: 'Gelap' },
                          ].map((c) => (
                            <button
                              key={c.hex}
                              type="button"
                              onClick={() => onUpdateFrame({ ...frame, splitDividerColor: c.hex })}
                              className={`w-5 h-5 rounded-full border transition-all ${
                                (frame.splitDividerColor || '#38BDF8').toUpperCase() === c.hex
                                  ? 'border-primary ring-2 ring-primary/40 scale-110'
                                  : 'border-white/30 hover:scale-105'
                              }`}
                              style={{ backgroundColor: c.hex }}
                              title={c.label}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SOCIAL PROFILE TEMPLATE SETTINGS */}
              {frame.mode === 'social' && (() => {
                const sp = frame.socialProfile ?? {
                  accountName: '@username',
                  accountHandle: 'Content Creator',
                  avatarUrl: '',
                  bgColor: '#FFFFFF',
                  textColor: '#000000',
                  handleColor: '#6B7280',
                  accentColor: '#0095F6',
                  verifiedBadgeColor: '#0095F6',
                  headerHeight: 18,
                  footerHeight: 8,
                  headerPosY: 6,
                  footerPosY: 91,
                  headerBarHeight: 48,
                  footerBarHeight: 34,
                  headerPaddingX: 0,
                  videoFrameHeight: 66,
                  videoFrameOffsetY: 0,
                  footerText: 'Follow for more! 🔥',
                  showVerifiedBadge: true,
                  showFollowButton: false,
                  cardStyle: 'flat' as const,
                  videoFrameBg: '#000000',
                  framePadding: 0,
                  frameBorderRadius: 0,
                };
                const updateSP = (patch: Record<string, unknown>) =>
                  onUpdateFrame({ ...frame, socialProfile: { ...sp, ...patch } });
                return (
                  <div className="space-y-3 pt-2 border-t border-surface-container-high/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                        <AtSign className="w-4 h-4 text-violet-400" />
                        <span>Social Profile Template</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateFrame({
                              ...frame,
                              zoom: 1.0,
                              offsetX: 0,
                              offsetY: 0,
                              socialProfile: {
                                accountName: '@username',
                                accountHandle: 'Content Creator',
                                avatarUrl: '',
                                bgColor: '#FFFFFF',
                                textColor: '#000000',
                                handleColor: '#6B7280',
                                accentColor: '#0095F6',
                                verifiedBadgeColor: '#0095F6',
                                headerHeight: 18,
                                footerHeight: 8,
                                headerPosY: 6,
                                footerPosY: 91,
                                headerBarHeight: 48,
                                footerBarHeight: 34,
                                headerPaddingX: 0,
                                videoFrameHeight: 66,
                                videoFrameOffsetY: 0,
                                footerText: 'Follow for more! 🔥',
                                showVerifiedBadge: true,
                                showFollowButton: false,
                                cardStyle: 'flat',
                                videoFrameBg: '#000000',
                                framePadding: 0,
                                frameBorderRadius: 0,
                              },
                            })
                          }
                          className="text-[10px] text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 px-2 py-0.5 rounded border border-violet-500/30 flex items-center gap-1 transition-colors"
                          title="Reset template sosial media ke setelan awal default"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          <span>Reset Template</span>
                        </button>
                        <span className="text-[10px] bg-violet-500/15 text-violet-400 px-1.5 py-0.5 rounded font-mono font-semibold">
                          9:16 Social
                        </span>
                      </div>
                    </div>

                    <p className="text-outline text-[11px] leading-relaxed">
                      Template postingan sosial media gaya Instagram/TikTok: profil akun rapi di atas tanpa border, video di tengah, dan CTA di bawah.
                    </p>

                    {/* Avatar Upload */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-outline text-xs">
                        <span>Foto Profil Bulat</span>
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">Tanpa border</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="relative w-12 h-12 rounded-full border border-dashed border-outline-variant/50 hover:border-violet-400 cursor-pointer transition-colors flex items-center justify-center overflow-hidden bg-surface-container group">
                          {sp.avatarUrl ? (
                            <img src={sp.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
                          ) : (
                            <Plus className="w-5 h-5 text-outline group-hover:text-violet-400 transition-colors" />
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = () => updateSP({ avatarUrl: reader.result as string });
                              reader.readAsDataURL(file);
                            }}
                          />
                        </label>
                        <div className="flex-1 space-y-1">
                          <p className="text-[11px] text-on-surface-variant">Upload foto profil atau logo brand (avatar bulat bersih)</p>
                          {sp.avatarUrl && (
                            <button
                              type="button"
                              onClick={() => updateSP({ avatarUrl: '' })}
                              className="text-[10px] text-error hover:text-error/80 underline"
                            >
                              Hapus foto
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Account Name */}
                    <div className="space-y-1">
                      <span className="text-outline text-xs">Nama Akun</span>
                      <input
                        type="text"
                        value={sp.accountName}
                        onChange={(e) => updateSP({ accountName: e.target.value })}
                        placeholder="@username"
                        className="w-full px-2.5 py-1.5 rounded bg-surface-container border border-outline-variant/30 text-on-surface text-xs focus:border-violet-400 focus:ring-1 focus:ring-violet-400/30 outline-none transition-colors"
                      />
                    </div>

                    {/* Account Handle / Subtitle */}
                    <div className="space-y-1">
                      <span className="text-outline text-xs">Subtitle / Bio Singkat</span>
                      <input
                        type="text"
                        value={sp.accountHandle}
                        onChange={(e) => updateSP({ accountHandle: e.target.value })}
                        placeholder="Content Creator"
                        className="w-full px-2.5 py-1.5 rounded bg-surface-container border border-outline-variant/30 text-on-surface text-xs focus:border-violet-400 focus:ring-1 focus:ring-violet-400/30 outline-none transition-colors"
                      />
                    </div>

                    {/* Verified Badge Toggle & Platform Presets */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-outline text-xs">Centang Biru (Verified Badge)</span>
                        <button
                          type="button"
                          onClick={() => updateSP({ showVerifiedBadge: !sp.showVerifiedBadge })}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors border flex items-center gap-1 ${
                            sp.showVerifiedBadge
                              ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                              : 'bg-surface-container border-outline-variant/30 text-outline hover:text-on-surface'
                          }`}
                        >
                          {sp.showVerifiedBadge ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => updateSP({ showVerifiedBadge: !sp.showVerifiedBadge })}
                        className={`w-full py-2 px-2.5 rounded text-[11px] font-medium transition-all border flex items-center justify-between ${
                          sp.showVerifiedBadge
                            ? 'bg-blue-500/15 text-white border-blue-500/40 shadow-sm'
                            : 'bg-surface-container border-outline-variant/30 text-outline hover:bg-surface-bright'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 shrink-0 drop-shadow-sm">
                            <path
                              fill={sp.showVerifiedBadge ? (sp.verifiedBadgeColor || '#0095F6') : '#6B7280'}
                              d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.67-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"
                            />
                            <path
                              fill="#FFFFFF"
                              d="M10.54 16.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"
                            />
                          </svg>
                          <span className="font-semibold text-xs">Centang Biru Asli (Verified Rosette)</span>
                        </div>
                        <span className="text-[10px] text-blue-300 font-mono">
                          {sp.showVerifiedBadge ? 'Tampil' : 'Sembunyi'}
                        </span>
                      </button>

                      {sp.showVerifiedBadge && (
                        <div className="grid grid-cols-4 gap-1.5 pt-1">
                          {[
                            { label: 'Instagram', hex: '#0095F6' },
                            { label: 'Twitter / X', hex: '#1D9BF0' },
                            { label: 'TikTok', hex: '#20D5EC' },
                            { label: 'Gold VIP', hex: '#F59E0B' },
                          ].map((b) => (
                            <button
                              key={b.label}
                              type="button"
                              onClick={() => updateSP({ verifiedBadgeColor: b.hex })}
                              className={`py-1 px-1 rounded text-[10px] font-medium border flex items-center justify-center gap-1 transition-all ${
                                (sp.verifiedBadgeColor || '#0095F6').toLowerCase() === b.hex.toLowerCase()
                                  ? 'border-blue-400 bg-blue-500/20 text-white font-bold'
                                  : 'border-outline-variant/30 bg-surface-container text-outline hover:text-on-surface hover:bg-surface-bright'
                              }`}
                            >
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.hex }} />
                              <span className="truncate">{b.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Card Style Presets */}
                    <div className="space-y-1.5">
                      <span className="text-outline text-xs">Gaya Visual Header</span>
                      <div className="grid grid-cols-4 gap-1.5">
                        {([
                          { id: 'flat', label: 'Flat', icon: '▬' },
                          { id: 'glass', label: 'Glass', icon: '◈' },
                          { id: 'gradient', label: 'Gradien', icon: '◆' },
                          { id: 'neon', label: 'Neon', icon: '✦' },
                        ] as const).map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => updateSP({ cardStyle: s.id })}
                            className={`py-1.5 rounded text-[11px] font-medium transition-all ${
                              sp.cardStyle === s.id
                                ? s.id === 'neon'
                                  ? 'bg-violet-500/30 text-violet-300 border border-violet-400/50 shadow-[0_0_8px_rgba(139,92,246,0.4)]'
                                  : s.id === 'gradient'
                                  ? 'bg-gradient-to-r from-violet-600/40 to-fuchsia-500/40 text-white border border-violet-400/40'
                                  : s.id === 'glass'
                                  ? 'bg-white/10 backdrop-blur text-white border border-white/30'
                                  : 'bg-primary/20 text-primary border border-primary/40'
                                : 'bg-surface-container text-on-surface hover:bg-surface-bright border border-transparent'
                            }`}
                          >
                            {s.icon} {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* ═══ UKURAN & POSISI BINGKAI VIDEO (AREA TENGAH) ═══ */}
                    <div className="space-y-3 pt-2 border-t border-surface-container-high/40">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-violet-400">
                          <Maximize2 className="w-4 h-4" />
                          <span>Bingkai Video (Area Tengah)</span>
                        </div>
                        <span className="text-[10px] bg-violet-500/20 text-violet-300 font-mono font-bold px-2 py-0.5 rounded-full border border-violet-500/30">
                          {sp.videoFrameHeight ?? 66}% Tinggi
                        </span>
                      </div>

                      <p className="text-[11px] text-outline leading-relaxed">
                        Atur tinggi bingkai video serta geser posisinya ke bawah atau ke atas secara fleksibel.
                      </p>

                      {/* 1. Tinggi Bingkai Video Tengah */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-outline text-[11px]">
                          <span className="font-medium text-on-surface">Tinggi Bingkai Video</span>
                          <span className="font-mono text-violet-400 font-bold bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/30">
                            {sp.videoFrameHeight ?? 66}%
                          </span>
                        </div>
                        <input
                          aria-label="Tinggi Bingkai Video"
                          type="range"
                          min="20"
                          max="85"
                          step="1"
                          value={sp.videoFrameHeight ?? 66}
                          onChange={(e) => updateSP({ videoFrameHeight: Number(e.target.value) })}
                          className="w-full accent-violet-500 h-1.5 bg-surface-container-high rounded cursor-pointer"
                        />
                      </div>

                      {/* 2. Posisi Vertikal Bingkai (Sumbu Y - Bisa diatur ke bawah/ke atas) */}
                      <div className="space-y-1.5 pt-1.5 border-t border-surface-container-high/30">
                        <div className="flex items-center justify-between text-outline text-[11px]">
                          <span className="font-medium text-on-surface">Posisi Vertikal Bingkai (Sumbu Y)</span>
                          <span className="font-mono text-violet-400 font-bold bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/30">
                            {(sp.videoFrameOffsetY ?? 0) > 0
                              ? `+${sp.videoFrameOffsetY}% (Turun)`
                              : (sp.videoFrameOffsetY ?? 0) < 0
                              ? `${sp.videoFrameOffsetY}% (Naik)`
                              : '0% (Tengah)'}
                          </span>
                        </div>
                        <input
                          aria-label="Posisi Vertikal Bingkai Video"
                          type="range"
                          min="-20"
                          max="25"
                          step="1"
                          value={sp.videoFrameOffsetY ?? 0}
                          onChange={(e) => updateSP({ videoFrameOffsetY: Number(e.target.value) })}
                          className="w-full accent-violet-500 h-1.5 bg-surface-container-high rounded cursor-pointer"
                        />
                        <p className="text-[10px] text-outline/80 leading-relaxed pt-0.5">
                          ✓ Geser posisi bingkai video ke bawah atau ke atas secara bebas tanpa mengubah proporsi video.
                        </p>
                      </div>

                      {/* ═══ KONTROL GESER KIRI-KANAN (PAN X) & ZOOM VIDEO ═══ */}
                      <div className="space-y-2 pt-2 border-t border-surface-container-high/30">
                        <div className="flex items-center justify-between text-outline text-[11px]">
                          <span className="font-medium text-on-surface flex items-center gap-1.5">
                            <SlidersHorizontal className="w-3.5 h-3.5 text-violet-400" />
                            <span>Geser Video Kiri / Kanan (Pan X)</span>
                          </span>
                          <span className="font-mono text-violet-400 font-bold bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/30">
                            {(frame.offsetX || 0) > 0 ? `+${frame.offsetX}% (Kanan)` : (frame.offsetX || 0) < 0 ? `${frame.offsetX}% (Kiri)` : '0% (Tengah)'}
                          </span>
                        </div>
                        <input
                          aria-label="Geser Horizontal Video"
                          type="range"
                          min="-80"
                          max="80"
                          step="1"
                          value={frame.offsetX || 0}
                          onChange={(e) => onUpdateFrame({ ...frame, offsetX: Number(e.target.value) })}
                          className="w-full accent-violet-500 h-1.5 bg-surface-container-high rounded cursor-pointer"
                        />
                        <p className="text-[10px] text-outline/80 leading-relaxed pt-0.5">
                          ✓ Klik &amp; drag langsung video di kanvas preview untuk menggeser posisinya secara bebas ke kiri/kanan.
                        </p>
                      </div>

                      {/* Zoom / Skala Video */}
                      <div className="space-y-1.5 pt-1.5 border-t border-surface-container-high/20">
                        <div className="flex items-center justify-between text-outline text-[11px]">
                          <span className="font-medium text-on-surface">Skala / Zoom Video</span>
                          <span className="font-mono text-violet-400 font-bold bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/30">
                            {Math.round((frame.zoom || 1) * 100)}%
                          </span>
                        </div>
                        <input
                          aria-label="Skala Zoom Video"
                          type="range"
                          min="0.8"
                          max="2.5"
                          step="0.05"
                          value={frame.zoom || 1.0}
                          onChange={(e) => onUpdateFrame({ ...frame, zoom: Number(e.target.value) })}
                          className="w-full accent-violet-500 h-1.5 bg-surface-container-high rounded cursor-pointer"
                        />
                      </div>

                      {/* Posisi Vertikal Header & Footer (Sumbu Y - Tanpa Mengubah Ukuran Video) */}
                      <div className="space-y-2.5 pt-2 border-t border-surface-container-high/30">
                        {/* Posisi Vertikal Header (Sumbu Y) */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-outline text-[11px]">
                            <span className="font-medium text-on-surface">Posisi Vertikal Header (Sumbu Y)</span>
                            <span className="font-mono text-violet-400 font-bold bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/30">
                              {sp.headerPosY ?? 6}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="35"
                            step="1"
                            value={sp.headerPosY ?? 6}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateSP({ headerPosY: val });
                            }}
                            className="w-full accent-violet-500 h-1 bg-surface-container-high rounded cursor-pointer"
                          />
                        </div>

                        {/* Posisi Vertikal Footer (Sumbu Y) */}
                        <div className="space-y-1 pt-1.5 border-t border-surface-container-high/20">
                          <div className="flex items-center justify-between text-outline text-[11px]">
                            <span className="font-medium text-on-surface">Posisi Vertikal Footer (Sumbu Y)</span>
                            <span className="font-mono text-violet-400 font-bold bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/30">
                              {sp.footerPosY ?? 91}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="65"
                            max="96"
                            step="1"
                            value={sp.footerPosY ?? 91}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateSP({ footerPosY: val });
                            }}
                            className="w-full accent-violet-500 h-1 bg-surface-container-high rounded cursor-pointer"
                          />
                        </div>
                        <p className="text-[10px] text-outline/80 leading-relaxed pt-0.5">
                          ✓ Geser posisi vertikal header dan footer (atas/bawah) secara bebas tanpa memotong atau mengubah video. Bisa ditarik juga langsung di kanvas preview.
                        </p>
                      </div>

                      {/* Ukuran Div Pembungkus Header & Footer */}
                      <div className="space-y-3 pt-2 border-t border-surface-container-high/30">
                        <span className="text-outline text-xs font-medium">Ukuran Div Pembungkus Header & Footer</span>

                        {/* Slider Tinggi Div Pembungkus Header */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-outline text-[11px]">
                            <span className="font-medium text-on-surface">Tinggi Kotak Header</span>
                            <span className="font-mono text-violet-400 font-bold bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/30">
                              {sp.headerBarHeight ?? 48}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min="32"
                            max="80"
                            step="2"
                            value={sp.headerBarHeight ?? 48}
                            onChange={(e) => updateSP({ headerBarHeight: Number(e.target.value) })}
                            className="w-full accent-violet-500 h-1 bg-surface-container-high rounded cursor-pointer"
                          />
                        </div>

                        {/* Slider Tinggi Div Pembungkus Footer */}
                        <div className="space-y-1 pt-1 border-t border-surface-container-high/20">
                          <div className="flex items-center justify-between text-outline text-[11px]">
                            <span className="font-medium text-on-surface">Tinggi Kotak Footer</span>
                            <span className="font-mono text-violet-400 font-bold bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/30">
                              {sp.footerBarHeight ?? 34}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min="20"
                            max="64"
                            step="2"
                            value={sp.footerBarHeight ?? 34}
                            onChange={(e) => updateSP({ footerBarHeight: Number(e.target.value) })}
                            className="w-full accent-violet-500 h-1 bg-surface-container-high rounded cursor-pointer"
                          />
                        </div>

                        {/* Slider Margin Samping (Lebar/Inset) Pembungkus Header & Footer */}
                        <div className="space-y-1 pt-1 border-t border-surface-container-high/20">
                          <div className="flex items-center justify-between text-outline text-[11px]">
                            <span className="font-medium text-on-surface">Margin Samping Pembungkus</span>
                            <span className="font-mono text-violet-400 font-bold bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/30">
                              {sp.headerPaddingX || 0}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="48"
                            step="2"
                            value={sp.headerPaddingX || 0}
                            onChange={(e) => updateSP({ headerPaddingX: Number(e.target.value) })}
                            className="w-full accent-violet-500 h-1 bg-surface-container-high rounded cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Footer CTA Text */}
                      <div className="space-y-1 pt-1 border-t border-surface-container-high/30">
                        <span className="text-outline text-xs">Teks CTA Bawah</span>
                        <input
                          type="text"
                          value={sp.footerText}
                          onChange={(e) => updateSP({ footerText: e.target.value })}
                          placeholder="Follow for more! 🔥"
                          className="w-full px-2.5 py-1.5 rounded bg-surface-container border border-outline-variant/30 text-on-surface text-xs focus:border-violet-400 focus:ring-1 focus:ring-violet-400/30 outline-none transition-colors"
                        />
                      </div>

                      {/* Warna Latar & Gaya Kotak Frame Video */}
                      <div className="space-y-2 pt-2 border-t border-surface-container-high/30">
                        <span className="text-outline text-xs font-medium">Kustomisasi Kotak Frame Video</span>

                        {/* Pilihan Warna Background Kotak Frame */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-outline text-[11px]">
                            <span>Warna Latar Kotak Video</span>
                            <span className="font-mono text-on-surface text-[10px]">{sp.videoFrameBg || '#000000'}</span>
                          </div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {[
                              { label: 'Hitam', color: '#000000' },
                              { label: 'Dark Zinc', color: '#18181B' },
                              { label: 'Tema Kartu', color: sp.bgColor },
                              { label: 'Putih', color: '#FFFFFF' },
                            ].map((bg) => (
                              <button
                                key={bg.label}
                                type="button"
                                onClick={() => updateSP({ videoFrameBg: bg.color })}
                                className={`py-1 px-1 rounded text-[10px] font-medium border flex items-center justify-center gap-1 transition-all ${
                                  (sp.videoFrameBg || '#000000').toLowerCase() === bg.color.toLowerCase()
                                    ? 'border-violet-400 bg-violet-500/20 text-violet-300 font-bold'
                                    : 'border-outline-variant/30 bg-surface-container text-on-surface hover:bg-surface-bright'
                                }`}
                              >
                                <div className="w-2.5 h-2.5 rounded-full border border-white/30 shrink-0" style={{ backgroundColor: bg.color }} />
                                <span className="truncate">{bg.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Frame Inset (Garis Kanan Kiri) & Border Radius */}
                        <div className="space-y-2.5 pt-1">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-outline text-[11px]">
                              <span className="font-medium text-on-surface">Garis Kiri & Kanan (Jarak Samping)</span>
                              <span className="font-mono text-violet-400 font-bold bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/30">
                                {sp.framePadding || 0}px
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="48"
                              step="2"
                              value={sp.framePadding || 0}
                              onChange={(e) => updateSP({ framePadding: Number(e.target.value) })}
                              className="w-full accent-violet-500 h-1 bg-surface-container-high rounded cursor-pointer"
                            />
                            <p className="text-[10px] text-outline/80 leading-relaxed">
                              Tip: Garis kiri & kanan video juga bisa ditarik langsung di layar kanvas editor.
                            </p>
                          </div>

                          <div className="space-y-1.5 pt-1 border-t border-surface-container-high/20">
                            <div className="flex items-center justify-between text-outline text-[11px]">
                              <span>Lengkungan Sudut (Corner Radius)</span>
                              <span className="font-mono text-on-surface font-semibold">{sp.frameBorderRadius || 0}px</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="32"
                              step="2"
                              value={sp.frameBorderRadius || 0}
                              onChange={(e) => updateSP({ frameBorderRadius: Number(e.target.value) })}
                              className="w-full accent-violet-500 h-1 bg-surface-container-high rounded cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Colors */}
                    <div className="space-y-2 pt-1 border-t border-surface-container-high/30">
                      <span className="text-outline text-xs font-medium">Warna Template</span>
                      <div className="space-y-2">
                        <HexColorPicker label="Latar Belakang" value={sp.bgColor} onChange={(v) => updateSP({ bgColor: v })} />
                        <HexColorPicker label="Teks Nama" value={sp.textColor} onChange={(v) => updateSP({ textColor: v })} />
                        <HexColorPicker label="Teks Subtitle" value={sp.handleColor} onChange={(v) => updateSP({ handleColor: v })} />
                        <HexColorPicker label="Aksen (Badge/Btn)" value={sp.accentColor} onChange={(v) => updateSP({ accentColor: v })} />
                      </div>
                    </div>

                    {/* Quick Theme Presets */}
                    <div className="space-y-1.5 pt-1 border-t border-surface-container-high/30">
                      <span className="text-outline text-xs font-medium">Preset Tema Cepat</span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { label: 'Clean White', bg: '#FFFFFF', text: '#000000', handle: '#4B5563', accent: '#0095F6' },
                          { label: 'Midnight', bg: '#0F172A', text: '#FFFFFF', handle: '#94A3B8', accent: '#38BDF8' },
                          { label: 'Snow', bg: '#F8FAFC', text: '#0F172A', handle: '#64748B', accent: '#6366F1' },
                          { label: 'Sunset', bg: '#1C1917', text: '#FEF3C7', handle: '#D97706', accent: '#F59E0B' },
                          { label: 'Forest', bg: '#052E16', text: '#ECFDF5', handle: '#6EE7B7', accent: '#10B981' },
                          { label: 'Sakura', bg: '#1E1B2E', text: '#FDE8F0', handle: '#F9A8D4', accent: '#EC4899' },
                        ].map((t) => (
                          <button
                            key={t.label}
                            type="button"
                            onClick={() => updateSP({ bgColor: t.bg, textColor: t.text, handleColor: t.handle, accentColor: t.accent, verifiedBadgeColor: sp.verifiedBadgeColor || '#0095F6' })}
                            className="py-1.5 px-1 rounded text-[10px] font-medium transition-all border border-outline-variant/30 hover:border-violet-400/50 bg-surface-container hover:bg-surface-bright flex items-center gap-1.5"
                          >
                            <div className="flex -space-x-0.5 shrink-0">
                              <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: t.bg }} />
                              <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: t.accent }} />
                            </div>
                            <span>{t.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Zoom & Posisi Video di Template Social (Interaktif Cursor) */}
                    <div className="space-y-2.5 pt-2 border-t border-surface-container-high/40">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-400">
                          <Maximize2 className="w-4 h-4" />
                          <span>Ukuran & Posisi Klip Video</span>
                        </div>
                        {(frame.zoom !== 1 || (frame.offsetX || 0) !== 0 || (frame.offsetY || 0) !== 0) && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateFrame({
                                ...frame,
                                zoom: 1.0,
                                offsetX: 0,
                                offsetY: 0,
                              })
                            }
                            className="text-[10px] text-violet-400 hover:underline flex items-center gap-0.5"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            <span>Reset Posisi</span>
                          </button>
                        )}
                      </div>

                      {/* Interactive Gesture & Drag-to-Resize Zoom Control */}
                      <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-violet-300 text-xs font-bold">Zoom Interaktif</span>
                          <span className="font-mono text-xs text-violet-300 font-bold bg-violet-500/20 px-2 py-0.5 rounded-full border border-violet-500/30">
                            {Math.round((frame.zoom || 1) * 100)}% ({Number(frame.zoom || 1).toFixed(2)}x)
                          </span>
                        </div>

                        {/* Slider Zoom */}
                        <div className="space-y-1 pt-1">
                          <div className="flex justify-between text-outline text-xs">
                            <span>Skala Ukuran Video</span>
                            <span className="font-mono text-on-surface font-semibold">{Math.round((frame.zoom || 1) * 100)}%</span>
                          </div>
                          <input
                            aria-label="Skala Zoom Video Social"
                            type="range"
                            min="0.5"
                            max="2.5"
                            step="0.05"
                            value={frame.zoom || 1}
                            onChange={(e) => onUpdateFrame({ ...frame, zoom: Number(e.target.value) })}
                            className="w-full accent-violet-500 h-1 bg-surface-container-high rounded cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Pan Horizontal (X) */}
                      <div className="space-y-1 pt-1 border-t border-surface-container-high/30">
                        <div className="flex justify-between text-outline text-xs">
                          <span>Geser Horizontal (Pan X)</span>
                          <span className="font-mono text-on-surface font-semibold">
                            {(frame.offsetX || 0) > 0 ? `+${Math.round(frame.offsetX || 0)}` : Math.round(frame.offsetX || 0)}%
                          </span>
                        </div>
                        <input
                          aria-label="Pan Horizontal X"
                          type="range"
                          min="-85"
                          max="85"
                          step="1"
                          value={frame.offsetX || 0}
                          onChange={(e) => onUpdateFrame({ ...frame, offsetX: Number(e.target.value) })}
                          className="w-full accent-violet-500 h-1 bg-surface-container-high rounded cursor-pointer"
                        />
                      </div>

                      {/* Pan Vertikal (Y) */}
                      <div className="space-y-1 pt-1 border-t border-surface-container-high/30">
                        <div className="flex justify-between text-outline text-xs">
                          <span>Geser Vertikal (Pan Y)</span>
                          <span className="font-mono text-on-surface font-semibold">
                            {(frame.offsetY || 0) > 0 ? `+${Math.round(frame.offsetY || 0)}` : Math.round(frame.offsetY || 0)}%
                          </span>
                        </div>
                        <input
                          aria-label="Pan Vertikal Y"
                          type="range"
                          min="-60"
                          max="60"
                          step="1"
                          value={frame.offsetY || 0}
                          onChange={(e) => onUpdateFrame({ ...frame, offsetY: Number(e.target.value) })}
                          className="w-full accent-violet-500 h-1 bg-surface-container-high rounded cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Face Tracking & Camera Pan Settings (Mode Crop) */}
              {frame.mode === 'crop' && (
                <div className="space-y-3 pt-1 border-t border-surface-container-high/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                      <Cpu className="w-4 h-4" />
                      <span>AI Face Tracking & Auto-Framing</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {retrackMessage && (
                        <span className="text-[10px] text-green-400 font-semibold animate-fade-in">
                          {retrackMessage}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleRetrackFaces}
                        disabled={isRetracking}
                        className="py-1 px-2 rounded text-[10.5px] font-bold bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer shadow-xs active:scale-95"
                        title="Jalankan ulang deteksi AI untuk mencari pembicara dan menentukan pergantian kamera yang paling akurat"
                      >
                        <RefreshCw className={`w-3 h-3 ${isRetracking ? 'animate-spin' : ''}`} />
                        <span>{isRetracking ? 'Menganalisis...' : '🔄 Sinkronkan AI'}</span>
                      </button>
                    </div>
                  </div>

                  {/* 1. PILIHAN MODE TRACKING KAMERA (AUTO-SWITCH vs SMOOTH FOLLOW vs STATIC LOCK) */}
                  <div className="space-y-1.5">
                    <span className="text-outline text-xs font-medium">Mode Gerakan Kamera AI:</span>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (!frame.speakerShots || frame.speakerShots.length === 0) {
                            generateSpeechSyncedShots('balanced');
                          } else {
                            onUpdateFrame({
                              ...frame,
                              trackingMode: 'auto_switch',
                              faceTracking: true,
                            });
                          }
                        }}
                        className={`py-1.5 px-1.5 rounded text-[10.5px] font-semibold transition-all border flex flex-col items-center justify-center text-center cursor-pointer ${
                          frame.trackingMode === 'auto_switch'
                            ? 'bg-primary/25 text-primary border-primary shadow-xs font-bold'
                            : 'bg-surface-container text-outline hover:text-on-surface border-outline-variant/30 hover:bg-surface-bright'
                        }`}
                        title="Otomatis berganti sudut kamera antara Host dan Guest saat bergantian bicara"
                      >
                        <span className="font-bold">🎯 Auto-Switch</span>
                        <span className="text-[8.5px] opacity-75">Multi-Cam Cut</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const dur = clip ? Math.max(5, (clip.end_sec - clip.start_sec)) : 30;
                          const primarySpk = frame.detectedSpeakers?.find((s) => s.is_primary) || frame.detectedSpeakers?.[0];
                          const targetX = primarySpk ? primarySpk.offset_x : (frame.offsetX || 0);

                          let kfs = frame.trackingKeyframes;
                          const hasMiddleDrift = kfs && kfs.some((k) => Math.abs(k.offsetX) < 5.0 && Math.abs(targetX) > 15.0);
                          if (!kfs || kfs.length === 0 || hasMiddleDrift) {
                            kfs = [
                              { time: 0, offsetX: targetX },
                              { time: Math.round(dur * 0.5 * 10) / 10, offsetX: targetX },
                              { time: Math.round(dur * 10) / 10, offsetX: targetX },
                            ];
                          }
                          onUpdateFrame({
                            ...frame,
                            offsetX: targetX,
                            trackingMode: 'smooth_follow',
                            trackingKeyframes: kfs,
                            faceTracking: true,
                          });
                        }}
                        className={`py-1.5 px-1.5 rounded text-[10.5px] font-semibold transition-all border flex flex-col items-center justify-center text-center cursor-pointer ${
                          frame.trackingMode === 'smooth_follow'
                            ? 'bg-primary/25 text-primary border-primary shadow-xs font-bold'
                            : 'bg-surface-container text-outline hover:text-on-surface border-outline-variant/30 hover:bg-surface-bright'
                        }`}
                        title="Kamera bergerak halus mengikuti orang yang paling terlihat jelas"
                      >
                        <span className="font-bold">🎥 Follow</span>
                        <span className="text-[8.5px] opacity-75">Kamera Halus</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const primarySpk = frame.detectedSpeakers?.find((s) => s.is_primary) || frame.detectedSpeakers?.[0];
                          const targetX = (frame.offsetX && Math.abs(frame.offsetX) > 3.0)
                            ? frame.offsetX
                            : (primarySpk ? primarySpk.offset_x : (frame.offsetX || 0));
                          onUpdateFrame({
                            ...frame,
                            offsetX: targetX,
                            trackingMode: 'static',
                            faceTracking: true,
                          });
                        }}
                        className={`py-1.5 px-1.5 rounded text-[10.5px] font-semibold transition-all border flex flex-col items-center justify-center text-center cursor-pointer ${
                          (!frame.trackingMode || frame.trackingMode === 'static')
                            ? 'bg-primary/25 text-primary border-primary shadow-xs font-bold'
                            : 'bg-surface-container text-outline hover:text-on-surface border-outline-variant/30 hover:bg-surface-bright'
                        }`}
                        title="Kamera mengunci satu posisi pembicara yang paling terlihat"
                      >
                        <span className="font-bold">🔒 Lock</span>
                        <span className="text-[8.5px] opacity-75">Sudut Statis</span>
                      </button>
                    </div>
                  </div>

                  {/* 2. MULTI-CAM AUTO-SWITCH CUT SUITE (EDITOR POTONGAN KAMERA OTOMATIS) */}
                  {frame.trackingMode === 'auto_switch' && (() => {
                    const dur = clip ? Math.max(3, clip.end_sec - clip.start_sec) : 30;
                    const inPoint = clip ? Math.max(0, clip.start_sec - (clip.preview_start_sec ?? 0)) : 0;
                    const currentRelSec = Math.max(0, currentTime - inPoint);
                    const shots = frame.speakerShots || [];
                    const activeIdx = shots.findIndex((s) => currentRelSec >= s.start && currentRelSec < s.end);
                    const activeShot = activeIdx !== -1 ? shots[activeIdx] : shots[shots.length - 1];

                    const spks = (frame.detectedSpeakers && frame.detectedSpeakers.length >= 2)
                      ? frame.detectedSpeakers
                      : [
                          { id: 1, label: 'Pembicara Kiri', offset_x: -25.0 },
                          { id: 2, label: 'Pembicara Kanan', offset_x: 25.0 },
                        ];

                    return (
                      <div className="space-y-2.5 p-3 rounded-lg bg-surface-container border border-primary/30 shadow-sm">
                        {/* Header & Status Aktif Real-Time */}
                        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                            <span className="font-semibold text-xs text-on-surface">
                              Multi-Cam Auto-Switch ({shots.length} Cut)
                            </span>
                          </div>
                          {activeShot && (
                            <span className="text-[10px] font-mono font-bold bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/30 truncate max-w-[170px]">
                              🔴 {activeShot.label} ({activeShot.offsetX > 0 ? `+${Math.round(activeShot.offsetX)}` : Math.round(activeShot.offsetX)}%)
                            </span>
                          )}
                        </div>

                        {/* Pilihan Ritme / Cadence Pergantian Kamera */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-outline font-medium">Ritme Pergantian Kamera:</span>
                            <span className="text-[9.5px] text-primary/80 font-mono">Sinkron Subtitle</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            <button
                              type="button"
                              onClick={() => generateSpeechSyncedShots('fast')}
                              className="py-1 px-1.5 rounded text-[10px] font-semibold border transition-all bg-surface-container-high hover:bg-surface-bright text-on-surface border-outline-variant/30 flex items-center justify-center gap-1 cursor-pointer"
                              title="Pergantian kamera lebih sering dan responsif (~3 detik per shot)"
                            >
                              <Zap className="w-3 h-3 text-amber-400" />
                              <span>⚡ Dinamis (~3s)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => generateSpeechSyncedShots('balanced')}
                              className="py-1 px-1.5 rounded text-[10px] font-semibold border transition-all bg-surface-container-high hover:bg-surface-bright text-on-surface border-outline-variant/30 flex items-center justify-center gap-1 cursor-pointer"
                              title="Ritme seimbang standar podcast (~5 detik per shot)"
                            >
                              <Activity className="w-3 h-3 text-primary" />
                              <span>⚖️ Seimbang (~5s)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => generateSpeechSyncedShots('relaxed')}
                              className="py-1 px-1.5 rounded text-[10px] font-semibold border transition-all bg-surface-container-high hover:bg-surface-bright text-on-surface border-outline-variant/30 flex items-center justify-center gap-1 cursor-pointer"
                              title="Sudut kamera lebih tenang, hanya beralih saat topik selesai (~8 detik per shot)"
                            >
                              <Clock className="w-3 h-3 text-secondary" />
                              <span>🧘 Santai (~8s)</span>
                            </button>
                          </div>
                        </div>

                        {/* Tombol Aksi Cepat: Potong Kamera di Detik Ini & Sinkronkan Ulang */}
                        <div className="grid grid-cols-2 gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={handleAddCutAtCurrentTime}
                            className="py-1.5 px-2 rounded bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 text-[10.5px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                            title={`Potong sudut kamera di detik ${currentRelSec.toFixed(1)}s (waktu pemutaran saat ini)`}
                          >
                            <Scissors className="w-3.5 h-3.5" />
                            <span>✂️ Potong di {currentRelSec.toFixed(1)}s</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => generateSpeechSyncedShots('balanced')}
                            className="py-1.5 px-2 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface border border-outline-variant/30 text-[10.5px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                            title="Otomatis menyusun ulang potongan kamera di setiap jeda kalimat subtitle"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-primary" />
                            <span>🔄 Susun dari Subtitle</span>
                          </button>
                        </div>

                        {/* Daftar Potongan Kamera Interaktif */}
                        <div className="space-y-1.5 pt-1 border-t border-outline-variant/20">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-on-surface flex items-center gap-1">
                              <Layers className="w-3.5 h-3.5 text-primary" />
                              <span>Daftar Potongan Kamera</span>
                            </span>
                            <span className="text-[10px] text-outline">Klik shot untuk lompat</span>
                          </div>

                          <div className="space-y-1 max-h-48 overflow-y-auto pr-0.5 custom-scrollbar">
                            {shots.map((sh, idx) => {
                              const isActive = idx === activeIdx;
                              const shDur = Math.max(0.1, sh.end - sh.start).toFixed(1);

                              return (
                                <div
                                  key={idx}
                                  className={`p-2 rounded-lg border transition-all text-xs flex items-center justify-between gap-2 ${
                                    isActive
                                      ? 'bg-primary/15 border-primary shadow-xs ring-1 ring-primary/30'
                                      : 'bg-surface-container-high/60 border-outline-variant/20 hover:bg-surface-container-high'
                                  }`}
                                >
                                  {/* Info Timing & Tombol Seek */}
                                  <button
                                    type="button"
                                    onClick={() => onSeek?.(inPoint + sh.start)}
                                    className="flex items-center gap-2 text-left shrink-0 cursor-pointer group"
                                    title={`Klik untuk melompat ke detik ${sh.start.toFixed(1)}s`}
                                  >
                                    <div
                                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                        isActive ? 'bg-primary text-on-primary' : 'bg-surface-container text-outline group-hover:bg-primary/20 group-hover:text-primary'
                                      }`}
                                    >
                                      {idx + 1}
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="font-mono font-bold text-[11px] text-on-surface flex items-center gap-1">
                                        <span>{sh.start.toFixed(1)}s - {sh.end.toFixed(1)}s</span>
                                        <span className="text-[9px] text-outline font-normal">({shDur}s)</span>
                                      </span>
                                      {isActive && (
                                        <span className="text-[9px] text-emerald-400 font-semibold flex items-center gap-0.5">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                          <span>Sedang Tayang</span>
                                        </span>
                                      )}
                                    </div>
                                  </button>

                                  {/* Dropdown Pemilih Pembicara Target untuk Shot Ini */}
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      aria-label={`Target Pembicara Shot ${idx + 1}`}
                                      value={sh.speakerId}
                                      onChange={(e) => handleChangeShotSpeaker(idx, Number(e.target.value))}
                                      className="px-2 py-1 rounded bg-surface-container border border-outline-variant/30 text-on-surface text-[11px] font-medium outline-none focus:border-primary cursor-pointer max-w-[135px] truncate"
                                    >
                                      {spks.map((spk) => (
                                        <option key={spk.id} value={spk.id}>
                                          {spk.label} ({spk.offset_x > 0 ? `+${Math.round(spk.offset_x)}` : Math.round(spk.offset_x)}%)
                                        </option>
                                      ))}
                                    </select>

                                    {/* Tombol Hapus Cut (Gabungkan ke shot sebelumnya) */}
                                    {shots.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteShot(idx)}
                                        className="p-1 rounded text-outline hover:text-error hover:bg-error/15 transition-colors cursor-pointer"
                                        title="Hapus potongan ini (durasi akan digabung ke potongan sebelumnya)"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Fine-Tuning Posisi Duduk Masing-Masing Pembicara */}
                        <div className="space-y-2 pt-2 border-t border-outline-variant/20">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-on-surface flex items-center gap-1.5">
                              <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                              <span>Koreksi Posisi Kamera Pembicara</span>
                            </span>
                            <span className="text-[9px] text-outline">Atur centering wajah</span>
                          </div>

                          <div className="space-y-2">
                            {spks.map((spk) => (
                              <div key={spk.id} className="space-y-1 bg-surface-container-high/40 p-2 rounded-lg border border-outline-variant/20">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-medium text-on-surface flex items-center gap-1">
                                    <span>👤 {spk.label}</span>
                                    {spk.is_primary && (
                                      <span className="text-[8px] bg-amber-400/20 text-amber-300 px-1 py-0.2 rounded font-bold">
                                        Utama
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-mono text-primary font-bold text-xs bg-surface-container px-1.5 py-0.2 rounded border border-outline-variant/20">
                                    {spk.offset_x > 0 ? `+${Math.round(spk.offset_x)}` : Math.round(spk.offset_x)}%
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] text-outline font-mono">Kiri</span>
                                  <input
                                    aria-label={`Offset ${spk.label}`}
                                    type="range"
                                    min="-60"
                                    max="60"
                                    step="1"
                                    value={spk.offset_x || 0}
                                    onChange={(e) => handleUpdateSpeakerOffset(spk.id, Number(e.target.value))}
                                    className="w-full accent-primary h-1 bg-surface-container-high rounded cursor-pointer"
                                  />
                                  <span className="text-[9px] text-outline font-mono">Kanan</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}



                  {/* 3. SMOOTH FOLLOW INFO CARD */}
                  {frame.trackingMode === 'smooth_follow' && (
                    <div className="p-2.5 rounded bg-primary/10 border border-primary/25 text-[11px] text-primary space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>Kamera Mengikuti Gerakan Wajah:</span>
                      </div>
                      <p className="text-[10.5px] text-outline leading-relaxed">
                        {frame.trackingKeyframes && frame.trackingKeyframes.length > 2
                          ? `Kamera 9:16 aktif melacak posisi wajah pembicara secara mulus (${frame.trackingKeyframes.length} titik koordinat AI) dengan peredam getar.`
                          : 'Kamera 9:16 mengikuti pergerakan posisi wajah pembicara secara halus.'}
                      </p>
                    </div>
                  )}



                  {/* 4. SKALA ZOOM WAJAH (SLIDER 100% - 200%) */}
                  <div className="space-y-1.5 pt-1.5 border-t border-surface-container-high/30">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        <span className="text-outline font-medium">Skala Zoom Wajah</span>
                      </div>
                      <span className="font-mono text-xs text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                        {Math.round((frame.zoom || 1.0) * 100)}% ({Number(frame.zoom || 1.0).toFixed(2)}x)
                      </span>
                    </div>

                    <input
                      aria-label="Skala Zoom Wajah"
                      type="range"
                      min="1.0"
                      max="2.0"
                      step="0.05"
                      value={frame.zoom || 1.0}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        onUpdateFrame({
                          ...frame,
                          zoom: val,
                          autoZoomCloseUp: val > 1.05,
                        });
                      }}
                      className="w-full accent-primary h-1.5 bg-surface-container-high rounded cursor-pointer"
                    />
                  </div>

                  {/* Horizontal Pan (Fokus Kiri / Kanan) - HANYA PADA MODE STATIS / MANUAL */}
                  {(!frame.trackingMode || frame.trackingMode === 'static') && (
                    <div className="space-y-1.5 pt-1 border-t border-surface-container-high/30">
                      <div className="flex justify-between text-outline text-xs">
                        <span className="font-medium text-on-surface">Koreksi Kamera Manual (Pan X)</span>
                        <span className="font-mono text-on-surface font-semibold">
                          {(frame.offsetX || 0) > 0 ? `+${Math.round(frame.offsetX || 0)}` : Math.round(frame.offsetX || 0)}%
                        </span>
                      </div>

                      <input
                        aria-label="Horizontal Camera Pan"
                        type="range"
                        min="-85"
                        max="85"
                        step="1"
                        value={frame.offsetX || 0}
                        onChange={(e) => onUpdateFrame({ ...frame, offsetX: Number(e.target.value) })}
                        className="w-full accent-primary h-1 bg-surface-container-high rounded cursor-pointer"
                      />
                    </div>
                  )}

                  {/* Vertical Pan (Headroom Y) */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-outline text-xs">
                      <span>Ruang Kepala Vertikal (Headroom Y)</span>
                      <span className="font-mono text-on-surface font-semibold">
                        {(frame.offsetY || 0) > 0 ? `+${Math.round(frame.offsetY || 0)}` : Math.round(frame.offsetY || 0)}%
                      </span>
                    </div>
                    <input
                      aria-label="Vertical Camera Pan"
                      type="range"
                      min="-60"
                      max="60"
                      step="1"
                      value={frame.offsetY || 0}
                      onChange={(e) => onUpdateFrame({ ...frame, offsetY: Number(e.target.value) })}
                      className="w-full accent-primary h-1 bg-surface-container-high rounded"
                    />
                  </div>
                </div>
              )}

              {/* Fit + Blur Controls: Zoom, Pan X, Pan Y, Blur Level */}
              {frame.mode === 'fit_blur' && (
                <div className="space-y-3 pt-1 border-t border-surface-container-high/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                      <Layers className="w-4 h-4" />
                      <span>Pengaturan Fit + Blur (Zoom & Posisi)</span>
                    </div>
                    {(frame.zoom !== 1 || (frame.offsetX || 0) !== 0 || (frame.offsetY || 0) !== 0 || (frame.blur || 24) !== 24) && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateFrame({
                            ...frame,
                            zoom: 1.0,
                            offsetX: 0,
                            offsetY: 0,
                            blur: 24,
                          })
                        }
                        className="text-[10px] text-tertiary hover:underline flex items-center gap-0.5"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>Reset Fit</span>
                      </button>
                    )}
                  </div>

                  {/* 1. Zoom Slider */}
                  <div className="space-y-1.5 pt-1.5 border-t border-surface-container-high/30">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-outline font-medium">Skala Zoom Video</span>
                      <span className="font-mono text-xs text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                        {Math.round((frame.zoom || 1.0) * 100)}% ({Number(frame.zoom || 1.0).toFixed(2)}x)
                      </span>
                    </div>
                    <input
                      aria-label="Skala Zoom Video"
                      type="range"
                      min="0.5"
                      max="2.5"
                      step="0.05"
                      value={frame.zoom || 1.0}
                      onChange={(e) => onUpdateFrame({ ...frame, zoom: Number(e.target.value) })}
                      className="w-full accent-primary h-1.5 bg-surface-container-high rounded cursor-pointer"
                    />
                  </div>

                  {/* 2. Vertical Pan Y (Posisi Atas / Bawah) */}
                  <div className="space-y-1.5 pt-1 border-t border-surface-container-high/30">
                    <div className="flex justify-between text-outline text-xs">
                      <span>Posisi Vertikal Video (Offset Y)</span>
                      <span className="font-mono text-on-surface font-semibold">
                        {(frame.offsetY || 0) > 0 ? `+${Math.round(frame.offsetY || 0)}` : Math.round(frame.offsetY || 0)}%
                      </span>
                    </div>
                    <input
                      aria-label="Vertical Pan Y"
                      type="range"
                      min="-60"
                      max="60"
                      step="1"
                      value={frame.offsetY || 0}
                      onChange={(e) => onUpdateFrame({ ...frame, offsetY: Number(e.target.value) })}
                      className="w-full accent-primary h-1 bg-surface-container-high rounded cursor-pointer"
                    />
                  </div>

                  {/* 3. Horizontal Pan X (Posisi Kiri / Kanan) */}
                  <div className="space-y-1.5 pt-1 border-t border-surface-container-high/30">
                    <div className="flex justify-between text-outline text-xs">
                      <span>Posisi Horizontal Video (Pan X)</span>
                      <span className="font-mono text-on-surface font-semibold">
                        {(frame.offsetX || 0) > 0 ? `+${Math.round(frame.offsetX || 0)}` : Math.round(frame.offsetX || 0)}%
                      </span>
                    </div>
                    <input
                      aria-label="Horizontal Pan X"
                      type="range"
                      min="-85"
                      max="85"
                      step="1"
                      value={frame.offsetX || 0}
                      onChange={(e) => onUpdateFrame({ ...frame, offsetX: Number(e.target.value) })}
                      className="w-full accent-primary h-1 bg-surface-container-high rounded cursor-pointer"
                    />
                  </div>

                  {/* 4. Blur Level */}
                  <div className="space-y-1.5 pt-1 border-t border-surface-container-high/30">
                    <div className="flex justify-between text-outline text-xs">
                      <span>Intensitas Blur Latar Frame</span>
                      <span className="font-mono text-on-surface font-semibold">{frame.blur || 24}px</span>
                    </div>
                    <input
                      aria-label="Background Blur Intensity"
                      type="range"
                      min="5"
                      max="60"
                      value={frame.blur || 24}
                      onChange={(e) => onUpdateFrame({ ...frame, blur: Number(e.target.value) })}
                      className="w-full accent-primary h-1 bg-surface-container-high rounded cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Fit Warna Controls: Background Color, Zoom, Pan X & Pan Y */}
              {frame.mode === 'fit' && (
                <div className="space-y-3 pt-1 border-t border-surface-container-high/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                      <Maximize2 className="w-4 h-4" />
                      <span>Pengaturan Fit Warna (Background & Posisi)</span>
                    </div>
                    {(frame.zoom !== 1 ||
                      (frame.offsetX || 0) !== 0 ||
                      (frame.offsetY || 0) !== 0 ||
                      (frame.fitColor && frame.fitColor.toUpperCase() !== '#000000')) && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateFrame({
                            ...frame,
                            zoom: 1.0,
                            offsetX: 0,
                            offsetY: 0,
                            fitColor: '#000000',
                          })
                        }
                        className="text-[10px] text-tertiary hover:underline flex items-center gap-0.5"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>Reset Fit</span>
                      </button>
                    )}
                  </div>

                  {/* 1. Pemilih Warna Latar Belakang (Fit Background Color) */}
                  <div className="space-y-2 pt-1 border-t border-surface-container-high/30">
                    <HexColorPicker
                      label="Warna Latar Belakang (Background)"
                      value={frame.fitColor || '#000000'}
                      onChange={(val) => onUpdateFrame({ ...frame, fitColor: val })}
                    />

                    {/* Preset Warna Populer */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-outline shrink-0">Preset:</span>
                      {[
                        { label: 'Hitam', color: '#000000' },
                        { label: 'Putih', color: '#FFFFFF' },
                        { label: 'Abu Slate', color: '#1E293B' },
                        { label: 'Biru Navy', color: '#0F172A' },
                        { label: 'Biru Cyan', color: '#083344' },
                        { label: 'Ungu Dark', color: '#2E1065' },
                      ].map((p) => {
                        const active = (frame.fitColor || '#000000').toUpperCase() === p.color.toUpperCase();
                        return (
                          <button
                            key={p.color}
                            type="button"
                            onClick={() => onUpdateFrame({ ...frame, fitColor: p.color })}
                            className={`w-5 h-5 rounded-full border transition-all ${
                              active ? 'ring-2 ring-primary scale-110 border-white' : 'border-outline-variant/50 hover:scale-105'
                            }`}
                            style={{ backgroundColor: p.color }}
                            title={p.label}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Zoom Slider */}
                  <div className="space-y-1.5 pt-1 border-t border-surface-container-high/30">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-outline font-medium">Skala Zoom Video</span>
                      <span className="font-mono text-xs text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                        {Math.round((frame.zoom || 1.0) * 100)}% ({Number(frame.zoom || 1.0).toFixed(2)}x)
                      </span>
                    </div>
                    <input
                      aria-label="Skala Zoom Video"
                      type="range"
                      min="0.5"
                      max="2.5"
                      step="0.05"
                      value={frame.zoom || 1.0}
                      onChange={(e) => onUpdateFrame({ ...frame, zoom: Number(e.target.value) })}
                      className="w-full accent-primary h-1.5 bg-surface-container-high rounded cursor-pointer"
                    />
                  </div>

                  {/* 3. Horizontal Pan X */}
                  <div className="space-y-1.5 pt-1 border-t border-surface-container-high/30">
                    <div className="flex justify-between text-outline text-xs">
                      <span>Posisi Horizontal Video (Offset X)</span>
                      <span className="font-mono text-on-surface font-semibold">
                        {(frame.offsetX || 0) > 0 ? `+${Math.round(frame.offsetX || 0)}` : Math.round(frame.offsetX || 0)}%
                      </span>
                    </div>
                    <input
                      aria-label="Horizontal Pan X"
                      type="range"
                      min="-60"
                      max="60"
                      step="1"
                      value={frame.offsetX || 0}
                      onChange={(e) => onUpdateFrame({ ...frame, offsetX: Number(e.target.value) })}
                      className="w-full accent-primary h-1 bg-surface-container-high rounded cursor-pointer"
                    />
                  </div>

                  {/* 4. Vertical Pan Y */}
                  <div className="space-y-1.5 pt-1 border-t border-surface-container-high/30">
                    <div className="flex justify-between text-outline text-xs">
                      <span>Posisi Vertikal Video (Offset Y)</span>
                      <span className="font-mono text-on-surface font-semibold">
                        {(frame.offsetY || 0) > 0 ? `+${Math.round(frame.offsetY || 0)}` : Math.round(frame.offsetY || 0)}%
                      </span>
                    </div>
                    <input
                      aria-label="Vertical Pan Y"
                      type="range"
                      min="-60"
                      max="60"
                      step="1"
                      value={frame.offsetY || 0}
                      onChange={(e) => onUpdateFrame({ ...frame, offsetY: Number(e.target.value) })}
                      className="w-full accent-primary h-1 bg-surface-container-high rounded cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* OPENCUT FEATURE: COLOR GRADING & ENHANCEMENTS */}
              <div className="space-y-2 pt-2 border-t border-surface-container-high/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
                    <SunMedium className="w-3.5 h-3.5 text-tertiary" />
                    <span>Kualitas Warna Video (Color Grading)</span>
                  </div>
                  {(frame.brightness !== 1 || frame.contrast !== 1 || frame.saturation !== 1) && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateFrame({
                          ...frame,
                          brightness: 1.0,
                          contrast: 1.0,
                          saturation: 1.0,
                        })
                      }
                      className="text-[10px] text-tertiary hover:underline"
                    >
                      Reset Warna
                    </button>
                  )}
                </div>

                {/* Brightness */}
                <div className="space-y-1">
                  <div className="flex justify-between text-outline text-[11px]">
                    <span>Kecerahan (Brightness)</span>
                    <span className="font-mono text-on-surface">{Math.round((frame.brightness ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="1.25"
                    step="0.01"
                    value={frame.brightness ?? 1}
                    onChange={(e) => onUpdateFrame({ ...frame, brightness: Number(e.target.value) })}
                    className="w-full accent-primary h-1 bg-surface-container-high rounded"
                  />
                </div>

                {/* Contrast */}
                <div className="space-y-1">
                  <div className="flex justify-between text-outline text-[11px]">
                    <span>Kontras (Contrast)</span>
                    <span className="font-mono text-on-surface">{Math.round((frame.contrast ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="1.3"
                    step="0.01"
                    value={frame.contrast ?? 1}
                    onChange={(e) => onUpdateFrame({ ...frame, contrast: Number(e.target.value) })}
                    className="w-full accent-primary h-1 bg-surface-container-high rounded"
                  />
                </div>

                {/* Saturation */}
                <div className="space-y-1">
                  <div className="flex justify-between text-outline text-[11px]">
                    <span>Saturasi Warna (Saturation)</span>
                    <span className="font-mono text-on-surface">{Math.round((frame.saturation ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.02"
                    value={frame.saturation ?? 1}
                    onChange={(e) => onUpdateFrame({ ...frame, saturation: Number(e.target.value) })}
                    className="w-full accent-primary h-1 bg-surface-container-high rounded"
                  />
                </div>
              </div>

              {/* FITUR RETENSI VIDEO */}
              <div className="space-y-3 pt-2 border-t border-surface-container-high/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <span>Fitur Retensi Video</span>
                  </div>
                  <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-mono font-semibold">
                    Short-Form
                  </span>
                </div>

                {/* 1. KECEPATAN PUTAR (RETIME / SPEED) */}
                <div className="bg-surface-container p-2.5 rounded-lg space-y-2 border border-outline-variant/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs font-semibold text-on-surface">
                      <Gauge className="w-3.5 h-3.5 text-amber-400" />
                      <span>Kecepatan Video (Retime)</span>
                    </div>
                    <span className="font-mono text-primary font-bold text-xs">{frame.speed || 1.0}x</span>
                  </div>
                  <p className="text-outline text-[10px] leading-tight">
                    Percepat klip (1.1x–1.25x) untuk tempo bicara lebih padat & retensi penonton tinggi tanpa mengubah nada suara (pitch terjaga).
                  </p>
                  <div className="grid grid-cols-5 gap-1">
                    {[
                      { val: 0.75, lbl: '0.75x' },
                      { val: 1.0, lbl: '1.0x' },
                      { val: 1.1, lbl: '1.1x' },
                      { val: 1.25, lbl: '1.25x' },
                      { val: 1.5, lbl: '1.5x' },
                    ].map((s) => (
                      <button
                        key={s.val}
                        type="button"
                        onClick={() => onUpdateFrame({ ...frame, speed: s.val })}
                        className={`py-1 rounded text-[11px] font-semibold transition-colors border ${
                          (frame.speed || 1.0) === s.val
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 font-bold'
                            : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface hover:bg-surface-bright'
                        }`}
                      >
                        {s.lbl}
                      </button>
                    ))}
                  </div>
                  <input
                    aria-label="Kecepatan Putar Video"
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={frame.speed || 1.0}
                    onChange={(e) => onUpdateFrame({ ...frame, speed: Number(e.target.value) })}
                    className="w-full accent-amber-400 h-1 bg-surface-container-high rounded"
                  />
                </div>

                {/* 2. DYNAMIC RETENTION PROGRESS BAR */}
                <div className="bg-surface-container p-2.5 rounded-lg space-y-2 border border-outline-variant/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
                      <Activity className="w-3.5 h-3.5 text-sky-400" />
                      <span>Garis Durasi Klip (Progress Bar)</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(frame.progressBar?.enabled)}
                        onChange={(e) =>
                          onUpdateFrame({
                            ...frame,
                            progressBar: {
                              enabled: e.target.checked,
                              color: frame.progressBar?.color || '#38BDF8',
                              height: frame.progressBar?.height || 4,
                              position: frame.progressBar?.position || 'bottom',
                            },
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4.5 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-sky-500"></div>
                    </label>
                  </div>

                  <p className="text-outline text-[10px] leading-tight">
                    Garis animasi di tepi video yang bertambah seiring durasi klip, meningkatkan viewer completion rate di Reels & TikTok.
                  </p>

                  {frame.progressBar?.enabled && (
                    <div className="space-y-2 pt-1 border-t border-surface-container-high/30">
                      <div className="flex items-center justify-between">
                        <span className="text-outline text-[11px]">Warna Progress Bar:</span>
                        <div className="flex items-center gap-1.5">
                          {[
                            { hex: '#38BDF8', label: 'Cyan' },
                            { hex: '#EF4444', label: 'Merah' },
                            { hex: '#F59E0B', label: 'Emas' },
                            { hex: '#22C55E', label: 'Hijau' },
                            { hex: '#FFFFFF', label: 'Putih' },
                          ].map((c) => (
                            <button
                              key={c.hex}
                              type="button"
                              onClick={() =>
                                onUpdateFrame({
                                  ...frame,
                                  progressBar: { ...frame.progressBar!, color: c.hex },
                                })
                              }
                              className={`w-5 h-5 rounded-full border transition-all ${
                                (frame.progressBar?.color || '#38BDF8').toUpperCase() === c.hex
                                  ? 'border-white ring-2 ring-sky-400/50 scale-110'
                                  : 'border-white/20 hover:scale-105'
                              }`}
                              style={{ backgroundColor: c.hex }}
                              title={c.label}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-outline text-[10px] block mb-1">Ketebalan Bar:</span>
                          <div className="grid grid-cols-3 gap-1">
                            {[2, 4, 6].map((h) => (
                              <button
                                key={h}
                                type="button"
                                onClick={() =>
                                  onUpdateFrame({
                                    ...frame,
                                    progressBar: { ...frame.progressBar!, height: h },
                                  })
                                }
                                className={`py-1 rounded text-[10px] font-semibold transition-colors border ${
                                  (frame.progressBar?.height || 4) === h
                                    ? 'bg-sky-500/20 text-sky-400 border-sky-400/40'
                                    : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface hover:bg-surface-bright'
                                }`}
                              >
                                {h}px
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="text-outline text-[10px] block mb-1">Posisi Bar:</span>
                          <div className="grid grid-cols-2 gap-1">
                            {(['bottom', 'top'] as const).map((pos) => (
                              <button
                                key={pos}
                                type="button"
                                onClick={() =>
                                  onUpdateFrame({
                                    ...frame,
                                    progressBar: { ...frame.progressBar!, position: pos },
                                  })
                                }
                                className={`py-1 rounded text-[10px] font-semibold transition-colors border ${
                                  (frame.progressBar?.position || 'bottom') === pos
                                    ? 'bg-sky-500/20 text-sky-400 border-sky-400/40'
                                    : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface hover:bg-surface-bright'
                                }`}
                              >
                                {pos === 'bottom' ? 'Bawah' : 'Atas'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* Reset Frame */}
              <button
                onClick={() =>
                  onUpdateFrame({
                    ratio: '9:16',
                    mode: 'crop',
                    zoom: 1.0,
                    offsetX: 0,
                    offsetY: 0,
                    blur: 24,
                    faceTracking: true,
                    splitTopOffsetX: -25,
                    splitBottomOffsetX: 25,
                    splitTopOffsetY: 0,
                    splitBottomOffsetY: 0,
                    splitTopZoom: 1.0,
                    splitBottomZoom: 1.0,
                    splitRatio: 50,
                    splitDividerWidth: 2,
                    splitDividerColor: '#38BDF8',
                    brightness: 1.0,
                    contrast: 1.0,
                    saturation: 1.0,
                    speed: 1.0,
                    hookTitle: {
                      enabled: false,
                      text: '',
                      bgColor: '#EF4444',
                      textColor: '#FFFFFF',
                      fontSize: 22,
                      positionY: 6,
                    },
                    progressBar: {
                      enabled: false,
                      color: '#38BDF8',
                      height: 4,
                      position: 'bottom',
                    },
                    watermark: {
                      enabled: false,
                      text: '',
                      opacity: 0.85,
                      position: 'bottom-right',
                      positionX: 85,
                      positionY: 92,
                      fontSize: 14,
                      fontFamily: 'Inter',
                      textColor: '#FFFFFF',
                      stylePreset: 'pill',
                      prefixIcon: 'at',
                      uppercase: false,
                    },
                    safeZonePreset: 'none',
                  })
                }
                className="w-full py-1.5 rounded bg-surface-container hover:bg-surface-bright text-tertiary text-xs transition-colors flex items-center justify-center gap-1.5 font-medium mt-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Posisi Kamera & Frame</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: FILTER & EFEK (OPENCUT SUITE) */}
        {activeTab === 'filter' && (
          <div className="space-y-4">
            {/* Header / Active Filter Summary */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Wand2 className="w-4 h-4 text-primary" />
                <span className="font-label-md text-on-surface font-semibold text-xs">
                  Filter Warna & Efek Visual
                </span>
              </div>
              {((frame.filterPreset && frame.filterPreset !== 'none') ||
                frame.brightness !== 1 ||
                frame.contrast !== 1 ||
                frame.saturation !== 1 ||
                (frame.videoBlur ?? 0) > 0 ||
                frame.vignette) && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateFrame({
                      ...frame,
                      filterPreset: 'none',
                      filterIntensity: 100,
                      brightness: 1.0,
                      contrast: 1.0,
                      saturation: 1.0,
                      videoBlur: 0,
                      vignette: false,
                    })
                  }
                  className="text-[11px] text-tertiary hover:underline flex items-center gap-1 font-medium"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset Filter
                </button>
              )}
            </div>

            {/* 1. KOLEKSI FILTER PRESETS (LUTs) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-outline text-[11px]">
                <span className="font-semibold text-on-surface">Preset Grading Warna ({FILTER_PRESETS.length})</span>
                <span className="text-[10px] font-mono text-primary">Live Canvas Preview</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {FILTER_PRESETS.map((p) => {
                  const isActive = (frame.filterPreset || 'none') === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onUpdateFrame({ ...frame, filterPreset: p.id })}
                      className={`relative flex flex-col rounded-lg p-2 text-left transition-all border overflow-hidden group ${
                        isActive
                          ? 'border-primary bg-primary/10 ring-1 ring-primary/40 shadow-sm'
                          : 'border-outline-variant/20 bg-surface-container hover:border-outline-variant/50 hover:bg-surface-container-high'
                      }`}
                    >
                      {/* Mini Visual Color Swatch */}
                      <div
                        className="w-full h-10 rounded-md mb-2 flex items-end justify-between p-1 shadow-inner relative overflow-hidden"
                        style={{ background: p.previewBg }}
                      >
                        {isActive && (
                          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-on-primary flex items-center justify-center shadow">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        )}
                        <span
                          className="text-[8px] font-bold px-1 py-0.5 rounded backdrop-blur-md bg-black/60 text-white font-mono uppercase tracking-wider"
                        >
                          {p.badge}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <span className={`text-[11px] font-bold block truncate ${isActive ? 'text-primary' : 'text-on-surface'}`}>
                          {p.name}
                        </span>
                        <span className="text-[9px] text-outline line-clamp-1 leading-tight">
                          {p.description}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Slider Intensitas Filter jika Preset dipilih */}
            {frame.filterPreset && frame.filterPreset !== 'none' && (
              <div className="bg-surface-container p-2.5 rounded-lg space-y-1.5 border border-primary/20">
                <div className="flex justify-between text-outline text-[11px]">
                  <span className="text-on-surface font-semibold flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-primary" />
                    Kekuatan Filter ({FILTER_PRESETS.find((p) => p.id === frame.filterPreset)?.name})
                  </span>
                  <span className="font-mono text-primary font-bold">{frame.filterIntensity ?? 100}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={frame.filterIntensity ?? 100}
                  onChange={(e) => onUpdateFrame({ ...frame, filterIntensity: Number(e.target.value) })}
                  className="w-full accent-primary h-1.5 bg-surface-container-high rounded cursor-pointer"
                />
              </div>
            )}

            {/* 2. EFEK LENSA & DEFOCUS (OPENCUT SHADERS) */}
            <div className="space-y-3 pt-2 border-t border-surface-container-high/40">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
                <Layers className="w-3.5 h-3.5 text-secondary" />
                <span>Efek Lensa & Tekstur Sinematik</span>
              </div>

              {/* A. OpenCut Gaussian Blur Video */}
              <div className="bg-surface-container p-2.5 rounded-lg space-y-2 border border-outline-variant/20">
                <div className="flex justify-between text-outline text-[11px]">
                  <span className="text-on-surface font-medium">Defocus / Gaussian Blur Video</span>
                  <span className="font-mono text-on-surface">{frame.videoBlur || 0}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="16"
                  step="1"
                  value={frame.videoBlur || 0}
                  onChange={(e) => onUpdateFrame({ ...frame, videoBlur: Number(e.target.value) })}
                  className="w-full accent-primary h-1 bg-surface-container-high rounded cursor-pointer"
                />
                <span className="text-[10px] text-outline block leading-relaxed">
                  Defocus video utama secara halus untuk efek dreamy atau intro klip estetik.
                </span>
              </div>

              {/* B. Vignette Tepi Gelap */}
              <div className="bg-surface-container p-2.5 rounded-lg space-y-2 border border-outline-variant/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-on-surface">
                    <span>Vignette Tepi Gelap (Fokus Wajah)</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(frame.vignette)}
                      onChange={(e) => onUpdateFrame({ ...frame, vignette: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-secondary"></div>
                  </label>
                </div>
                <span className="text-[10px] text-outline block leading-relaxed">
                  Menambahkan bayangan melingkar halus di sudut layar agar perhatian penonton berfokus ke pembicara utama.
                </span>
              </div>

              {/* C. OpenCut Cinematic Bars (Letterbox Black Bars Mask) */}
              <div className="bg-surface-container p-2.5 rounded-lg space-y-2 border border-outline-variant/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-on-surface">
                    <Film className="w-3.5 h-3.5 text-primary" />
                    <span>Cinematic Letterbox (Bilah Bioskop)</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(frame.cinematicBars)}
                      onChange={(e) => onUpdateFrame({ ...frame, cinematicBars: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
                <span className="text-[10px] text-outline block leading-relaxed">
                  Bilah hitam sinematik atas-bawah ala film layar lebar bioskop (Hollywood 2.35:1).
                </span>

                {frame.cinematicBars && (
                  <div className="pt-2 border-t border-outline-variant/15 space-y-2">
                    <div className="flex justify-between text-outline text-[11px]">
                      <span>Tinggi Bilah Hitam</span>
                      <span className="font-mono text-on-surface font-semibold">{frame.cinematicBarsHeight ?? 12}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="25"
                      step="1"
                      value={frame.cinematicBarsHeight ?? 12}
                      onChange={(e) => onUpdateFrame({ ...frame, cinematicBarsHeight: Number(e.target.value) })}
                      className="w-full accent-primary h-1 bg-surface-container-high rounded cursor-pointer"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 3. PEWARNAAN MANUAL (COLOR GRADING) */}
            <div className="space-y-3 pt-2 border-t border-surface-container-high/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
                  <SunMedium className="w-3.5 h-3.5 text-amber-400" />
                  <span>Koreksi Warna Halus (Color Grading)</span>
                </div>
                {(frame.brightness !== 1 || frame.contrast !== 1 || frame.saturation !== 1) && (
                  <button
                    type="button"
                    onClick={() => onUpdateFrame({ ...frame, brightness: 1.0, contrast: 1.0, saturation: 1.0 })}
                    className="text-[10px] text-tertiary hover:underline"
                  >
                    Reset Grading
                  </button>
                )}
              </div>

              {/* Kecerahan */}
              <div className="bg-surface-container p-2.5 rounded-lg space-y-1.5 border border-outline-variant/20">
                <div className="flex justify-between text-outline text-[11px]">
                  <span>Kecerahan (Brightness)</span>
                  <span className="font-mono text-on-surface">{Math.round((frame.brightness ?? 1) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.25"
                  step="0.01"
                  value={frame.brightness ?? 1}
                  onChange={(e) => onUpdateFrame({ ...frame, brightness: Number(e.target.value) })}
                  className="w-full accent-primary h-1 bg-surface-container-high rounded cursor-pointer"
                />
              </div>

              {/* Kontras */}
              <div className="bg-surface-container p-2.5 rounded-lg space-y-1.5 border border-outline-variant/20">
                <div className="flex justify-between text-outline text-[11px]">
                  <span>Kontras (Contrast)</span>
                  <span className="font-mono text-on-surface">{Math.round((frame.contrast ?? 1) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.3"
                  step="0.01"
                  value={frame.contrast ?? 1}
                  onChange={(e) => onUpdateFrame({ ...frame, contrast: Number(e.target.value) })}
                  className="w-full accent-primary h-1 bg-surface-container-high rounded cursor-pointer"
                />
              </div>

              {/* Saturasi */}
              <div className="bg-surface-container p-2.5 rounded-lg space-y-1.5 border border-outline-variant/20">
                <div className="flex justify-between text-outline text-[11px]">
                  <span>Saturasi Warna (Saturation)</span>
                  <span className="font-mono text-on-surface">{Math.round((frame.saturation ?? 1) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.02"
                  value={frame.saturation ?? 1}
                  onChange={(e) => onUpdateFrame({ ...frame, saturation: Number(e.target.value) })}
                  className="w-full accent-primary h-1 bg-surface-container-high rounded cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: AUDIO SETTINGS */}
        {activeTab === 'audio' && (
          <div className="space-y-4">
            <span className="font-label-md text-on-surface font-semibold block">Pengaturan Audio</span>

            <div className="bg-surface-container-lowest p-3 rounded-lg space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-outline">
                  <span>Volume Klip</span>
                  <span className="font-mono text-on-surface">{Math.round(audio.volume * 100)}%</span>
                </div>
                <input
                  aria-label="Clip Volume"
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={audio.volume}
                  onChange={(e) => onUpdateAudio({ ...audio, volume: Number(e.target.value) })}
                  className="w-full accent-secondary h-1 bg-surface-container-high rounded"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-outline">Mute (Bungkam Suara)</span>
                <input
                  aria-label="Mute Audio"
                  type="checkbox"
                  checked={audio.muted}
                  onChange={(e) => onUpdateAudio({ ...audio, muted: e.target.checked })}
                  className="accent-secondary w-4 h-4 cursor-pointer"
                />
              </div>

              {/* OPENCUT FEATURE: VOCAL CLARITY BOOST */}
              <div className="p-2.5 rounded-lg bg-surface-container border border-outline-variant/20 space-y-1.5 mt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Vocal Clarity Boost (+3dB)</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(audio.vocalBoost)}
                      onChange={(e) => onUpdateAudio({ ...audio, vocalBoost: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4.5 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>
                <p className="text-outline text-[10px] leading-tight">
                  Mengangkat kejelasan suara pembicara (+3dB di frekuensi vokal 3kHz) agar suara terdengar renyah dan tegas di speaker HP penonton.
                </p>
              </div>

              <div className="p-2.5 rounded bg-surface-container flex items-center justify-between mt-2">
                <span className="text-outline text-xs">Normalisasi EBU R128</span>
                <span className="text-secondary font-mono text-xs font-semibold">-14.0 LUFS</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: VIRAL AI ANALYTICS & METADATA */}
        {activeTab === 'info' && (
          <div className="space-y-3.5 pb-4">
            {/* Score Ring Banner */}
            <div className="bg-surface-container-lowest p-3 rounded-lg border border-primary/20 flex items-center justify-between shadow-xs">
              <div>
                <span className="text-[10px] font-mono text-outline uppercase tracking-wider block">
                  Skor Klip AI
                </span>
                <span className="font-headline-lg text-primary font-bold text-2xl font-mono">
                  {clip?.viral_score ?? 85}<span className="text-sm font-normal text-outline">/100</span>
                </span>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="px-2.5 py-0.5 rounded-full bg-secondary/15 text-secondary font-bold text-[11px] flex items-center gap-1 border border-secondary/20">
                  <Flame className="w-3 h-3 text-secondary" />
                  Potensi Trending Tinggi
                </span>
                <span className="text-[10px] text-outline font-mono">Durasi: {clip ? Math.round(clip.end_sec - clip.start_sec) : 30}s</span>
              </div>
            </div>

            {/* 1-CLICK READY TO POST BUTTON */}
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/10 via-surface-container to-secondary/10 border border-primary/30 flex flex-col gap-1.5 shadow-sm">
              <button
                type="button"
                onClick={handleCopyReadyToPost}
                className={`w-full py-2.5 px-3 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm ${
                  copiedAll
                    ? 'bg-secondary text-on-secondary shadow-secondary/30 scale-[1.01]'
                    : 'bg-primary text-on-primary hover:bg-primary/90 shadow-primary/20 hover:scale-[1.01] active:scale-[0.99]'
                }`}
              >
                {copiedAll ? (
                  <>
                    <Check className="w-4 h-4 text-on-secondary" />
                    <span>Format Lengkap Berhasil Disalin!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span>Salin Format Siap Posting (Judul + Caption + Tag)</span>
                  </>
                )}
              </button>
              <span className="text-[10px] text-center text-outline">
                Tinggal Paste ke TikTok, Instagram Reels, atau YouTube Shorts ✨
              </span>
            </div>

            {/* MAGIC AI COPYWRITER GENERATOR */}
            <div className="bg-surface-container-lowest p-3 rounded-lg border border-surface-container-highest space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-on-surface flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Generator Copywriting AI
                </span>
                <span className="text-[10px] font-mono text-outline">Pilih Gaya Copy</span>
              </div>

              {/* Tone Selector Pills */}
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'viral_hook', label: '🎯 Hook Utama', desc: 'Memicu Penasaran' },
                  { id: 'question_curiosity', label: '❓ Pertanyaan', desc: 'Relatable & Menusuk' },
                  { id: 'story_emotion', label: '📖 Cerita', desc: 'Emosional & Hangat' },
                  { id: 'education_action', label: '💡 Edukasi', desc: 'Insight & Solusi' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setAiTone(t.id as any)}
                    className={`py-1.5 px-2 rounded-md text-left transition-all border text-[11px] ${
                      aiTone === t.id
                        ? 'bg-primary/15 border-primary text-primary font-semibold'
                        : 'bg-surface-container border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    <div className="font-medium">{t.label}</div>
                    <div className="text-[9px] opacity-70 truncate">{t.desc}</div>
                  </button>
                ))}
              </div>

              {/* Generate AI Button */}
              <button
                type="button"
                onClick={handleGenerateAiCopy}
                disabled={isGeneratingAi || !clip?.id}
                className="w-full py-2 px-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest border border-primary/30 text-primary hover:text-on-surface text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isGeneratingAi ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                    <span>Meracik Hook &amp; Caption AI...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Tulis Ulang Judul &amp; Caption dengan AI</span>
                  </>
                )}
              </button>

              {/* Alternative Titles Suggestions */}
              {altTitles.length > 0 && (
                <div className="pt-1 space-y-1.5 border-t border-surface-container-high/60">
                  <span className="text-[10px] font-mono text-outline block">Pilihan Judul Alternatif Lain:</span>
                  <div className="flex flex-col gap-1">
                    {altTitles.map((alt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setClipTitle(alt);
                          onUpdateClipInfo(alt, clipDesc, clipHashtags);
                        }}
                        className="text-left py-1 px-2 rounded bg-surface-container hover:bg-surface-container-high text-[11px] text-on-surface-variant hover:text-primary transition-colors flex items-center justify-between group"
                      >
                        <span className="truncate flex-1">&bull; {alt}</span>
                        <span className="text-[9px] font-mono text-outline group-hover:text-primary shrink-0 ml-1">Pakai</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Title & Description Form */}
            <div className="bg-surface-container-lowest p-3 rounded-lg space-y-3 border border-surface-container-highest">
              {/* Judul Klip */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <label className="text-on-surface font-semibold flex items-center gap-1">
                    Judul Klip (Hook Video)
                  </label>
                  <div className="flex items-center gap-2 font-mono">
                    <span className={clipTitle.length > 100 ? 'text-error' : 'text-outline text-[10px]'}>
                      {clipTitle.length}/100
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyTitle}
                      className="text-primary hover:underline flex items-center gap-1 cursor-pointer text-[10px]"
                    >
                      {copiedTitle ? <Check className="w-3 h-3 text-secondary" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedTitle ? 'Tersalin' : 'Salin'}</span>
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={clipTitle}
                  placeholder="Ketik judul hook video yang menarik..."
                  onChange={(e) => {
                    setClipTitle(e.target.value);
                    onUpdateClipInfo(e.target.value, clipDesc, clipHashtags);
                  }}
                  className="w-full bg-surface-container px-2.5 py-1.5 rounded-lg text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary border border-outline-variant/30 font-medium"
                />
              </div>

              {/* Deskripsi & Caption */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <label className="text-on-surface font-semibold flex items-center gap-1">
                    Deskripsi &amp; Caption Siap Posting
                  </label>
                  <div className="flex items-center gap-2 font-mono">
                    <span className={clipDesc.length > 2200 ? 'text-error' : 'text-outline text-[10px]'}>
                      {clipDesc.length}/2200
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyDesc}
                      className="text-primary hover:underline flex items-center gap-1 cursor-pointer text-[10px]"
                    >
                      {copiedDesc ? <Check className="w-3 h-3 text-secondary" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedDesc ? 'Tersalin' : 'Salin'}</span>
                    </button>
                  </div>
                </div>
                <textarea
                  rows={4}
                  value={clipDesc}
                  placeholder="Ketik caption dan ajakan interaksi penonton..."
                  onChange={(e) => {
                    setClipDesc(e.target.value);
                    onUpdateClipInfo(clipTitle, e.target.value, clipHashtags);
                  }}
                  className="w-full bg-surface-container px-2.5 py-2 rounded-lg text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary border border-outline-variant/30 resize-none leading-relaxed"
                />
              </div>
            </div>

            {/* INTERACTIVE HASHTAGS MANAGEMENT */}
            <div className="bg-surface-container-lowest p-3 rounded-lg space-y-2.5 border border-surface-container-highest">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-tertiary" />
                  Rekomendasi Hashtag ({clipHashtags.length})
                </span>
                <button
                  type="button"
                  onClick={handleCopyHashtags}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  {copiedTags ? <Check className="w-3 h-3 text-secondary" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedTags ? 'Tersalin!' : 'Salin Semua'}</span>
                </button>
              </div>

              {/* Tag Chips Pool */}
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                {clipHashtags.map((tag, idx) => {
                  const displayTag = tag.startsWith('#') ? tag : `#${tag}`;
                  return (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 text-tertiary text-[11px] font-mono group transition-colors"
                    >
                      <span>{displayTag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveHashtag(tag)}
                        className="opacity-60 hover:opacity-100 hover:text-error transition-opacity cursor-pointer p-0.5"
                        title="Hapus hashtag ini"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  );
                })}
              </div>

              {/* Add Custom Tag Bar */}
              <div className="flex gap-1.5 pt-1">
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[12px] font-mono">#</span>
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={handleAddHashtag}
                    placeholder="Tambah hashtag kustom lalu tekan Enter..."
                    className="w-full pl-6 pr-3 py-1.5 rounded-lg bg-surface-container text-xs text-on-surface placeholder:text-outline border border-outline-variant/30 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleAddHashtag()}
                  disabled={!newTagInput.trim()}
                  className="px-2.5 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-primary text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah</span>
                </button>
              </div>
            </div>

            {/* AI Reason Narrative */}
            {clip?.reason && (
              <div className="bg-surface-container-lowest p-3 rounded-lg space-y-1 border border-surface-container-highest">
                <span className="font-semibold text-xs text-secondary flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5 text-secondary" />
                  Analisis Rekomendasi AI
                </span>
                <p className="text-xs text-on-surface-variant leading-relaxed">{clip.reason}</p>
              </div>
            )}

            {/* Score Breakdown Bars */}
            {clip?.score_breakdown && (
              <div className="bg-surface-container-lowest p-3 rounded-lg space-y-2 border border-surface-container-highest">
                <span className="font-semibold text-xs text-on-surface block mb-1">
                  Parameter Evaluasi AI
                </span>
                {Object.entries(clip.score_breakdown).map(([k, v]) => (
                  <div key={k} className="space-y-0.5">
                    <div className="flex justify-between text-[11px] text-outline capitalize">
                      <span>{k}</span>
                      <span className="font-mono text-on-surface">{v}/100</span>
                    </div>
                    <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full transition-all"
                        style={{ width: `${v}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
