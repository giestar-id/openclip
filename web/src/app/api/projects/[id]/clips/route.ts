import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute, fromJson, toJson } from '@/lib/db';
import { Project, Transcript } from '@/lib/types';
import { DEFAULT_STYLE, DEFAULT_FRAME, DEFAULT_AUDIO } from '@/lib/captions';
import { spawn } from 'child_process';
import path from 'path';

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

    const body = await req.json();
    const { start_sec, end_sec, title = 'Klip Manual' } = body;

    const start = Number(start_sec);
    const end = Number(end_sec);

    if (isNaN(start) || isNaN(end) || end <= start) {
      return NextResponse.json({ error: 'Rentang waktu start_sec dan end_sec tidak valid.' }, { status: 400 });
    }

    const project = await queryOne<Project>('SELECT * FROM projects WHERE id = ?', [projectId]);
    if (!project || !project.source_path) {
      return NextResponse.json({ error: 'Project atau video sumber tidak ditemukan.' }, { status: 404 });
    }

    // Gunakan helper python clipper.manual_clip untuk memotong preview & generate thumbnail cepat
    // Transkrip kata dimuat langsung dari SQLite oleh worker untuk menghindari batas argumen baris perintah Windows (ENAMETOOLONG)
    const workerDir = path.resolve(process.cwd(), '..', 'worker');
    const pythonExe = process.platform === 'win32'
      ? path.join(workerDir, '.venv', 'Scripts', 'python.exe')
      : path.join(workerDir, '.venv', 'bin', 'python');

    const proc = spawn(
      pythonExe,
      ['-m', 'clipper.manual_clip', String(projectId), String(start), String(end), project.source_path],
      { cwd: workerDir }
    );

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    const exitCode = await new Promise<number>((resolve) => {
      proc.on('close', resolve);
    });

    if (exitCode !== 0) {
      return NextResponse.json({ error: `Gagal memproses klip manual: ${stderr || stdout}` }, { status: 500 });
    }

    const match = stdout.match(/RESULT:(.+)/);
    if (!match) {
      return NextResponse.json({ error: 'Gagal membaca output pemotongan klip manual.' }, { status: 500 });
    }

    const { preview_path, thumbnail_path, segments, p_start, p_end, frame: manualFrame } = JSON.parse(match[1]);

    const maxSort = await queryOne<{ max_s: number }>('SELECT MAX(sort_order) AS max_s FROM clips WHERE project_id = ?', [projectId]);
    const nextSort = (maxSort?.max_s ?? 0) + 1;

    const clipId = await execute(
      `
      INSERT INTO clips (
        project_id, start_sec, end_sec, preview_start_sec, preview_end_sec,
        viral_score, reason, title, description, hashtags,
        preview_path, thumbnail_path, status, is_favorite, is_manual, sort_order
      ) VALUES (
        ?, ?, ?, ?, ?,
        85, 'Dipotong manual oleh pengguna.', ?, 'Klip pilihan manual', ?,
        ?, ?, 'ready', 0, 1, ?
      )
      `,
      [
        projectId,
        start,
        end,
        p_start,
        p_end,
        title,
        toJson(['#manualclip', '#custom', '#reels']),
        preview_path,
        thumbnail_path,
        nextSort,
      ]
    );

    await execute(
      `
      INSERT INTO clip_edits (
        clip_id, caption_segments, style, frame, audio
      ) VALUES (?, ?, ?, ?, ?)
      `,
      [
        clipId,
        toJson(segments),
        toJson(DEFAULT_STYLE),
        toJson(manualFrame || DEFAULT_FRAME),
        toJson(DEFAULT_AUDIO),
      ]
    );

    const createdClip = await queryOne<any>(`
      SELECT c.*, e.caption_segments, e.style, e.frame, e.audio
      FROM clips c
      LEFT JOIN clip_edits e ON e.clip_id = c.id
      WHERE c.id = ?
    `, [clipId]);

    return NextResponse.json({
      clip: {
        ...createdClip,
        caption_segments: fromJson(createdClip.caption_segments, []),
        style: fromJson(createdClip.style, DEFAULT_STYLE),
        frame: fromJson(createdClip.frame, DEFAULT_FRAME),
        audio: fromJson(createdClip.audio, DEFAULT_AUDIO),
      },
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
