import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute, fromJson, toJson } from '@/lib/db';
import { Clip } from '@/lib/types';
import fs from 'fs';
import path from 'path';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clipId = Number(id);
    if (!clipId) {
      return NextResponse.json({ error: 'ID clip tidak valid' }, { status: 400 });
    }

    const body = await req.json();
    const fields: string[] = [];
    const values: any[] = [];

    if (body.title !== undefined) {
      fields.push('title = ?');
      values.push(body.title);
    }
    if (body.description !== undefined) {
      fields.push('description = ?');
      values.push(body.description);
    }
    if (body.hashtags !== undefined) {
      fields.push('hashtags = ?');
      values.push(Array.isArray(body.hashtags) ? toJson(body.hashtags) : body.hashtags);
    }
    if (body.is_favorite !== undefined) {
      fields.push('is_favorite = ?');
      values.push(body.is_favorite ? 1 : 0);
    }
    if (body.sort_order !== undefined) {
      fields.push('sort_order = ?');
      values.push(Number(body.sort_order));
    }
    if (body.start_sec !== undefined) {
      fields.push('start_sec = ?');
      values.push(Number(body.start_sec));
    }
    if (body.end_sec !== undefined) {
      fields.push('end_sec = ?');
      values.push(Number(body.end_sec));
    }

    if (fields.length > 0) {
      values.push(clipId);
      await execute(`UPDATE clips SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    const updated = await queryOne<any>(`
      SELECT c.*, e.caption_segments, e.style, e.frame, e.audio
      FROM clips c
      LEFT JOIN clip_edits e ON e.clip_id = c.id
      WHERE c.id = ?
    `, [clipId]);

    return NextResponse.json({
      clip: {
        ...updated,
        score_breakdown: fromJson(updated?.score_breakdown, null),
        hashtags: fromJson(updated?.hashtags, []),
        caption_segments: fromJson(updated?.caption_segments, []),
        style: fromJson(updated?.style, null),
        frame: fromJson(updated?.frame, null),
        audio: fromJson(updated?.audio, null),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clipId = Number(id);
    if (!clipId) {
      return NextResponse.json({ error: 'ID clip tidak valid' }, { status: 400 });
    }

    const clip = await queryOne<Clip>('SELECT * FROM clips WHERE id = ?', [clipId]);
    if (!clip) {
      return NextResponse.json({ error: 'Klip tidak ditemukan' }, { status: 404 });
    }

    await execute('DELETE FROM clips WHERE id = ?', [clipId]);

    // Hapus file preview jika ada
    if (clip.preview_path) {
      const p = path.resolve(process.cwd(), '..', 'storage', clip.preview_path);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    if (clip.thumbnail_path) {
      const p = path.resolve(process.cwd(), '..', 'storage', clip.thumbnail_path);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
