import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { Clip } from '@/lib/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clipId = Number(id);
    if (!clipId) {
      return NextResponse.json({ error: 'ID clip tidak valid' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const resolution = body.resolution === '720p' ? '720p' : '1080p';

    const clip = await queryOne<Clip>('SELECT * FROM clips WHERE id = ?', [clipId]);
    if (!clip) {
      return NextResponse.json({ error: 'Klip tidak ditemukan' }, { status: 404 });
    }

    // Jika user menyertakan data edit terbaru (caption_segments, style, frame, audio), simpan langsung ke DB
    if (body.caption_segments || body.style || body.frame || body.audio) {
      const { toJson } = await import('@/lib/db');
      await execute(
        `
        INSERT INTO clip_edits (
          clip_id, caption_segments, style, frame, audio
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(clip_id) DO UPDATE SET
          caption_segments = COALESCE(excluded.caption_segments, clip_edits.caption_segments),
          style = COALESCE(excluded.style, clip_edits.style),
          frame = COALESCE(excluded.frame, clip_edits.frame),
          audio = COALESCE(excluded.audio, clip_edits.audio),
          updated_at = CURRENT_TIMESTAMP
        `,
        [
          clipId,
          body.caption_segments ? toJson(body.caption_segments) : null,
          body.style ? toJson(body.style) : null,
          body.frame ? toJson(body.frame) : null,
          body.audio ? toJson(body.audio) : null,
        ]
      );
    }

    const exportId = await execute(
      `
      INSERT INTO exports (
        clip_id, project_id, resolution, status, progress
      ) VALUES (?, ?, ?, 'queued', 0)
      `,
      [clipId, clip.project_id, resolution]
    );

    return NextResponse.json({
      export_id: exportId,
      status: 'queued',
      resolution,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
