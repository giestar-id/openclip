import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

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

    const workerDir = path.resolve(process.cwd(), '..', 'worker');
    const pythonExe = process.platform === 'win32'
      ? path.join(workerDir, '.venv', 'Scripts', 'python.exe')
      : path.join(workerDir, '.venv', 'bin', 'python');

    const script = `
import json, sys, os
from clipper import db, config, face_tracker

clip_id = int(sys.argv[1])
clip = db.one("SELECT * FROM clips WHERE id = ?", (clip_id,))
if not clip:
    print("ERROR:Clip not found")
    sys.exit(1)

p = db.one("SELECT source_path FROM projects WHERE id = ?", (clip["project_id"],))
src_video = None
if p and p.get("source_path"):
    try:
        cand = config.abs_storage(p["source_path"])
        if cand.exists():
            src_video = cand
    except Exception:
        pass
if not src_video:
    pdir = config.project_dir(clip["project_id"])
    for f in pdir.glob("source.*"):
        if f.suffix.lower() in (".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"):
            src_video = f
            break
if not src_video or not src_video.exists():
    print("ERROR:Video source file not found")
    sys.exit(1)
edit = db.one("SELECT frame, caption_segments FROM clip_edits WHERE clip_id = ?", (clip_id,))

cur_frame = json.loads(edit["frame"]) if edit and edit.get("frame") else {}
caps = json.loads(edit["caption_segments"]) if edit and edit.get("caption_segments") else None

res = face_tracker.analyze_clip_faces(
    src_video,
    clip["start_sec"],
    clip["end_sec"],
    sample_interval=0.4,
    caption_segments=caps,
)

cur_frame["hasFace"] = res["has_face"]
cur_frame["faceTracking"] = True
cur_frame["offsetX"] = res["offset_x"]
cur_frame["offsetY"] = res["offset_y"]
cur_frame["trackingMode"] = res["tracking_mode"]
cur_frame["detectedSpeakers"] = res["detected_speakers"]
cur_frame["speakerShots"] = res["speaker_shots"]
cur_frame["trackingKeyframes"] = res["tracking_keyframes"]
cur_frame["isMultiSpeaker"] = res["is_multi_speaker"]

db.execute("UPDATE clip_edits SET frame = ? WHERE clip_id = ?", (json.dumps(cur_frame), clip_id))
print("RETRACK_SUCCESS:" + json.dumps(cur_frame))
`;

    return await new Promise<NextResponse>((resolve) => {
      const proc = spawn(pythonExe, ['-c', script, String(clipId)], {
        cwd: workerDir,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          console.error('Retrack error:', stderr);
          return resolve(
            NextResponse.json({ error: stderr || 'Gagal memproses ulang tracking wajah' }, { status: 500 })
          );
        }

        const match = stdout.match(/RETRACK_SUCCESS:([\s\S]+)$/);
        if (match) {
          try {
            const frame = JSON.parse(match[1].trim());
            return resolve(NextResponse.json({ success: true, frame }));
          } catch (e: any) {
            return resolve(
              NextResponse.json({ error: 'Gagal mem-parsing hasil tracking: ' + e.message }, { status: 500 })
            );
          }
        }

        return resolve(
          NextResponse.json({ error: 'Output tracking tidak valid: ' + stdout }, { status: 500 })
        );
      });
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

