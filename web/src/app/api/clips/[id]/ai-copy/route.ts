import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute, fromJson, toJson } from '@/lib/db';
import fs from 'fs';
import path from 'path';

interface EnvKeys {
  gemini: string;
  openai: string;
  groq: string;
  anthropic: string;
}

function getApiKeys(): EnvKeys {
  const keys: EnvKeys = {
    gemini: process.env.GEMINI_API_KEY || '',
    openai: process.env.OPENAI_API_KEY || '',
    groq: process.env.GROQ_API_KEY || '',
    anthropic: process.env.ANTHROPIC_API_KEY || '',
  };
  try {
    const envPath = path.resolve(process.cwd(), '..', 'worker', '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [k, ...v] = trimmed.split('=');
        const keyName = k.trim();
        const val = v.join('=').trim();
        if (keyName === 'GEMINI_API_KEY' && val) keys.gemini = val;
        if (keyName === 'OPENAI_API_KEY' && val) keys.openai = val;
        if (keyName === 'GROQ_API_KEY' && val) keys.groq = val;
        if (keyName === 'ANTHROPIC_API_KEY' && val) keys.anthropic = val;
      }
    }
  } catch (err) {
    console.warn('Gagal membaca .env worker:', err);
  }
  return keys;
}

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

    const body = await req.json().catch(() => ({}));
    const tone = body.tone || 'viral_hook';

    // 1. Ambil data klip & caption
    const clip = await queryOne<any>(
      `
      SELECT c.*, e.caption_segments
      FROM clips c
      LEFT JOIN clip_edits e ON e.clip_id = c.id
      WHERE c.id = ?
      `,
      [clipId]
    );

    if (!clip) {
      return NextResponse.json({ error: 'Klip tidak ditemukan' }, { status: 404 });
    }

    // 2. Kumpulkan teks transkrip klip
    let transcriptText = '';
    const segments = fromJson(clip.caption_segments, []);
    if (Array.isArray(segments) && segments.length > 0) {
      transcriptText = segments.map((s: any) => s.text || '').join(' ');
    }

    // Jika caption_segments kosong, ambil dari transkrip proyek
    if (!transcriptText || transcriptText.trim().length < 10) {
      const transcriptRow = await queryOne<any>(
        'SELECT words FROM transcripts WHERE project_id = ?',
        [clip.project_id]
      );
      if (transcriptRow?.words) {
        const words = fromJson(transcriptRow.words, []);
        const filtered = words.filter(
          (w: any) => w.start >= clip.start_sec - 0.5 && w.end <= clip.end_sec + 0.5
        );
        transcriptText = filtered.map((w: any) => w.word).join(' ');
      }
    }

    if (!transcriptText.trim()) {
      transcriptText = clip.title || 'Video menarik dan inspiratif';
    }

    const keys = getApiKeys();
    let generatedTitle = '';
    let generatedDesc = '';
    let generatedTags: string[] = [];
    let altTitles: string[] = [];

    // Tone instruction
    let tonePrompt = 'Gaya: Hook penasaran, kontroversial halus, memicu rasa ingin tahu seketika.';
    if (tone === 'question_curiosity') {
      tonePrompt = 'Gaya: Pertanyaan menusuk atau relatable yang membuat penonton berhenti scrolling.';
    } else if (tone === 'story_emotion') {
      tonePrompt = 'Gaya: Storytelling dramatis, emosional, dan menyentuh hati.';
    } else if (tone === 'education_action') {
      tonePrompt = 'Gaya: Tips praktis, bernilai tinggi, solutif, dan mudah dipraktikkan.';
    }

    const prompt = `Anda adalah copywriter dan content strategist video viral profesional untuk TikTok, Instagram Reels, dan YouTube Shorts.
Tugas Anda adalah membuat Judul Hook, Caption siap posting, dan Rekomendasi Hashtag berdasarkan transkrip klip video berikut:

TRANSKRIP KLIP:
"${transcriptText.slice(0, 1500)}"

PANDUAN:
${tonePrompt}
- Judul harus singkat, padat, nendang (maksimal 8-10 kata), tanpa tanda kutip.
- Buat juga 2 variasi alternatif judul yang sama menariknya.
- Deskripsi/Caption harus 2-3 baris rapi:
  * Baris 1: Hook pembuka yang bikin orang betah membaca.
  * Baris 2: Insight / inti pembahasan video.
  * Baris 3: Ajakan bertindak (Call To Action: ajak komen/save/share).
- Hashtag harus 10-14 tag terkurasi:
  * 4-6 tag spesifik sesuai topik ucapan di video.
  * 3-4 tag kategori umum & edukasi/hiburan.
  * 2-3 tag reach/format (#fyp, #reelsindonesia, #shorts, #viral).

KEMBALIKAN HANYA JSON DENGAN FORMAT INI (tanpa markdown atau teks lain):
{
  "title": "Judul Utama Viral",
  "alternative_titles": ["Variasi Judul 1", "Variasi Judul 2"],
  "description": "Baris hook pembuka!\\n\\nInti pembahasan video yang memicu rasa ingin tahu.\\n\\nKira-kira kamu setuju nggak? Tulis di kolom komentar & simpan video ini ya! 👇",
  "hashtags": ["#topik1", "#topik2", "#edukasi", "#mindset", "#fyp", "#reelsindonesia"]
}`;

    const parseLlmJson = (rawText: string) => {
      try {
        const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.title) generatedTitle = parsed.title;
        if (parsed.description) generatedDesc = parsed.description;
        if (Array.isArray(parsed.hashtags) && parsed.hashtags.length > 0) {
          generatedTags = parsed.hashtags.map((t: string) => (t.startsWith('#') ? t : `#${t}`));
        }
        if (Array.isArray(parsed.alternative_titles)) {
          altTitles = parsed.alternative_titles;
        }
        return Boolean(generatedTitle && generatedDesc);
      } catch (e) {
        return false;
      }
    };

    // 1. Coba Gemini jika ada
    if (!generatedTitle && keys.gemini) {
      const candidateModels = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];
      for (const m of candidateModels) {
        try {
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${keys.gemini}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.6, responseMimeType: 'application/json' },
              }),
              signal: AbortSignal.timeout(45000),
            }
          );
          if (r.ok) {
            const jsonRes = await r.json();
            const rawText = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText && parseLlmJson(rawText)) break;
          }
        } catch (errLoop) {
          console.warn(`Gemini model ${m} gagal:`, errLoop);
        }
      }
    }

    // 2. Coba OpenAI jika ada (gpt-4o-mini / gpt-4o)
    if (!generatedTitle && keys.openai) {
      try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${keys.openai}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.6,
          }),
          signal: AbortSignal.timeout(45000),
        });
        if (r.ok) {
          const jsonRes = await r.json();
          const raw = jsonRes.choices?.[0]?.message?.content;
          if (raw) parseLlmJson(raw);
        }
      } catch (errOpenai) {
        console.warn('OpenAI copywriting gagal:', errOpenai);
      }
    }

    // 3. Coba Groq jika ada (llama-3.3-70b-versatile)
    if (!generatedTitle && keys.groq) {
      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${keys.groq}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.6,
          }),
          signal: AbortSignal.timeout(45000),
        });
        if (r.ok) {
          const jsonRes = await r.json();
          const raw = jsonRes.choices?.[0]?.message?.content;
          if (raw) parseLlmJson(raw);
        }
      } catch (errGroq) {
        console.warn('Groq copywriting gagal:', errGroq);
      }
    }

    // 4. Coba Anthropic jika ada (claude-3-7-sonnet / claude-3-5-sonnet / haiku)
    if (!generatedTitle && keys.anthropic) {
      const claudeModels = [
        'claude-3-7-sonnet-20250219',
        'claude-3-5-sonnet-latest',
        'claude-3-5-haiku-20241022',
        'claude-3-5-haiku-latest',
        'claude-3-sonnet-20240229',
      ];
      for (const cm of claudeModels) {
        try {
          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': keys.anthropic,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: cm,
              max_tokens: 1500,
              messages: [{ role: 'user', content: prompt }],
            }),
            signal: AbortSignal.timeout(45000),
          });
          if (r.ok) {
            const jsonRes = await r.json();
            const raw = jsonRes.content?.[0]?.text;
            if (raw && parseLlmJson(raw)) break;
          }
        } catch (errAnthropic) {
          console.warn(`Anthropic model ${cm} gagal:`, errAnthropic);
        }
      }
    }

    // Smart Heuristic Fallback jika API gagal atau offline
    if (!generatedTitle || !generatedDesc || generatedTags.length === 0) {
      const words = transcriptText.split(/\s+/).filter(Boolean);
      const cleanWords = words.map((w) => w.replace(/[^\w]/g, '').toLowerCase());

      // Cari kata kunci penting dari transkrip
      const stopWords = new Set([
        'yang', 'di', 'ke', 'dari', 'pada', 'dan', 'ini', 'itu', 'untuk', 'dengan',
        'saya', 'kamu', 'dia', 'kita', 'mereka', 'akan', 'bisa', 'ada', 'tidak', 'juga',
        'sudah', 'karena', 'jadi', 'lagi', 'saja', 'kalau', 'nah', 'ya', 'kan', 'sih',
      ]);
      const topicKeywords = Array.from(new Set(cleanWords.filter((w) => w.length > 3 && !stopWords.has(w)))).slice(0, 6);

      generatedTitle = `Rahasia di Balik ${topicKeywords[0] || 'Momen Ini'} yang Jarang Terungkap!`;
      altTitles = [
        `Pernah Nyadar Nggak Soal Hal Ini? Simak!`,
        `Stop Skip Dulu! Penjelasan Ini Bakal Buka Pikiranmu`,
      ];
      generatedDesc = `Jangan skip kalau kamu ingin paham intinya! 🔥\n\nPenjelasan penting yang bakal ngebantu kamu melihat hal ini dari sudut pandang baru.\n\nBagikan video ini ke teman yang butuh & simpan biar nggak lupa! 👇`;

      const dynamicTags = topicKeywords.map((k) => `#${k}`);
      generatedTags = Array.from(
        new Set([
          ...dynamicTags,
          '#insight',
          '#edukasi',
          '#tipsberharga',
          '#reelsindonesia',
          '#videoviral',
          '#fyp',
          '#shorts',
        ])
      );
    }

    // 3. Simpan perubahan ke database
    await execute(
      `
      UPDATE clips
      SET title = ?,
          description = ?,
          hashtags = ?
      WHERE id = ?
      `,
      [generatedTitle, generatedDesc, toJson(generatedTags), clipId]
    );

    return NextResponse.json({
      success: true,
      title: generatedTitle,
      alternative_titles: altTitles,
      description: generatedDesc,
      hashtags: generatedTags,
    });
  } catch (err: any) {
    console.error('Error generating AI copy:', err);
    return NextResponse.json({ error: err.message || 'Gagal menghasilkan copy AI.' }, { status: 500 });
  }
}
