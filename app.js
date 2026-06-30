const CONFIG = {
  resultsUrl: 'results/results.json',
  itemsPerPage: 24,
};

let allData = [];
let filteredData = [];
let currentPage = 1;

/* ==================== DATA ==================== */
async function loadData() {
  const btn = document.getElementById('refreshBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Memuat...';

  try {
    const res = await fetch(`${CONFIG.resultsUrl}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    allData = Object.values(json.domains || {});
    applyFilters();
    updateStats();
  } catch (err) {
    document.getElementById('grid').innerHTML = `
      <div class="error">
        <h3>Gagal memuat data</h3>
        <p>${err.message}</p>
        <p>Pastikan file <code>results/results.json</code> tersedia.</p>
      </div>
    `;
    document.getElementById('pagination').innerHTML = '';
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Refresh Data';
  }
}

function updateStats() {
  const total = allData.length;
  const ok = allData.filter(d => d.success && d.statusCode >= 200 && d.statusCode < 300).length;
  const fail = allData.filter(d => !d.success).length;
  const https = allData.filter(d => d.isHttps).length;

  document.getElementById('stats').innerHTML = `
    <span>Total Domain<strong>${total}</strong></span>
    <span>Sukses<strong>${ok}</strong></span>
    <span>Gagal<strong>${fail}</strong></span>
    <span>HTTPS<strong>${https}</strong></span>
  `;
}

/* ==================== FILTER & SORT ==================== */
function applyFilters() {
  const q = document.getElementById('search').value.toLowerCase().trim();
  const status = document.getElementById('filterStatus').value;
  const https = document.getElementById('filterHttps').value;
  const sort = document.getElementById('sortBy').value;

  filteredData = allData.filter(item => {
    if (q && !item.domain.includes(q)) return false;

    if (status !== 'all') {
      const c = item.statusCode || 0;
      if (status === 'success' && !(c >= 200 && c < 300)) return false;
      if (status === 'redirect' && !(c >= 300 && c < 400)) return false;
      if (status === 'clientError' && !(c >= 400 && c < 500)) return false;
      if (status === 'serverError' && !(c >= 500 && c < 600)) return false;
      if (status === 'failed' && item.success !== false) return false;
    }

    if (https !== 'all') {
      if (https === 'yes' && !item.isHttps) return false;
      if (https === 'no' && item.isHttps) return false;
    }

    return true;
  });

  filteredData.sort((a, b) => {
    switch (sort) {
      case 'domain': return a.domain.localeCompare(b.domain);
      case 'scannedAt': return new Date(b.scannedAt || 0) - new Date(a.scannedAt || 0);
      case 'statusCode': return (b.statusCode || 0) - (a.statusCode || 0);
      case 'responseTime': return (b.responseTime || 0) - (a.responseTime || 0);
      default: return 0;
    }
  });

  currentPage = 1;
  render();
}

/* ==================== RENDER ==================== */
function render() {
  const grid = document.getElementById('grid');
  const start = (currentPage - 1) * CONFIG.itemsPerPage;
  const pageItems = filteredData.slice(start, start + CONFIG.itemsPerPage);

  if (!pageItems.length) {
    grid.innerHTML = '<div class="empty">Tidak ada data yang cocok dengan filter.</div>';
    renderPagination(0);
    return;
  }

  grid.innerHTML = pageItems.map(item => `
    <div class="card ${item.success ? 'success' : 'failed'}">
      <div class="screenshot">
        ${item.screenshot
          ? `<img src="${item.screenshot}" alt="${item.domain}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\'no-screenshot\'>Screenshot Error</div>'">`
          : `<div class="no-screenshot">Tidak Ada Screenshot</div>`
        }
      </div>
      <div class="info">
        <h3>${escapeHtml(item.domain)}</h3>
        <div class="meta">
          <span class="badge ${getStatusClass(item.statusCode)}">${item.statusCode || 'N/A'}</span>
          <span class="badge ${item.isHttps ? 'https-yes' : 'https-no'}">${item.isHttps ? '🔒 HTTPS' : '🔓 HTTP'}</span>
          <span class="badge">${item.responseTime || 0}ms</span>
        </div>
        <p class="title">${escapeHtml(item.title) || '-'}</p>
        <p class="url">
          <a href="${item.finalUrl}" target="_blank" rel="noopener">${truncate(item.finalUrl, 45)}</a>
        </p>
        <p class="time">🕒 ${formatDate(item.scannedAt)}</p>
      </div>
    </div>
  `).join('');

  renderPagination(Math.ceil(filteredData.length / CONFIG.itemsPerPage));
}

function getStatusClass(code) {
  if (!code) return 'status-failed';
  if (code >= 200 && code < 300) return 'status-ok';
  if (code >= 300 && code < 400) return 'status-redirect';
  if (code >= 400 && code < 500) return 'status-client-error';
  if (code >= 500) return 'status-server-error';
  return 'status-failed';
}

function renderPagination(total) {
  const el = document.getElementById('pagination');
  if (total <= 1) { el.innerHTML = ''; return; }

  let html = '';
  if (currentPage > 1) {
    html += `<button onclick="goToPage(${currentPage - 1})">← Sebelumnya</button>`;
  }

  const maxBtn = 5;
  let start = Math.max(1, currentPage - Math.floor(maxBtn / 2));
  let end = Math.min(total, start + maxBtn - 1);
  if (end - start < maxBtn - 1) start = Math.max(1, end - maxBtn + 1);

  for (let i = start; i <= end; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }

  if (currentPage < total) {
    html += `<button onclick="goToPage(${currentPage + 1})">Selanjutnya →</button>`;
  }

  el.innerHTML = html;
}

function goToPage(n) {
  currentPage = n;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ==================== UTILS ==================== */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d) ? '-' : d.toLocaleString('id-ID');
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ==================== EVENTS ==================== */
document.getElementById('search').addEventListener('input', debounce(applyFilters, 250));
document.getElementById('filterStatus').addEventListener('change', applyFilters);
document.getElementById('filterHttps').addEventListener('change', applyFilters);
document.getElementById('sortBy').addEventListener('change', applyFilters);
document.getElementById('refreshBtn').addEventListener('click', loadData);

/* ==================== INIT ==================== */
loadData();
