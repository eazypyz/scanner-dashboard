
## Setup & Deploy

### 1. Fork / Buat Repository

Buat repository baru di GitHub dengan nama `scanner-dashboard`.

### 2. Atur Repository Variables

Masuk ke **Settings → Secrets and variables → Actions → Variables**, lalu tambahkan:

| Variable | Contoh Value | Keterangan |
|---|---|---|
| `SOURCE_REPO` | `OWNER/asset-dashboard` | Repository sumber data domain |
| `SOURCE_BRANCH` | `main` | Branch repository sumber |
| `CONCURRENCY` | `5` | Jumlah worker paralel (1-10) |
| `MIN_RESCAN_HOURS` | `24` | Jeda minimal antar scan ulang (jam) |
| `MAX_DOMAINS` | `0` | Batas domain (0 = tidak dibatasi) |

> **Catatan**: Ganti `OWNER` dengan username atau organisasi GitHub pemilik repository `asset-dashboard`.

### 3. Aktifkan GitHub Pages

**Settings → Pages**:
- Source: **Deploy from a branch**
- Branch: `main` / `root`

### 4. Jalankan Scanner

- **Otomatis**: Setiap hari pukul 00:00 UTC (sesuai cron di workflow).
- **Manual**: Actions → Scan Domains → Run workflow.

### 5. Akses Dashboard

Buka `https://OWNER.github.io/scanner-dashboard/` (ganti `OWNER` dengan username GitHub-mu).

## Penggunaan Dashboard

| Fitur | Cara Penggunaan |
|---|---|
| **Pencarian** | Ketik nama domain pada kolom search |
| **Filter Status** | Pilih kategori status code (2xx, 3xx, 4xx, 5xx, gagal) |
| **Filter HTTPS** | Tampilkan hanya domain dengan HTTPS aktif atau tidak |
| **Pengurutan** | Urutkan berdasarkan domain, waktu scan, status code, atau response time |
| **Pagination** | Navigasi halaman untuk ribuan hasil |
| **Refresh** | Klik tombol refresh untuk memuat data terbaru |

## Optimasi

| Teknik | Deskripsi |
|---|---|
| **Git Tree API** | Mengambil seluruh file JSON dalam 1 request tanpa perlu `index.json` |
| **Worker Queue** | Pemrosesan paralel dengan batasan worker agar tidak overload |
| **Skip Rescan** | Domain yang sudah discan dalam waktu tertentu dilewati |
| **Quick HTTP Check** | Validasi HEAD request sebelum Playwright untuk hemat resource |
| **Incremental Save** | Hasil disimpan setiap 10 domain untuk mencegah kehilangan data |
| **Playwright Cache** | Browser binary di-cache di GitHub Actions runner |

## Troubleshooting

### Scanner gagal mengambil data dari repository sumber
- Pastikan repository `asset-dashboard` bersifat **public** atau `GITHUB_TOKEN` memiliki akses ke repository private.
- Periksa apakah branch (`SOURCE_BRANCH`) dan path (`data/domains/`) sudah benar.

### Screenshot tidak muncul di dashboard
- Pastikan folder `screenshots/` sudah ter-commit ke repository.
- Cek browser console untuk error path screenshot.

### Workflow timeout
- Naikkan `timeout-minutes` di `.github/workflows/scan.yml` (default 300 menit).
- Turunkan `MAX_DOMAINS` untuk testing, atau naikkan `CONCURRENCY`.

### Rate limit GitHub API
- Untuk repository public, 60 request/jam tanpa token. Dengan `GITHUB_TOKEN` di Actions, limit naik ke 5.000 request/jam.

## Teknologi

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Scanner**: Node.js 20, Playwright (Chromium)
- **CI/CD**: GitHub Actions
- **Hosting**: GitHub Pages

## Lisensi

MIT
