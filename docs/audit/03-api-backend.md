# Audit 03 — API & Arsitektur Backend

**Repo:** `my-billboard-app`
**Tanggal audit:** 2026-09-21
**Keluhan user:** "Backend masih semrawut", "API Tidak jelas"
**Verdict:** Keluhan **terkonfirmasi penuh**. Tetapi masalah sebenarnya jauh lebih berat daripada sekadar "semrawut": ada **9 route API admin tanpa autentikasi sama sekali**, dua di antaranya memberi **privilege escalation ke SUPER_ADMIN tanpa login**.

---

## 1. Executive Summary

Aplikasi ini menjalankan **tiga backend paralel** yang saling tumpang tindih, ditambah Server Actions, tanpa satu pun sumber kebenaran (source of truth). Hasilnya: logika bisnis yang sama ditulis dua kali dengan perilaku berbeda, dan lapisan keamanan bocor di sela-sela ketiganya.

Temuan paling kritis (detail di tabel Findings):

1. **`POST /api/admin/users/update-business` tanpa auth + mass assignment** (`src/app/api/admin/users/update-business/route.ts:7`). Satu request tanpa login dapat mengubah kolom `role` user mana pun menjadi `SUPER_ADMIN`. Ini adalah kompromi total sistem.
2. **`POST /api/admin/users/update-account` tanpa auth** (`src/app/api/admin/users/update-account/route.ts:8`) — reset password akun mana pun tanpa login, lalu mengembalikan **hash password** ke client.
3. **`POST /api/admin/users/create` tanpa auth** (`src/app/api/admin/users/create/route.ts:6`) — siapa pun dapat membuat akun `SUPER_ADMIN` yang langsung `isVerified: true`.
4. **Harga dihitung di client dan dipercaya server** (`src/components/CheckoutForm.tsx:38-41` → `src/app/api/booking/create/route.ts:42`). User dapat menyewa billboard seharga Rp 0.
5. **`POST /api/booking/request-refund` tanpa auth & tanpa cek kepemilikan** (`src/app/api/booking/request-refund/route.ts:6`) — IDOR; siapa pun dapat membajak refund order orang lain ke rekening sendiri.
6. **NestJS berjalan tanpa autentikasi apa pun.** `AuthModule` tidak pernah di-import di `backend/src/app.module.ts:13-22`, sehingga `JwtAuthGuard` adalah dead code. `backend/src/bookings/bookings.controller.ts:16` bahkan menanam user palsu hardcoded.
7. **Proxy tanpa auth** (`src/app/api/proxy/[...path]/route.ts:3-5`) meneruskan metode apa pun ke NestJS, dan `src/app/api/proxy/route.ts:10` adalah **SSRF terbuka**.
8. **Dua fitur frontend memanggil endpoint yang tidak ada** — `/api/chat/history` dan `/api/admin/orders/detail` (404 permanen).

Kualitas dasar: **160 error `tsc`**, **239 masalah ESLint**, **0 file `error.tsx`/`loading.tsx`/`not-found.tsx` dari 19 route segment**, **tidak ada library validasi** (zod tidak terpasang; `class-validator` terpasang tapi DTO tidak berdekorator dan `ValidationPipe` tidak pernah dipasang), dan `next.config.ts:29-34` **mematikan pengecekan TypeScript & ESLint saat build** sehingga semua error itu tak terlihat.

---

## 2. Runtime Topology

### 2.1 Topologi AKTUAL hari ini

Tiga backend hidup bersamaan. Frontend memilih backend secara ad-hoc per file — ada yang hardcode URL, ada yang pakai env, ada yang lewat proxy.

```
                            ┌─────────────────────────────────────┐
                            │   BROWSER (Next.js frontend :4000)  │
                            └───┬─────────┬──────────┬────────┬───┘
                                │         │          │        │
        ┌───────────────────────┘         │          │        └──────────────┐
        │ (A) relative fetch              │ (B)      │ (C) proxy            │ (D) socket.io
        │     '/api/...'                  │ NEXT_PUBLIC_API_URL             │
        v                                 v          v                       v
┌───────────────────────┐   ┌──────────────────────────────┐   ┌────────────────────────┐
│ NEXT.JS API ROUTES    │   │   NestJS  :4001              │   │ chat-server :3001      │
│ src/app/api/**        │   │   backend/src/**             │   │ chat-server/index.js   │
│ 34 route.ts           │   │                              │   │ socket.io, CORS '*'    │
│ auth: next-auth       │   │   auth: TIDAK ADA            │   │ auth: TIDAK ADA        │
│ (9 route TANPA auth)  │   │   AuthModule tak di-import   │   │ sender bisa dipalsukan │
└──────────┬────────────┘   └──────────────┬───────────────┘   └───────────┬────────────┘
           │                               ^                               │
           │                               │ (C) /api/proxy/[...path]      │
           │                               │     UNAUTHENTICATED           │
           │                               │     forward semua verb        │
           │                               │                               │
           v                               v                               v
    ┌──────────────────────────────────────────────────────────────────────────┐
    │                    PostgreSQL  (satu DB, prisma/schema.prisma)           │
    │      3 PrismaClient terpisah + 2 nested node_modules client              │
    └──────────────────────────────────────────────────────────────────────────┘

  Server Actions (src/app/admin/(dashboard)/actions.ts, live-chat/actions.ts)
      --> langsung ke Prisma, TANPA cek session sama sekali.

  SSRF: src/app/api/proxy/route.ts?url=<apa pun> --> fetch ke internet/internal.
```

**Siapa memanggil apa (hasil grep lengkap):**

| Caller (file:line) | URL dipanggil | Dilayani oleh |
|---|---|---|
| `src/app/page.tsx:10` | `${NEXT_PUBLIC_API_URL}/api/billboards` | NestJS |
| `src/app/billboard/[slug]/page.tsx:14` | `http://localhost:4001/api/billboards/${slug}` **(hardcoded)** | NestJS |
| `src/app/admin/(dashboard)/billboards/page.tsx:21` | `${BACKEND_API_URL}/api/billboards/admin` | NestJS (komentar L16: "unauthenticated call for debugging") |
| `src/app/admin/(dashboard)/billboards/form/page.tsx:48,115,148` | `${NEXT_PUBLIC_API_URL}/api/billboards/*` | NestJS |
| `src/app/register/page.tsx:28` | `${NEXT_PUBLIC_API_URL}/api/users/register` | NestJS |
| `src/app/dashboard/settings/AccountSettingsForm.tsx:53,80` | `${NEXT_PUBLIC_API_URL}/api/users/${id}/...` | NestJS |
| `src/components/CheckoutForm.tsx:71` | `${NEXT_PUBLIC_API_URL}/api/bookings` | NestJS (**user hardcoded**) |
| `src/components/BookingCard.tsx:51,82,105,121,140,157` | `${NEXT_PUBLIC_API_URL}/api/bookings/*`, `/api/payments/notify`, `/api/uploads/design` | NestJS |
| `src/components/admin/OrderActions.tsx:41` | `${NEXT_PUBLIC_API_URL}/api/orders/update-status` | NestJS |
| `src/components/ChatWidget.tsx:57` | `http://localhost:4001/api/chat/start` **(hardcoded)** | NestJS |
| `src/components/admin/DeleteBillboardBtn.tsx:21` | `/api/proxy/billboards/${id}` DELETE | proxy → NestJS |
| `src/components/admin/StatusChanger.tsx:44` | `/api/proxy/billboards/${id}/status` PATCH | proxy → NestJS |
| `src/components/ImageUpload.tsx:41` | `/api/upload` | Next route |
| `src/app/admin/(dashboard)/orders/TransactionClient.tsx:32,87,153` | `/api/admin/orders/*` | Next route |
| `src/app/admin/(dashboard)/orders/[id]/page.tsx:22` | `/api/admin/orders/detail?id=` | **TIDAK ADA — 404** |
| `src/app/admin/(dashboard)/orders/[id]/page.tsx:27` | `/api/admin/update-order` | Next route |
| `src/app/admin/(dashboard)/settings/page.tsx:20,27,43` | `/api/admin/settings` | Next route |
| `src/app/admin/(dashboard)/users/UserFormModal.tsx:78` | `/api/admin/users/create` | Next route (**tanpa auth**) |
| `src/app/admin/(dashboard)/users/[userId]/UserProfileForm.tsx:62,94` | `/api/admin/users/update-business`, `/update-account` | Next route (**tanpa auth**) |
| `src/components/admin/UserActions.tsx:23,43` | `/api/admin/users/delete`, `/update-role` | Next route |
| `src/components/admin/ChatInterface.tsx:44` | `/api/chat/history?id=` | **TIDAK ADA — 404** |
| `src/components/admin/ChatRoom.tsx:21,43` | `/api/chat/history?id=` | **TIDAK ADA — 404** |
| `src/components/admin/ChatInterface.tsx:45,78,88,102,111` | `/api/admin/chat/*` | Next route (**4 dari 5 tanpa auth**) |

**Kesimpulan status `backend/` (NestJS): PARTIALLY USED — dan inilah sumber utama kekacauan.**
NestJS bukan dead code; ia melayani jalur paling kritis (booking, payment, billboard publik, register, chat start). Namun ia berjalan **sepenuhnya tanpa autentikasi**, sementara Next.js API routes yang punya `next-auth` justru menduplikasi logika yang sama. Jadi sistem memiliki dua implementasi untuk operasi yang sama, dan **client secara konsisten memilih yang tidak aman**.

**Bug konfigurasi:** `.env:14` menetapkan `NEXT_PUBLIC_API_URL=http://localhost:3001` (port chat-server), sedangkan `.env.local:1` menimpanya dengan `http://localhost:4001` (port NestJS). Jika `.env.local` hilang saat deploy, seluruh traffic booking akan menghantam chat-server dan aplikasi mati total. Port NestJS juga hardcoded di `backend/src/main.ts:21`.

### 2.2 Topologi REKOMENDASI

**Pilihan: konsolidasi ke Next.js API Routes. Hapus NestJS. Pertahankan chat-server hanya sebagai transport socket.io.**

Justifikasi:
- Next.js sudah memegang **satu-satunya sistem auth yang benar-benar berfungsi** (`next-auth` + `src/lib/auth.ts`). NestJS tidak punya auth sama sekali dan JWT strategy-nya memakai **secret hardcoded** (`backend/src/auth/jwt.strategy.ts:39`), ditulis untuk Clerk yang tidak dipakai.
- Menghapus NestJS menghapus satu proses, satu PrismaClient, satu `package.json`, dan seluruh `backend/dist/` (128 file ter-commit).
- Session cookie next-auth dapat langsung dibaca `getServerSession` di route handler — tidak butuh proxy, tidak butuh CORS, tidak butuh token bearer antar-service.
- Socket.io tetap butuh server Node terpisah (Next.js route handler tidak memegang koneksi WebSocket persisten), jadi chat-server dipertahankan — tetapi **hanya** sebagai relay pesan, dengan verifikasi token saat handshake; seluruh penulisan DB dipindah ke Next.

```
                    ┌──────────────────────────────────────┐
                    │        BROWSER (Next.js :4000)       │
                    └──────┬────────────────────────┬──────┘
                           │ semua HTTP             │ WebSocket
                           │ relative '/api/v1/...' │ (token next-auth
                           │ (tanpa proxy)          │  divalidasi saat handshake)
                           v                        v
        ┌──────────────────────────────┐   ┌──────────────────────────┐
        │  NEXT.JS API ROUTES (satu)   │   │  chat-server (socket.io) │
        │  src/app/api/v1/**           │   │  RELAY SAJA              │
        │                              │   │  - verifikasi token      │
        │  middleware.ts  <-- auth &   │   │  - tanpa tulis DB        │
        │  RBAC terpusat               │<--│  - panggil Next API      │
        │  zod validasi tiap input     │   └──────────────────────────┘
        │  service layer src/server/** │
        │  envelope respons seragam    │
        └───────────────┬──────────────┘
                        │ satu PrismaClient
                        v
                ┌───────────────┐
                │  PostgreSQL   │
                └───────────────┘

  Email --> dipindah ke background queue, tidak memblokir request.
  Harga --> dihitung ULANG di server dari DB, input client diabaikan.
```

---

## 3. Inventaris API Lengkap — Next.js API Routes

Auth = pemeriksaan `getServerSession`. **Tidak ada satu pun route** yang memiliki `export const dynamic`, `runtime`, atau `revalidate` (runtime default `nodejs`, tanpa konfigurasi cache eksplisit). **Tidak ada satu pun route** yang memakai library validasi.

| Route | Methods | Auth | Input tervalidasi | Bentuk respons | Status codes | Issues |
|---|---|---|---|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | n/a (next-auth) | n/a | next-auth | — | Auto-register Google `src/lib/auth.ts:71`, password `''` |
| `/api/admin/billboards/create` | POST | `role !== 'ADMIN'` (L11) | Tidak | `{message, id}` | 401,500,200 | SUPER_ADMIN terkunci keluar; `any` L34,L38 |
| `/api/admin/billboards/update` | POST | ADMIN+SUPER (L10) | Tidak | `{message}` | 400,401,404,500,200 | OK-ish; pakai `$transaction` L48; `any` L43-44 |
| `/api/admin/billboards/detail` | GET | **TIDAK ADA** | hanya `!id` | entitas mentah | 200 | Bocor `history.changedBy` (data admin); tanpa try/catch |
| `/api/admin/billboards/quick-update` | POST | ADMIN+SUPER (L10) | Tidak | `{message}` | 400,401,500,200 | `status` string bebas, tanpa enum |
| `/api/admin/billboards/rollback` | POST | `role !== 'ADMIN'` (L9) | Tidak | `{message}` | 401,404,500,200 | SUPER_ADMIN terkunci; body parse di luar try L11; error ditelan tanpa log |
| `/api/admin/billboards/delete` | **POST** | ADMIN+SUPER (L10) | Tidak | `{message}` | 400,401,500,200 | **Verb salah: POST untuk DELETE** |
| `/api/admin/users/create` | POST | **TIDAK ADA** | hanya presence | user mentah (201) | 400,409,500,201 | **CRITICAL: buat SUPER_ADMIN tanpa login** |
| `/api/admin/users/update-account` | POST | **TIDAK ADA** | Tidak | user mentah **+ hash password** | 500,200 | **CRITICAL: reset password siapa pun**; mass assignment; error plain-text |
| `/api/admin/users/update-business` | POST | **TIDAK ADA** | Tidak | user mentah **+ hash password** | 500,200 | **CRITICAL: mass assignment → `role` bisa ditulis** |
| `/api/admin/users/update-role` | POST | ADMIN+SUPER (L11) | Tidak | `{status, message}` | 403,500,200 | ADMIN biasa bisa promosikan ke SUPER_ADMIN; envelope hibrida |
| `/api/admin/users/delete` | **POST** | `role !== 'ADMIN'` (L11) | Tidak | `{message}` | 400,401,500,200 | **Verb salah**; SUPER_ADMIN terkunci; `deleteMany` booking L31 tanpa transaksi |
| `/api/admin/orders/add-charge` | POST | ADMIN+SUPER (L10) | parsial (isNaN L22) | `{message}` | 400,401,500,200 | 2 write tanpa transaksi |
| `/api/admin/orders/update-design-status` | POST | ADMIN+SUPER (L10) | presence | `{message}` | 400,401,500,200 | `status.toLowerCase()` L41 crash jika non-string; `any` L26 |
| `/api/admin/orders/upload-internal-design` | POST | +OPERATOR (L13) | presence | `{message}` | 400,401,500,200 | `designUrl` tidak divalidasi (XSS tersimpan) |
| `/api/admin/update-order` | POST | ADMIN+SUPER (L11) | **Tidak** | `{message}` | 401,500,200 | Body parse di luar try L15; update+email tanpa transaksi; log email user L64; `any` L18 |
| `/api/admin/settings` | GET, **POST** | GET: **TIDAK ADA**; POST: SUPER_ADMIN | Tidak | entitas mentah / `{message}` | 400,401,500,200 | **GET membocorkan `geminiApiKey` & `googleMapsApiKey` ke publik**; GET juga menulis DB (L10) |
| `/api/admin/chat/close` | POST | **TIDAK ADA** | Tidak | `{status:'ok'}` | 200 | 2 write tanpa transaksi; tanpa try/catch |
| `/api/admin/chat/join` | POST | **TIDAK ADA** | Tidak | `{status:'ok'}` | 200 | Siapa pun jadi "AGENT"; 2 write tanpa transaksi |
| `/api/admin/chat/reply` | POST | **TIDAK ADA** | Tidak | `{status:'ok'}` | 200 | **Impersonasi ADMIN**; 2 write tanpa transaksi |
| `/api/admin/chat/send` | POST | **TIDAK ADA** | presence | `{status}` / **`{error}`** | 400,404,500,200 | Satu-satunya pemakai key `error`; pakai `$transaction` L33 |
| `/api/admin/chat/session-detail` | GET | **TIDAK ADA** | hanya `!id` | entitas mentah | 200 | Baca sesi chat siapa pun; tanpa try/catch |
| `/api/admin/chat/suggest` | POST | **TIDAK ADA** | Tidak | `{reply}` | 200 | **Prompt injection**; error dibalas HTTP 200 |
| `/api/booking/create` | POST | Ya (L10) | **Tidak** | `{message, orderId}` | 400,401,403,500,200 | **`totalPrice` dari client dipercaya**; write+2 email tanpa transaksi |
| `/api/booking/cancel` | POST | Ya (L11) | Tidak | `{message}` | 401,500,200 | **Tanpa cek kepemilikan → IDOR**: user A batalkan order user B |
| `/api/booking/request-refund` | POST | **TIDAK ADA** | Tidak | `{message}` | 400,200 | **CRITICAL IDOR**: rekening refund order siapa pun |
| `/api/booking/submit-design` | POST | — | Tidak | `{message}` | 500,200 | Tanpa cek kepemilikan |
| `/api/payment/notify` | POST | **TIDAK ADA** | Tidak | `{status:'ok'}` | 404,500,200 | **Tandai order LUNAS tanpa verifikasi**; `setTimeout` 1s L63 memblokir |
| `/api/user/change-password` | POST | Ya (L11) | presence | `{message}` | 400,401,403,404,500,200 | Route paling benar; tanpa aturan kekuatan password |
| `/api/user/update-profile` | POST | Ya | Tidak | `{message}` | 401,500,200 | — |
| `/api/upload` | POST | Ya (L9) | tipe+ukuran | `{url}` | 400,401,500,200 | **Path traversal**: `ext` dari `file.name` L29 tanpa sanitasi |
| `/api/upload/design` | POST | Ya | tipe+ukuran | `{url}` | 400,401,500,200 | Sama seperti di atas |
| `/api/proxy` | GET | **TIDAK ADA** | Tidak | HTML mentah | 400,500,200 | **SSRF terbuka** |
| `/api/proxy/[...path]` | GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD | **TIDAK ADA** | Tidak | passthrough | 502 + upstream | Melewati seluruh auth ke NestJS |

**Endpoint yang dipanggil frontend tetapi TIDAK ADA:** `/api/chat/history` (dipanggil `ChatInterface.tsx:44`, `ChatRoom.tsx:21,43`) dan `/api/admin/orders/detail` (dipanggil `orders/[id]/page.tsx:22`).

### 3.1 Inkonsistensi envelope respons — 6 bentuk berbeda

1. `{ message: "..." }` — dipakai untuk **sukses dan error sekaligus**, sehingga client tidak bisa membedakan tanpa melihat status code.
2. `{ error: "..." }` — hanya `admin/chat/send/route.ts:10,19,63`.
3. `{ status: 'ok' }` — `chat/close:21`, `chat/join:25`, `chat/reply:19`, `payment/notify:84`.
4. Entitas Prisma mentah tanpa envelope — `billboards/detail:21`, `chat/session-detail:14`, `users/create:44`, `users/update-account:20`.
5. Teks biasa `new NextResponse('Internal Server Error')` — `users/update-account:22`, `users/update-business:16`.
6. Hibrida `{ status, message }` — `users/update-role:29`.

Status auth-failure juga tidak konsisten: **401 di 7 route**, **403 hanya di `update-role:11`**. Semestinya 403 (sudah login, tetapi tidak berhak).

**Hal positif:** tidak ada satu pun catch block yang membocorkan `error.message` atau kode Prisma ke client — semua mengembalikan string generik. Ini satu-satunya aspek yang konsisten benar.

---

## 4. Matriks Duplikasi — Next Route vs NestJS Service

| Domain | Next.js | NestJS | Status | Divergensi |
|---|---|---|---|---|
| Booking create | `src/app/api/booking/create/route.ts:7` | `backend/src/bookings/bookings.service.ts:17` | **Duplikat, keduanya hidup** | Next memakai session asli (L9); Nest memakai **user palsu hardcoded** (`bookings.controller.ts:16`) → semua booking via NestJS tercatat ke `'clerk-user-id'` yang tidak ada. Next juga blokir admin via session; Nest cek `user.role` dari objek palsu, jadi tidak pernah aktif. |
| Booking cancel | `booking/cancel/route.ts:8` | `bookings.service.ts:118` | Duplikat | Next cek session (L11); Nest **tanpa auth**. Logika email identik. |
| Request refund | `booking/request-refund/route.ts:6` | `bookings.service.ts:152` | Duplikat | Logika identik, termasuk potongan 10% (`*0.90` L45 vs `*0.9` L187). **Keduanya tanpa cek kepemilikan.** |
| Submit design | `booking/submit-design/route.ts` | `bookings.service.ts:101` | Duplikat | Setara, keduanya tanpa cek kepemilikan. |
| Payment notify | `payment/notify/route.ts:7` | `payments.service.ts:14` | Duplikat | **Next menyisipkan `setTimeout` 1 detik (L63); Nest tidak.** Sisanya identik, keduanya tanpa verifikasi pembayaran. |
| Update order status | `admin/update-order/route.ts:7` | `orders.service.ts:14` | **Duplikat divergen** | **Nest menangani `installationProof` (L15,L22); Next TIDAK.** Fitur bukti pemasangan hilang bila request lewat Next. Next punya auth admin (L11); Nest **tanpa auth**. |
| Billboard update | `admin/billboards/update/route.ts:7` | `billboards.service.ts` | Duplikat | Keduanya pakai `$transaction`. Next menghitung `excludesList` (L45) lalu tidak memakainya; Nest mendokumentasikan hal yang sama (L110-112). |
| Billboard delete | `admin/billboards/delete/route.ts:7` (POST) | `billboards.controller.ts:28` (DELETE, `@Public()`) | Duplikat divergen | **Next mengecek booking aktif sebelum hapus (L18-27); NestJS TIDAK** — dan NestJS ditandai `@Public()`. Frontend memakai jalur NestJS via proxy (`DeleteBillboardBtn.tsx:21`), jadi **pengaman itu terlewati sepenuhnya.** |
| Billboard status | `admin/billboards/quick-update/route.ts` | `billboards.controller.ts:67` `@Public()` | Duplikat | Next butuh admin; Nest publik. Frontend pakai Nest (`StatusChanger.tsx:44`). |
| User register | — | `users.controller.ts:12` | Hanya Nest | `users.service.ts:20` berisi `// ... (existing create method)` — **badan fungsi kosong**; register kemungkinan besar gagal. |
| Change password | `user/change-password/route.ts:8` | `users.service.ts:28` | Duplikat | Next memakai `session.user.id` (aman, L23). **Nest memakai `:id` dari URL tanpa auth** (`users.controller.ts:32`) → siapa pun ganti password siapa pun bila tahu ID. |
| Email | `src/lib/mail.ts:73` | `backend/src/lib/mail.service.ts:100` | **Duplikat ~95% identik** | Template HTML disalin utuh. Perbedaan: `mail.ts:11-12` mengaktifkan `logger: true, debug: true` (membocorkan dialog SMTP ke log); versi Nest tidak. |
| Chat | `admin/chat/*` (6 route) | `chat.controller.ts:9` (hanya `start`) | Terbelah tiga | Sesi dibuat di NestJS, pesan ditulis oleh chat-server, admin membaca lewat Next — dan endpoint riwayat yang dipanggil UI tidak ada. |

**Catatan `http://localhost:4000`:** dokumen lama menyebut link email hardcoded. Hasil verifikasi: **tidak hardcoded** — kedua implementasi memakai `process.env.NEXTAUTH_URL` (`src/lib/mail.ts:60`, `backend/src/lib/mail.service.ts:78`). Namun `.env:24` mengisinya dengan `"http://localhost:4000"`, sehingga **setiap link invoice di email produksi akan menunjuk ke localhost** kecuali env diganti. Efeknya sama dengan hardcoded.

---

## 5. Findings

Severity: **C**=Critical, **H**=High, **M**=Medium, **L**=Low.

| ID | Sev | Judul | File:line | Dampak | Fix |
|---|---|---|---|---|---|
| F-01 | **C** | Mass assignment tanpa auth → siapa pun jadi SUPER_ADMIN | `src/app/api/admin/users/update-business/route.ts:7-12` | `{userId, ...data}` masuk langsung ke `prisma.user.update`. `role`, `isVerified`, `email` dapat ditulis tanpa login. Kompromi total. | Tambah `getServerSession` + guard SUPER_ADMIN; whitelist field eksplisit; jangan spread. |
| F-02 | **C** | Reset password akun mana pun tanpa auth | `src/app/api/admin/users/update-account/route.ts:8-18` | Ambil alih akun admin; respons L20 juga mengembalikan hash password. | Tambah auth; whitelist field; jangan kembalikan objek user mentah. |
| F-03 | **C** | Pembuatan user tanpa auth dengan `role` dari client | `src/app/api/admin/users/create/route.ts:6-39` | Registrasi diam-diam sebagai SUPER_ADMIN, `isVerified:true` (L37). | Tambah auth; `role` dari whitelist enum server. |
| F-04 | **C** | Harga dari client dipercaya bulat-bulat | `src/components/CheckoutForm.tsx:38-41` → `src/app/api/booking/create/route.ts:19-47` | `totalPrice`/`dpAmount` dikirim client; server menyimpan apa adanya (L42). Sewa seharga Rp 0. | Hitung ulang di server dari `billboard.price` DB; abaikan harga dari body. |
| F-05 | **C** | IDOR refund tanpa auth | `src/app/api/booking/request-refund/route.ts:6-56` | Tanpa session, tanpa cek pemilik. Attacker menulis `userBankName`/`userBankAccount` sendiri ke order korban (L51-52) → dana dialihkan. | Wajibkan session; verifikasi `booking.userId === session.user.id`. |
| F-06 | **C** | NestJS berjalan tanpa autentikasi | `backend/src/app.module.ts:13-22` | `AuthModule` tak pernah di-import → `JwtAuthGuard` dead code; seluruh endpoint NestJS terbuka, termasuk `orders/update-status` dan `payments/notify`. | Konsolidasi ke Next (lihat migrasi); sementara: blokir port 4001 dari publik. |
| F-07 | **C** | Konfirmasi pembayaran tanpa verifikasi | `src/app/api/payment/notify/route.ts:7-32` & `backend/src/payments/payments.service.ts:14` | POST `{orderId}` menandai order terbayar (`paidAt`, status naik) tanpa signature gateway. Penipuan langsung. | Verifikasi signature/callback resmi provider; tolak request tak bertanda tangan. |
| F-08 | **C** | Proxy tanpa auth membypass seluruh lapisan izin | `src/app/api/proxy/[...path]/route.ts:7-28` | Meneruskan semua verb ke NestJS tanpa cek; `DeleteBillboardBtn.tsx:21` memakainya untuk DELETE, melewati pengaman booking aktif milik Next. | Hapus proxy saat NestJS dipensiunkan; sampai itu, wajibkan session + whitelist path. |
| F-09 | **H** | SSRF terbuka | `src/app/api/proxy/route.ts:5-15` | `?url=` di-fetch tanpa filter → akses metadata cloud/host internal, dipantulkan ke client. | Hapus route; atau whitelist domain ketat + blokir IP privat. |
| F-10 | **H** | API key bocor lewat GET publik | `src/app/api/admin/settings/route.ts:7-12` | GET tanpa auth mengembalikan baris `systemSetting` utuh termasuk `geminiApiKey` dan `googleMapsApiKey`. GET juga menulis DB (L10). | Tambah guard admin; `select` field aman saja; pindahkan tulis ke POST. |
| F-11 | **H** | Impersonasi admin di chat | `src/app/api/admin/chat/reply/route.ts:5-9` | Tanpa auth, siapa pun mengirim pesan `sender:'ADMIN'` ke sesi mana pun (juga `join`, `close`, `send`, `session-detail`). | Tambah guard admin pada 5 route `admin/chat/*`. |
| F-12 | **H** | socket.io tanpa auth, `sender` dapat dipalsukan | `chat-server/index.js:12-17,108-116` | CORS `*`, tanpa verifikasi; klien mana pun `joinRoom` sesi mana pun lalu kirim `sender:'ADMIN'`. Semua percakapan dapat dibaca & dipalsukan. | Verifikasi token next-auth saat handshake; turunkan `sender` dari token, bukan payload. |
| F-13 | **H** | IDOR pembatalan booking | `src/app/api/booking/cancel/route.ts:11-21` | Ada session tetapi tanpa cek pemilik — user A membatalkan order user B. | Tambahkan `userId: session.user.id` pada klausa `where`. |
| F-14 | **H** | Prompt injection ke Gemini | `src/app/api/admin/chat/suggest/route.ts:24-37` | Riwayat chat user disisipkan mentah ke prompt (L27); user dapat membajak instruksi. Endpoint tanpa auth → siapa pun menguras kuota API. | Tambah auth; pisahkan konten user dari instruksi; batasi panjang & rate limit. |
| F-15 | **H** | Prompt injection + kebocoran data di chat-server | `chat-server/index.js:48-66` | `${message}` disisipkan mentah (L65); seluruh katalog billboard dikirim tiap pesan (L33-41) — biaya token membengkak, tanpa rate limit. | Sama seperti F-14; cache konteks; batasi panjang pesan. |
| F-16 | **H** | Path traversal pada nama file upload | `src/app/api/upload/route.ts:29-37` | `ext` diambil dari `file.name` tanpa sanitasi lalu digabung ke path tulis. `orderId` juga tidak divalidasi. | Whitelist ekstensi dari MIME; buat nama acak; validasi `orderId`. |
| F-17 | **H** | Server Actions tanpa cek session | `src/app/admin/(dashboard)/actions.ts:13`, `live-chat/actions.ts:5,23` | Server Action dapat dipanggil siapa pun. `getRevenueData` membocorkan omzet; `getChatSessions` membocorkan seluruh percakapan + kontak. | Panggil `getServerSession` + guard peran di awal setiap action. |
| F-18 | **H** | Pengecekan tipe & lint dimatikan saat build | `next.config.ts:29-34` | `ignoreBuildErrors` + `ignoreDuringBuilds` menyembunyikan 160 error tsc dan 239 masalah lint; bug lolos ke produksi. | Matikan kedua flag setelah error dibereskan; jadikan CI gate. |
| F-19 | **M** | Tidak ada library validasi input | seluruh repo | zod tidak terpasang; `class-validator` terpasang (`backend/package.json:41`) tetapi DTO tanpa dekorator (`create-booking.dto.ts`) dan `ValidationPipe` tak pernah dipasang di `backend/src/main.ts`. Semua `req.json()` dipakai mentah. | Pasang zod; buat skema per route; parse di batas masuk. |
| F-20 | **M** | Penulisan multi-langkah tanpa transaksi | `booking/create/route.ts:39-89`, `admin/update-order:34-80`, `chat/close:7-13`, `chat/join:8-17`, `chat/reply:9-14`, `orders/add-charge:27-36`, `users/delete:31-34` | Lihat §6. Booking tersimpan lalu email gagal → client menerima 500 padahal order sudah dibuat; retry menggandakan order. | Bungkus penulisan DB dengan `prisma.$transaction`; pindahkan email ke luar transaksi/queue. |
| F-21 | **M** | Email memblokir request, kegagalan ditelan | `src/lib/mail.ts:81-92`, `booking/create/route.ts:52,75` | Dua `await sendEmail` berurutan menahan respons; `notify` bahkan menambah `setTimeout` 1 detik (L63). `sendEmail` hanya `return false` saat gagal (L91), tidak ada yang memeriksa. | Pindah ke queue/background; catat kegagalan; jangan tahan respons HTTP. |
| F-22 | **M** | Dua fitur memanggil endpoint yang tidak ada | `ChatInterface.tsx:44`, `ChatRoom.tsx:21,43`, `orders/[id]/page.tsx:22` | Riwayat chat admin dan detail order selalu 404 → fitur rusak diam-diam (tanpa error boundary, UI hanya kosong). | Buat endpoint, atau arahkan ke Server Action yang sudah ada. |
| F-23 | **M** | Tidak ada `error.tsx`/`loading.tsx`/`not-found.tsx` | seluruh `src/app/**` | 19 route segment memiliki `page.tsx`; **nol** file khusus. Exception apa pun memunculkan layar error default Next, tanpa fallback loading. | Tambah `error.tsx` + `loading.tsx` global, lalu per segment berat (orders, billboards, live-chat). |
| F-24 | **M** | 160 error TypeScript | `npx tsc --noEmit` | Terbanyak: TS2339 (47, properti tak ada), TS1206/TS1270/TS1241 (73, dekorator NestJS gagal kompilasi karena `tsconfig.json` root tidak mengaktifkan `experimentalDecorators` dan ikut meng-compile `backend/**`), TS18048 (23, mungkin undefined). | Exclude `backend/**` dari `tsconfig.json` root; perbaiki TS2339/TS18048. |
| F-25 | **M** | Skrip `npm run lint` rusak | `package.json:16` | `next lint` dihapus di Next 16 (terpasang 16.0.10) → `npm run lint` gagal ("no such directory: lint"). Lint efektif tidak pernah dijalankan. | Ganti menjadi `eslint .`. Baseline saat ini: 239 masalah (132 error), didominasi `no-explicit-any` (109) dan `no-unused-vars` (79). |
| F-26 | **M** | Verb HTTP salah + penamaan RPC | `admin/billboards/delete/route.ts:7`, `admin/users/delete/route.ts:7`, `admin/billboards/quick-update`, `admin/update-order` | Penghapusan lewat POST; semua mutasi POST (tidak ada PATCH/PUT/DELETE); nama berbentuk RPC, bukan resource. Tidak ada route yang mutasi lewat GET. | Lihat desain REST §8. |
| F-27 | **M** | `backend/dist/` ter-commit + node_modules bersarang | `backend/dist/` (**128 file ter-track dari total 307 file di repo = 41,7% repo adalah artefak build**); `backend/backend/` dan `backend/chat-server/` **hanya berisi `node_modules`** (masing-masing 25M, hasil `npm install` dari cwd salah) | `.gitignore` tidak punya entri `dist/` → setiap rebuild backend menghasilkan diff palsu dan konflik merge. **5 salinan generated Prisma client**; total `node_modules` ~1,66 GB dengan 5 engine Prisma duplikat. | `git rm -r --cached backend/dist` + tambah `dist/` ke `.gitignore`; hapus total direktori `backend/backend/` dan `backend/chat-server/`. |
| F-28 | **M** | 6 dependensi mati | `package.json:20,19,36,22,26,40,25` | `@clerk/nextjs` **nol pemakaian** padahal `next-auth` yang aktif — sisa migrasi. `@google/generative-ai` tak pernah di-import (Gemini via `fetch` mentah). `sharp` tak pernah di-import (tidak ada kompresi gambar). `@headlessui/react` nol pemakaian. `date-fns` nol pemakaian (dideklarasikan dua kali: root + `backend/package.json:43`). `tailwind-merge` + `clsx` mati berpasangan — tanda util `cn()` yang tak pernah dibuat. | Hapus keenamnya. `next-cloudinary` (`ImageUpload.tsx:4`), `recharts` (`RevenueChart.tsx:4`), `react-calendar` (`AvailabilityCalendar.tsx:4`), leaflet, socket.io-client, bcryptjs, nodemailer **dipakai**. |
| F-29 | **M** | `ADMIN` terkunci keluar / RBAC tidak konsisten | `billboards/create:11`, `billboards/rollback:9`, `users/delete:11` | Cek `role !== 'ADMIN'` menolak `SUPER_ADMIN`. Sebaliknya `users/update-role` membiarkan ADMIN biasa mempromosikan user ke SUPER_ADMIN (tanpa whitelist `newRole`). | Sentralisasi RBAC di `middleware.ts` + helper `requireRole()`. |
| F-30 | **M** | Tidak ada logger terstruktur; PII & isi percakapan di log | **69 `console.*`** (26 log / 43 error). Terburuk: `chat-server/index.js:82` (dump **seluruh body respons Gemini**), `:117` (**setiap pesan chat pelanggan verbatim**), `:135` (isi balasan AI); `payment/notify:81` & `backend/payments.service.ts:77` (email pelanggan); `admin/update-order:64` (email pelanggan); `src/lib/mail.ts:87` (**setiap alamat penerima**, util pusat → berlaku semua email); `booking/create:72` (email admin + bocorkan status env); `users/[userId]/page.tsx:18` (user ID ke console **browser** produksi); `src/lib/mail.ts:11-12` (`debug:true` → dialog SMTP) | Observabilitas nihil (nol winston/pino/NestJS `Logger`). Transkrip percakapan pelanggan & alamat email masuk stdout. Tidak ada key/password yang ter-log hari ini, tetapi `admin/settings:31` mencatat nama model tepat di sebelah `:34` yang menyusun URL berisi `?key=…`. | Pasang pino; matikan debug SMTP; hapus log debug sisa; redaksi PII. |
| F-31 | **L** | Port tidak konsisten & hardcoded | `.env:14` (3001) vs `.env.local:1` (4001); `billboard/[slug]/page.tsx:14`, `ChatWidget.tsx:57`, `backend/src/main.ts:21` | Tanpa `.env.local`, seluruh booking menghantam chat-server. URL hardcoded gagal di produksi. | Satu variabel env, tanpa hardcode, validasi env saat boot. |
| F-32 | **L** | Link invoice email menunjuk localhost | `.env:24` → `src/lib/mail.ts:60` | `NEXTAUTH_URL="http://localhost:4000"`; semua link invoice di email tidak dapat diklik pelanggan. | Set URL publik di env produksi. |
| F-33 | **L** | `prisma.config-ts` salah nama, inert berlapis | root (ter-track git) | Seharusnya `prisma.config.ts`. **Tiga konsekuensi:** (1) Prisma CLI tidak pernah memuatnya — file mati total; (2) `tsconfig.json:32` meng-include `"prisma.config"` yang **tidak cocok ke apa pun** (entri include tanpa ekstensi hanya cocok `.ts`/`.tsx`/`.d.ts`); (3) bahkan setelah di-rename ia tetap gagal kompilasi — ia mengimpor `dotenv/config` (**`dotenv` tidak terpasang sama sekali**) dan `prisma/config` yang merupakan export Prisma v6, sedangkan root memakai prisma `^5.22.0`. | Rename + pasang `dotenv` + naikkan prisma, atau hapus. |
| F-34 | **L** | File/artefak tak terpakai | `src/lib/dummy-data.ts`, `docker-compose.yml`, `manager.js`, `.continue/`, **8 dokumen di root** | `src/lib/dummy-data.ts` (76 baris) **DEAD** — `dummyBillboards` nol importer, sisa prototipe pra-Prisma. `docker-compose.yml` **ORPHANED** — mendefinisikan `postgres:13` dengan kredensial `user`/`password`, tidak dirujuk skrip/README mana pun. `manager.js` **dipakai** (`package.json:17`). `.continue/` gitignored (`.gitignore:51`) — **periksa kedua YAML Gemini di dalamnya untuk API key tertanam**. Dokumen root: `RANGKUMAN_MIGRASI.md` adalah daftar tugas migrasi Next→NestJS yang **tidak pernah dieksekusi** — route yang ia nyatakan "sudah usang dan dapat dihapus" masih ada dan masih berjalan (inilah akar duplikasi §4). | Hapus dummy-data & compose; eksekusi atau buang `RANGKUMAN_MIGRASI.md`; konsolidasi 8 dokumen ke `docs/`. |
| F-35 | **L** | Tidak ada tipe bersama client-server | seluruh repo | Client mendefinisikan ulang bentuk data (`CheckoutForm.tsx:10-17`); 109 `any`. Perubahan skema tidak terdeteksi. | Ekspor tipe dari skema zod; pakai tipe Prisma bersama. |

---

## 6. Transaksi — skenario inkonsistensi

Hanya **2 dari 34** route memakai `prisma.$transaction`: `admin/billboards/update/route.ts:48` dan `admin/chat/send/route.ts:33`. Yang bermasalah:

- **`booking/create/route.ts:39-89`** — `booking.create` (L39), lalu email user (L52), lalu email admin (L75). Tidak ada transaksi dan **status billboard tidak pernah diubah**, padahal L30 mensyaratkan `status === 'Available'`. Akibatnya **satu billboard dapat dipesan berkali-kali secara bersamaan** (double booking). Bila SMTP gagal setelah L39, exception jatuh ke catch L93 → client menerima "Error Server" padahal order sudah tersimpan; user menekan tombol lagi → order ganda.
- **`admin/update-order/route.ts:34-80`** — update booking lalu kirim email. Email gagal → 500, padahal status sudah berubah permanen. Admin mengulang → email ganda.
- **`payment/notify/route.ts:26-80`** — status dinaikkan (L26), lalu `setTimeout` 1 detik (L63), lalu dua email. Timeout serverless dapat memotong proses setelah DB berubah tetapi sebelum notifikasi terkirim.
- **`admin/orders/add-charge/route.ts:27-36`** — `additionalCharge.create` lalu `booking.update`. Kegagalan di tengah meninggalkan biaya tambahan yang tidak tercermin pada booking.
- **`admin/chat/close|join|reply`** — masing-masing 2 penulisan tanpa transaksi dan **tanpa try/catch**; sesi dapat berubah status tanpa pesan sistem pendamping.
- **`admin/users/delete/route.ts:31-34`** — `booking.deleteMany` lalu `user.delete`. Gagal di antaranya → **riwayat booking terhapus sementara user tetap ada** (kehilangan data permanen, tidak dapat dipulihkan).

---

## 7. Integrasi eksternal

| Integrasi | Lokasi | Catatan |
|---|---|---|
| Google Gemini | `admin/chat/suggest:34` (key dari **DB**), `admin/settings:34` (key dari **body request**), `chat-server/index.js:21` (key dari **env**) | **Tiga sumber key berbeda.** Dipanggil via `fetch` mentah — SDK `@google/generative-ai` terpasang tapi tidak dipakai. Tanpa rate limit, timeout, atau batas biaya. Rentan prompt injection (F-14, F-15). |
| Cloudinary | `src/components/ImageUpload.tsx:4` | `next-cloudinary` dipakai; preset unsigned via `NEXT_PUBLIC_CLOUDINARY_PRESET` — upload dapat disalahgunakan pihak luar. |
| `sharp` | — | Terpasang, **tidak pernah di-import**. Tidak ada kompresi gambar. |
| Leaflet | `MapWrapper`/`react-leaflet` | Dipakai; `reactStrictMode:false` (`next.config.ts:7`) dipasang untuk menyiasati crash peta — menyembunyikan bug siklus hidup. |
| Clerk | — | **Dead.** Nol pemakaian; sisa migrasi yang masih mencemari `backend/src/auth/*`. |
| nodemailer | `src/lib/mail.ts`, `backend/src/lib/mail.service.ts` | Duplikat; `secure:true` dengan port dari env — akan gagal bila port 587. |

---

## 8. Usulan desain REST

Ganti penamaan RPC dengan resource + verb yang benar, di bawah satu prefix berversi:

```
GET    /api/v1/billboards                 (publik, terpaginasi)
POST   /api/v1/billboards                 (admin)
GET    /api/v1/billboards/{id}
PATCH  /api/v1/billboards/{id}            (gantikan update + quick-update)
DELETE /api/v1/billboards/{id}            (gantikan POST .../delete)
POST   /api/v1/billboards/{id}/rollback   (aksi sah: bukan CRUD)

GET    /api/v1/bookings                   (milik sendiri; admin lihat semua)
POST   /api/v1/bookings                   (harga dihitung SERVER)
GET    /api/v1/bookings/{id}
PATCH  /api/v1/bookings/{id}              (status, kunci, bukti)
POST   /api/v1/bookings/{id}/cancel
POST   /api/v1/bookings/{id}/refund-request
POST   /api/v1/bookings/{id}/design

GET    /api/v1/users                      (admin)
POST   /api/v1/users                      (admin)
PATCH  /api/v1/users/{id}                 (field di-whitelist)
DELETE /api/v1/users/{id}
PATCH  /api/v1/users/me/password

GET    /api/v1/chat/sessions              (admin)
GET    /api/v1/chat/sessions/{id}/messages   <-- endpoint hilang (F-22)
POST   /api/v1/chat/sessions/{id}/messages
POST   /api/v1/chat/sessions/{id}/close

POST   /api/v1/payments/webhook           (signature diverifikasi)
GET    /api/v1/settings  /  PATCH /api/v1/settings   (rahasia TIDAK pernah dikembalikan)
```

Envelope tunggal untuk semua respons:

```jsonc
// sukses
{ "data": { ... }, "meta": { ... } }
// error
{ "error": { "code": "VALIDATION_FAILED", "message": "…", "details": [ … ] } }
```

Aturan status: 200 sukses, 201 dibuat, 400 validasi, 401 belum login, **403 tidak berhak**, 404 tidak ada, 409 konflik, 422 gagal aturan bisnis, 500 tak terduga.

---

## 9. Rencana Migrasi

Urutan ini menutup risiko terbesar lebih dulu dan tidak merusak aplikasi di tiap tahap.

### Fase 0 — Hentikan pendarahan (hari ini, sebelum apa pun)
Tanpa perubahan arsitektur; murni tambal keamanan.
1. Tambah guard auth+RBAC pada 9 route tanpa auth: `users/create`, `users/update-account`, `users/update-business`, `billboards/detail`, `settings` (GET), dan 5 `admin/chat/*`. **(F-01,02,03,10,11)**
2. Ganti spread `...data` dengan whitelist field eksplisit di kedua route user. **(F-01,02)**
3. Hitung ulang harga di server pada `booking/create`; abaikan `totalPrice` dari client. **(F-04)**
4. Tambah cek kepemilikan pada `booking/cancel`, `request-refund`, `submit-design`. **(F-05,13)**
5. Hapus `src/app/api/proxy/route.ts` (SSRF). **(F-09)**
6. Blokir port 4001 & 3001 dari akses publik di level jaringan. **(F-06)**
7. Tambah guard session pada kedua file Server Actions. **(F-17)**

### Fase 1 — Satu sumber kebenaran auth (minggu 1)
8. Buat `src/middleware.ts` + helper `requireRole()`; seragamkan 401 vs 403; perbaiki cek `role !== 'ADMIN'`. **(F-29)**
9. Verifikasi signature pada webhook pembayaran. **(F-07)**
10. Verifikasi token saat handshake socket.io; ambil `sender` dari token. **(F-12)**

### Fase 2 — Kontrak & validasi (minggu 2)
11. Pasang zod; definisikan skema per route; parse semua `req.json()`. **(F-19)**
12. Terapkan envelope `{data}` / `{error}` tunggal + helper respons. **(§3.1)**
13. Ekspor tipe dari skema zod agar client-server berbagi tipe; hapus `any` di jalur API. **(F-35)**
14. Buat endpoint yang hilang: `chat/sessions/{id}/messages` dan detail order. **(F-22)**

### Fase 3 — Pensiunkan NestJS (minggu 3-4)
Pindahkan per domain; setelah tiap domain, arahkan ulang frontend lalu hapus modul NestJS-nya.
15. Urutan: `billboards` → `users/register` → `chat/start` → `orders` → `payments` → `bookings` (paling akhir, paling berisiko).
16. Saat memindahkan `orders`, bawa serta `installationProof` yang hanya ada di NestJS. **(§4)**
17. Saat memindahkan `billboards`, pertahankan pengaman "booking aktif" milik Next yang hilang di NestJS.
18. Ganti semua `${NEXT_PUBLIC_API_URL}/api/...` dan URL hardcoded menjadi path relatif `/api/v1/...`.
19. Hapus `src/app/api/proxy/[...path]/route.ts`. **(F-08)**
20. Hapus direktori `backend/` seluruhnya; hapus `backend/dist/` dari git. **(F-27)**

### Fase 4 — Ketahanan & kebersihan (minggu 5)
21. Bungkus penulisan multi-langkah dengan `$transaction`; keluarkan email dari jalur transaksi. **(F-20)**
22. Pindahkan email ke queue background; tangani kegagalan. **(F-21)**
23. Ubah status billboard saat booking dibuat (di dalam transaksi) untuk mencegah double booking. **(§6)**
24. Tambah `error.tsx`, `loading.tsx`, `not-found.tsx` global lalu per segment. **(F-23)**
25. Pasang pino; hapus PII dari log; matikan `debug:true` SMTP. **(F-30)**
26. Perbaiki `package.json` script lint menjadi `eslint .`. **(F-25)**
27. Exclude `backend/**` dari `tsconfig.json` root; bereskan error tsc tersisa. **(F-24)**
28. **Terakhir**: matikan `ignoreBuildErrors` & `ignoreDuringBuilds` di `next.config.ts`; jadikan gate CI. **(F-18)**
29. Hapus dep mati (`@clerk/nextjs`, `@google/generative-ai`, `sharp`); rename `prisma.config-ts`; rapikan dokumen root. **(F-28,33,34)**

---

## 10. Lampiran — data terverifikasi

- `npx tsc --noEmit`: **160 error**. TS2339 ×47, TS1206 ×29, TS18048 ×23, TS1270 ×22, TS1241 ×22, TS18046 ×6, TS2451 ×4, TS2322 ×4, TS2393 ×2, TS2353 ×1. Terkonsentrasi di `backend/src/billboards` (35), `backend/src/users` (17), `backend/src/bookings` (12).
- `npx eslint src`: **239 masalah (132 error, 107 warning)**. `no-explicit-any` ×109, `no-unused-vars` ×79, `no-img-element` ×16, `static-components` ×15, `alt-text` ×9.
- `npm run lint`: **gagal** — `next lint` dihapus di Next 16.0.10.
- `tsconfig.json:6`: `"strict": true` (aktif — namun dikalahkan oleh `ignoreBuildErrors`).
- Route segment dengan `page.tsx`: **19**. File `error.tsx`/`loading.tsx`/`not-found.tsx`/`global-error.tsx`: **0**.
- `git ls-files backend/dist`: **128 file ter-track** dari **307 total file ter-track** = 41,7% repo adalah output build.
- `node_modules`: root 793M + `backend/` 608M + `chat-server/` 213M + dua direktori hantu 25M = **~1,66 GB**, dengan **5 generated Prisma client** terduplikasi.
- Logger: **nol** winston/pino/NestJS `Logger`. **69 `console.*`** (`src/` 45, `backend/src/` 12, `chat-server/` 12).
- Layout: hanya 2 (`src/app/layout.tsx`, `src/app/admin/(dashboard)/layout.tsx`).
- `git ls-files .env .env.local`: **kosong** — rahasia tidak ter-commit (baik), terkonfirmasi via `git check-ignore -v` → `.gitignore:39` `.env*`. Semua nilai env dalam laporan ini diredaksi.
- Tidak ada `src/middleware.ts`.
- `prisma.$transaction` di kode aplikasi: 3 lokasi (`billboards/update:48`, `chat/send:33`, `backend/billboards.service.ts:116`).
