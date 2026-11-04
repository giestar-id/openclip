'use client';

import React from 'react';
import {
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  Disc,
  Music,
  Search,
  Plus,
  Send,
  MoreVertical,
  ThumbsUp,
  ThumbsDown,
  Repeat2,
  Radio,
} from 'lucide-react';

interface PlatformGuidesOverlayProps {
  preset: 'none' | 'tiktok' | 'reels' | 'shorts' | 'grid';
  showGridSafe?: boolean;
}

export function PlatformGuidesOverlay({ preset, showGridSafe }: PropsWithPlatform) {
  if (preset === 'none' && !showGridSafe) return null;

  return (
    <div className="absolute inset-0 z-28 pointer-events-none select-none overflow-hidden font-sans">
      {/* 1. TIKTOK UI OVERLAY */}
      {preset === 'tiktok' && (
        <div className="w-full h-full relative flex flex-col justify-between p-3.5 text-white/80">
          {/* Top Bar */}
          <div className="flex items-center justify-between pt-1 px-1">
            <div className="flex items-center gap-1 text-[11px] font-bold text-white/90 bg-black/30 backdrop-blur-xs px-2 py-0.5 rounded-full border border-white/10">
              <Radio className="w-3 h-3 text-red-500 animate-pulse" />
              <span>LIVE</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold text-white/90">
              <span className="text-white/50">Mengikuti</span>
              <span className="text-white border-b-2 border-white pb-0.5">Untuk Anda</span>
            </div>
            <div className="w-7 h-7 rounded-full bg-black/30 backdrop-blur-xs flex items-center justify-center border border-white/10">
              <Search className="w-3.5 h-3.5 text-white/90" />
            </div>
          </div>

          {/* Center Danger Zone Marker */}
          <div className="absolute inset-x-12 top-20 bottom-36 border border-dashed border-cyan-400/30 rounded-lg flex items-start justify-center pt-2">
            <span className="text-[10px] font-mono text-cyan-300/80 bg-black/60 px-2 py-0.5 rounded border border-cyan-400/20">
              Area Aman Konten (Safe Content Zone)
            </span>
          </div>

          {/* Right Action Rail */}
          <div className="absolute right-2.5 bottom-16 flex flex-col items-center gap-3 z-10">
            {/* Avatar */}
            <div className="relative mb-1">
              <div className="w-10 h-10 rounded-full border-2 border-white bg-slate-700 shadow-md flex items-center justify-center text-xs font-bold text-white">
                TT
              </div>
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-pink-500 flex items-center justify-center text-white">
                <Plus className="w-3 h-3 stroke-[3]" />
              </div>
            </div>

            {/* Like */}
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-9 h-9 rounded-full bg-black/30 backdrop-blur-xs flex items-center justify-center shadow-md">
                <Heart className="w-5 h-5 fill-white text-white drop-shadow" />
              </div>
              <span className="text-[10px] font-bold drop-shadow">184.2K</span>
            </div>

            {/* Comment */}
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-9 h-9 rounded-full bg-black/30 backdrop-blur-xs flex items-center justify-center shadow-md">
                <MessageCircle className="w-5 h-5 fill-white text-white drop-shadow" />
              </div>
              <span className="text-[10px] font-bold drop-shadow">2,410</span>
            </div>

            {/* Bookmark */}
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-9 h-9 rounded-full bg-black/30 backdrop-blur-xs flex items-center justify-center shadow-md">
                <Bookmark className="w-5 h-5 fill-white text-white drop-shadow" />
              </div>
              <span className="text-[10px] font-bold drop-shadow">14.8K</span>
            </div>

            {/* Share */}
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-9 h-9 rounded-full bg-black/30 backdrop-blur-xs flex items-center justify-center shadow-md">
                <Share2 className="w-5 h-5 fill-white text-white drop-shadow" />
              </div>
              <span className="text-[10px] font-bold drop-shadow">6,120</span>
            </div>

            {/* Sound Disc */}
            <div className="w-9 h-9 rounded-full bg-slate-900 border-2 border-slate-700 flex items-center justify-center animate-spin duration-3000">
              <Disc className="w-5 h-5 text-pink-400" />
            </div>
          </div>

          {/* Bottom Info & Description */}
          <div className="pr-16 pb-1 space-y-1.5 z-10">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white drop-shadow">@creator_account</span>
              <span className="text-[9px] bg-white/20 px-1 py-0.2 rounded text-white font-semibold">Ikuti</span>
            </div>
            <p className="text-[11px] text-white/90 line-clamp-2 leading-tight drop-shadow font-normal">
              Rahasia bikin konten video klip podcast viral di TikTok & Reels! Simak pembahasannya 🔥 #fyp #viral #podcast
            </p>
            <div className="flex items-center gap-1.5 text-[10px] text-white/80 drop-shadow">
              <Music className="w-3 h-3 text-white" />
              <span className="truncate max-w-[200px]">Suara Asli - Creator Highlights Studio</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. INSTAGRAM REELS UI OVERLAY */}
      {preset === 'reels' && (
        <div className="w-full h-full relative flex flex-col justify-between p-3.5 text-white/80">
          {/* Top Bar */}
          <div className="flex items-center justify-between pt-1 px-1">
            <span className="text-sm font-bold text-white tracking-wide drop-shadow">Reels</span>
            <div className="w-6 h-6 rounded-full bg-black/20 flex items-center justify-center">
              <Search className="w-3.5 h-3.5 text-white" />
            </div>
          </div>

          {/* Center Safe Zone Marker */}
          <div className="absolute inset-x-12 top-16 bottom-32 border border-dashed border-pink-400/30 rounded-lg flex items-start justify-center pt-2">
            <span className="text-[10px] font-mono text-pink-300/80 bg-black/60 px-2 py-0.5 rounded border border-pink-400/20">
              Area Aman Reels (Instagram Safe Zone)
            </span>
          </div>

          {/* Right Action Rail */}
          <div className="absolute right-2.5 bottom-12 flex flex-col items-center gap-3.5 z-10">
            <div className="flex flex-col items-center gap-0.5">
              <Heart className="w-6 h-6 text-white drop-shadow" />
              <span className="text-[10px] font-semibold drop-shadow">95.4K</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <MessageCircle className="w-6 h-6 text-white drop-shadow" />
              <span className="text-[10px] font-semibold drop-shadow">1,208</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <Send className="w-5 h-5 text-white drop-shadow" />
              <span className="text-[10px] font-semibold drop-shadow">4,900</span>
            </div>
            <MoreVertical className="w-5 h-5 text-white drop-shadow" />
            <div className="w-7 h-7 rounded border border-white/50 bg-slate-800 flex items-center justify-center">
              <Music className="w-3.5 h-3.5 text-white" />
            </div>
          </div>

          {/* Bottom Info */}
          <div className="pr-16 pb-1 space-y-1 z-10">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 p-0.5">
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-[10px] font-bold text-white">
                  IG
                </div>
              </div>
              <span className="text-xs font-bold text-white drop-shadow">creator_official</span>
              <button className="text-[10px] font-bold text-white border border-white/60 px-2 py-0.5 rounded-md backdrop-blur-xs">
                Ikuti
              </button>
            </div>
            <p className="text-[11px] text-white/90 line-clamp-1 leading-tight drop-shadow">
              Kiat sukses konten short-form video 2026...
            </p>
            <div className="flex items-center gap-1.5 text-[10px] text-white/80 drop-shadow">
              <Music className="w-3 h-3 text-white" />
              <span className="truncate max-w-[180px]">Audio Asli • creator_official</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. YOUTUBE SHORTS UI OVERLAY */}
      {preset === 'shorts' && (
        <div className="w-full h-full relative flex flex-col justify-between p-3.5 text-white/80">
          {/* Top Bar */}
          <div className="flex items-center justify-between pt-1 px-1">
            <div className="flex items-center gap-1 text-xs font-black text-white tracking-wider">
              <span className="bg-red-600 text-white px-1.5 py-0.2 rounded text-[10px]">Shorts</span>
            </div>
            <Search className="w-4 h-4 text-white" />
          </div>

          {/* Center Safe Zone Marker */}
          <div className="absolute inset-x-12 top-16 bottom-28 border border-dashed border-red-400/30 rounded-lg flex items-start justify-center pt-2">
            <span className="text-[10px] font-mono text-red-300/80 bg-black/60 px-2 py-0.5 rounded border border-red-400/20">
              Area Aman YouTube Shorts
            </span>
          </div>

          {/* Right Action Rail */}
          <div className="absolute right-2.5 bottom-10 flex flex-col items-center gap-3 z-10">
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-xs flex items-center justify-center">
                <ThumbsUp className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] font-bold">48K</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-xs flex items-center justify-center">
                <ThumbsDown className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] font-bold">Tidak suka</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-xs flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] font-bold">1.5K</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-xs flex items-center justify-center">
                <Share2 className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] font-bold">Bagikan</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-xs flex items-center justify-center">
                <Repeat2 className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] font-bold">Remix</span>
            </div>
          </div>

          {/* Bottom Info */}
          <div className="pr-16 pb-1 space-y-1.5 z-10">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center text-xs font-bold text-white">
                YT
              </div>
              <span className="text-xs font-bold text-white drop-shadow">@ChannelKreator</span>
              <button className="bg-white text-black text-[10px] font-bold px-2.5 py-1 rounded-full shadow">
                Subscribe
              </button>
            </div>
            <p className="text-[11px] text-white/95 font-medium line-clamp-1 drop-shadow">
              Tips editing video klip profesional yang paling ampuh! #shorts
            </p>
          </div>
        </div>
      )}

      {/* 4. TITLE / ACTION SAFE MARGIN GRID (90% / 80%) */}
      {(preset === 'grid' || showGridSafe) && (
        <div className="absolute inset-0 pointer-events-none p-[5%] flex flex-col justify-between">
          <div className="absolute inset-[5%] border border-dashed border-emerald-400/40 rounded flex flex-col justify-between p-1.5">
            <span className="font-mono text-[9px] text-emerald-300 bg-black/50 px-1 py-0.5 rounded self-start">
              Safe Title (90%)
            </span>
            <div className="absolute inset-[5%] border border-dashed border-sky-400/35 rounded flex flex-col justify-end p-1.5">
              <span className="font-mono text-[9px] text-sky-300 bg-black/50 px-1 py-0.5 rounded self-end">
                Action Safe (80%)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface PropsWithPlatform {
  preset: 'none' | 'tiktok' | 'reels' | 'shorts' | 'grid';
  showGridSafe?: boolean;
}
