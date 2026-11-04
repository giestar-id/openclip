import { NextRequest, NextResponse } from 'next/server';
import { execute, toJson } from '@/lib/db';

export async function PUT(
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
    const { caption_segments, style, frame, audio } = body;

    await execute(
      `
      INSERT INTO clip_edits (
        clip_id, caption_segments, style, frame, audio
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(clip_id) DO UPDATE SET
        caption_segments = excluded.caption_segments,
        style = excluded.style,
        frame = excluded.frame,
        audio = excluded.audio,
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        clipId,
        caption_segments ? toJson(caption_segments) : null,
        style ? toJson(style) : null,
        frame ? toJson(frame) : null,
        audio ? toJson(audio) : null,
      ]
    );

    return NextResponse.json({
      success: true,
      updated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
