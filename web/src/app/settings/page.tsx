'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import {
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Zap,
  ExternalLink,
  ShieldCheck,
  Cpu,
  Brain,
  Trash2,
  Save,
  Check,
  HardDrive,
} from 'lucide-react';
import { cleanApiKey } from '@/lib/apiKeyUtils';

interface KeysStatus {
  groq: boolean;
  openai: boolean;
  anthropic: boolean;
  gemini: boolean;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Form states - AI Settings
  const [transcribeMode, setTranscribeMode] = useState('local');
  const [transcribeApiProvider, setTranscribeApiProvider] = useState('groq');
  const [localModel, setLocalModel] = useState('base');
  const [localDevice, setLocalDevice] = useState('cpu');
  const [localComputeType, setLocalComputeType] = useState('int8');
  const [llmProvider, setLlmProvider] = useState('anthropic');
  const [retentionDays, setRetentionDays] = useState('7');

  // Form states - Direct API Keys
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [groqApiKey, setGroqApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');

  // Password visibility state
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({
    gemini: false,
    groq: false,
    openai: false,
    anthropic: false,
  });

  // Key testing state
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string } | null>>({});

  const [keys, setKeys] = useState<KeysStatus>({
    groq: false,
    openai: false,
    anthropic: false,
    gemini: false,
  });

  const hasGeminiKey = Boolean(cleanApiKey(geminiApiKey));
  const hasGroqKey = Boolean(cleanApiKey(groqApiKey));
  const hasOpenaiKey = Boolean(cleanApiKey(openaiApiKey));
  const hasAnthropicKey = Boolean(cleanApiKey(anthropicApiKey));

  const hasAnyTranscribeKey = hasGeminiKey || hasGroqKey || hasOpenaiKey;
  const hasAnyLlmKey = hasGeminiKey || hasOpenaiKey || hasGroqKey || hasAnthropicKey;

  // Sinkronisasi otomatis transcribeApiProvider jika key yang aktif berubah
  useEffect(() => {
    const available: string[] = [];
    if (hasGroqKey) available.push('groq');
    if (hasGeminiKey) available.push('gemini');
    if (hasOpenaiKey) available.push('openai');

    if (available.length > 0 && !available.includes(transcribeApiProvider)) {
      setTranscribeApiProvider(available[0]);
    }
  }, [hasGeminiKey, hasGroqKey, hasOpenaiKey, transcribeApiProvider]);

  // Sinkronisasi otomatis llmProvider jika key yang aktif berubah
  useEffect(() => {
    const availableLlm: string[] = [];
    if (hasGeminiKey) availableLlm.push('gemini');
    if (hasGroqKey) availableLlm.push('groq');
    if (hasOpenaiKey) availableLlm.push('openai');
    if (hasAnthropicKey) availableLlm.push('anthropic');

    if (llmProvider !== 'heuristic' && llmProvider !== 'auto') {
      if (!availableLlm.includes(llmProvider)) {
        setLlmProvider(availableLlm.length > 0 ? 'auto' : 'heuristic');
      }
    } else if (llmProvider === 'auto' && availableLlm.length === 0) {
      setLlmProvider('heuristic');
    }
  }, [hasGeminiKey, hasGroqKey, hasOpenaiKey, hasAnthropicKey, llmProvider]);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) {
          const s = data.settings;
          if (s.transcribe_mode) setTranscribeMode(s.transcribe_mode);
          if (s.transcribe_api_provider) setTranscribeApiProvider(s.transcribe_api_provider);
          if (s.local_model) setLocalModel(s.local_model);
          if (s.local_device) setLocalDevice(s.local_device);
          if (s.local_compute_type) setLocalComputeType(s.local_compute_type);
          if (s.llm_provider) setLlmProvider(s.llm_provider);
          if (s.retention_days) setRetentionDays(s.retention_days);

          // Muat API Keys dari DB / .env (otomatis bersihkan jika ada prefix variabel)
          if (s.gemini_api_key) setGeminiApiKey(cleanApiKey(s.gemini_api_key));
          if (s.groq_api_key) setGroqApiKey(cleanApiKey(s.groq_api_key));
          if (s.openai_api_key) setOpenaiApiKey(cleanApiKey(s.openai_api_key));
          if (s.anthropic_api_key) setAnthropicApiKey(cleanApiKey(s.anthropic_api_key));
        }
        if (data.keys) setKeys(data.keys);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleShow = (provider: string) => {
    setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const handleKeyChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Jika pengguna menempel baris dari .env (mengandung '=' atau tanda petik), bersihkan otomatis
    if (raw.includes('=') || raw.startsWith('"') || raw.startsWith("'")) {
      setter(cleanApiKey(raw));
    } else {
      setter(raw);
    }
  };

  const handleKeyBlur = (setter: React.Dispatch<React.SetStateAction<string>>, currentVal: string) => () => {
    setter(cleanApiKey(currentVal));
  };

  const handleTestKey = async (provider: string, keyValue: string) => {
    const cleaned = cleanApiKey(keyValue);
    if (!cleaned) {
      setTestResults((prev) => ({
        ...prev,
        [provider]: { success: false, message: 'Isi API key yang valid terlebih dahulu untuk diuji.' },
      }));
      return;
    }

    setTestingProvider(provider);
    setTestResults((prev) => ({ ...prev, [provider]: null }));

    try {
      const res = await fetch('/api/settings/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: cleaned }),
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [provider]: { success: data.success, message: data.message },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [provider]: { success: false, message: err.message || 'Gagal menghubungi server untuk verifikasi.' },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcribe_mode: transcribeMode,
          transcribe_api_provider: transcribeApiProvider,
          local_model: localModel,
          local_device: localDevice,
          local_compute_type: localComputeType,
          llm_provider: llmProvider,
          retention_days: retentionDays,
          gemini_api_key: cleanApiKey(geminiApiKey),
          groq_api_key: cleanApiKey(groqApiKey),
          openai_api_key: cleanApiKey(openaiApiKey),
          anthropic_api_key: cleanApiKey(anthropicApiKey),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.keys) setKeys(data.keys);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3500);
      } else {
        alert('Gagal menyimpan pengaturan');
      }
    } catch {
      alert('Koneksi terputus saat menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col select-none">
      <Header />
      <Sidebar />

      <main className="pl-16 pt-20 sm:pt-24 pb-16 flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 flex flex-col gap-6">
        {/* Title */}
        <div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface">
            Pengaturan Sistem &amp; AI
          </h1>
          <p className="font-body-md text-on-surface-variant text-xs">
            Konfigurasi model Whisper, provider LLM, retensi disk, dan manajemen Kunci API langsung di UI
          </p>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <span className="material-symbols-outlined text-primary text-[36px] animate-spin">
              progress_activity
            </span>
            <span className="font-label-md text-xs text-outline">Memuat pengaturan...</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {/* Section 1: Manajemen Kunci API Cloud AI (Langsung di UI) */}
            <div className="bg-surface-container-low p-5 sm:p-6 rounded-2xl border border-surface-container-highest/40 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-surface-container-highest/40 pb-3.5">
                <div>
                  <h3 className="font-headline-sm text-sm sm:text-base font-semibold text-on-surface flex items-center gap-2">
                    <Key className="w-4.5 h-4.5 text-primary" />
                    <span>Kunci API Cloud AI</span>
                  </h3>
                  <p className="text-[11px] text-outline mt-0.5">
                    Masukkan Kunci API Anda di sini untuk mengaktifkan fitur analisis dan transkripsi AI otomatis.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[11px] self-start sm:self-auto font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Tersimpan Aman di Sistem</span>
                </div>
              </div>

              {/* Info Note */}
              <div className="p-3.5 rounded-xl bg-surface-container-lowest/80 border border-outline-variant/20 text-xs text-on-surface-variant flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong>Tips:</strong> Cukup salin dan tempel Kunci API Anda ke kolom penyedia yang sesuai. Sistem akan otomatis merapikan kuncinya jika ada spasi atau tanda tambahan.
                </div>
              </div>

              {/* 4 Provider Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Google Gemini */}
                <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/25 flex flex-col justify-between gap-3 shadow-xs">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-secondary" />
                        <span className="font-bold text-xs text-on-surface">Google Gemini</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                          cleanApiKey(geminiApiKey)
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-surface-container-high text-outline'
                        }`}
                      >
                        {cleanApiKey(geminiApiKey) ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Aktif</span>
                          </>
                        ) : (
                          <span>Belum Diisi</span>
                        )}
                      </span>
                    </div>
                    <p className="text-[10px] text-outline">
                      Untuk Transkripsi Flash &amp; Analisis Konten.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="relative flex items-center">
                      <input
                        type={showKeys.gemini ? 'text' : 'password'}
                        value={geminiApiKey}
                        onChange={handleKeyChange(setGeminiApiKey)}
                        onBlur={handleKeyBlur(setGeminiApiKey, geminiApiKey)}
                        placeholder="AIzaSy... (Tempel Kunci Gemini)"
                        className="w-full bg-surface-container-lowest pr-16 pl-3 py-2 rounded-lg text-xs text-on-surface border border-outline-variant/30 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                      />
                      <div className="absolute right-1.5 flex items-center gap-1">
                        {geminiApiKey && (
                          <button
                            type="button"
                            onClick={() => setGeminiApiKey('')}
                            className="p-1 text-outline hover:text-error transition-colors"
                            title="Hapus Kunci"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleShow('gemini')}
                          className="p-1 text-outline hover:text-on-surface transition-colors"
                          title={showKeys.gemini ? 'Sembunyikan' : 'Tampilkan'}
                        >
                          {showKeys.gemini ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px]">
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline flex items-center gap-0.5"
                      >
                        <span>Dapatkan Kunci Gratis</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>

                      <button
                        type="button"
                        onClick={() => handleTestKey('gemini', geminiApiKey)}
                        disabled={testingProvider === 'gemini' || !cleanApiKey(geminiApiKey)}
                        className="px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface text-[10px] font-semibold flex items-center gap-1 border border-outline-variant/20 disabled:opacity-40 transition-colors"
                      >
                        {testingProvider === 'gemini' ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-primary" />
                            <span>Menguji...</span>
                          </>
                        ) : (
                          <span>Uji Kunci</span>
                        )}
                      </button>
                    </div>

                    {testResults.gemini && (
                      <div
                        className={`p-2 rounded text-[10px] flex items-center gap-1.5 ${
                          testResults.gemini.success
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                            : 'bg-error-container/20 text-error border border-error/30'
                        }`}
                      >
                        {testResults.gemini.success ? (
                          <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />
                        ) : (
                          <AlertCircle className="w-3 h-3 shrink-0" />
                        )}
                        <span className="truncate">{testResults.gemini.message}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Groq */}
                <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/25 flex flex-col justify-between gap-3 shadow-xs">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-primary" />
                        <span className="font-bold text-xs text-on-surface">Groq Cloud</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                          cleanApiKey(groqApiKey)
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-surface-container-high text-outline'
                        }`}
                      >
                        {cleanApiKey(groqApiKey) ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Aktif</span>
                          </>
                        ) : (
                          <span>Belum Diisi</span>
                        )}
                      </span>
                    </div>
                    <p className="text-[10px] text-outline">
                      Whisper Large-v3 Super Cepat &amp; Llama 3.3.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="relative flex items-center">
                      <input
                        type={showKeys.groq ? 'text' : 'password'}
                        value={groqApiKey}
                        onChange={handleKeyChange(setGroqApiKey)}
                        onBlur={handleKeyBlur(setGroqApiKey, groqApiKey)}
                        placeholder="gsk_... (Tempel Kunci Groq)"
                        className="w-full bg-surface-container-lowest pr-16 pl-3 py-2 rounded-lg text-xs text-on-surface border border-outline-variant/30 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                      />
                      <div className="absolute right-1.5 flex items-center gap-1">
                        {groqApiKey && (
                          <button
                            type="button"
                            onClick={() => setGroqApiKey('')}
                            className="p-1 text-outline hover:text-error transition-colors"
                            title="Hapus Kunci"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleShow('groq')}
                          className="p-1 text-outline hover:text-on-surface transition-colors"
                          title={showKeys.groq ? 'Sembunyikan' : 'Tampilkan'}
                        >
                          {showKeys.groq ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px]">
                      <a
                        href="https://console.groq.com/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline flex items-center gap-0.5"
                      >
                        <span>Dapatkan Kunci Gratis</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>

                      <button
                        type="button"
                        onClick={() => handleTestKey('groq', groqApiKey)}
                        disabled={testingProvider === 'groq' || !cleanApiKey(groqApiKey)}
                        className="px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface text-[10px] font-semibold flex items-center gap-1 border border-outline-variant/20 disabled:opacity-40 transition-colors"
                      >
                        {testingProvider === 'groq' ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-primary" />
                            <span>Menguji...</span>
                          </>
                        ) : (
                          <span>Uji Kunci</span>
                        )}
                      </button>
                    </div>

                    {testResults.groq && (
                      <div
                        className={`p-2 rounded text-[10px] flex items-center gap-1.5 ${
                          testResults.groq.success
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                            : 'bg-error-container/20 text-error border border-error/30'
                        }`}
                      >
                        {testResults.groq.success ? (
                          <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />
                        ) : (
                          <AlertCircle className="w-3 h-3 shrink-0" />
                        )}
                        <span className="truncate">{testResults.groq.message}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. OpenAI */}
                <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/25 flex flex-col justify-between gap-3 shadow-xs">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-on-surface" />
                        <span className="font-bold text-xs text-on-surface">OpenAI</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                          cleanApiKey(openaiApiKey)
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-surface-container-high text-outline'
                        }`}
                      >
                        {cleanApiKey(openaiApiKey) ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Aktif</span>
                          </>
                        ) : (
                          <span>Belum Diisi</span>
                        )}
                      </span>
                    </div>
                    <p className="text-[10px] text-outline">
                      Whisper Audio STT &amp; Model GPT-4o-mini.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="relative flex items-center">
                      <input
                        type={showKeys.openai ? 'text' : 'password'}
                        value={openaiApiKey}
                        onChange={handleKeyChange(setOpenaiApiKey)}
                        onBlur={handleKeyBlur(setOpenaiApiKey, openaiApiKey)}
                        placeholder="sk-... (Tempel Kunci OpenAI)"
                        className="w-full bg-surface-container-lowest pr-16 pl-3 py-2 rounded-lg text-xs text-on-surface border border-outline-variant/30 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                      />
                      <div className="absolute right-1.5 flex items-center gap-1">
                        {openaiApiKey && (
                          <button
                            type="button"
                            onClick={() => setOpenaiApiKey('')}
                            className="p-1 text-outline hover:text-error transition-colors"
                            title="Hapus Kunci"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleShow('openai')}
                          className="p-1 text-outline hover:text-on-surface transition-colors"
                          title={showKeys.openai ? 'Sembunyikan' : 'Tampilkan'}
                        >
                          {showKeys.openai ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px]">
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline flex items-center gap-0.5"
                      >
                        <span>Dapatkan Kunci</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>

                      <button
                        type="button"
                        onClick={() => handleTestKey('openai', openaiApiKey)}
                        disabled={testingProvider === 'openai' || !cleanApiKey(openaiApiKey)}
                        className="px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface text-[10px] font-semibold flex items-center gap-1 border border-outline-variant/20 disabled:opacity-40 transition-colors"
                      >
                        {testingProvider === 'openai' ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-primary" />
                            <span>Menguji...</span>
                          </>
                        ) : (
                          <span>Uji Kunci</span>
                        )}
                      </button>
                    </div>

                    {testResults.openai && (
                      <div
                        className={`p-2 rounded text-[10px] flex items-center gap-1.5 ${
                          testResults.openai.success
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                            : 'bg-error-container/20 text-error border border-error/30'
                        }`}
                      >
                        {testResults.openai.success ? (
                          <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />
                        ) : (
                          <AlertCircle className="w-3 h-3 shrink-0" />
                        )}
                        <span className="truncate">{testResults.openai.message}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Anthropic Claude */}
                <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/25 flex flex-col justify-between gap-3 shadow-xs">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-tertiary" />
                        <span className="font-bold text-xs text-on-surface">Anthropic Claude</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                          cleanApiKey(anthropicApiKey)
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-surface-container-high text-outline'
                        }`}
                      >
                        {cleanApiKey(anthropicApiKey) ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Aktif</span>
                          </>
                        ) : (
                          <span>Belum Diisi</span>
                        )}
                      </span>
                    </div>
                    <p className="text-[10px] text-outline">
                      Claude 3.5 &amp; 4.5 Sonnet untuk Analisis Hook.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="relative flex items-center">
                      <input
                        type={showKeys.anthropic ? 'text' : 'password'}
                        value={anthropicApiKey}
                        onChange={handleKeyChange(setAnthropicApiKey)}
                        onBlur={handleKeyBlur(setAnthropicApiKey, anthropicApiKey)}
                        placeholder="sk-ant-... (Tempel Kunci Anthropic)"
                        className="w-full bg-surface-container-lowest pr-16 pl-3 py-2 rounded-lg text-xs text-on-surface border border-outline-variant/30 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                      />
                      <div className="absolute right-1.5 flex items-center gap-1">
                        {anthropicApiKey && (
                          <button
                            type="button"
                            onClick={() => setAnthropicApiKey('')}
                            className="p-1 text-outline hover:text-error transition-colors"
                            title="Hapus Kunci"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleShow('anthropic')}
                          className="p-1 text-outline hover:text-on-surface transition-colors"
                          title={showKeys.anthropic ? 'Sembunyikan' : 'Tampilkan'}
                        >
                          {showKeys.anthropic ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px]">
                      <a
                        href="https://console.anthropic.com/settings/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline flex items-center gap-0.5"
                      >
                        <span>Dapatkan Kunci</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>

                      <button
                        type="button"
                        onClick={() => handleTestKey('anthropic', anthropicApiKey)}
                        disabled={testingProvider === 'anthropic' || !anthropicApiKey.trim()}
                        className="px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface text-[10px] font-semibold flex items-center gap-1 border border-outline-variant/20 disabled:opacity-40 transition-colors"
                      >
                        {testingProvider === 'anthropic' ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-primary" />
                            <span>Menguji...</span>
                          </>
                        ) : (
                          <span>Uji Kunci</span>
                        )}
                      </button>
                    </div>

                    {testResults.anthropic && (
                      <div
                        className={`p-2 rounded text-[10px] flex items-center gap-1.5 ${
                          testResults.anthropic.success
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                            : 'bg-error-container/20 text-error border border-error/30'
                        }`}
                      >
                        {testResults.anthropic.success ? (
                          <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />
                        ) : (
                          <AlertCircle className="w-3 h-3 shrink-0" />
                        )}
                        <span className="truncate">{testResults.anthropic.message}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: AI Transkripsi (Speech-to-Text) */}
            <div className="bg-surface-container-low p-5 rounded-xl border border-surface-container-highest/40 shadow-lg space-y-4">
              <div>
                <h3 className="font-headline-sm text-sm font-semibold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-[18px]">record_voice_over</span>
                  Mesin Transkripsi Audio (Speech-to-Text)
                </h3>
                <p className="text-[11px] text-outline mt-0.5">
                  Klik mode di bawah untuk mengatur engine Cloud API atau konfigurasi Lokal (faster-whisper)
                </p>
              </div>

              {/* Mode Toggle Buttons at Top */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTranscribeMode('api')}
                  className={`h-14 px-4 rounded-xl border flex items-center gap-3 transition-all text-left ${
                    transcribeMode === 'api'
                      ? 'bg-primary/15 border-primary text-primary font-bold shadow-xs ring-1 ring-primary/40'
                      : 'bg-surface-container-lowest border-surface-container-high/80 text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[24px]">cloud</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold font-mono">Cloud API</span>
                    <span className="text-[10px] opacity-75">Groq • Gemini • OpenAI</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTranscribeMode('local')}
                  className={`h-14 px-4 rounded-xl border flex items-center gap-3 transition-all text-left ${
                    transcribeMode === 'local'
                      ? 'bg-primary/15 border-primary text-primary font-bold shadow-xs ring-1 ring-primary/40'
                      : 'bg-surface-container-lowest border-surface-container-high/80 text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[24px]">computer</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold font-mono">Lokal (faster-whisper)</span>
                    <span className="text-[10px] opacity-75">CPU / GPU • 100% Offline</span>
                  </div>
                </button>
              </div>

              {/* Settings Box when Cloud API is clicked */}
              {transcribeMode === 'api' && (
                <div className="p-4 rounded-xl bg-surface-container-lowest border border-primary/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-primary text-[16px]">tune</span>
                      Pilihan Cloud Provider Transkripsi
                    </label>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                      Mode Cloud Aktif
                    </span>
                  </div>

                  <div>
                    {!hasAnyTranscribeKey ? (
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">Belum Ada Kunci API Cloud Transkripsi yang Diisi</p>
                          <p className="text-[11px] text-amber-200/80 mt-0.5">
                            Pilihan provider transkripsi cloud (Gemini, Groq, atau OpenAI) hanya akan muncul setelah Anda memasukkan Kunci API pada formulir di atas.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <select
                        value={transcribeApiProvider}
                        onChange={(e) => setTranscribeApiProvider(e.target.value)}
                        className="w-full bg-surface-container px-3 py-2.5 rounded-lg text-xs text-on-surface border border-outline-variant/30 focus:outline-none focus:ring-1 focus:ring-primary font-medium cursor-pointer"
                      >
                        {hasGroqKey && (
                          <option value="groq">Groq Whisper (Large v3 — Super Cepat)</option>
                        )}
                        {hasGeminiKey && (
                          <option value="gemini">Google Gemini Audio (Multimodal Flash STT)</option>
                        )}
                        {hasOpenaiKey && (
                          <option value="openai">OpenAI Whisper (Whisper-1 Audio)</option>
                        )}
                      </select>
                    )}
                  </div>

                  <p className="text-[10px] text-outline flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px] text-secondary">check_circle</span>
                    Daftar transkripsi otomatis menyesuaikan dengan Kunci API yang terisi di atas.
                  </p>
                </div>
              )}

              {/* Settings Box when Lokal is clicked */}
              {transcribeMode === 'local' && (
                <div className="p-4 rounded-xl bg-surface-container-lowest border border-primary/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-primary text-[16px]">tune</span>
                      Konfigurasi Model faster-whisper Lokal
                    </label>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary/10 text-secondary font-semibold">
                      Mode Lokal Aktif (Offline)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-on-surface-variant block mb-1">
                        Ukuran Model Whisper
                      </label>
                      <select
                        value={localModel}
                        onChange={(e) => setLocalModel(e.target.value)}
                        className="w-full bg-surface-container px-2.5 py-2 rounded-lg text-xs text-on-surface border border-outline-variant/30 focus:outline-none focus:ring-1 focus:ring-primary font-mono cursor-pointer"
                      >
                        <option value="tiny">tiny (~75MB, Sangat Ringan)</option>
                        <option value="base">base (~140MB, CPU Cepat)</option>
                        <option value="small">small (~460MB, Seimbang)</option>
                        <option value="medium">medium (~1.5GB, Sangat Akurat)</option>
                        <option value="large-v3">large-v3 (~3GB, Maksimal Akurasi)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-on-surface-variant block mb-1">
                        Perangkat Hardware
                      </label>
                      <select
                        value={localDevice}
                        onChange={(e) => setLocalDevice(e.target.value)}
                        className="w-full bg-surface-container px-2.5 py-2 rounded-lg text-xs text-on-surface border border-outline-variant/30 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                      >
                        <option value="cpu">CPU (Kompatibel Semua PC)</option>
                        <option value="cuda">NVIDIA GPU (Akselerasi CUDA)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-on-surface-variant block mb-1">
                        Tipe Kuantisasi
                      </label>
                      <select
                        value={localComputeType}
                        onChange={(e) => setLocalComputeType(e.target.value)}
                        className="w-full bg-surface-container px-2.5 py-2 rounded-lg text-xs text-on-surface border border-outline-variant/30 focus:outline-none focus:ring-1 focus:ring-primary font-mono cursor-pointer"
                      >
                        <option value="int8">int8 (Hemat RAM, CPU optimal)</option>
                        <option value="int8_float16">int8_float16 (Campuran)</option>
                        <option value="float16">float16 (Khusus GPU CUDA)</option>
                      </select>
                    </div>
                  </div>

                  <p className="text-[10px] text-outline flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px] text-secondary">info</span>
                    Model diunduh sekali saja ke Drive D (<code className="text-secondary font-mono">storage/models</code>) dan berjalan gratis tanpa internet.
                  </p>
                </div>
              )}
            </div>

            {/* Section 3: AI Provider Analisis Klip */}
            <div className="bg-surface-container-low p-5 rounded-xl border border-surface-container-highest/40 shadow-lg space-y-4">
              <h3 className="font-headline-sm text-sm font-semibold text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-[18px]">psychology</span>
                Provider LLM Analisis Klip
              </h3>

              <div>
                <label className="text-xs font-semibold text-on-surface block mb-1.5">
                  Model AI Utama
                </label>
                <select
                  value={llmProvider}
                  onChange={(e) => setLlmProvider(e.target.value)}
                  className="w-full bg-surface-container px-3 py-2 rounded-lg text-xs text-on-surface border border-outline-variant/30 focus:outline-none focus:ring-1 focus:ring-primary font-semibold cursor-pointer"
                >
                  {hasAnyLlmKey && (
                    <option value="auto">Otomatis (Pilih AI Cloud Terbaik yang Tersedia)</option>
                  )}
                  {hasGeminiKey && (
                    <option value="gemini">Google Gemini (Flash 3.5 / 3.8 / Latest)</option>
                  )}
                  {hasGroqKey && (
                    <option value="groq">Groq Llama 3.3 70B (Super Cepat)</option>
                  )}
                  {hasOpenaiKey && (
                    <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>
                  )}
                  {hasAnthropicKey && (
                    <option value="anthropic">Claude 3.5 / 4.5 Sonnet (Kreativitas &amp; Konteks Terbaik)</option>
                  )}
                  <option value="heuristic">Heuristik Offline (Tanpa API Key — Analisis Audio &amp; Kata)</option>
                </select>
                <p className="text-[10px] text-outline flex items-center gap-1 mt-2">
                  <span className="material-symbols-outlined text-[13px] text-secondary">auto_awesome</span>
                  Daftar AI otomatis menyesuaikan dengan Kunci API yang terisi. Penyedia yang belum memiliki Kunci API disembunyikan.
                </p>
              </div>
            </div>

            {/* Section 4: Manajemen Disk & Retensi Penyimpanan */}
            <div className="bg-surface-container-low p-5 rounded-xl border border-surface-container-highest/40 shadow-lg space-y-4">
              <h3 className="font-headline-sm text-sm font-semibold text-on-surface flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-primary" />
                <span>Manajemen Disk &amp; Retensi Penyimpanan</span>
              </h3>

              <div className="max-w-md space-y-2">
                <label className="text-xs font-semibold text-on-surface block">
                  Batas Retensi File Video Mentah (Hari)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(e.target.value)}
                    className="w-28 bg-surface-container px-3 py-2 rounded-lg text-xs text-on-surface border border-outline-variant/30 font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-xs text-on-surface-variant font-medium">Hari</span>
                </div>
                <p className="text-[11px] text-outline leading-relaxed">
                  File video sumber dan cache render yang usianya melebihi batas ini akan otomatis dibersihkan secara berkala oleh sistem worker untuk menghemat ruang disk Anda.
                </p>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs font-semibold">
                {savedSuccess && (
                  <span className="text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Semua Kunci API &amp; Pengaturan Berhasil Disimpan!</span>
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-bold text-xs transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 active:scale-95"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Simpan Semua Pengaturan</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
