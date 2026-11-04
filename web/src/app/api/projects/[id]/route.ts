import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute, fromJson } from '@/lib/db';
import { Project, Clip, ClipEdit, Transcript } from '@/lib/types';
import fs from 'fs';
import path from 'path';

export async function GET(
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

    // Ambil deretan klip beserta edit data
    const rawClips = await query<any>(`
      SELECT c.*,
             e.caption_segments, e.style, e.frame, e.audio, e.updated_at AS edit_updated_at
      FROM clips c
      LEFT JOIN clip_edits e ON e.clip_id = c.id
      WHERE c.project_id = ?
      ORDER BY c.sort_order ASC, c.viral_score DESC
    `, [projectId]);

    const clips = rawClips.map((c) => ({
      ...c,
      score_breakdown: fromJson(c.score_breakdown, null),
      hashtags: fromJson(c.hashtags, []),
      caption_segments: fromJson(c.caption_segments, []),
      style: fromJson(c.style, null),
      frame: fromJson(c.frame, null),
      audio: fromJson(c.audio, null),
    }));

    // Ambil transcript
    const rawTranscript = await queryOne<any>('SELECT * FROM transcripts WHERE project_id = ?', [projectId]);
    const transcript = rawTranscript ? {
      ...rawTranscript,
      words: fromJson(rawTranscript.words, []),
    } : null;

    // Baca peaks waveform jika ada di storage
    let peaks = null;
    const peaksFile = path.resolve(process.cwd(), '..', 'storage', 'projects', String(projectId), 'peaks.json');
    if (fs.existsSync(peaksFile)) {
      try {
        peaks = JSON.parse(fs.readFileSync(peaksFile, 'utf-8'));
      } catch {
        peaks = null;
      }
    }

    return NextResponse.json({
      project,
      clips,
      transcript,
      peaks,
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
    const projectId = Number(id);
    if (!projectId) {
      return NextResponse.json({ error: 'ID project tidak valid' }, { status: 400 });
    }

    await execute('DELETE FROM projects WHERE id = ?', [projectId]);

    // Hapus storage folder project
    const projDir = path.resolve(process.cwd(), '..', 'storage', 'projects', String(projectId));
    if (fs.existsSync(projDir)) {
      fs.rmSync(projDir, { recursive: true, force: true });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
