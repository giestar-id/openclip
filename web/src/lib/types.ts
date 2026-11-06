export interface Project {
  id: number;
  user_id: number;
  source_url: string;
  title: string | null;
  thumbnail_path: string | null;
  duration_sec: number | null;
  clip_duration: number;
  clip_count: number;
  language: string;
  transcribe_mode: 'api' | 'local';
  transcribe_config: {
    provider?: string;
    model?: string;
    device?: string;
    compute_type?: string;
  } | null;
  llm_provider: string | null;
  status: 'queued' | 'downloading' | 'transcribing' | 'analyzing' | 'cutting' | 'ready' | 'failed';
  progress: number;
  progress_message: string | null;
  error: string | null;
  failed_stage: string | null;
  source_path: string | null;
  width: number | null;
  height: number | null;
  rights_confirmed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface Transcript {
  id: number;
  project_id: number;
  language: string | null;
  words: TranscriptWord[];
  created_at: string;
}

export interface ScoreBreakdown {
  hook: number;
  emotion: number;
  standalone: number;
  punchline: number;
  pace: number;
}

export interface Clip {
  id: number;
  project_id: number;
  start_sec: number;
  end_sec: number;
  preview_start_sec: number | null;
  preview_end_sec: number | null;
  viral_score: number;
  score_breakdown: ScoreBreakdown | null;
  reason: string | null;
  title: string | null;
  description: string | null;
  hashtags: string[] | null;
  preview_path: string | null;
  thumbnail_path: string | null;
  export_path: string | null;
  status: 'pending' | 'rendering' | 'ready' | 'error';
  error: string | null;
  is_favorite: number;
  is_manual: number;
  sort_order: number;
  created_at: string;
}

export interface CaptionWordItem {
  w: string;
  s: number;
  e: number;
  hl?: boolean;
}

export interface CaptionSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  words: CaptionWordItem[];
}

export interface CaptionStyle {
  enabled?: boolean; // Aktif / Nonaktifkan caption subtitle (default true)
  template: string;
  fontFamily: string;
  fontSize: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number; // 1.0 .. 1.8
  uppercase: boolean;
  textColor: string;
  activeColor: string;
  keywordColor: string;
  outlineColor: string;
  outlineWidth: number;
  shadow: boolean;
  shadowColor: string;
  shadowDepth: number;
  shadowBlur?: number; // 0 .. 20 px blur radius
  background: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundCornerRadius?: number; // 0 .. 32 px (pill rounded box)
  backgroundPaddingX?: number; // 8 .. 36 px (horizontal padding)
  backgroundPaddingY?: number; // 4 .. 24 px (vertical padding)
  positionY: number; // 0..100 % from top
  positionX?: number; // 0..100 % from left (default 50)
  rotation?: number; // -45..45 deg rotation angle
  wordsPerLine: number;
  wordSpacing?: number; // 0.8 .. 2.5 multiplier jarak antar kata
  letterSpacing?: number; // px letter tracking
  animation: 'karaoke' | 'pop' | 'fade' | 'typewriter' | 'none';
  highlightKeywords: boolean;
}


export type HookTitleStylePreset =
  | 'pill'
  | 'clean-no-bg'
  | 'glow-no-bg'
  | 'glass'
  | 'marker'
  | 'outline'
  | 'luxury'
  | 'badge';

export type HookTitleTextCase = 'original' | 'uppercase' | 'lowercase' | 'titlecase';
export type HookTitleFontWeight = 'normal' | 'medium' | 'bold' | 'black';

export interface HookTitleSettings {
  enabled: boolean;
  text: string;
  bgColor: string;
  textColor: string;
  fontSize: number; // Skala ukuran font (OpenCut style: 1.5 - 14.0, default 4.5)
  fontWeight?: HookTitleFontWeight; // Ketebalan huruf: 'normal' (400), 'medium' (500), 'bold' (700), 'black' (900)
  textAlign?: 'left' | 'center' | 'right'; // Perataan teks (default 'center')
  positionX?: number; // % dari kiri kanvas (default 50, tengah)
  positionY?: number; // % dari atas kanvas (default 6)
  stylePreset?: HookTitleStylePreset; // Pilihan gaya tampilan headline / add text
  fontFamily?: string; // Jenis font (Inter, Montserrat, dll)
  textCase?: HookTitleTextCase; // Format huruf: 'original' (sesuai ketikan), 'uppercase', 'lowercase', 'titlecase'
  uppercase?: boolean; // Huruf kapital semua (legacy boolean)
}

export interface ProgressBarSettings {
  enabled: boolean;
  color: string;
  height: number;
  position: 'bottom' | 'top';
}

export interface WatermarkSettings {
  enabled: boolean;
  text: string;
  opacity: number;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'custom';
  positionX?: number; // 0..100% dari kiri kanvas
  positionY?: number; // 0..100% dari atas kanvas
  fontSize?: number; // 10 .. 32 px
  fontFamily?: string; // Inter, Montserrat, Poppins, Space Grotesk, Bebas Neue, etc.
  textColor?: string; // hex color e.g. #FFFFFF
  stylePreset?: 'pill' | 'minimal' | 'glow' | 'marker' | 'outline' | 'glass';
  prefixIcon?: 'none' | 'at' | 'verified' | 'sparkle' | 'video';
  uppercase?: boolean;
}

export type FilterPreset =
  | 'none'
  | 'cinematic'
  | 'vintage'
  | 'monochrome'
  | 'vibrant'
  | 'cold'
  | 'warm'
  | 'fade'
  | 'cyberpunk';

// Social Profile Template Settings
export interface SocialProfileSettings {
  accountName: string; // Nama akun / channel (e.g. "@creator")
  accountHandle: string; // Handle atau subtitle (e.g. "Content Creator")
  avatarUrl: string; // URL atau data-URL foto profil / logo
  bgColor: string; // Warna latar belakang area profil (hex)
  textColor: string; // Warna teks nama akun (hex)
  handleColor: string; // Warna teks handle/subtitle (hex)
  accentColor: string; // Warna aksen (garis, badge verified, dll)
  headerHeight: number; // Tinggi area header profil (legacy / sync dengan headerGap)
  footerHeight: number; // Tinggi area footer bawah (legacy / sync dengan footerGap)
  headerGap?: number; // Jarak header ke video (legacy)
  footerGap?: number; // Jarak footer ke video (legacy)
  headerPosY?: number; // Posisi sumbu vertikal (Y) header dari atas kanvas (0..35 %, default 6)
  footerPosY?: number; // Posisi sumbu vertikal (Y) footer dari atas kanvas (65..96 %, default 91)
  headerBarHeight?: number; // Tinggi div pembungkus header (32..80 px, default 48)
  footerBarHeight?: number; // Tinggi div pembungkus footer (20..64 px, default 34)
  headerPaddingX?: number; // Margin samping div pembungkus header & footer (0..48 px, default 0)
  videoFrameHeight?: number; // Persentase tinggi frame video tengah (45..85 %, default 66)
  videoFrameOffsetY?: number; // Pergeseran vertikal posisi bingkai video (-20..+25 %, default 0 = tengah)
  footerText: string; // Teks CTA / keterangan di footer (e.g. "Follow for more!")
  showVerifiedBadge: boolean; // Tampilkan centang biru di samping nama
  verifiedBadgeColor?: string; // Warna centang biru verified badge (default '#0095F6')
  showFollowButton?: boolean; // Tampilkan tombol "Follow" di header (opsional)
  cardStyle: 'flat' | 'glass' | 'gradient' | 'neon'; // Gaya visual header
  videoHeight?: number; // Persentase tinggi frame video tengah (45..88%, default 74)
  videoFrameBg?: string; // Warna latar belakang kotak video tengah (default '#000000')
  framePadding?: number; // Jarak margin/inset kotak frame video garis kiri-kanan (0..48 px, default 0)
  frameBorderRadius?: number; // Lengkungan sudut bingkai video (0..32 px, default 0)
}

// Speaker Cut & Dynamic Camera Tracking
export interface SpeakerShot {
  start: number; // detik relatif klip (mulai dari 0.0)
  end: number;   // detik relatif klip
  speakerId: number;
  label: string;
  offsetX: number;
  offsetY?: number;
}

export interface TrackingKeyframe {
  time: number;  // detik relatif klip
  offsetX: number;
  offsetY?: number;
}

export interface FrameSettings {
  ratio: '9:16' | '1:1' | '16:9';
  mode: 'crop' | 'fit_blur' | 'fit' | 'split' | 'social';
  zoom: number;
  offsetX: number;
  offsetY: number;
  blur: number;
  fitColor?: string; // Warna latar belakang mode Fit (default '#000000')
  faceTracking?: boolean;
  // Dynamic AI Tracking Modes (Active Speaker & Smooth Follow)
  trackingMode?: 'auto_switch' | 'smooth_follow' | 'static';
  speakerShots?: SpeakerShot[];
  trackingKeyframes?: TrackingKeyframe[];
  autoZoomCloseUp?: boolean;
  // Podcast Split Screen settings (Atas - Bawah 2 Pembicara)
  splitTopOffsetX?: number; // Pan X untuk Pembicara Atas (-50..50, default -25)
  splitBottomOffsetX?: number; // Pan X untuk Pembicara Bawah (-50..50, default 25)
  splitTopOffsetY?: number; // Pan Y untuk Pembicara Atas (-50..50, default 0)
  splitBottomOffsetY?: number; // Pan Y untuk Pembicara Bawah (-50..50, default 0)
  splitTopZoom?: number; // Zoom Pembicara Atas (0.5..3.0, default 1.0)
  splitBottomZoom?: number; // Zoom Pembicara Bawah (0.5..3.0, default 1.0)
  splitRatio?: number; // 30..70 % tinggi box atas (default 50)
  splitDividerWidth?: number; // 0..8 px (default 2)
  splitDividerColor?: string; // hex color (default '#38bdf8')
  // Deteksi Multi-Speaker (Podcast 2, 3, 4, 5 orang)
  detectedSpeakers?: Array<{
    id: number;
    label: string;
    offset_x: number;
    center_x_pct?: number;
    weight?: number;
    count?: number;
    is_primary?: boolean;
  }>;
  isMultiSpeaker?: boolean;
  // Social Profile Template settings
  socialProfile?: SocialProfileSettings;
  // Video enhancements (Color grading)
  brightness?: number; // 0.8 .. 1.3 (default 1.0)
  contrast?: number; // 0.8 .. 1.3 (default 1.0)
  saturation?: number; // 0.5 .. 1.5 (default 1.0)
  // Visual Filters & Effects (LUTs & Shaders)
  filterPreset?: FilterPreset; // Default 'none'
  filterIntensity?: number; // 0 .. 100 % (default 100)
  videoBlur?: number; // 0 .. 20 px Gaussian blur on main video (default 0)
  vignette?: boolean; // Tepi video menggelap dramatis (default false)
  // Masks (Cinematic Letterbox Bars)
  cinematicBars?: boolean; // Letterbox black bars
  cinematicBarsHeight?: number; // 5 .. 25 % (default 12)
  // Retime / Speed
  speed?: number; // 0.5 .. 2.0 (default 1.0)
  // Short-form Viral Clip Features
  hookTitle?: HookTitleSettings;
  progressBar?: ProgressBarSettings;
  watermark?: WatermarkSettings;
  safeZonePreset?: 'none' | 'tiktok' | 'reels' | 'shorts' | 'grid';
}

export interface AudioSettings {
  volume: number;
  muted: boolean;
  vocalBoost?: boolean; // Vocal Clarity Boost (+3dB Voice Presence)
}

export interface ClipEdit {
  id: number;
  clip_id: number;
  caption_segments: CaptionSegment[];
  style: CaptionStyle;
  frame: FrameSettings;
  audio: AudioSettings;
  updated_at: string;
}

export interface ExportRecord {
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
}

export interface AppSettings {
  transcribe_mode: string;
  transcribe_api_provider: string;
  local_model: string;
  local_device: string;
  local_compute_type: string;
  llm_provider: string;
  default_language: string;
  default_clip_duration: string;
  default_clip_count: string;
  retention_days: string;
  worker_status?: string;
  worker_heartbeat?: string;
  keys?: {
    groq: boolean;
    openai: boolean;
    anthropic: boolean;
    gemini: boolean;
  };
}
