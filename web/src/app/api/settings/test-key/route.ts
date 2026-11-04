import { NextRequest, NextResponse } from 'next/server';
import { cleanApiKey } from '@/lib/apiKeyUtils';

export async function POST(req: NextRequest) {
  try {
    const { provider, api_key } = await req.json();

    const key = cleanApiKey(api_key);
    if (!key) {
      return NextResponse.json({
        success: false,
        message: 'API key masih kosong atau tidak valid (hanya variabel).',
      }, { status: 400 });
    }

    if (provider === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        return NextResponse.json({
          success: true,
          message: 'Koneksi Groq API Berhasil! Model Whisper & Llama siap digunakan.',
        });
      }
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({
        success: false,
        message: data.error?.message || `Kunci Groq ditolak (Status ${res.status}).`,
      });
    }

    if (provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (res.ok) {
        return NextResponse.json({
          success: true,
          message: 'Koneksi Google Gemini API Berhasil! Multimodal Flash aktif.',
        });
      }
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({
        success: false,
        message: data.error?.message || `Kunci Gemini ditolak (Status ${res.status}).`,
      });
    }

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        return NextResponse.json({
          success: true,
          message: 'Koneksi OpenAI API Berhasil! Model GPT & Whisper aktif.',
        });
      }
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({
        success: false,
        message: data.error?.message || `Kunci OpenAI ditolak (Status ${res.status}).`,
      });
    }

    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
      });
      if (res.ok) {
        return NextResponse.json({
          success: true,
          message: 'Koneksi Anthropic Claude API Berhasil!',
        });
      }
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({
        success: false,
        message: data.error?.message || `Kunci Anthropic ditolak (Status ${res.status}).`,
      });
    }

    return NextResponse.json({
      success: false,
      message: `Provider '${provider}' tidak dikenali.`,
    }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      message: err.message || 'Koneksi gagal atau time out saat menghubungi server API provider.',
    }, { status: 500 });
  }
}
