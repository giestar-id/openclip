'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlusCircle, Film, Settings } from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-14 bottom-0 w-16 bg-surface-container-lowest z-40 flex flex-col justify-between py-3 border-r border-surface-container-high/60 shadow-[0_1px_8px_rgba(0,0,0,0.3)] select-none">
      <nav className="flex flex-col items-center gap-2 w-full px-2">
        <Link
          href="/"
          aria-label="Buat proyek baru"
          className={`w-12 h-12 flex flex-col items-center justify-center rounded-lg transition-all ${
            pathname === '/' || pathname === '/new'
              ? 'bg-surface-container-highest text-primary font-bold shadow-sm'
              : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
          }`}
          title="New Project"
        >
          <PlusCircle className="w-5 h-5" />
          <span className="text-[10px] font-mono mt-1">Baru</span>
        </Link>

        <Link
          href="/projects"
          aria-label="Daftar proyek"
          className={`w-12 h-12 flex flex-col items-center justify-center rounded-lg transition-all ${
            pathname.startsWith('/projects')
              ? 'bg-surface-container-highest text-primary font-bold shadow-sm'
              : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
          }`}
          title="Daftar Project"
        >
          <Film className="w-5 h-5" />
          <span className="text-[10px] font-mono mt-1">Proyek</span>
        </Link>
      </nav>

      {/* Bottom tools */}
      <div className="flex flex-col items-center gap-1.5 px-2">
        <Link
          href="/settings"
          aria-label="Pengaturan"
          className={`w-12 h-12 flex flex-col items-center justify-center rounded-lg transition-all ${
            pathname === '/settings'
              ? 'bg-surface-container-highest text-primary font-bold shadow-sm'
              : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
          }`}
          title="Pengaturan & AI Providers"
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-mono mt-1">Setting</span>
        </Link>
      </div>
    </aside>
  );
}
