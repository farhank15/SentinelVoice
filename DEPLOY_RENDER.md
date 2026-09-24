# 🚀 Panduan Deployment SentinelVoice ke Render (render.com)

Dokumen ini berisi panduan lengkap dan hasil riset teknis untuk men-deploy **SentinelVoice** ke platform **Render**.

---

## 📌 Ringkasan Arsitektur di Render

Terdapat 2 opsi deployment yang sudah disiapkan dan diuji:

| Opsi | Tipe Service di Render | Keuntungan | Kompleksitas |
| :--- | :--- | :--- | :--- |
| **Opsi 1 (Sangat Direkomendasikan)** | **1x Web Service (Docker)** | Frontend + Backend + WebSocket berjalan dalam 1 domain yang sama (`https://app.onrender.com`). **Zero CORS issues, tanpa setup URL cross-origin, hemat kuota Free Tier (1 service)**. | ⭐ Paling Mudah (1-Click) |
| **Opsi 2 (Decoupled)** | **1x Web Service (Backend)** + **1x Static Site (Frontend)** | Frontend di-host di CDN global Render (gratis), Backend berjalan di Web Service terpisah. | Memerlukan copy-paste URL Backend ke Env Frontend. |

---

## 🛠️ OPSI 1: Unified Docker Deployment (Rekomendasi Utama)

Metode ini menggunakan file [`Dockerfile`](file:///Users/mawa/Development/my_projects/sarjanamuda/G-voice/Dockerfile) yang sudah disiapkan. Multi-stage build akan me-compile React Vite frontend, lalu menggabungkannya ke dalam Bun runtime Fastify server. Fastify secara otomatis menyajikan UI di `/`, REST API di `/api/*`, dan WebSocket di `/ws/voice-session`.

### Langkah-langkah di Dashboard Render:
1. Login ke [dashboard.render.com](https://dashboard.render.com).
2. Klik tombol **New +** > pilih **Web Service**.
3. Hubungkan (Connect) repository GitHub/GitLab proyek ini.
4. Konfigurasikan form:
   - **Name**: `sentinel-voice` (atau nama pilihan Anda)
   - **Region**: Pilih yang terdekat (misal: *Singapore* untuk latensi audio terendah)
   - **Runtime**: **Docker** (Render otomatis membaca [`Dockerfile`](file:///Users/mawa/Development/my_projects/sarjanamuda/G-voice/Dockerfile))
   - **Instance Type**: **Free** (atau *Starter* $7/bln untuk no sleep)
5. Gulir ke bawah ke bagian **Environment Variables** dan tambahkan:
   - `ASSEMBLYAI_API_KEY`: *(API Key AssemblyAI Anda)*
   - `LLM_API_KEY`: *(API Key Poolside Laguna S Anda, diawali `sky_...`)*
   - `GEMINI_API_KEY`: *(Opsional, fallback LLM)*
   - `NODE_ENV`: `production`
6. (Opsional) Di bagian **Advanced**:
   - **Health Check Path**: `/api/health`
7. Klik **Create Web Service**.

Selesai! Render akan otomatis me-build dan merilis service Anda. Setelah selesai, buka URL yang diberikan (contoh: `https://sentinel-voice.onrender.com`).

---

## 📜 OPSI 2: Render Blueprint (`render.yaml`)

Jika Anda ingin deploy otomatis menggunakan file konfigurasi Infrastructure-as-Code:
1. Pastikan file [`render.yaml`](file:///Users/mawa/Development/my_projects/sarjanamuda/G-voice/render.yaml) sudah ter-push ke GitHub.
2. Di dashboard Render, klik **New +** > **Blueprint**.
3. Pilih repository proyek ini.
4. Render akan membaca `render.yaml` dan meminta Anda mengisi Environment Variables yang bertanda `sync: false` (`ASSEMBLYAI_API_KEY`, `LLM_API_KEY`).
5. Klik **Apply**.

---

## 🔀 OPSI 3: Decoupled (Terpisah: Web Service BE + Static Site FE)

Jika Anda ingin memisahkan Frontend dan Backend menjadi 2 service terpisah di Render:

### Bagian A: Backend (Web Service)
1. **New +** > **Web Service**.
2. **Root Directory**: `backend`
3. **Runtime**: **Node** (Render mendukung Bun di lingkungan Node)
4. **Build Command**: `bun install`
5. **Start Command**: `bun run start`
6. **Health Check Path**: `/api/health`
7. **Environment Variables**:
   - `ASSEMBLYAI_API_KEY`: `<key>`
   - `LLM_API_KEY`: `<sky_key>`
   - `NODE_ENV`: `production`
   *(Catatan: Render otomatis menyuntikkan `PORT`, Fastify backend sudah otomatis membaca `process.env.PORT`)*
8. Klik **Create Web Service**, lalu catat URL Backend yang didapat (misal: `https://sentinel-backend.onrender.com`).

### Bagian B: Frontend (Static Site - 100% Free)
1. **New +** > **Static Site**.
2. **Root Directory**: `frontend`
3. **Build Command**: `bun install && bun run build` (atau `npm install && npm run build`)
4. **Publish Directory**: `dist`
5. **Environment Variables**:
   - `VITE_API_URL`: `https://sentinel-backend.onrender.com`
   - `VITE_WS_URL`: `wss://sentinel-backend.onrender.com/ws/voice-session`
6. Di menu **Redirects/Rewrites** (menu kiri dashboard):
   - Klik **Add Rule**
   - **Source**: `/*`
   - **Destination**: `/index.html`
   - **Action**: `Rewrite`
7. Klik **Create Static Site**.

---

## ⚡ Poin-Poin Kritis & Tips Khusus Render

### 1. Penanganan WebSocket (`wss://`)
- Render Web Service secara **native mendukung WebSocket** pada port 443 dengan SSL/TLS termination otomatis.
- Browser akan terhubung dengan protokol `wss://` (aman).
- Kode frontend di [`frontend/src/config/api.js`](file:///Users/mawa/Development/my_projects/sarjanamuda/G-voice/frontend/src/config/api.js) sudah secara dinamis mendeteksi protokol `https:` -> `wss:` otomatis.

### 2. SQLite Database & Persistence
- Pada Render Free Tier, filesystem container bersifat **ephemeral** (data reset saat restart).
- **Kabar Baik**: SentinelVoice di [`voiceprintRepository.js`](file:///Users/mawa/Development/my_projects/sarjanamuda/G-voice/backend/src/services/voiceprintRepository.js) dirancang dengan mekanisme **auto-seed dari `mockExecutives.json`**.
- Setiap kali service booting/restart, 10 profil eksekutif acuan (Robert Sterling, Elena Vance, Marcus Thorne, dll.) akan di-seed secara instan ke SQLite. Sistem tetap 100% siap untuk live testing.

### 3. Masalah Free Tier Spin-Down (PENTING untuk Demo/Juri)
- Web Service Render Free Tier akan masuk ke mode tidur (*spin-down*) jika tidak ada traffic selama **15 menit**.
- Saat ada request baru, dibutuhkan waktu ~50 detik (*cold start*) untuk bangun.
- **Tips Hackathon:**
  - Siapkan cron pinger gratis seperti [cron-job.org](https://cron-job.org) atau [UptimeRobot](https://uptimerobot.com) untuk melakukan HTTP GET ke `https://<nama-app>.onrender.com/api/health` setiap **10 menit**.
  - Ini memastikan service Anda selalu **panas dan responsif seketika** saat juri membuka demo live Anda!
