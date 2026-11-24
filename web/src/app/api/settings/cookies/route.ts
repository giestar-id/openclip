import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function getCookiesFilePath(): string {
  return path.resolve(process.cwd(), '..', 'storage', 'cookies.txt');
}

function getCookieStatus() {
  const filePath = getCookiesFilePath();
  if (!fs.existsSync(filePath)) {
    return { exists: false, size: 0, updatedAt: null, cookieCount: 0 };
  }
  const stat = fs.statSync(filePath);
  let cookieCount = 0;
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    cookieCount = text
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith('#') && line.includes('\t'))
      .length;
  } catch {
    cookieCount = 0;
  }
  return {
    exists: true,
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
    cookieCount,
  };
}

export async function GET() {
  try {
    return NextResponse.json(getCookieStatus());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let content = '';
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');
      if (!file || typeof file === 'string') {
        return NextResponse.json({ error: 'File cookies.txt tidak ditemukan.' }, { status: 400 });
      }
      content = await file.text();
    } else {
      const body = await req.json();
      content = String(body?.content || '');
    }

    const trimmed = content.trim();
    if (!trimmed) {
      return NextResponse.json({ error: 'Isi file cookies.txt kosong.' }, { status: 400 });
    }

    const lines = trimmed.split(/\r?\n/);
    const validEntries = lines.filter((l) => l.trim() && !l.trim().startsWith('#') && l.split('\t').length >= 6);
    if (validEntries.length === 0) {
      return NextResponse.json(
        { error: 'Format tidak valid. Gunakan file Netscape cookies.txt (hasil ekspor ekstensi browser).' },
        { status: 400 }
      );
    }

    const filePath = getCookiesFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');

    return NextResponse.json({
      success: true,
      ...getCookieStatus(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Gagal menyimpan cookies.txt' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const filePath = getCookiesFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return NextResponse.json({
      success: true,
      ...getCookieStatus(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Gagal menghapus cookies.txt' }, { status: 500 });
  }
}
