import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { Project, Clip } from '@/lib/types';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiver = require('archiver');
import fs from 'fs';
import path from 'path';
import { PassThrough } from 'stream';

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

    const clips = await query<Clip>(
      'SELECT * FROM clips WHERE project_id = ? AND (export_path IS NOT NULL OR preview_path IS NOT NULL)',
      [projectId]
    );

    if (clips.length === 0) {
      return NextResponse.json({ error: 'Belum ada klip yang siap untuk di-download.' }, { status: 400 });
    }

    const archive = archiver('zip', { zlib: { level: 6 } });
    const passthrough = new PassThrough();

    let filesAdded = 0;
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      const rel = c.export_path || c.preview_path;
      if (!rel) continue;

      const abs = path.resolve(process.cwd(), '..', 'storage', rel);
      if (fs.existsSync(abs)) {
        const cleanTitle = (c.title || `clip_${i + 1}`).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
        const entryName = `${String(i + 1).padStart(2, '0')}_${cleanTitle}_1080p.mp4`;
        archive.file(abs, { name: entryName });
        filesAdded++;
      }
    }

    if (filesAdded === 0) {
      return NextResponse.json({ error: 'File video klip tidak ditemukan di disk storage.' }, { status: 404 });
    }

    archive.pipe(passthrough);
    archive.finalize();

    const cleanProjTitle = (project.title || `project_${projectId}`).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
    const filename = `${cleanProjTitle}_clips.zip`;

    // Convert node PassThrough stream to web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        passthrough.on('data', (chunk) => controller.enqueue(chunk));
        passthrough.on('end', () => controller.close());
        passthrough.on('error', (err) => controller.error(err));
      },
    });

    return new Response(webStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
