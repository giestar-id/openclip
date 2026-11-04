import { NextRequest, NextResponse } from 'next/server';
import { getSettings, setSetting } from '@/lib/db';
import { cleanApiKey } from '@/lib/apiKeyUtils';
import fs from 'fs';
import path from 'path';

function getWorkerEnvPath(): string {
  const possiblePaths = [
    path.resolve(process.cwd(), '..', 'worker', '.env'),
    path.resolve(process.cwd(), 'worker', '.env'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(/*turbopackIgnore: true*/ p)) return p;
  }
  return possiblePaths[0];
}

function readKeyFromEnv(content: string, keyName: string): string {
  // Gunakan [ \t]* agar tidak menyerap baris baru (\n atau \r), mencegah nilai baris bawah terbaca ke atas
  const match = content.match(new RegExp(`^[ \\t]*${keyName}[ \\t]*=[ \\t]*([^\\r\\n#]*)`, 'm'));
  return match && match[1] ? cleanApiKey(match[1]) : '';
}

function updateEnvFile(filePath: string, updates: Record<string, string>) {
  let content = fs.existsSync(/*turbopackIgnore: true*/ filePath) ? fs.readFileSync(/*turbopackIgnore: true*/ filePath, 'utf-8') : '';

  for (const [key, value] of Object.entries(updates)) {
    const val = cleanApiKey(value);
    const regex = new RegExp(`^[ \\t]*#?[ \\t]*${key}[ \\t]*=.*$`, 'm');

    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${val}`);
    } else {
      content += `\n${key}=${val}`;
    }
  }

  // Pastikan folder parent ada
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, content.trim() + '\n', 'utf-8');
}

export async function GET() {
  try {
    const settings = await getSettings();
    const envPath = getWorkerEnvPath();
    const envContent = fs.existsSync(/*turbopackIgnore: true*/ envPath) ? fs.readFileSync(/*turbopackIgnore: true*/ envPath, 'utf-8') : '';

    // Ambil API keys dari database, fallback ke worker/.env jika di database masih kosong
    // Selalu bersihkan nilai dari prefix variabel seperti "OPENAI_API_KEY="
    const groqKey = cleanApiKey(settings.groq_api_key) || readKeyFromEnv(envContent, 'GROQ_API_KEY');
    const openaiKey = cleanApiKey(settings.openai_api_key) || readKeyFromEnv(envContent, 'OPENAI_API_KEY');
    const anthropicKey = cleanApiKey(settings.anthropic_api_key) || readKeyFromEnv(envContent, 'ANTHROPIC_API_KEY');
    const geminiKey = cleanApiKey(settings.gemini_api_key) || readKeyFromEnv(envContent, 'GEMINI_API_KEY');

    // Pastikan nilai bersih dimasukkan ke settings yang dikembalikan
    settings.groq_api_key = groqKey;
    settings.openai_api_key = openaiKey;
    settings.anthropic_api_key = anthropicKey;
    settings.gemini_api_key = geminiKey;

    return NextResponse.json({
      settings,
      keys: {
        groq: Boolean(groqKey),
        openai: Boolean(openaiKey),
        anthropic: Boolean(anthropicKey),
        gemini: Boolean(geminiKey),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const envUpdates: Record<string, string> = {};
    const apiKeyFields = ['groq_api_key', 'openai_api_key', 'anthropic_api_key', 'gemini_api_key'];

    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') {
        const isApiKey = apiKeyFields.includes(key);
        const finalVal = isApiKey ? cleanApiKey(value) : value.trim();

        await setSetting(key, finalVal);

        // Sinkronisasi ke .env jika parameter adalah API key
        if (key === 'groq_api_key') envUpdates['GROQ_API_KEY'] = finalVal;
        if (key === 'openai_api_key') envUpdates['OPENAI_API_KEY'] = finalVal;
        if (key === 'anthropic_api_key') envUpdates['ANTHROPIC_API_KEY'] = finalVal;
        if (key === 'gemini_api_key') envUpdates['GEMINI_API_KEY'] = finalVal;
      }
    }

    // Perbarui file worker/.env jika ada API key yang diupdate
    if (Object.keys(envUpdates).length > 0) {
      try {
        const envPath = getWorkerEnvPath();
        updateEnvFile(envPath, envUpdates);
      } catch (envErr) {
        console.warn('Gagal memperbarui worker/.env secara otomatis:', envErr);
      }
    }

    const updated = await getSettings();
    updated.groq_api_key = cleanApiKey(updated.groq_api_key);
    updated.openai_api_key = cleanApiKey(updated.openai_api_key);
    updated.anthropic_api_key = cleanApiKey(updated.anthropic_api_key);
    updated.gemini_api_key = cleanApiKey(updated.gemini_api_key);

    return NextResponse.json({
      settings: updated,
      keys: {
        groq: Boolean(updated.groq_api_key),
        openai: Boolean(updated.openai_api_key),
        anthropic: Boolean(updated.anthropic_api_key),
        gemini: Boolean(updated.gemini_api_key),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
