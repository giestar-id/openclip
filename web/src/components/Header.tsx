'use client';

import React from 'react';
import Link from 'next/link';
import { Scissors, Film, Undo2, Redo2, Download } from 'lucide-react';

interface HeaderProps {
  projectName?: string;
  onExport?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  isSaving?: boolean;
  lastSavedText?: string;
}

export function Header({
  projectName,
  onExport,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  isSaving = false,
  lastSavedText = 'Tersimpan otomatis',
}: HeaderProps) {

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-surface-container-lowest/95 backdrop-blur-xl border-b border-surface-container-high/60 shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
      <div className="h-full w-full pl-2 pr-[18px] flex items-center justify-between gap-4">
        {/* Left: Brand / App Name only */}
        <div className="flex items-center gap-6 shrink-0">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center group-hover:scale-105 transition-transform text-on-primary">
              <Scissors className="w-4 h-4" />
            </div>
            <span className="font-sans font-bold text-base tracking-tight text-on-surface">
              OpenClip
            </span>
          </Link>
        </div>

        {/* Center: Active Project Title & Undo/Redo (when inside editor) */}
        <div className="flex items-center gap-3 flex-1 justify-center max-w-xl min-w-0">
          {projectName && (
            <>
              <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1 rounded max-w-sm w-full min-w-0 border border-surface-container-high/40">
                <Film className="w-3.5 h-3.5 text-outline shrink-0" />
                <span className="truncate font-sans text-xs text-on-surface font-medium">
                  {projectName}
                </span>
                <span className="font-mono text-[10px] text-primary px-1 rounded bg-surface-container-high shrink-0">
                  9:16 PRO
                </span>
              </div>

              {/* Undo / Redo controls */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  className={`p-1.5 rounded transition-colors ${
                    canUndo
                      ? 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                      : 'opacity-40 text-outline cursor-not-allowed'
                  }`}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onRedo}
                  disabled={!canRedo}
                  className={`p-1.5 rounded transition-colors ${
                    canRedo
                      ? 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                      : 'opacity-40 text-outline cursor-not-allowed'
                  }`}
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Autosave status indicator */}
              <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded bg-surface-container-low text-on-surface-variant text-[11px] font-mono">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isSaving ? 'bg-tertiary animate-spin' : 'bg-secondary animate-pulse'
                  }`}
                />
                <span>{isSaving ? 'Menyimpan...' : lastSavedText}</span>
              </div>
            </>
          )}
        </div>

        {/* Right: Quick actions (Export button when inside editor) */}
        <div className="flex items-center gap-3 shrink-0">
          {onExport && (
            <button
              onClick={onExport}
              className="px-3.5 py-1.5 rounded bg-gradient-to-r from-primary-container to-primary hover:brightness-110 text-on-primary-container font-mono text-xs font-bold flex items-center gap-1.5 shadow-md shadow-primary/20 transition-all hover:scale-102 active:scale-98"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Final</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
