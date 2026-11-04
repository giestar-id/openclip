import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL video wajib diisi.' }, { status: 400 });
    }

    const workerDir = path.resolve(process.cwd(), '..', 'worker');
    const pythonExe = process.platform === 'win32'
      ? path.join(workerDir, '.venv', 'Scripts', 'python.exe')
      : path.join(workerDir, '.venv', 'bin', 'python');

    const script = `
import json, sys
from clipper import downloader
try:
    res = downloader.probe(sys.argv[1])
    print("PROBE_RESULT:" + json.dumps(res))
except Exception as e:
    print("PROBE_ERROR:" + str(e))
    sys.exit(1)
`;

    const proc = spawn(pythonExe, ['-c', script, url], {
      cwd: workerDir,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    const exitCode = await new Promise<number>((resolve) => {
      proc.on('close', resolve);
    });

    if (exitCode !== 0) {
      const errMatch = stdout.match(/PROBE_ERROR:(.+)/);
      const errMsg = errMatch ? errMatch[1].trim() : (stderr.trim() || 'Gagal memvalidasi URL video.');
      return NextResponse.json({ error: errMsg }, { status: 422 });
    }

    const resMatch = stdout.match(/PROBE_RESULT:(.+)/);
    if (!resMatch) {
      return NextResponse.json({ error: 'Output probe tidak valid.' }, { status: 500 });
    }

    const probeData = JSON.parse(resMatch[1]);
    return NextResponse.json({ data: probeData });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
