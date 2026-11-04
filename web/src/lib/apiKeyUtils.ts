/**
 * Membersihkan API key dari format variabel env yang tidak sengaja tertempel pengguna.
 * Contoh:
 * - "GEMINI_API_KEY=AQ.Ab8RN6J..." -> "AQ.Ab8RN6J..."
 * - "OPENAI_API_KEY=" -> ""
 * - "export GROQ_API_KEY='gsk_...'" -> "gsk_..."
 * - "ANTHROPIC_API_KEY" -> ""
 */
export function cleanApiKey(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let str = raw.trim();
  if (!str) return '';

  // Jika berupa baris komentar
  if (str.startsWith('#')) return '';

  // 1. Bersihkan prefix export dan/atau VAR_NAME=
  let changed = true;
  while (changed) {
    const next = str.replace(/^(?:export\s+)?[A-Za-z0-9_]+\s*=\s*/, '').trim();
    if (next !== str) {
      str = next;
    } else {
      changed = false;
    }
  }

  // 2. Hapus tanda petik pembungkus ("..." atau '...')
  str = str.replace(/^["'](.*)["']$/, '$1').trim();

  // 3. Jika yang tersisa hanya nama variabel murni atau kosong, kembalikan string kosong
  if (!str || /^[A-Za-z0-9_]+_API_KEY$/i.test(str) || /^[A-Za-z0-9_]+=$/i.test(str)) {
    return '';
  }

  return str;
}
