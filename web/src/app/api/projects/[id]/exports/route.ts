import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { Project } from '@/lib/types';

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

    const project = await queryOne<Project>('SELECT id FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ error: 'Project tidak ditemukan' }, { status: 404 });
    }

    // Ambil export terbaru untuk setiap klip pada proyek ini
    const exportsList = await query<any>(
      `
      SELECT e.id, e.clip_id, e.project_id, e.resolution, e.file_path, e.status, e.progress, e.error,
             e.created_at, e.finished_at,
             c.title AS clip_title, c.viral_score, c.start_sec, c.end_sec, c.thumbnail_path
      FROM exports e
      JOIN clips c ON e.clip_id = c.id
      WHERE e.project_id = ?
        AND e.id IN (
          SELECT MAX(id) FROM exports WHERE project_id = ? GROUP BY clip_id
        )
      ORDER BY c.sort_order ASC, c.id ASC
      `,
      [projectId, projectId]
    );

    const summary = {
      total: exportsList.length,
      queued: exportsList.filter((e) => e.status === 'queued').length,
      rendering: exportsList.filter((e) => e.status === 'rendering').length,
      done: exportsList.filter((e) => e.status === 'done').length,
      failed: exportsList.filter((e) => e.status === 'failed').length,
    };

    return NextResponse.json({
      exports: exportsList,
      summary,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
