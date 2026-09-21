# Rangkuman Migrasi API (Next.js ke NestJS Backend)

Dokumen ini merangkum progres migrasi logika API dari direktori `src/app/api` di Next.js ke aplikasi backend NestJS yang terpusat.

**Tujuan:** Memindahkan semua logika API untuk sentralisasi, skalabilitas, dan pengelolaan yang lebih baik.

---

## ✅ API yang Telah Selesai Dimigrasikan

Berikut adalah daftar rute API Next.js yang logikanya **telah berhasil dipindahkan** ke backend NestJS. File-file `route.ts` yang bersangkutan di frontend sekarang sudah usang dan dapat dihapus.

### 1. Manajemen Pengguna (User)
- **Registrasi:** `POST /api/register` → `POST /api/users/register`
- **Update Profil:** `POST /api/user/update-profile` → `PATCH /api/users/:id/profile`
- **Ganti Password:** `POST /api/user/change-password` → `PATCH /api/users/:id/change-password`

### 2. Manajemen Billboard (Admin)
- **Buat Billboard:** `POST /api/admin/billboards/create` → `POST /api/billboards`
- **Update Billboard:** `POST /api/admin/billboards/update` → `PATCH /api/billboards/:id`
- **Detail Billboard:** `GET /api/admin/billboards/detail` → `GET /api/billboards/:id/detail`
- **Hapus Billboard:** `POST /api/admin/billboards/delete` → `DELETE /api/billboards/:id`
- **Rollback Data:** `POST /api/admin/billboards/rollback` → `POST /api/billboards/rollback`
- **Update Cepat:** `POST /api/admin/billboards/quick-update` → Digabungkan ke endpoint `PATCH /api/billboards/:id/status` dan `PATCH /api/billboards/:id/quick-update`.

### 3. Alur Pemesanan (Booking)
- **Buat Pesanan:** `POST /api/booking/create` → `POST /api/bookings`
- **Kirim Desain:** `POST /api/booking/submit-design` → `POST /api/bookings/submit-design`
- **Batal Pesanan:** `POST /api/booking/cancel` → `POST /api/bookings/cancel`
- **Minta Refund:** `POST /api/booking/request-refund` → `POST /api/bookings/request-refund`

### 4. Manajemen Pesanan (Order)
- **Update Status Pesanan:** `POST /api/admin/update-order` → `POST /api/orders/update-status`

### 5. Notifikasi Pembayaran
- **Webhook Pembayaran:** `POST /api/payment/notify` → `POST /api/payments/notify`

### 6. Unggah File
- **Upload Desain:** `POST /api/upload/design` → `POST /api/uploads/design` (Sekarang ditangani oleh `multer` di backend).

---

## ⏳ API yang Belum Dimigrasikan

Berikut adalah rute API yang masih berada di frontend Next.js dan menjadi target untuk migrasi selanjutnya.

### 1. Autentikasi Utama
- `src/app/api/auth/[...nextauth]/route.ts`: Ini adalah inti dari sistem autentikasi. Migrasinya akan memerlukan implementasi strategi autentikasi di NestJS (misalnya, menggunakan JWT dan Passport.js).

### 2. Manajemen Pengguna (Admin)
- `src/app/api/admin/users/*` (create, update-account, update-business, update-role, delete)

### 3. Manajemen Pesanan (Admin)
- `src/app/api/admin/orders/*` (add-charge, update-design-status, upload-internal-design)

### 4. Fitur Chat (Admin)
- `src/app/api/admin/chat/*` (close, join, reply, send, session-detail, suggest)

### 5. Pengaturan (Admin)
- `src/app/api/admin/settings/route.ts`

### 6. Proxy
- `src/app/api/proxy/route.ts`: Rute ini belum ditemukan penggunaannya di frontend. Implementasinya ditunda.

---

## ✨ Komponen & Perubahan Baru di Backend (NestJS)

Untuk mendukung migrasi ini, beberapa komponen baru telah dibuat di dalam direktori `backend/src`:

- **Modul Baru:**
  - `users/users.module.ts`
  - `orders/orders.module.ts`
  - `bookings/bookings.module.ts`
  - `payments/payments.module.ts`
  - `uploads/uploads.module.ts`
  - *Semua modul ini telah didaftarkan di `app.module.ts`.*

- **Controllers & Services:**
  - Struktur `[nama-modul].controller.ts` dan `[nama-modul].service.ts` telah dibuat untuk setiap modul di atas.
  - Logika bisnis utama (validasi, interaksi database, pengiriman email) sekarang berada di dalam file `*.service.ts`.

- **Layanan Tambahan:**
  - `lib/mail.service.ts`: Logika untuk mengirim email menggunakan `nodemailer` telah dipindahkan ke layanan ini agar dapat digunakan kembali di berbagai modul.

- **Data Transfer Objects (DTOs):**
  - Direktori `dto` dibuat di dalam setiap modul baru untuk validasi *payload* permintaan, meningkatkan keamanan dan keandalan kode.

- **Konfigurasi Tambahan:**
  - `main.ts`: Dikonfigurasi untuk menyajikan file statis dari direktori `public` (untuk file yang diunggah).
  - **CORS**: Diaktifkan di `main.ts` untuk mengizinkan permintaan dari aplikasi frontend.
  - **File Upload**: Menggunakan `multer` dan `FileInterceptor` di `uploads.controller.ts` untuk menangani `multipart/form-data`.
