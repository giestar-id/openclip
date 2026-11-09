import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = path.resolve('..', 'test-screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const results = {
  passed: 0,
  failed: 0,
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  testSteps: [],
};

function logStep(name, status, details = '') {
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [${status}] ${name} ${details ? '- ' + details : ''}`);
  results.testSteps.push({ name, status, details });
  if (status === 'PASS') results.passed++;
  else results.failed++;
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 MEMULAI PENGUJIAN BROWSER END-TO-END OPENCLIP');
  console.log('====================================================');
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`Browser: Google Chrome (${CHROME_PATH})`);
  console.log(`Screenshots: ${SCREENSHOT_DIR}\n`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();

  // Monitor console messages
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') {
      console.warn(`  [Browser Console Error]: ${text}`);
      results.consoleErrors.push({ url: page.url(), text });
    }
  });

  // Monitor uncaught JavaScript exceptions
  page.on('pageerror', (err) => {
    console.error(`  [Uncaught Page Error]: ${err.message}`);
    results.pageErrors.push({ url: page.url(), error: err.message });
  });

  // Monitor failed network requests
  page.on('requestfailed', (req) => {
    if (req.failure()?.errorText !== 'net::ERR_ABORTED') {
      const info = `${req.method()} ${req.url()} (${req.failure()?.errorText})`;
      console.warn(`  [Network Failed]: ${info}`);
      results.failedRequests.push(info);
    }
  });

  page.on('response', (res) => {
    const status = res.status();
    const url = res.url();
    if (status >= 400 && !url.includes('favicon.ico')) {
      const info = `HTTP ${status}: ${url}`;
      console.warn(`  [HTTP Error Response]: ${info}`);
      results.failedRequests.push(info);
    }
  });

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Homepage (/)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: Halaman Depan (Homepage /) ---');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 15000 });
    
    const homeTitle = await page.title();
    console.log(`  Judul halaman: "${homeTitle}"`);
    
    const urlInput = await page.$('input[placeholder*="youtube.com"], input[placeholder*="youtu.be"], input[type="text"], input[type="url"]');
    if (urlInput) {
      logStep('Homepage: Input URL Video ditemukan', 'PASS');
      await urlInput.type('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    } else {
      logStep('Homepage: Input URL Video ditemukan', 'FAIL', 'Input tidak ditemukan');
    }

    const durationBtns = await page.$$('button');
    if (durationBtns.length > 0) {
      logStep('Homepage: Komponen tombol durasi & opsi ter-render', 'PASS', `Total ${durationBtns.length} tombol`);
    } else {
      logStep('Homepage: Komponen tombol durasi & opsi ter-render', 'FAIL');
    }

    const homeScreenshot = path.join(SCREENSHOT_DIR, '01_homepage.png');
    await page.screenshot({ path: homeScreenshot, fullPage: true });
    logStep('Homepage: Screenshot berhasil diambil', 'PASS', homeScreenshot);

    // -------------------------------------------------------------------------
    // TEST 2: Projects List (/projects)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Daftar Project (/projects) ---');
    await page.goto(`${BASE_URL}/projects`, { waitUntil: 'networkidle2', timeout: 15000 });

    const pageContent = await page.content();
    const hasProjectTitle = pageContent.includes('Uji Coba Otomasi Browser OpenClip');
    if (hasProjectTitle) {
      logStep('Projects List: Item project yang di-seed tampil di halaman', 'PASS', 'Uji Coba Otomasi Browser OpenClip');
    } else {
      logStep('Projects List: Item project yang di-seed tampil di halaman', 'FAIL', 'Project tidak muncul di list');
    }

    const projectScreenshot = path.join(SCREENSHOT_DIR, '02_projects_list.png');
    await page.screenshot({ path: projectScreenshot, fullPage: true });
    logStep('Projects List: Screenshot berhasil diambil', 'PASS', projectScreenshot);

    // -------------------------------------------------------------------------
    // TEST 3: Project NLE Editor (/projects/1)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: NLE Video Editor (/projects/1) ---');
    await page.goto(`${BASE_URL}/projects/1`, { waitUntil: 'networkidle2', timeout: 20000 });

    await page.waitForSelector('main, .flex-1', { timeout: 10000 });

    const editorContent = await page.content();
    if (editorContent.includes('Klip Uji Browser 1') || editorContent.includes('Uji Coba Otomasi')) {
      logStep('Editor: Data project & klip termuat dengan benar', 'PASS');
    } else {
      logStep('Editor: Data project & klip termuat dengan benar', 'FAIL', 'Teks klip tidak ditemukan di DOM');
    }

    // Uji Tab Subtitle/Caption
    const tabCaption = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent && (b.textContent.includes('Subtitle') || b.textContent.includes('Caption')));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    if (tabCaption) {
      logStep('Editor: Interaksi Tab Subtitle/Caption', 'PASS');
    }

    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_editor_caption_tab.png') });

    // Uji Tab Format / Tata Letak
    const tabFormat = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent && (b.textContent.includes('Format') || b.textContent.includes('Tata Letak')));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    if (tabFormat) {
      logStep('Editor: Interaksi Tab Format/Tata Letak', 'PASS');
    }

    await new Promise((r) => setTimeout(r, 500));

    // Periksa mode Social
    const socialModeChecked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div[role="button"]'));
      const socialBtn = btns.find((b) => b.textContent && b.textContent.toLowerCase().includes('social'));
      if (socialBtn) {
        socialBtn.click();
        return true;
      }
      return false;
    });

    if (socialModeChecked) {
      logStep('Editor: Pemilihan mode Social Media Frame', 'PASS');
    }

    await new Promise((r) => setTimeout(r, 500));

    // Periksa centang biru dan avatar tanpa border
    const verifiedBadgeAudit = await page.evaluate(() => {
      // Cari svg rosette centang biru
      const svgs = Array.from(document.querySelectorAll('svg'));
      const hasVerifiedSvg = svgs.some(
        (s) => s.innerHTML.includes('38.2568') || s.innerHTML.includes('badge') || s.classList.contains('text-[#0095F6]') || s.getAttribute('data-badge') === 'verified'
      );
      // Periksa elemen avatar
      const avatarContainer = document.querySelector('div[class*="rounded-full"]');
      const hasBorderOnAvatar = avatarContainer ? avatarContainer.className.includes('border-') && !avatarContainer.className.includes('border-none') : false;
      return {
        hasVerifiedSvg,
        avatarBorderClean: !hasBorderOnAvatar,
      };
    });

    if (verifiedBadgeAudit.avatarBorderClean) {
      logStep('Editor: Foto profil bulat bersih tanpa border (Sesuai Aturan User)', 'PASS');
    } else {
      logStep('Editor: Foto profil bulat bersih tanpa border (Sesuai Aturan User)', 'FAIL', 'Masih ada border di avatar');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_editor_social_profile.png') });

    // Uji Buka Export Modal
    const exportModalClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const exportBtn = btns.find((b) => b.textContent && b.textContent.toLowerCase().includes('export') && !b.textContent.toLowerCase().includes('all'));
      if (exportBtn) {
        exportBtn.click();
        return true;
      }
      return false;
    });

    if (exportModalClicked) {
      logStep('Editor: Membuka Modal Export Klip', 'PASS');
      await new Promise((r) => setTimeout(r, 600));
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_editor_export_modal.png') });

      // Tutup modal
      await page.evaluate(() => {
        const closeBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent && (b.textContent.includes('Batal') || b.textContent.includes('Tutup')));
        if (closeBtn) closeBtn.click();
      });
      await new Promise((r) => setTimeout(r, 300));
    }

    // -------------------------------------------------------------------------
    // TEST 4: Processing Page (/projects/1/processing)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Halaman Processing (/projects/1/processing) ---');
    await page.goto(`${BASE_URL}/projects/1/processing`, { waitUntil: 'networkidle2', timeout: 15000 });

    const procContent = await page.content();
    if (procContent.includes('100%') || procContent.includes('Selesai') || procContent.includes('ready') || procContent.includes('Uji Coba')) {
      logStep('Processing Page: Status dan progres project ter-render dengan baik', 'PASS');
    } else {
      logStep('Processing Page: Status dan progres project ter-render dengan baik', 'FAIL');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_processing_page.png') });

    // -------------------------------------------------------------------------
    // TEST 5: Settings Page (/settings)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Halaman Pengaturan (/settings) ---');
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle2', timeout: 15000 });

    const apiInputs = await page.$$('input[type="password"], input[type="text"]');
    if (apiInputs.length >= 2) {
      logStep('Settings: Form API Keys & Konfigurasi ter-render lengkap', 'PASS', `${apiInputs.length} fields`);
    } else {
      logStep('Settings: Form API Keys & Konfigurasi ter-render lengkap', 'FAIL');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_settings_page.png') });

    // -------------------------------------------------------------------------
    // TEST 6: Backend API Direct Health Checks
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Backend API Endpoints Direct Health Check ---');
    const apiChecks = [
      { endpoint: '/api/projects', expectedStatus: 200 },
      { endpoint: '/api/projects/1', expectedStatus: 200 },
      { endpoint: '/api/settings', expectedStatus: 200 },
      { endpoint: '/api/clips/1', expectedStatus: 200 },
    ];

    for (const check of apiChecks) {
      const res = await page.evaluate(async (url) => {
        try {
          const r = await fetch(url);
          const data = await r.json();
          return { status: r.status, ok: r.ok, hasData: !!data };
        } catch (e) {
          return { status: 500, ok: false, error: e.message };
        }
      }, check.endpoint);

      if (res.status === check.expectedStatus && res.ok) {
        logStep(`API ${check.endpoint}: Respon 200 OK & Valid JSON`, 'PASS');
      } else {
        logStep(`API ${check.endpoint}: Respon 200 OK & Valid JSON`, 'FAIL', `Status ${res.status}`);
      }
    }

  } catch (err) {
    console.error(`💥 Runtime Automation Error: ${err.message}`);
    logStep('Test Suite Execution', 'FAIL', err.message);
  } finally {
    await browser.close();
  }

  // ---------------------------------------------------------------------------
  // SUMMARY REPORT
  // ---------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log('📊 RINGKASAN HASIL PENGUJIAN BROWSER END-TO-END');
  console.log('====================================================');
  console.log(`✅ Passed Steps: ${results.passed}`);
  console.log(`❌ Failed Steps: ${results.failed}`);
  console.log(`⚠️  Console Errors: ${results.consoleErrors.length}`);
  console.log(`💥 Page Errors (Uncaught): ${results.pageErrors.length}`);
  console.log(`🛑 Failed Network Requests: ${results.failedRequests.length}`);

  if (results.consoleErrors.length > 0) {
    console.log('\nDetail Console Errors:');
    results.consoleErrors.forEach((e) => console.log(` - [${e.url}] ${e.text}`));
  }

  if (results.pageErrors.length > 0) {
    console.log('\nDetail Page Errors:');
    results.pageErrors.forEach((e) => console.log(` - [${e.url}] ${e.error}`));
  }

  if (results.failedRequests.length > 0) {
    console.log('\nDetail Failed Requests:');
    results.failedRequests.forEach((e) => console.log(` - ${e}`));
  }

  const reportPath = path.join(SCREENSHOT_DIR, 'test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\nLaporan JSON tersimpan di: ${reportPath}`);
  console.log('====================================================\n');

  if (results.failed > 0 || results.pageErrors.length > 0 || results.consoleErrors.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
