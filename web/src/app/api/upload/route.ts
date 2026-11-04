import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { execute, queryOne, toJson } from '@/lib/db';
import { Project } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'File video wajib diunggah.' }, { status: 400 });
    }

    const originalName = file.name || 'uploaded_video.mp4';
    const cleanTitle = (formData.get('title') as string)?.trim() || originalName.replace(/\.[^/.]+$/, '');
    const clipDuration = Number(formData.get('clip_duration')) || 30;
    const clipCount = Number(formData.get('clip_count')) || 0;
    const language = (formData.get('language') as string) || 'id';
    const transcribeMode = (formData.get('transcribe_mode') as string) || 'local';
    const transcribeConfigRaw = formData.get('transcribe_config') as string | null;
    const llmProvider = (formData.get('llm_provider') as string) || 'auto';
    const duration = Number(formData.get('duration')) || null;
    const width = Number(formData.get('width')) || null;
    const height = Number(formData.get('height')) || null;
    const thumbnailData = formData.get('thumbnail_data') as string | null;

    const originalExt = path.extname(originalName).toLowerCase() || '.mp4';
    const validExts = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'];
    if (!validExts.includes(originalExt)) {
      return NextResponse.json(
        { error: `Format file '${originalExt}' tidak didukung. Harap unggah video (.mp4, .mov, .webm, .mkv, .avi).` },
        { status: 400 }
      );
    }
    const safeExt = originalExt;

    // Batasi ukuran file maksimum 2 GB
    if (file.size > 2 * 1024 * 1024 * 1024) {
      return NextResponse.json({ error: 'Ukuran file video terlalu besar (maksimal 2 GB).' }, { status: 400 });
    }

    // 1. Masukkan entri project baru ke database SQLite
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const insertId = await execute(
      `
      INSERT INTO projects (
        user_id, source_url, title, clip_duration, clip_count,
        language, transcribe_mode, transcribe_config, llm_provider,
        status, progress, progress_message, duration_sec, width, height, rights_confirmed_at
      ) VALUES (
        1, ?, ?, ?, ?,
        ?, ?, ?, ?,
        'queued', 0, 'Menyiapkan file upload...', ?, ?, ?, ?
      )
      `,
      [
        `local:${originalName}`,
        cleanTitle,
        clipDuration,
        clipCount,
        language,
        transcribeMode,
        transcribeConfigRaw ? JSON.parse(transcribeConfigRaw) : null,
        llmProvider,
        duration,
        width,
        height,
        nowIso,
      ]
    );

    // 2. Buat folder penyimpanan project: storage/projects/{insertId}
    const storageDir = path.resolve(process.cwd(), '..', 'storage');
    const projectDir = path.join(storageDir, 'projects', String(insertId));
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // 3. Simpan file video ke storage/projects/{insertId}/source{safeExt}
    const targetVideoPath = path.join(projectDir, `source${safeExt}`);
    const nodeStream = Readable.fromWeb(file.stream() as any);
    const writeStream = fs.createWriteStream(targetVideoPath);
    await pipeline(nodeStream, writeStream);

    // 4. Jika ada thumbnail_data (base64 image dari canvas browser), simpan ke source_thumb.jpg
    let relThumbnailPath: string | null = null;
    if (thumbnailData && thumbnailData.startsWith('data:image/')) {
      try {
        const base64Data = thumbnailData.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const thumbFile = path.join(projectDir, 'source_thumb.jpg');
        fs.writeFileSync(thumbFile, buffer);
        relThumbnailPath = `projects/${insertId}/source_thumb.jpg`;
      } catch (thumbErr) {
        console.warn('Gagal menyimpan thumbnail client:', thumbErr);
      }
    }

    // 5. Update data project dengan source_path dan thumbnail_path
    const relSourcePath = `projects/${insertId}/source${safeExt}`;
    await execute(
      `
      UPDATE projects
      SET source_path = ?,
          thumbnail_path = COALESCE(?, thumbnail_path),
          progress_message = 'Menunggu antrean worker...'
      WHERE id = ?
      `,
      [relSourcePath, relThumbnailPath, insertId]
    );

    const project = await queryOne<Project>('SELECT * FROM projects WHERE id = ?', [insertId]);

    return NextResponse.json({ id: insertId, project }, { status: 201 });
  } catch (err: any) {
    console.error('Error handling upload in /api/upload:', err);
    return NextResponse.json(
      { error: err.message || 'Gagal mengunggah file video.' },
      { status: 500 }
    );
  }
}
