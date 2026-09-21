***
---

### 4. RENCANA SELANJUTNYA & PERBAIKAN (Next Steps)

Berikut adalah beberapa item prioritas yang akan dikerjakan untuk membawa Utero Cloud ke tahap produksi:

1.  **Migrasi Database ke PostgreSQL:**
    *   **Tugas:** Setup Supabase/Neon, ubah skema Prisma, dan jalankan migrasi.
    *   **Prioritas:** **KRITIS** - Wajib sebelum deployment.
2.  **Integrasi Cloud Storage (Cloudinary):**
    *   **Tugas:** Buat API handler untuk upload ke Cloudinary, ganti semua fungsi upload lokal.
    *   **Prioritas:** **KRITIS** - Wajib sebelum deployment.
3.  **Implementasi Payment Gateway (Xendit):**
    *   **Tugas:** Setup Xendit Callback, buat UI untuk pemilihan metode bayar, dan hubungkan dengan sistem `Booking`.
    *   **Prioritas:** Tinggi.
4.  **Desain Ulang Form Kontak (Contoh Implementasi):**
    *   **Tugas:** Mengubah form statis menjadi responsif dengan validasi email. Berikut adalah contoh implementasi menggunakan Tailwind CSS sebagai referensi.

# 📘 DOKUMEN MASTER PROYEK: UTERO CLOUD v1.0
**Status Terkini:** Prototipe Lengkap (Localhost Ready)
**Tanggal Arsip:** 20 Desember 2025

---

### 1. APA YANG SUDAH JADI? (Achievements)

Sistem saat ini sudah berfungsi secara **End-to-End** (Hulu ke Hilir) dengan fitur sebagai berikut:

#### A. Sisi User (Pelanggan)
*   **Discovery:** Pencarian billboard via Peta Interaktif & Filter (Lokasi, Tanggal, Tipe).
*   **Booking System:** Kalkulator harga otomatis (Durasi sewa + PPN), Input Tanggal Tayang, Pilihan Faktur Pajak.
*   **Tracking Dashboard:** Visualisasi Timeline 6 Tahap (*Pesan > Bayar > Desain > Cetak > Pasang > Tayang*).
*   **Smart Action:** Upload file desain setelah bayar, unduh invoice PDF otomatis, dan fitur "Ajukan Refund" jika ingin batal.
*   **Live Chat:** Widget chat dengan AI yang bisa merekomendasikan produk, dan diteruskan ke manusia jika perlu.

#### B. Sisi Admin (Back-Office)
*   **Inventory (Gudang):** CRUD lengkap dengan Audit Logs (mencatat siapa yg edit) dan **Fitur Rollback** (kembali ke versi data lama). Support spesifikasi detail & Google Street View Embed.
*   **Order Management:**
    *   Verifikasi Pembayaran Manual (Kirim Email Notif).
    *   Kendali Alur Produksi: Admin menggerakkan status (*Cetak > Kirim Pasang > Upload Bukti Tayang*).
    *   Manajemen Refund & Batal Paksa dengan input alasan audit.
*   **Setting & Security:** Konfigurasi API Key dinamis dan Login Admin terpisah (Security Gate).

#### C. Core System
*   **Notifikasi Email:** SMTP Server (via cPanel) mengirim email otomatis saat: Order Masuk, Order Lunas, Refund, dan Admin Update Status.
*   **Hybrid AI:** Google Gemini 2.0 yang membantu menjawab user dan membantu admin menulis balasan chat.
*   **Storage:** Support upload gambar lokal dengan kompresi `sharp` atau via CDN.

---

### 2. ARSITEKTUR & STRUKTUR SAAT INI

#### Stack Teknologi:
*   **Framework:** Next.js 16 (App Router) + Turbopack.
*   **Database:** SQLite (File `dev.db` lokal) + Prisma ORM.
*   **Auth:** NextAuth v4 (Google Login & Credentials).
*   **Backend:** Next.js API Routes (Serverless functions).

#### Struktur Database (Skema Inti):
1.  **User:** Role-based (USER, ADMIN, SUPER_ADMIN), Google Auth support.
2.  **Billboard:** Data produk + Slug unik + Relasi ke History (untuk Audit).
3.  **BillboardHistory:** Menyimpan snapshot data lama untuk fitur Rollback.
4.  **Booking:** Menyimpan Transaksi, Status Flow, Bukti Tayang, Data Refund.
5.  **ChatSession/Message:** Menyimpan percakapan & status tiket (Open/Agent/Closed).
6.  **SystemSetting:** Menyimpan API Key (Google Maps & AI) agar dinamis.

---

### 3. KELEMAHAN SISTEM SAAT INI (The "Gap")

Walaupun canggih secara fitur, sistem ini **BELUM SIAP PRODUKSI (Live Online)** karena alasan teknis berikut:

1.  **Database Lokal (SQLite):**
    *   *Masalah:* SQLite berbentuk file. Jika di-deploy ke Vercel, data akan **RESET/HILANG** setiap kali kamu update kodingan.
    *   *Solusi:* Wajib migrasi ke PostgreSQL (Supabase/Neon).
2.  **Penyimpanan Gambar Lokal:**
    *   *Masalah:* Fitur upload ke folder `public/uploads` **TIDAK AKAN BEKERJA** di Vercel (karena serverless itu read-only).
    *   *Solusi:* Wajib full menggunakan Cloudinary/S3 untuk semua upload (User & Admin).
3.  **Pembayaran Masih Simulasi:**
    *   *Masalah:* Tombol bayar hanya *alert* simulasi, tidak muncul QRIS/VA beneran.
    *   *Solusi:* Harus menyambungkan API Xendit yang sesungguhnya.
4.  **Email Hardcode (Link):**
    *   *Masalah:* Link di dalam email masih `http://localhost:4000`. Jika user membuka email di HP, link itu tidak akan bisa diklik.

---