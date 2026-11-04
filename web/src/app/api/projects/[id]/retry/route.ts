import { NextRequest, NextResponse } from 'next/server';
import { execute, queryOne } from '@/lib/db';
import { Project } from '@/lib/types';

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

    await execute(
      `
      UPDATE projects
      SET status = 'queued',
          error = NULL,
          failed_stage = NULL,
          progress = 0,
          progress_message = 'Menunggu antrean ulang worker...'
      WHERE id = ?
      `,
      [projectId]
    );

    const project = await queryOne<Project>('SELECT * FROM projects WHERE id = ?', [projectId]);
    return NextResponse.json({ project });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
