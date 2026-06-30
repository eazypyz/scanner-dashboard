const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { chromium } = require('playwright');

/* ==================== KONFIGURASI ==================== */
const CONFIG = {
  sourceRepo: process.env.SOURCE_REPO || 'eazypyz/asset-dashboard',
  sourceBranch: process.env.SOURCE_BRANCH || 'main',
  domainsPath: 'data/domains',
  resultsFile: path.join(__dirname, '..', 'results', 'results.json'),
  screenshotsDir: path.join(__dirname, '..', 'screenshots'),
  concurrency: parseInt(process.env.CONCURRENCY) || 5,
  pageTimeout: 30000,
  minRescanInterval: (parseInt(process.env.MIN_RESCAN_HOURS) || 24) * 60 * 60 * 1000,
  maxDomains: parseInt(process.env.MAX_DOMAINS) || 0,
};

/* ==================== HELPERS ==================== */
function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      ...options,
      timeout: 15000,
      headers: {
        'User-Agent': 'Scanner-Dashboard/1.0',
        'Accept': 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN ? { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
        ...options.headers,
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchGitTree() {
  const url = `https://api.github.com/repos/${CONFIG.sourceRepo}/git/trees/${CONFIG.sourceBranch}?recursive=1`;
  const res = await httpsGet(url);
  const json = JSON.parse(res.data);
  if (!json.tree) throw new Error('Gagal mengambil tree: ' + res.data);
  return json.tree;
}

function extractDomains(tree) {
  const domains = new Set();
  for (const item of tree) {
    if (item.type !== 'blob') continue;
    if (!item.path.startsWith(CONFIG.domainsPath)) continue;
    if (!item.path.endsWith('.json')) continue;
    const filename = path.basename(item.path, '.json');
    if (filename) domains.add(filename.toLowerCase());
  }
  return Array.from(domains);
}

async function loadExistingResults() {
  try {
    const data = await fs.readFile(CONFIG.resultsFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return { scannedAt: null, domains: {} };
  }
}

function needsScan(domain, existing) {
  const prev = existing.domains[domain];
  if (!prev) return true;
  const last = new Date(prev.scannedAt).getTime();
  return isNaN(last) || (Date.now() - last) > CONFIG.minRescanInterval;
}

/* ==================== QUICK CHECK ==================== */
async function quickCheck(domain) {
  for (const protocol of ['https', 'http']) {
    const url = `${protocol}://${domain}`;
    try {
      const start = Date.now();
      let res;
      try {
        res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) });
      } catch {
        res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(10000) });
      }
      return {
        accessible: true,
        statusCode: res.status,
        finalUrl: res.url,
        isHttps: res.url.startsWith('https'),
        responseTime: Date.now() - start,
      };
    } catch {
      continue;
    }
  }
  return { accessible: false };
}

/* ==================== PLAYWRIGHT ==================== */
async function scanWithPlaywright(domain, quick) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0.36',
  });

  try {
    const page = await context.newPage();
    const start = Date.now();

    const response = await page.goto(quick.finalUrl || `https://${domain}`, {
      waitUntil: 'networkidle',
      timeout: CONFIG.pageTimeout,
    });

    const responseTime = Date.now() - start;
    const finalUrl = page.url();
    const statusCode = response ? response.status() : (quick.statusCode || 0);
    const title = await page.title().catch(() => '');
    const isHttps = finalUrl.startsWith('https');

    const safeName = domain.replace(/[^a-zA-Z0-9.-]/g, '_');
    const screenshotFile = `${safeName}.png`;
    const screenshotPath = path.join(CONFIG.screenshotsDir, screenshotFile);

    await page.screenshot({ path: screenshotPath, fullPage: false, type: 'png' });
    await browser.close();

    return {
      domain,
      statusCode,
      title: title.trim(),
      isHttps,
      finalUrl,
      responseTime,
      screenshot: `screenshots/${screenshotFile}`,
      scannedAt: new Date().toISOString(),
      success: true,
    };
  } catch (err) {
    await browser.close();
    return {
      domain,
      statusCode: quick.statusCode || 0,
      title: '',
      isHttps: quick.isHttps || false,
      finalUrl: quick.finalUrl || `https://${domain}`,
      responseTime: quick.responseTime || 0,
      screenshot: null,
      scannedAt: new Date().toISOString(),
      success: false,
      error: err.message,
    };
  }
}

/* ==================== DOMAIN SCANNER ==================== */
async function scanDomain(domain, existing) {
  if (!needsScan(domain, existing)) {
    console.log(`⏭️  Skip ${domain} (baru discan)`);
    return existing.domains[domain];
  }

  console.log(`🔍 ${domain}`);
  const quick = await quickCheck(domain);

  if (!quick.accessible) {
    console.log(`❌ ${domain} tidak dapat diakses`);
    return {
      domain,
      statusCode: 0,
      title: '',
      isHttps: false,
      finalUrl: `https://${domain}`,
      responseTime: 0,
      screenshot: null,
      scannedAt: new Date().toISOString(),
      success: false,
      error: 'Tidak dapat diakses',
    };
  }

  const result = await scanWithPlaywright(domain, quick);
  console.log(result.success ? `✅ ${domain}` : `⚠️  ${domain} (screenshot gagal)`);
  return result;
}

/* ==================== QUEUE & SAVE ==================== */
let isSaving = false;
let pendingSave = false;

async function saveResults(data) {
  if (isSaving) {
    pendingSave = true;
    return;
  }
  isSaving = true;
  await fs.mkdir(path.dirname(CONFIG.resultsFile), { recursive: true });
  await fs.writeFile(CONFIG.resultsFile, JSON.stringify(data, null, 2));
  isSaving = false;
  if (pendingSave) {
    pendingSave = false;
    await saveResults(data);
  }
}

async function processQueue(domains, existing) {
  const results = { ...existing.domains };
  let idx = 0;

  async function worker() {
    while (idx < domains.length) {
      const domain = domains[idx++];
      const result = await scanDomain(domain, existing);
      results[domain] = result;

      if (idx % 10 === 0) {
        await saveResults({ scannedAt: new Date().toISOString(), domains: results });
      }
    }
  }

  const workers = Array(Math.min(CONFIG.concurrency, domains.length)).fill().map(worker);
  await Promise.all(workers);

  return { scannedAt: new Date().toISOString(), domains: results };
}

/* ==================== MAIN ==================== */
async function main() {
  console.log('🚀 Scanner Dashboard');
  console.log(`Config: concurrency=${CONFIG.concurrency}, max=${CONFIG.maxDomains || 'unlimited'}`);

  await fs.mkdir(CONFIG.screenshotsDir, { recursive: true });

  console.log('📡 Mengambil tree dari GitHub API...');
  const tree = await fetchGitTree();
  let domains = extractDomains(tree);
  console.log(`📁 Ditemukan ${domains.length} domain`);

  if (CONFIG.maxDomains > 0) {
    domains = domains.slice(0, CONFIG.maxDomains);
    console.log(`✂️  Dibatasi ${domains.length} domain`);
  }

  const existing = await loadExistingResults();
  const results = await processQueue(domains, existing);

  await saveResults(results);
  console.log('💾 Selesai. Data disimpan di results/results.json');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
