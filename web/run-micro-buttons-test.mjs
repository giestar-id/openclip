import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = path.resolve('..', 'test-screenshots', 'micro-tests');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const results = {
  totalButtonsTested: 0,
  passed: 0,
  failed: 0,
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  categories: {},
};

function recordButton(category, buttonName, status, details = '') {
  results.totalButtonsTested++;
  if (!results.categories[category]) {
    results.categories[category] = { passed: 0, failed: 0, items: [] };
  }
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`  ${icon} [${category}] ${buttonName} ${details ? '(' + details + ')' : ''}`);
  results.categories[category].items.push({ name: buttonName, status, details });
  if (status === 'PASS') {
    results.passed++;
    results.categories[category].passed++;
  } else {
    results.failed++;
    results.categories[category].failed++;
  }
}

async function runMicroButtonsTest() {
  console.log('================================================================');
  console.log('🔬 PENGUJIAN MIKROSKOPIS LENGKAP: 70+ TOMBOL KECIL & KONTROL UI');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      console.warn(`    ⚠️ [Console Error]: ${text}`);
      results.consoleErrors.push({ url: page.url(), text });
    }
  });

  page.on('pageerror', (err) => {
    console.error(`    💥 [Uncaught Exception]: ${err.message}`);
    results.pageErrors.push({ url: page.url(), error: err.message });
  });

  page.on('requestfailed', (req) => {
    if (req.failure()?.errorText !== 'net::ERR_ABORTED') {
      const info = `${req.method()} ${req.url()} (${req.failure()?.errorText})`;
      console.warn(`    🛑 [Request Failed]: ${info}`);
      results.failedRequests.push(info);
    }
  });

  try {
    // -------------------------------------------------------------------------
    // Buka Editor Proyek 1
    // -------------------------------------------------------------------------
    console.log('--- 1. Memuat Workspace Editor (/projects/1) ---');
    await page.goto(`${BASE_URL}/projects/1`, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.waitForSelector('main, .flex-1', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 600));

    // -------------------------------------------------------------------------
    // KATEGORI 1: Header Toolbar & Undo/Redo & Dock View
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Menguji Tombol Toolbar Header & Dock View ---');

    // Tombol Undo
    const undoRes = await page.evaluate(() => {
      const btn = document.querySelector('button[title*="Undo"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Header Toolbar', 'Tombol Undo (Ctrl+Z)', undoRes ? 'PASS' : 'FAIL');

    // Tombol Redo
    const redoRes = await page.evaluate(() => {
      const btn = document.querySelector('button[title*="Redo"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Header Toolbar', 'Tombol Redo (Ctrl+Y)', redoRes ? 'PASS' : 'FAIL');

    // Switch View: Rak Klip AI
    const switchClipsView = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent && b.textContent.includes('Rak Klip'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Dock View', 'Tab Tombol "Rak Klip AI"', switchClipsView ? 'PASS' : 'FAIL');
    await new Promise((r) => setTimeout(r, 200));

    // Switch View: Timeline & Waveform
    const switchTimelineView = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent && b.textContent.includes('Timeline & Waveform'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Dock View', 'Tab Tombol "Timeline & Waveform"', switchTimelineView ? 'PASS' : 'FAIL');
    await new Promise((r) => setTimeout(r, 200));

    // Tombol Perbesar Layar Preview (Cinema Mode Toggle)
    const cinemaToggleRes = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Perbesar Layar'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Dock View', 'Tombol "Perbesar Layar Preview" (Fokus)', cinemaToggleRes ? 'PASS' : 'FAIL');
    await new Promise((r) => setTimeout(r, 300));

    // Kembalikan dari Cinema Mode jika tertutup
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent && (b.textContent.includes('Timeline') || b.textContent.includes('Tampilkan')));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 200));

    // -------------------------------------------------------------------------
    // KATEGORI 2: Timeline Controls
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Menguji Kontrol Timeline ---');

    // Tombol Magnet
    const magnetRes = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Magnet'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Timeline Controls', 'Toggle Tombol "Magnet" (Snap)', magnetRes ? 'PASS' : 'FAIL');

    // Tombol Bagi (Split)
    const splitBtnRes = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Bagi (Split)'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Timeline Controls', 'Tombol "Bagi (Split)" di Playhead', splitBtnRes ? 'PASS' : 'FAIL');

    // Tombol Potong Kiri (Trim In)
    const trimInRes = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Potong Kiri'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Timeline Controls', 'Tombol "Potong Kiri" (Trim In)', trimInRes ? 'PASS' : 'FAIL');

    // Tombol Potong Kanan (Trim Out)
    const trimOutRes = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Potong Kanan'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Timeline Controls', 'Tombol "Potong Kanan" (Trim Out)', trimOutRes ? 'PASS' : 'FAIL');

    // Tombol Shortcuts Popover
    const shortcutsBtnRes = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Shortcuts'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Timeline Controls', 'Tombol Buka "Shortcuts Popover"', shortcutsBtnRes ? 'PASS' : 'FAIL');
    await new Promise((r) => setTimeout(r, 200));

    // Tombol Tutup (X) Shortcuts Popover
    const closeShortcuts = await page.evaluate(() => {
      const popover = document.querySelector('div.animate-in');
      const closeBtn = popover ? popover.querySelector('button') : null;
      if (closeBtn) {
        closeBtn.click();
        return true;
      }
      return false;
    });
    recordButton('Timeline Controls', 'Tombol Tutup (X) Shortcuts Popover', closeShortcuts ? 'PASS' : 'FAIL');

    // Tombol Zoom In & Zoom Out
    const zoomInRes = await page.evaluate(() => {
      const btn = document.querySelector('button[title*="Zoom In"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Timeline Controls', 'Tombol Zoom In (+)', zoomInRes ? 'PASS' : 'FAIL');

    const zoomOutRes = await page.evaluate(() => {
      const btn = document.querySelector('button[title*="Zoom Out"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Timeline Controls', 'Tombol Zoom Out (-)', zoomOutRes ? 'PASS' : 'FAIL');

    // Slider Zoom Timeline
    const zoomSliderRes = await page.evaluate(() => {
      const sliders = Array.from(document.querySelectorAll('input[type="range"]'));
      const zoomSlider = sliders.find((s) => s.min === '1' && s.max === '4');
      if (zoomSlider) {
        zoomSlider.value = '2';
        zoomSlider.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      return false;
    });
    recordButton('Timeline Controls', 'Slider Zoom Skala Timeline', zoomSliderRes ? 'PASS' : 'FAIL');

    // -------------------------------------------------------------------------
    // KATEGORI 3: Canvas Viewport Buttons (Playback, Frame, Ratio)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Menguji Kontrol Pemutar Canvas Viewport ---');

    // Master Play/Pause Button
    const masterPlayRes = await page.evaluate(() => {
      const btn = document.querySelector('button[title*="Play / Pause"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Canvas Controls', 'Tombol Master Play / Pause (Space)', masterPlayRes ? 'PASS' : 'FAIL');

    // Mundur 1 Frame (Arrow Left)
    const stepBackRes = await page.evaluate(() => {
      const btn = document.querySelector('button[title*="Mundur 1 Frame"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Canvas Controls', 'Tombol Mundur 1 Frame (Arrow Left)', stepBackRes ? 'PASS' : 'FAIL');

    // Maju 1 Frame (Arrow Right)
    const stepFwdRes = await page.evaluate(() => {
      const btn = document.querySelector('button[title*="Maju 1 Frame"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Canvas Controls', 'Tombol Maju 1 Frame (Arrow Right)', stepFwdRes ? 'PASS' : 'FAIL');

    // Kembali ke Awal Klip (Home)
    const jumpStartRes = await page.evaluate(() => {
      const btn = document.querySelector('button[title*="Awal Klip"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Canvas Controls', 'Tombol Ke Awal Klip (Home)', jumpStartRes ? 'PASS' : 'FAIL');

    // Ke Akhir Klip (End)
    const jumpEndRes = await page.evaluate(() => {
      const btn = document.querySelector('button[title*="Akhir Klip"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Canvas Controls', 'Tombol Ke Akhir Klip (End)', jumpEndRes ? 'PASS' : 'FAIL');

    // Loop Putar Klip (L)
    const loopRes = await page.evaluate(() => {
      const btn = document.querySelector('button[title*="Loop Putar Klip"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Canvas Controls', 'Toggle Tombol Loop Playback (L)', loopRes ? 'PASS' : 'FAIL');

    // Safe Zone Guides Button
    const safeZoneRes = await page.evaluate(() => {
      const btn = document.querySelector('button[title*="Area Aman"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Canvas Controls', 'Toggle Tombol "Safe Zone Guides"', safeZoneRes ? 'PASS' : 'FAIL');

    // Zoom Buttons di Canvas Viewport: Fit, 100%, 125%, 150%
    for (const zLevel of ['Fit', '100%', '125%']) {
      const zRes = await page.evaluate((lvl) => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === lvl);
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }, zLevel);
      recordButton('Canvas Controls', `Tombol Zoom Kanvas [${zLevel}]`, zRes ? 'PASS' : 'FAIL');
    }

    // Aspect Ratio Select di Canvas Viewport
    const ratioSelectRes = await page.evaluate(() => {
      const select = document.querySelector('select[aria-label="Aspect Ratio"]');
      if (select) {
        select.value = '1:1';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.value = '9:16';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    });
    recordButton('Canvas Controls', 'Dropdown Pemilih Rasio Aspek Kanvas', ratioSelectRes ? 'PASS' : 'FAIL');

    // -------------------------------------------------------------------------
    // KATEGORI 4: ClipShelf Controls
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Menguji Kontrol Rak Klip (ClipShelf) ---');

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Rak Klip'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 200));

    // Filter: Semua (1)
    const fAll = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Semua'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('ClipShelf', 'Filter Pill "Semua"', fAll ? 'PASS' : 'FAIL');

    // Filter: Top >80
    const fViral = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Top >80'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('ClipShelf', 'Filter Pill "Top >80"', fViral ? 'PASS' : 'FAIL');

    // Filter: Favorit
    const fFav = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Favorit'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('ClipShelf', 'Filter Pill "Favorit"', fFav ? 'PASS' : 'FAIL');

    // Kembalikan ke Semua
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Semua'));
      if (btn) btn.click();
    });

    // Tombol Bintang Favorit di kartu klip
    const starBtnRes = await page.evaluate(() => {
      const star = document.querySelector('aside button svg.lucide-star, main button svg.lucide-star');
      const btn = star ? star.closest('button') : null;
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('ClipShelf', 'Tombol Bintang Favorit (Kecil di Kartu Klip)', starBtnRes ? 'PASS' : 'FAIL');

    // Tombol "+ Buat Klip Manual"
    const manualBtnRes = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Klip Manual'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('ClipShelf', 'Tombol "+ Buat Klip Manual"', manualBtnRes ? 'PASS' : 'FAIL');
    await new Promise((r) => setTimeout(r, 300));

    // Tutup Modal Klip Manual
    const closeManualRes = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Batal'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('ClipShelf', 'Tombol Batal Modal Klip Manual', closeManualRes ? 'PASS' : 'FAIL');

    // -------------------------------------------------------------------------
    // KATEGORI 5: Inspector Tab 1: Subtitle (caption)
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Menguji Tombol Tab Subtitle / Caption ---');

    await page.evaluate(() => document.getElementById('inspector-caption-tab')?.click());
    await new Promise((r) => setTimeout(r, 400));

    // Toggle Aktifkan / Nonaktifkan Subtitle
    const toggleSubRes = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').includes('Nonaktifkan') || (b.textContent || '').includes('Aktifkan'));
      if (btn) {
        btn.click();
        btn.click(); // Kembalikan ke aktif
        return true;
      }
      return false;
    });
    recordButton('Inspector: Subtitle', 'Tombol Toggle "Aktifkan/Nonaktifkan Subtitle"', toggleSubRes ? 'PASS' : 'FAIL');

    // Unduh .SRT
    const srtRes = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').includes('.SRT'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Inspector: Subtitle', 'Tombol "Unduh .SRT"', srtRes ? 'PASS' : 'FAIL');

    // Unduh .ASS
    const assRes = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').includes('.ASS'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Inspector: Subtitle', 'Tombol "Unduh .ASS"', assRes ? 'PASS' : 'FAIL');

    // Salin Teks
    const copyTxtRes = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').includes('Salin Teks'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Inspector: Subtitle', 'Tombol "Salin Teks" Dialog Lengkap', copyTxtRes ? 'PASS' : 'FAIL');

    // Tombol Irama Kata (Cadence): 1 Kata, 2 Kata, 3 Kata
    for (const cad of ['1 Kata', '2 Kata', '3 Kata']) {
      const cadRes = await page.evaluate((label) => {
        const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').includes(label));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }, cad);
      recordButton('Inspector: Subtitle', `Tombol Irama Kata [${cad}]`, cadRes ? 'PASS' : 'FAIL');
    }

    // -------------------------------------------------------------------------
    // KATEGORI 6: Inspector Tab 2: Gaya Teks & Animasi (style)
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Menguji Tombol Tab Gaya Teks & Preset (style) ---');

    await page.evaluate(() => document.getElementById('inspector-style-tab')?.click());
    await new Promise((r) => setTimeout(r, 400));

    // Category pills: Semua, Pro Studio, Neon, Natural
    for (const catName of ['Semua', 'Pro Studio', 'Neon', 'Natural']) {
      const catRes = await page.evaluate((c) => {
        const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').includes(c));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }, catName);
      recordButton('Inspector: Style Presets', `Pill Kategori Preset [${catName}]`, catRes ? 'PASS' : 'FAIL');
      await new Promise((r) => setTimeout(r, 150));
    }

    // Kembalikan ke Semua
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').trim() === 'Semua');
      if (btn) btn.click();
    });

    // Preset cards di tab style
    const pCardRes = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('aside button')).filter((b) => {
        const txt = b.textContent || '';
        return txt.includes('Pill') || txt.includes('Clean') || txt.includes('Glow') || txt.includes('Pop');
      });
      if (cards.length > 0) {
        cards[0].click();
        return true;
      }
      return false;
    });
    recordButton('Inspector: Style Presets', 'Kartu Preset Gaya Subtitle Interaktif', pCardRes ? 'PASS' : 'FAIL');

    // Font family dropdown
    const fontSelectRes = await page.evaluate(() => {
      const sel = document.querySelector('aside select');
      if (sel) {
        sel.value = sel.options[0]?.value || sel.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    });
    recordButton('Inspector: Style Presets', 'Dropdown Pemilihan Font', fontSelectRes ? 'PASS' : 'FAIL');

    // -------------------------------------------------------------------------
    // KATEGORI 7: Inspector Tab 3: Headline / Add Text (text)
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Menguji Tombol Tab Headline / Add Text (text) ---');

    await page.evaluate(() => document.getElementById('inspector-text-tab')?.click());
    await new Promise((r) => setTimeout(r, 400));

    // Toggle Aktifkan Headline
    const hlToggleRes = await page.evaluate(() => {
      const chk = document.querySelector('aside input[type="checkbox"]');
      if (chk) {
        if (!chk.checked) chk.click(); // pastikan aktif
        return true;
      }
      return false;
    });
    recordButton('Inspector: Headline', 'Toggle Switch Aktifkan Headline Teks', hlToggleRes ? 'PASS' : 'FAIL');
    await new Promise((r) => setTimeout(r, 200));

    // Preset Headline: Kapsul, Teks Polos, Neon Glow, Stabilo
    for (const hPreset of ['Kapsul', 'Teks Polos', 'Neon Glow', 'Stabilo']) {
      const hpRes = await page.evaluate((label) => {
        const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').includes(label));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }, hPreset);
      recordButton('Inspector: Headline', `Tombol Preset Gaya Headline [${hPreset}]`, hpRes ? 'PASS' : 'FAIL');
      await new Promise((r) => setTimeout(r, 100));
    }

    // Format Case Buttons: BESAR (ALL CAPS), kecil (lowercase), Awal (Title Case), Bebas (Original)
    for (const tc of [
      { label: 'BESAR', name: 'BESAR (ALL CAPS)' },
      { label: 'kecil', name: 'kecil (lowercase)' },
      { label: 'Awal', name: 'Awal (Title Case)' },
      { label: 'Bebas', name: 'Bebas (Original)' },
    ]) {
      const tcRes = await page.evaluate((btnLabel) => {
        const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').trim().includes(btnLabel));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }, tc.label);
      recordButton('Inspector: Headline', `Tombol Format Huruf [${tc.name}]`, tcRes ? 'PASS' : 'FAIL');
      await new Promise((r) => setTimeout(r, 100));
    }

    // -------------------------------------------------------------------------
    // KATEGORI 8: Inspector Tab 4: Format & Social Profile (frame)
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Menguji Tombol Tab Format & Social Media (frame) ---');

    await page.evaluate(() => document.getElementById('inspector-frame-tab')?.click());
    await new Promise((r) => setTimeout(r, 400));

    // Rasio Kanvas: 9:16, 1:1, 16:9
    for (const r of ['9:16', '1:1', '16:9']) {
      const rRes = await page.evaluate((val) => {
        const btn = Array.from(document.querySelectorAll('aside button')).find((b) => b.textContent?.trim() === val);
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }, r);
      recordButton('Inspector: Format', `Tombol Rasio Kanvas [${r}]`, rRes ? 'PASS' : 'FAIL');
    }

    // Kembalikan ke 9:16
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('aside button')).find((b) => b.textContent?.trim() === '9:16');
      if (btn) btn.click();
    });

    // Mode Penyesuaian: Face Crop, Podcast, Social, Fit + Blur, Fit Warna
    for (const modeName of ['Face Crop', 'Podcast', 'Social', 'Fit + Blur', 'Fit Warna']) {
      const mRes = await page.evaluate((m) => {
        const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').includes(m));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }, modeName);
      recordButton('Inspector: Format', `Tombol Mode Penyesuaian [${modeName}]`, mRes ? 'PASS' : 'FAIL');
      await new Promise((r) => setTimeout(r, 150));
    }

    // Pastikan masuk ke mode Social untuk menguji fitur detailnya
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').includes('Social'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    // Reset Template Social Button
    const resetSocialRes = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').includes('Reset Template'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Inspector: Social Profile', 'Tombol "Reset Template Social"', resetSocialRes ? 'PASS' : 'FAIL');

    // Toggle Centang Biru (Verified Badge)
    const verifiedToggle = await page.evaluate(() => {
      const chk = Array.from(document.querySelectorAll('aside input[type="checkbox"]')).find((c) => {
        const txt = c.closest('div')?.textContent || '';
        return txt.includes('Centang Biru') || txt.includes('Verified');
      });
      if (chk) {
        if (!chk.checked) chk.click(); // pastikan aktif
        return true;
      }
      return false;
    });
    recordButton('Inspector: Social Profile', 'Toggle Switch "Centang Biru (Verified Badge)"', verifiedToggle ? 'PASS' : 'FAIL');

    // Platform Presets Centang Biru: Instagram, Twitter / X, TikTok, Gold VIP
    for (const pBadge of ['Instagram', 'Twitter', 'TikTok', 'Gold VIP']) {
      const pbRes = await page.evaluate((badge) => {
        const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').includes(badge));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }, pBadge);
      recordButton('Inspector: Social Profile', `Tombol Warna Verified Badge [${pBadge}]`, pbRes ? 'PASS' : 'FAIL');
    }

    // Preset Tema Cepat Social: Clean White, Midnight, Snow
    for (const theme of ['Clean White', 'Midnight', 'Snow']) {
      const tRes = await page.evaluate((name) => {
        const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').includes(name));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }, theme);
      recordButton('Inspector: Social Profile', `Tombol Preset Tema Cepat [${theme}]`, tRes ? 'PASS' : 'FAIL');
    }

    // -------------------------------------------------------------------------
    // KATEGORI 9: Inspector Tab 5: Filter Warna (filter)
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Menguji Tombol Tab Filter Warna (filter) ---');

    await page.evaluate(() => document.getElementById('inspector-filter-tab')?.click());
    await new Promise((r) => setTimeout(r, 400));

    // Filter preset cards: Cinematic, Vintage 90s, Noir Mono, Vibrant Pop
    for (const fName of ['Cinematic', 'Vintage 90s', 'Noir Mono', 'Vibrant Pop']) {
      const fRes = await page.evaluate((name) => {
        const card = Array.from(document.querySelectorAll('aside button, aside div[role="button"]')).find((b) => (b.textContent || '').includes(name));
        if (card) {
          card.click();
          return true;
        }
        return false;
      }, fName);
      recordButton('Inspector: Filter Warna', `Kartu Preset Filter [${fName}]`, fRes ? 'PASS' : 'FAIL');
    }

    // Tombol Reset Filter ke Normal
    const resetFiltRes = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').includes('Reset Filter') || (b.textContent || '').includes('Normal'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Inspector: Filter Warna', 'Tombol "Reset Filter ke Normal"', resetFiltRes ? 'PASS' : 'FAIL');

    // -------------------------------------------------------------------------
    // KATEGORI 10: Inspector Tab 6: Audio (audio)
    // -------------------------------------------------------------------------
    console.log('\n--- 11. Menguji Tombol Tab Audio (audio) ---');

    await page.evaluate(() => document.getElementById('inspector-audio-tab')?.click());
    await new Promise((r) => setTimeout(r, 400));

    // Slider Volume Klip
    const volRes = await page.evaluate(() => {
      const slider = document.querySelector('aside input[aria-label="Clip Volume"]');
      if (slider) {
        slider.value = '1.25';
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      return false;
    });
    recordButton('Inspector: Audio', 'Slider Volume Klip Audio', volRes ? 'PASS' : 'FAIL');

    // Checkbox Mute (Bungkam Suara)
    const muteRes = await page.evaluate(() => {
      const chk = document.querySelector('aside input[aria-label="Mute Audio"]');
      if (chk) {
        chk.click();
        chk.click(); // Kembalikan ke unmuted
        return true;
      }
      return false;
    });
    recordButton('Inspector: Audio', 'Checkbox "Mute (Bungkam Suara)"', muteRes ? 'PASS' : 'FAIL');

    // Toggle Vocal Clarity Boost (+3dB)
    const vocalBoostRes = await page.evaluate(() => {
      const chk = Array.from(document.querySelectorAll('aside input[type="checkbox"]')).find((c) => {
        const txt = c.closest('div')?.textContent || '';
        return txt.includes('Vocal Clarity Boost');
      });
      if (chk) {
        chk.click();
        return true;
      }
      return false;
    });
    recordButton('Inspector: Audio', 'Toggle Switch "Vocal Clarity Boost (+3dB)"', vocalBoostRes ? 'PASS' : 'FAIL');

    // -------------------------------------------------------------------------
    // KATEGORI 11: Inspector Tab 7: Info & Copywriting AI (info)
    // -------------------------------------------------------------------------
    console.log('\n--- 12. Menguji Tombol Tab Info & Metadata AI Copy (info) ---');

    await page.evaluate(() => document.getElementById('inspector-info-tab')?.click());
    await new Promise((r) => setTimeout(r, 400));

    // Tombol Salin Format Siap Posting
    const copyReadyRes = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').includes('Salin Format Siap Posting') || (b.textContent || '').includes('Format Lengkap'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Inspector: Info & Copy', 'Tombol "Salin Format Siap Posting (1-Click)"', copyReadyRes ? 'PASS' : 'FAIL');

    // Tone Buttons: Hook Utama, Pertanyaan, Cerita, Edukasi
    for (const tone of ['Hook Utama', 'Pertanyaan', 'Cerita', 'Edukasi']) {
      const tRes = await page.evaluate((label) => {
        const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').includes(label));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }, tone);
      recordButton('Inspector: Info & Copy', `Tombol Gaya Penulisan AI [${tone}]`, tRes ? 'PASS' : 'FAIL');
    }

    // Tombol Salin Judul
    const cTitleRes = await page.evaluate(() => {
      const container = Array.from(document.querySelectorAll('aside div')).find((d) => (d.textContent || '').includes('Judul Klip (Hook Video)'));
      const btn = container?.querySelector('button');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Inspector: Info & Copy', 'Tombol "Salin Judul"', cTitleRes ? 'PASS' : 'FAIL');

    // Tombol Salin Deskripsi
    const cDescRes = await page.evaluate(() => {
      const container = Array.from(document.querySelectorAll('aside div')).find((d) => (d.textContent || '').includes('Deskripsi & Caption'));
      const btn = container?.querySelector('button');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Inspector: Info & Copy', 'Tombol "Salin Deskripsi"', cDescRes ? 'PASS' : 'FAIL');

    // Tombol Salin Semua Hashtag
    const cTagsRes = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('aside button')).find((b) => (b.textContent || '').includes('Salin Semua'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Inspector: Info & Copy', 'Tombol "Salin Semua Hashtag"', cTagsRes ? 'PASS' : 'FAIL');

    // Tombol Hapus Hashtag Individual (x kecil)
    const delTagRes = await page.evaluate(() => {
      const btn = document.querySelector('aside button[title*="Hapus hashtag"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Inspector: Info & Copy', 'Tombol Hapus Tag Individual (X kecil)', delTagRes ? 'PASS' : 'FAIL');

    // -------------------------------------------------------------------------
    // KATEGORI 12: Modals (Export Modal & Batch Export Modal)
    // -------------------------------------------------------------------------
    console.log('\n--- 13. Menguji Kontrol Modal Ekspor ---');

    // Buka Modal Export MP4
    const openExportModal = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('header button')).find((b) => (b.textContent || '').trim() === 'Ekspor MP4');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Modal Export', 'Tombol Buka Modal "Ekspor MP4"', openExportModal ? 'PASS' : 'FAIL');
    await new Promise((r) => setTimeout(r, 600));

    // Pilihan Resolusi 720p & 1080p
    for (const res of ['720p', '1080p']) {
      const resChoice = await page.evaluate((r) => {
        const btn = Array.from(document.querySelectorAll('button')).find((el) => (el.textContent || '').includes(r));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }, res);
      recordButton('Modal Export', `Tombol Pilihan Resolusi [${res}]`, resChoice ? 'PASS' : 'FAIL');
    }

    // Tutup Modal Export (Tombol Batal)
    const closeExport = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Batal'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Modal Export', 'Tombol Batal Modal Ekspor', closeExport ? 'PASS' : 'FAIL');
    await new Promise((r) => setTimeout(r, 400));

    // Buka Batch Export Modal ("Ekspor Semua")
    const openBatchModal = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('header button')).find((b) => (b.textContent || '').includes('Ekspor Semua'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Modal Batch Export', 'Tombol Buka Modal "Ekspor Semua"', openBatchModal ? 'PASS' : 'FAIL');
    await new Promise((r) => setTimeout(r, 600));

    // Tutup Batch Export Modal
    const closeBatch = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Batal'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    recordButton('Modal Batch Export', 'Tombol Batal Modal Batch Ekspor', closeBatch ? 'PASS' : 'FAIL');
    await new Promise((r) => setTimeout(r, 400));

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'micro_tests_complete.png'), fullPage: true });

  } catch (err) {
    console.error(`💥 Runtime Automation Error: ${err.message}`);
  } finally {
    await browser.close();
  }

  // ---------------------------------------------------------------------------
  // LAPORAN HASIL PENGUJIAN MIKROSKOPIS
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('📊 REKAPITULASI PENGUJIAN MIKROSKOPIS TOMBOL & KONTROL UI');
  console.log('================================================================');
  console.log(`🎯 Total Kontrol & Tombol Diuji : ${results.totalButtonsTested}`);
  console.log(`✅ Tombol Berhasil (Passed)      : ${results.passed}`);
  console.log(`❌ Tombol Gagal (Failed)         : ${results.failed}`);
  console.log(`⚠️  Console Errors               : ${results.consoleErrors.length}`);
  console.log(`💥 Uncaught Page Errors          : ${results.pageErrors.length}`);
  console.log(`🛑 Failed Requests               : ${results.failedRequests.length}`);
  console.log('================================================================');

  for (const [catName, catData] of Object.entries(results.categories)) {
    console.log(`  • [${catName.padEnd(25)}] : ${catData.passed}/${catData.items.length} PASS`);
  }

  const reportPath = path.join(SCREENSHOT_DIR, 'micro-buttons-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\nLaporan JSON tersimpan di: ${reportPath}`);
  console.log('================================================================\n');

  if (results.failed > 0 || results.pageErrors.length > 0 || results.consoleErrors.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runMicroButtonsTest();
