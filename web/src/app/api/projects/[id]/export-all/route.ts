import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute, fromJson, toJson } from '@/lib/db';
import { Project, Clip } from '@/lib/types';

// Properti frame yang bersifat gaya/template visual (aman disalin antarklip tanpa merusak face tracking atau cutRanges tiap klip)
const TEMPLATE_FRAME_KEYS = [
  'ratio',
  'mode',
  'blur',
  'fitColor',
  'splitRatio',
  'splitDividerWidth',
  'splitDividerColor',
  'brightness',
  'contrast',
  'saturation',
  'filterPreset',
  'filterIntensity',
  'videoBlur',
  'vignette',
  'cinematicBars',
  'cinematicBarsHeight',
  'speed',
  'hookTitle',
  'progressBar',
  'watermark',
  'safeZonePreset',
  'socialProfile',
] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectId = Number(id);
    if (!projectId) {
      return NextResponse.json({ error: 'ID project tidak valid' }, { status: 400 });
    }

    const project = await queryOne<Project>('SELECT * FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ error: 'Project tidak ditemukan' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const resolution = body.resolution === '720p' ? '720p' : '1080p';
    const clipIds: number[] = Array.isArray(body.clip_ids) ? body.clip_ids.map(Number).filter(Boolean) : [];
    const applyCurrentStyle = Boolean(body.apply_current_style);
    const currentClipId = body.current_clip_id ? Number(body.current_clip_id) : null;

    // Ambil daftar klip yang valid di proyek ini
    let targetClips: Clip[] = [];
    if (clipIds.length > 0) {
      const placeholders = clipIds.map(() => '?').join(',');
      targetClips = await query<Clip>(
        `SELECT * FROM clips WHERE project_id = ? AND id IN (${placeholders}) ORDER BY sort_order ASC, id ASC`,
        [projectId, ...clipIds]
      );
    } else {
      targetClips = await query<Clip>(
        'SELECT * FROM clips WHERE project_id = ? ORDER BY sort_order ASC, id ASC',
        [projectId]
      );
    }

    if (targetClips.length === 0) {
      return NextResponse.json({ error: 'Tidak ada klip yang dipilih untuk diekspor.' }, { status: 400 });
    }

    // Jika pengguna ingin menerapkan template gaya (style, frame, audio) dari klip saat ini ke seluruh klip yang dipilih
    if (applyCurrentStyle && currentClipId) {
      const sourceEdit = await queryOne<any>(
        'SELECT style, frame, audio FROM clip_edits WHERE clip_id = ?',
        [currentClipId]
      );

      if (sourceEdit) {
        const srcFrameObj = fromJson<Record<string, any> | null>(sourceEdit.frame, null);
        for (const clip of targetClips) {
          if (clip.id === currentClipId) continue;

          // Gabungkan hanya properti visual template agar face-tracking & cutRanges milik tiap klip tetap aman!
          let mergedFrameJson = sourceEdit.frame;
          if (srcFrameObj) {
            const existingRow = await queryOne<any>(
              'SELECT frame FROM clip_edits WHERE clip_id = ?',
              [clip.id]
            );
            const targetFrameObj = fromJson<Record<string, any>>(existingRow?.frame, {}) || {};
            const nextFrame: Record<string, any> = { ...targetFrameObj };
            for (const key of TEMPLATE_FRAME_KEYS) {
              if (srcFrameObj[key] !== undefined) {
                if (key === 'hookTitle' && srcFrameObj.hookTitle) {
                  // Salin gaya hookTitle tanpa membawa startSec/endSec spesifik klip asal jika melebihi durasi klip target
                  const { startSec: _s, endSec: _e, ...restHt } = srcFrameObj.hookTitle;
                  nextFrame.hookTitle = restHt;
                } else if (key === 'watermark' && srcFrameObj.watermark) {
                  const { startSec: _s, endSec: _e, ...restWm } = srcFrameObj.watermark;
                  nextFrame.watermark = restWm;
                } else {
                  nextFrame[key] = srcFrameObj[key];
                }
              }
            }
            mergedFrameJson = toJson(nextFrame);
          }

          await execute(
            `
            INSERT INTO clip_edits (clip_id, style, frame, audio)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(clip_id) DO UPDATE SET
              style = COALESCE(excluded.style, clip_edits.style),
              frame = COALESCE(excluded.frame, clip_edits.frame),
              audio = COALESCE(excluded.audio, clip_edits.audio),
              updated_at = CURRENT_TIMESTAMP
            `,
            [clip.id, sourceEdit.style, mergedFrameJson, sourceEdit.audio]
          );
        }
      }
    }

    // Antrekan setiap klip ke tabel exports
    const queuedExportIds: number[] = [];

    for (const clip of targetClips) {
      // Cek apakah sudah ada antrean export yang sedang berjalan / antre
      const existing = await queryOne<any>(
        "SELECT id, status FROM exports WHERE clip_id = ? AND status IN ('queued', 'rendering') ORDER BY id DESC LIMIT 1",
        [clip.id]
      );

      if (existing) {
        queuedExportIds.push(existing.id);
      } else {
        const exportId = await execute(
          `
          INSERT INTO exports (
            clip_id, project_id, resolution, status, progress
          ) VALUES (?, ?, ?, 'queued', 0)
          `,
          [clip.id, projectId, resolution]
        );
        queuedExportIds.push(exportId);
      }
    }

    return NextResponse.json({
      success: true,
      total_queued: queuedExportIds.length,
      resolution,
      export_ids: queuedExportIds,
      message: `${queuedExportIds.length} klip berhasil ditambahkan ke antrean batch export.`,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
