import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute, toJson } from '@/lib/db';
import { Project } from '@/lib/types';

export async function GET() {
  try {
    const projects = await query<any>(`
      SELECT p.*,
             COUNT(c.id) AS total_clips,
             SUM(CASE WHEN c.status = 'ready' THEN 1 ELSE 0 END) AS ready_clips,
             MAX(c.viral_score) AS max_viral_score
      FROM projects p
      LEFT JOIN clips c ON c.project_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);

    return NextResponse.json({ projects });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      source_url,
      title,
      thumbnail_url,
      clip_duration = 30,
      clip_count = 0,
      language = 'auto',
      transcribe_mode = 'local',
      transcribe_config,
      llm_provider = 'auto',
      rights_confirmed = true,
    } = body;

    if (!source_url || typeof source_url !== 'string') {
      return NextResponse.json({ error: 'URL video wajib diisi.' }, { status: 400 });
    }

    const insertId = await execute(
      `
      INSERT INTO projects (
        user_id, source_url, title, thumbnail_path, clip_duration, clip_count,
        language, transcribe_mode, transcribe_config, llm_provider,
        status, progress, progress_message, rights_confirmed_at
      ) VALUES (
        1, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        'queued', 0, 'Menunggu antrean worker...', ?
      )
      `,
      [
        source_url.trim(),
        title || null,
        thumbnail_url || null,
        Number(clip_duration) || 30,
        Number(clip_count) || 0,
        language || 'auto',
        transcribe_mode || 'local',
        transcribe_config ? toJson(transcribe_config) : null,
        llm_provider || 'auto',
        rights_confirmed ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null,
      ]
    );

    const project = await queryOne<Project>('SELECT * FROM projects WHERE id = ?', [insertId]);

    return NextResponse.json({ id: insertId, project }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
