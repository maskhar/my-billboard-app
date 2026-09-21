# Laporan Progres Kerja: Proyek Utero Cloud
**Dokumen ini dibuat berdasarkan cross-check antara rencana awal (`project-awal.md`), status terkini (`billboard-system.md`), dan progres development yang telah dilakukan.**

---

## 1. Papan Skor Proyek: Perbandingan Rencana Awal vs. Realita

### ✅ Sesuai Rencana & Sudah Selesai

*   **Autentikasi Pengguna (NextAuth):**
    *   Fitur Login dengan Google, Register Manual, dan sistem `role-based` (User, Admin, dll.) telah **berhasil diimplementasikan**.
    *   Manajemen user (tambah user & ubah role) melalui dashboard admin **sudah selesai**.

*   **Peta Interaktif (Leaflet):**
    *   Fitur pencarian billboard melalui peta interaktif **sudah menjadi fitur inti** di halaman utama dan berfungsi dengan baik.

*   **Dashboard Admin Fungsional:**
    *   Fitur CRUD (Create, Read, Update, Delete) untuk Billboard, Manajemen Order (ubah status, dll), dan Manajemen User **sudah lengkap dan berfungsi** di lingkungan localhost.

*   **Konsep Awal Terbukti:**
    *   Konsep **AI Gemini dengan Persona** dan penggunaan **SMTP Kustom** telah divalidasi dan menjadi bagian dari arsitektur di dokumen `billboard-system.md`.

### ⚠️ Sesuai Rencana tapi Berubah / Belum Lengkap

*   **File Storage (Cloud Storage):**
    *   **Rencana Awal:** Google Cloud Storage (GCS).
    *   **Rencana Baru:** Dokumen `billboard-system.md` merekomendasikan **Cloudinary**.
    *   **Status Saat Ini:** **GAP KRITIS.** Proyek masih menggunakan **penyimpanan lokal** (`public/uploads`). Ini adalah *blocker* utama yang mencegah website untuk *go-live*.

*   **Database:**
    *   **Rencana Awal:** Tidak spesifik, dimulai dengan **SQLite**.
    *   **Rencana Baru:** Dokumen `billboard-system.md` menegaskan **wajib migrasi ke PostgreSQL** (Supabase/Neon).
    *   **Status Saat Ini:** **GAP KRITIS.** Proyek masih menggunakan **SQLite**. Ini adalah *blocker* utama kedua yang harus diselesaikan sebelum *deployment*.

*   **Fitur Lupa Password:**
    *   **Rencana Awal:** Disebutkan sebagai bagian dari fitur Autentikasi.
    *   **Status Saat Ini:** Fitur ini **belum diimplementasikan**.

### ❌ Belum Dikerjakan (Hilang dari Rencana Saat Ini)

*   **Internal Analytics (Visitor Tracking):**
    *   **Rencana Awal:** Membuat sistem "Spy/Intip" untuk mencatat IP Address & User Agent pengunjung.
    *   **Status Saat Ini:** Fitur ini **tidak disebutkan** dalam dokumen status terkini (`billboard-system.md`) dan **belum dikerjakan**.

*   **Input Google Analytics di Dashboard:**
    *   **Rencana Awal:** Membuat kolom input di admin untuk menanam kode tracking Google Analytics.
    *   **Status Saat Ini:** Fitur ini **belum dibuat**.

---

## 2. Rangkuman Kekurangan (GAP Analysis)

Berikut adalah daftar kekurangan proyek saat ini, diurutkan berdasarkan tingkat urgensi.

### 1. Kekurangan Kritis (Blocker Deployment)

*   **Tidak ada Cloud Storage:**
    *   **Masalah:** Semua fitur upload gambar (bukti tayang, desain user, foto billboard) **akan gagal total** saat website di-hosting online.
    *   **Prioritas:** **#1 - Sangat Mendesak.**

*   **Database Masih Lokal (SQLite):**
    *   **Masalah:** Semua data (user, billboard, booking) **akan hilang/reset** setiap kali ada pembaruan kode di server.
    *   **Prioritas:** **#2 - Sangat Mendesak.**

### 2. Kekurangan Fungsionalitas User

*   **Tidak ada Payment Gateway:**
    *   **Masalah:** Proses pembayaran masih simulasi (`alert`). User tidak bisa melakukan pembayaran nyata.
    *   **Prioritas:** **#3 - Tinggi.**

*   **Tidak ada Fitur Lupa Password:**
    *   **Masalah:** Pengguna yang mendaftar manual tidak memiliki cara untuk memulihkan akun mereka.
    *   **Prioritas:** Medium.

*   **Link Email Masih `localhost`:**
    *   **Masalah:** Notifikasi email yang terkirim berisi link yang tidak valid jika dibuka dari perangkat lain.
    *   **Prioritas:** Medium.

### 3. Kekurangan Fitur Tambahan (Value-Add)

*   **Tidak ada Visitor Tracking & Input GA:**
    *   **Masalah:** Fitur untuk memantau pengunjung secara *real-time* dan memasang Google Analytics secara dinamis belum tersedia.
    *   **Prioritas:** Rendah (bisa ditambahkan setelah *go-live*).

---

## 3. Kesimpulan & Rencana Selanjutnya

**Kesimpulan:** Proyek Utero Cloud sudah **sangat matang dan canggih dari segi fitur dalam lingkungan pengembangan (localhost)**. Namun, proyek ini memiliki **dua kelemahan teknis fundamental** yang membuatnya belum siap untuk diluncurkan secara online (produksi).

Rencana selanjutnya harus fokus untuk menutup celah kritis ini, sesuai dengan yang sudah diidentifikasi dalam dokumen `billboard-system.md`.

**Prioritas Pengerjaan:**
1.  **Migrasi Database ke PostgreSQL (Supabase/Neon).**
2.  **Integrasi Cloud Storage (Cloudinary).**
3.  **Implementasi Payment Gateway (Xendit).**
4.  Menyempurnakan fitur fungsional (Lupa Password, Link Email).
5.  Menambahkan fitur tambahan (Visitor Tracking, Input GA) jika diperlukan.

---

## 4. Rangkuman Migrasi API (Backend Refactoring)
**Tanggal Mulai:** [Tanggal Mulai Migrasi]

Sebagai bagian dari upaya untuk mematangkan arsitektur dan memisahkan *concern*, logika API yang sebelumnya berada di Next.js (`src/app/api`) telah dipindahkan ke backend NestJS.

### ✅ API yang Telah Selesai Dimigrasikan

- **Manajemen Pengguna:** Registrasi, Update Profil, Ganti Password.
- **Manajemen Billboard (Admin):** CRUD Penuh, Rollback, Update Status.
- **Alur Pemesanan:** Buat Pesanan, Kirim Desain, Batal Pesanan, Minta Refund.
- **Manajemen Pesanan:** Update Status Pesanan oleh Admin.
- **Notifikasi Pembayaran:** Webhook simulasi pembayaran.
- **Unggah File:** Penanganan upload file desain via `multer`.

### ⏳ API yang Belum Dimigrasikan

- **Autentikasi Utama (`[...nextauth]`):** Memerlukan implementasi JWT/Passport.js di NestJS.
- **Manajemen Pengguna (Admin):** CRUD untuk user dari sisi admin.
- **Manajemen Pesanan (Admin):** Fitur-fitur spesifik admin seperti tambah biaya.
- **Fitur Chat:** Seluruh logika chat masih di Next.js.
- **Proxy & Pengaturan Lainnya.**

### ✨ Perubahan Teknis di Backend

- **Modul Baru:** `Users`, `Orders`, `Bookings`, `Payments`, `Uploads`.
- **Layanan Email Terpusat:** `lib/mail.service.ts` dibuat untuk menangani semua pengiriman email.
- **Validasi DTO:** Setiap endpoint baru menggunakan Data Transfer Objects (DTO) untuk keamanan.
- **Penyajian File Statis:** Backend kini dapat menyajikan file yang diunggah dari direktori `public`.

