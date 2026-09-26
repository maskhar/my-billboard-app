# TODO PERBAIKAN — Utero Cloud (my-billboard-app)

> Disusun dari 6 laporan Deep Audit di `docs/audit/` (348 temuan mentah, dikonsolidasi & dideduplikasi menjadi 196 task).
> Tanggal: 21 September 2026 · Branch: `master`
>
> **STATUS PROYEK: TIDAK BOLEH ONLINE.** Ada 5 jalur ke SUPER_ADMIN tanpa login, 4 jalur kerugian uang, dan 1 bug yang merugikan Rp 10.005.000/transaksi tanpa perlu penyerang.

---

## Cara pakai dokumen ini

- Kerjakan **berurutan per fase**. Fase 1 harus tuntas sebelum Fase 2, dst. Alasannya di tiap header fase.
- `[ ]` belum · `[~]` sedang dikerjakan · `[x]` selesai · `[!]` diblokir/butuh keputusan
- Kolom **Ref** = ID temuan asli, untuk menelusuri detail & contoh kode di laporan sumber.
- Task bertanda **⚠️** mengubah perilaku produksi / sulit dibalik — baca detail di laporan sumber dulu.

### Peta laporan sumber

| Kode | File | Temuan |
|---|---|---|
| `[01]` | `01-security-auth.md` | 33 (10 CRITICAL) |
| `[02]` | `02-database-rls.md` | 35 (5 CRITICAL) |
| `[03]` | `03-api-backend.md` | 35 |
| `[04]` | `04-ui-responsive-public.md` | 138 (18 C) |
| `[05]` | `05-admin-dashboard.md` | 53 (2 C) |
| `[06]` | `06-ux-flows-business-logic.md` | 54 (11 S1) |

### Keputusan yang sudah diambil (21 Sep 2026)

| # | Keputusan | Dampak |
|---|---|---|
| **D1** | **Next.js** jadi backend tunggal; `backend/` dihapus, `chat-server/` tetap sebagai relay ber-auth | Fase 4 naik urutan; bug uang diperbaiki sekali saja di route Next |
| **D3** | **Data sekarang boleh hilang** (isinya seed/uji coba) | Fase 3 jadi satu kali tulis ulang skema + `migrate reset` + reseed, bukan 8 migrasi bertahap. 4–5 hari → ~1,5 hari |
| **D5** | **Belum pernah online**, murni localhost | Fase 0 tinggal task 0.1–0.5 (kebersihan). Task 0.6–0.9 & 4.11 **gugur** |
| **D-review** | Approval **per fase** sebelum lanjut | Tiap fase berakhir dengan laporan + diff untuk direview |
| **D4** (22 Sep) | **Payment gateway sungguhan** | Task 2.3 jadi verifikasi signature + cek nominal + idempotency, bukan penghapusan webhook. Task 6.3 & 4.21 (baru) mengikuti |

Masih menunggu: **D2** (nasib `ChatInterface.tsx` + `UserActions.tsx`) memblokir Fase 5.

**Status fase:** Fase 1 ✅ selesai & disetujui (22 Sep 2026) · Fase 4 ✅ selesai (22 Sep 2026), `backend/` dihapus · sisa: 4.3e, 4.14 (blokir D2), 4.16, 4.18.

### ⚠️ URUTAN EKSEKUSI ≠ URUTAN NOMOR

Nomor fase dipertahankan agar ID task tetap valid, tapi **urutan jalannya diubah**:

```
0 → 1 → 4 → 3 → 2 → 5 ∥ 6 → 7 → 8
```

| Pemindahan | Alasan |
|---|---|
| **4 sebelum 3** | Hapus `backend/` dulu → membuang 178 file duplikat **sebelum** konversi enum, jadi enum diterapkan ke satu basis kode bukan dua. Juga: bug uang (2.1, 2.2) ada di `backend/src/bookings/bookings.service.ts` yang akan dihapus — memperbaikinya sebelum Fase 4 = kerja dua kali |
| **3 sebelum 2** | Skema final (`Decimal`, enum) mendarat dulu → kode uang ditulis **sekali** terhadap tipe yang benar. Urutan terbalik memaksa seluruh kode Fase 2 disentuh ulang saat `Float`→`Decimal` |
| **Task 4.3 naik** | Repoint `CheckoutForm.tsx:71` dari NestJS ke route Next adalah **gerbang semua perbaikan uang**. Jadi task pertama Fase 4 |

### Ringkasan beban kerja

| Urut | Fase | Fokus | Task | Estimasi | Agent paralel |
|---|---|---|---|---|---|
| 1 | 0 | Kebersihan kredensial (non-koding) | 4 | 20 mnt | — (kamu sendiri) |
| 2 | 1 | Tutup lubang auth | 31 | 3–4 hari | 1 solo → **4** |
| 3 | 4 | Konsolidasi backend | 17 | 4–5 hari | **1** |
| 4 | 3 | Skema & integritas data | 28 | ~1,5 hari | **3** |
| 5 | 2 | Perbaiki uang | 24 | 3–4 hari | **2** |
| 6 | 5 | Dashboard admin | 33 | 7–9 hari | **5** |
| 7 | 6 | UI publik & alur beli | 29 | 6–8 hari | **4** |
| 8 | 7 | A11y, SEO, kepatuhan | 18 | 5–6 hari | **3** |
| 9 | 8 | Higiene & infra | 12 | 2–3 hari | **2** |
| | | **Total** | **196** | **±4,5–6 minggu** | |

Fase 5 dan 6 boleh berjalan bersamaan (wilayah file terpisah: `src/app/admin/**` vs `src/app/(public)/**`).

### Aturan paralelisme

Agent **tidak saling melihat edit**. Dua agent menyentuh file sama = timpa senyap, bukan konflik git yang kelihatan. Karena itu:

1. Tiap agent dapat **daftar file eksklusif**. Nol overlap, tanpa kecuali.
2. **Migrasi Prisma tidak pernah paralel** — timestamp bentrok merusak DB.
3. Hanya satu dev server (port 4000) — agent tidak bisa test bersamaan.
4. Integrasi, typecheck, dan verifikasi dilakukan terpusat setelah tiap batch, sebelum lapor.

---

# FASE 0 — KEBERSIHAN KREDENSIAL *(urutan eksekusi: 1) · kamu sendiri, non-koding*

> **D5 = belum pernah online.** Audit kompromi tidak diperlukan — task 0.6–0.9 **gugur** (dicoret di bawah sebagai catatan).
>
> Yang tersisa murni kebersihan: kredensial ini akan bocor lewat `GET /api/admin/settings` begitu aplikasi online, dan JWT secret sudah terduplikasi di 128 file `backend/dist/` yang ter-track git. Rotate sekarang selagi murah.

| # | Task | Ref | Status |
|---|---|---|---|
| 0.1 | Rotate **Gemini API key** di Google AI Studio | `[01]F-05` `[02]DB-01` `[06]F-052` | [ ] |
| 0.2 | Rotate **Google Maps API key** — tambahkan HTTP referrer restriction saat membuat key baru | `[01]F-05` | [ ] |
| 0.3 | Regenerasi `NEXTAUTH_SECRET` (`openssl rand -base64 32`) — nilai sekarang lemah/tertebak | `[01]F-27` | [ ] |
| 0.4 | Rotate **password Supabase** — tertulis plaintext di komentar `.env:10-12,20` | `[01]F-32` | [ ] |

```bash
openssl rand -base64 32
```

**Gugur karena D5 (belum pernah online):**

- ~~0.5 Rotate JWT secret NestJS~~ → tidak perlu dirotate, `backend/` dihapus seluruhnya di Fase 4 (task 4.9)
- ~~0.6 Reset password seluruh user~~ → tidak ada pihak luar yang bisa menjangkau `update-account`
- ~~0.7 Audit tabel `User` atas admin liar~~ → tidak terjangkau dari luar
- ~~0.8 Audit tabel `Booking` atas harga janggal~~ → dan lagi, DB akan direset di Fase 3 (D3)
- ~~0.9 Cek tagihan Google Cloud~~ → key belum pernah terekspos publik

**Catatan positif — tidak perlu dikerjakan:** `.env` **tidak pernah** ter-commit (diverifikasi `git log --all`), `prisma/dev.db` tidak ter-track, tidak ada XSS sink, tidak ada secret di `NEXT_PUBLIC_`, `remotePatterns` sudah ketat. `[02]DB-23` `[01]F-33-clean`

---

# FASE 1 — TUTUP LUBANG AUTH *(urutan eksekusi: 2) · 1 solo → 4 agent*

> **Kenapa duluan:** selama endpoint ini terbuka, memperbaiki hal lain tidak menambah keamanan. Task 1.1–1.9 semuanya CRITICAL dan dikonfirmasi ≥2 agent secara independen.
>
> Tetap dikerjakan walau `backend/` akan dihapus: seluruh task Fase 1 menyentuh `src/**` dan `chat-server/**` yang **tetap hidup**. Hanya task 1.16 & 1.21 menyentuh `backend/` — keduanya ditunda ke Fase 4, tidak dikerjakan di sini.

**Pembagian agent:**

| Gelombang | Agent | Task | File eksklusif |
|---|---|---|---|
| **Solo dulu** | — | 1.13, 1.22, 1.23 | `src/middleware.ts` (baru), `src/lib/auth.ts` |
| Paralel | **A** | 1.1–1.4, 1.8, 1.9 | `src/app/api/admin/users/**`, `api/admin/settings/`, `api/admin/billboards/detail/` |
| Paralel | **B** | 1.10–1.12, 1.14, 1.15, 1.17 | `src/app/api/proxy/**` (hapus), `dashboard/order/[id]/`, `api/booking/{cancel,submit-design,request-refund}/`, `invoice/[id]/`, `DeleteBillboardBtn.tsx` |
| Paralel | **C** | 1.24–1.27 | `chat-server/**` (repo terpisah, nol tabrakan) |
| Paralel | **D** | 1.5–1.7, 1.18–1.20, 1.28–1.31 | `api/admin/chat/**`, `admin/(dashboard)/{actions.ts,users/page.tsx,orders/page.tsx,settings/page.tsx}`, `api/upload/**` |

Gelombang solo harus mendarat lebih dulu — `middleware.ts` adalah fondasi yang diandalkan keempat agent.

**Ditunda ke Fase 4** (menyentuh `backend/` yang akan dihapus): 1.16, 1.21, 1.30.

## 1A. Endpoint tanpa autentikasi (CRITICAL)

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 1.1 | ⚠️ Tutup `admin/users/update-account` — tambah `getServerSession` + cek role, allowlist field, **blokir `role` & `password` dari body**, `select` tanpa `password` | `src/app/api/admin/users/update-account/route.ts:6-18` | `[01]F-01` `[02]DB-00` `[03]#2` | [ ] |
| 1.2 | ⚠️ Tutup `admin/users/update-business` — hentikan spread `{userId, ...data}` ke `prisma.user.update` | `src/app/api/admin/users/update-business/route.ts:5-18` | `[02]DB-00` `[03]#1` | [ ] |
| 1.3 | ⚠️ Tutup `admin/users/create` — tambah cek role; paksa `role: 'USER'`, jangan terima `isVerified` dari body | `src/app/api/admin/users/create/route.ts:6-39` | `[01]F-06` `[03]#3` | [ ] |
| 1.4 | ⚠️ Tutup `GET /api/admin/settings` — samakan gate `SUPER_ADMIN` dengan POST di file yang sama (`:16-20`); jangan pernah kirim API key ke client | `src/app/api/admin/settings/route.ts:7-13` | `[01]F-05` `[02]DB-01` | [ ] |
| 1.5 | ⚠️ Tutup `booking/request-refund` — tambah sesi + cek kepemilikan order | `src/app/api/booking/request-refund/route.ts:6-77` | `[01]F-12` `[03]#5` | [ ] |
| 1.6 | ⚠️ Tutup 6 endpoint `admin/chat/*` (`close`, `join`, `reply`, `send`, `session-detail`, `suggest`) — nol auth, bocorkan identitas tamu & kuras kuota Gemini | `src/app/api/admin/chat/*/route.ts` | `[01]F-14` `[06]F-046` | [ ] |
| 1.7 | ⚠️ Tambah auth ke Server Actions `getRevenueData` dkk — Server Action = endpoint publik | `src/app/admin/(dashboard)/actions.ts:13`, `live-chat/actions.ts:5,23` | `[01]F-15` | [ ] |
| 1.8 | Tutup `admin/billboards/detail` — bocorkan draft + email admin via `changedBy` | `src/app/api/admin/billboards/detail/route.ts:4-21` | `[01]F-22` | [ ] |
| 1.9 | Hapus kode debug: komentar literal *"unauthenticated call for debugging purposes"* + fallback `localhost:4001` | `src/app/admin/(dashboard)/billboards/page.tsx:17-21` | `[05]F-08` | [ ] |

## 1B. Proxy (CRITICAL)

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 1.10 | ⚠️ **Hapus** `src/app/api/proxy/route.ts` — open SSRF, `?url=` tanpa allowlist, respons dipantulkan sebagai `text/html` dari origin sendiri (jangkau `169.254.169.254`, RFC1918) | `proxy/route.ts:5,10,19,28-32` | `[01]F-03` `[06]F-050` `[03]#10` | [ ] |
| 1.11 | ⚠️ **Hapus** `src/app/api/proxy/[...path]/route.ts` — komentarnya sendiri menulis *"Do not use this in production"*; ekspor `DELETE` → `DELETE /api/proxy/billboards/:id` hapus billboard tanpa login | `proxy/[...path]/route.ts:3-5,20-28,50-56` | `[01]F-02` `[06]F-051` `[03]#9` | [ ] |
| 1.12 | Alihkan `DeleteBillboardBtn` yang memakai proxy ke route Next ber-auth (yang punya guard booking aktif) | `src/components/admin/DeleteBillboardBtn.tsx:21` | `[03]#9` | [ ] |

## 1C. Middleware & IDOR

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 1.13 | ⚠️ **Buat `src/middleware.ts`** — nol proteksi edge saat ini; matcher untuk `/admin`, `/dashboard`, `/api/admin`. 13 dari 34 route tanpa `getServerSession` | (file belum ada) | `[01]F-17` | [ ] |
| 1.14 | Perbaiki IDOR detail order user — tambah `if (order.userId !== session.user.id) return notFound()`. Pola benar sudah ada di `invoice/[id]/page.tsx:30`, tinggal ditiru | `src/app/dashboard/order/[id]/page.tsx:18-23` | `[01]F-23` `[06]F-009` `[04]#12` | [ ] |
| 1.15 | Perbaiki IDOR `booking/cancel` & `submit-design` — tambah `where: { id, userId: session.user.id }` | `src/app/api/booking/cancel/route.ts:17-21`, `submit-design/route.ts:15-22` | `[01]F-11` | [ ] |
| 1.16 | ~~Perbaiki IDOR cancel/refund sisi NestJS~~ → **ditunda ke Fase 4**, file dihapus | `backend/src/bookings/bookings.service.ts:118-222` | `[02]DB-05` | [!] |
| 1.17 | Perbaiki cek akses invoice yang melewatkan `SUPER_ADMIN` → `!['ADMIN','SUPER_ADMIN'].includes(role)` | `src/app/invoice/[id]/page.tsx:30` | `[06]F-013` | [ ] |

## 1D. Kebocoran data ke client

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 1.18 | ⚠️ Hentikan pengiriman **hash password & `otpCode`** ke browser — ganti spread `...user` dengan `select` eksplisit | `src/app/admin/(dashboard)/users/page.tsx:7-18` | `[01]F-16` `[02]DB-06` | [ ] |
| 1.19 | Ganti `include: { user: true }` dengan `select` bersarang (4 lokasi) | `orders/page.tsx:42-46`, `bookings.service.ts:125,163,197` | `[02]DB-07` | [ ] |
| 1.20 | Hentikan pengiriman API key utuh ke client settings — `type="password"` hanya sembunyikan visual; kirim versi ter-mask, POST hanya bila diubah | `src/app/admin/(dashboard)/settings/page.tsx:20-22,84,100` | `[05]F-09` | [ ] |
| 1.21 | ~~Filter `publishStatus` di API publik NestJS~~ → **ditunda ke Fase 4**; gate `PUBLISHED` ditulis di route Next pengganti | `backend/src/billboards/billboards.service.ts:161` | `[06]F-017` | [!] |

## 1E. NextAuth & chat-server

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 1.22 | ⚠️ Tutup account takeover via Google — cek `profile.email_verified`, tolak auto-linking ke akun email yang sudah ada | `src/lib/auth.ts:58-90` | `[01]F-18` | [ ] |
| 1.23 | Set `session.maxAge` — sesi saat ini tidak pernah kedaluwarsa | `src/lib/auth.ts:9-12` | `[01]F-27` | [ ] |
| 1.24 | ⚠️ Tambah `io.use()` handshake auth di chat-server + validasi kepemilikan room — `joinRoom` arbitrer bisa baca chat pelanggan lain | `chat-server/index.js:100-106` | `[01]F-09` | [ ] |
| 1.25 | ⚠️ Tentukan `sender` **server-side** dari identitas terverifikasi — client bisa kirim `sender: 'ADMIN'` dan memalsukan pesan resmi | `chat-server/index.js:108-117` | `[01]F-10` | [ ] |
| 1.26 | Batasi CORS ke domain dikenal (backend & chat-server) | `backend/src/main.ts:14`, `chat-server/index.js:9,13-15` | `[01]F-26` | [ ] |
| 1.27 | Hentikan logging pesan pelanggan verbatim | `chat-server/index.js:117` | `[03]#12` | [ ] |

## 1F. Rate limit & upload

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 1.28 | Terapkan rate limiting pada login, OTP, dan endpoint AI — nol rate limiting di seluruh repo | `src/lib/auth.ts:32-52` dll. | `[01]F-19` | [ ] |
| 1.29 | Perbaiki upload: turunkan ekstensi dari **MIME allowlist** (bukan nama file klien), nama file acak — cegah stored XSS via `.html`/`.svg` & penimpaan desain | `src/app/api/upload/design/route.ts:55-57`, `upload/route.ts:29-30` | `[01]F-25` | [ ] |
| 1.30 | ~~Auth + cek kepemilikan upload NestJS~~ → **ditunda ke Fase 4**; cek kepemilikan ditulis di route upload Next | `backend/src/uploads/uploads.controller.ts:38-51` | `[06]F-016` | [!] |
| 1.31 | Pindahkan Gemini API key dari query string ke header `x-goog-api-key` — key bocor ke log/proxy | `src/app/api/admin/settings/route.ts:34`, `chat-server/index.js:68` | `[01]F-28` | [ ] |

**✅ Gerbang Fase 1:** jalankan ulang cek — nol route `admin/*` tanpa `getServerSession`; `curl` ke 5 endpoint di 1A mengembalikan 401/403; kedua route proxy hilang; `middleware.ts` ada.

---

# FASE 2 — PERBAIKI UANG *(urutan eksekusi: 5) · 2 agent*

> Fase 1 menghentikan pencuri; fase ini menghentikan sistem merugikan dirinya sendiri. Task 2.1 terjadi **tanpa penyerang**, tiap kali ada refund normal.
>
> **Dipindah ke urutan 5** karena dua alasan: (a) target aslinya `backend/src/bookings/bookings.service.ts` sudah dihapus di Fase 4 — perbaikan ditulis di route Next hasil porting; (b) skema `Decimal` sudah mendarat di Fase 3, jadi aritmetika uang ditulis sekali terhadap tipe yang benar.
>
> **2 agent saja.** File menumpuk berat: `CheckoutForm.tsx` disentuh 3 task, logika booking 4 task.

| Agent | Task | Wilayah |
|---|---|---|
| **H** | 2.1–2.6, 2.20–2.23 | Route booking/payment Next, `CheckoutForm.tsx`, `BookingCard.tsx` |
| **I** | 2.7–2.9, 2.14–2.19, 2.24 | `invoice/[id]/page.tsx`, `src/lib/revenue.ts` (baru), KPI dashboard, `HeroMap.tsx`, `BillboardDetailClient.tsx` |

⚠️ **Semua aritmetika uang memakai `Decimal`**, bukan `number` JavaScript. Fase 3 sudah mengubah tipe kolomnya; operasi float pada nilai `Decimal` memunculkan kembali bug pembulatan yang baru saja ditutup.

## 2A. Kerugian langsung (CRITICAL)

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 2.1 | ⚠️ **Perbaiki rumus refund** — `totalPrice * 0.9` memakai **bruto**, bukan uang yang benar-benar diterima. User DP setor Rp 20.010.000 → sistem perintahkan transfer Rp 30.015.000. **Rugi Rp 10.005.000/transaksi.** Ganti ke `Σ pembayaran diterima × 0.9` | route refund Next (hasil 4.3a) | `[06]F-003` | [ ] |
| 2.2 | ⚠️ **Hitung harga di server** — `totalPrice`/`dpAmount` diambil mentah dari body. Billboard Rp 300jt bisa dipesan Rp 1 via `curl`. Abaikan nilai client sepenuhnya, hitung dari `billboard.price × duration` | `CheckoutForm.tsx:62` → `api/booking/create/route.ts:39-47` | `[01]F-13` `[02]DB-03` `[06]F-001` `[03]#4` | [ ] |
| 2.3 | ⚠️ **Verifikasi signature webhook pembayaran** — POST `{orderId}` saja sudah menandai order LUNAS + memicu email "[LUNAS] Uang Masuk". Tambah HMAC, cek nominal, idempotency. **Bentuk akhir bergantung D4** | `src/app/api/payment/notify/route.ts:7-32` | `[01]F-04` `[03]#7` | [!] |
| 2.4 | ⚠️ **Cegah double-booking** — nol constraint, nol query overlap, nol transaksi. `booking/create:30` cuma cek `status !== 'Available'`, dan **tidak ada kode yang pernah menulis `'Booked'`** → gerbang permanen terbuka | `api/booking/create/route.ts:26-47` | `[02]DB-02` `[06]F-006` | [ ] |
| 2.5 | ~~`EXCLUDE USING gist` constraint~~ → **naik ke Fase 3** (task 3.8), digabung ke migrasi tunggal. Verifikasi di sini bahwa constraint benar menolak overlap | migrasi Fase 3 | `[02]DB-02` | [ ] |

## 2B. Tagihan & invoice salah

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 2.6 | ⚠️ Perbaiki tagihan DP — user pilih DP 60% tapi ditagih **100%** lalu diemail "LUNAS". Tagih `dpAmount` bila `dpAmount > 0`; bedakan email DP vs lunas | `BookingCard.tsx:116`, route payment Next | `[06]F-005` | [ ] |
| 2.7 | ⚠️ Perbaiki blok total invoice — "Subtotal 33.350.000 − DP 20.010.000 = **Total 33.350.000**". Pengurangnya tidak diterapkan | `src/app/invoice/[id]/page.tsx:102,108,113` | `[06]F-025` | [ ] |
| 2.8 | Tampilkan PPN & admin fee di invoice — tidak pernah muncul sama sekali; invoice bukan faktur pajak sah | `invoice/[id]/page.tsx:100-115` | `[06]F-024` | [ ] |
| 2.9 | Sertakan `additionalCharges` di query & render invoice — user ditagih biaya yang tidak pernah ia lihat | `invoice/[id]/page.tsx:72-95` vs `TransactionClient.tsx:191` | `[06]F-026` | [ ] |
| 2.10 | ~~Tambah kolom `basePrice`, `taxAmount`, `adminFee`~~ → **naik ke Fase 3** (digabung ke migrasi tunggal). Di sini tinggal **isi** kolomnya saat pembuatan booking | `schema.prisma:112-113` | `[06]F-024` | [ ] |
| 2.11 | ~~Tambah kolom `unitPrice`~~ → **naik ke Fase 3**. Di sini tinggal **snapshot** nilainya saat pembuatan — laporan historis terdistorsi tiap harga billboard berubah | `schema.prisma:103-146` | `[02]DB-09` | [ ] |

## 2C. Presisi & pembulatan

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 2.12 | ~~Ubah 6 kolom uang `Float` → `Decimal`~~ → **naik ke Fase 3** (task 3.29). Di sini tinggal **sesuaikan kode pemanggil** ke tipe `Decimal` | `schema.prisma:70,112,113,131,154,200` | `[02]DB-08` `[06]F-023` | [ ] |
| 2.13 | Tambah `Math.round()` pada `grandTotal * 0.60` — float mentah masuk UI **dan** database sebagai `dpAmount` | `CheckoutForm.tsx:42,64,265` | `[04]#14` | [ ] |
| 2.14 | Perbaiki `toFixed(0)` yang menurunkan harga tampil s/d Rp 900rb | `HeroMap.tsx:67` | `[04]#14` | [ ] |
| 2.15 | Perbaiki pembulatan menyesatkan di detail — Rp 8.500.000 tampil "**9 Jt**", Rp 500.000 jadi "1 Jt" | `BillboardDetailClient.tsx:41,160` | `[06]F-015` | [ ] |

## 2D. Angka salah di dashboard

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 2.16 | ⚠️ **Omzet menghitung order `REFUNDED` sebagai pendapatan** — kartu KPI & grafik melebih-lebihkan omzet sebesar total refund | `admin/(dashboard)/page.tsx`, `actions.ts` | `[05]F-03` | [x] |
| 2.17 | Satukan definisi "uang masuk" — saat ini **3 definisi berbeda di 3 file** | `page.tsx`, `actions.ts`, `users/page.tsx` | `[05]F-04` | [x] |
| 2.18 | Keluarkan `REFUNDED` dari `totalSpent` pelanggan | `src/app/dashboard/DashboardWrapper.tsx` | `[02]DB-30` | [x] |
| 2.19 | Perbaiki "Total Spending" yang melewatkan `PAID_CONFIRMED` | `users/page.tsx` | `[05]F-04` | [x] |

> **Catatan penyelesaian 2.16–2.19 (27 Sep 2026).** Keempatnya tuntas sekaligus,
> tapi **bukan** lewat `isRevenueStatus(status)` seperti yang disarankan laporan
> `[05]`. Helper itu tidak pernah dibuat, dan sengaja: status *pesanan* bukan
> bukti uang masuk. `PAID_CONFIRMED` hanya berarti seseorang menekan tombol
> verifikasi, dan pesanan DP berstatus `ACTIVE` uangnya baru masuk sebagian —
> helper berbasis status akan menghitung kontrak penuh sebagai pendapatan.
>
> Yang dipakai sebagai gantinya: baris `Payment` berstatus `PAID` sebagai
> satu-satunya bukti uang masuk, dibaca lewat `uangMasuk()` /`uangMasukSemua()`
> di [`src/lib/pembayaran.ts`](../../src/lib/pembayaran.ts). Refund yang selesai
> menjadi PENGURANG terpisah dari `Booking.refundAmount` pada pesanan `REFUNDED`,
> bukan status yang dikecualikan dari daftar. Grafik tren membukukan tiap
> penerimaan pada `Payment.paidAt` miliknya sendiri, sehingga pelunasan yang
> masuk berbulan-bulan kemudian tidak lagi tercatat di bulan DP.
>
> `UserClientPage.tsx:51` tidak lagi menghitung apa pun; angkanya disusun server
> di `users/page.tsx` dan diserahkan sebagai angka jadi.

## 2E. Tanggal & kedaluwarsa

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 2.20 | ⚠️ Perbaiki `setMonth` overflow — **31 Jan + 1 bulan → 3 Maret**. Pakai `addMonths` dari `date-fns` (sudah terpasang) + clamp akhir bulan | `api/booking/create/route.ts:37` | `[06]F-022` | [ ] |
| 2.21 | ⚠️ **Timer 24 jam kosmetik** — hanya `useState`, nol scheduler. Order pending tidak pernah kedaluwarsa → **inventori terkunci selamanya**. Tambah job pengekspirasi; kolom `expiresAt` sudah ada dari task 3.30 | `BookingCard.tsx:29-40` | `[06]F-007` | [ ] |
| 2.22 | Tambah guard status pada refund — bisa diajukan pada order `CANCELLED`/`REFUNDED` → **refund ganda** | route refund Next (hasil 4.3a) | `[06]F-008` | [ ] |
| 2.23 | Terapkan peta transisi status legal (enum dari task 3.4) — `CANCELLED → ACTIVE` dan `REFUNDED → ACTIVE` saat ini diizinkan | route update-status Next (hasil 4.3d) | `[06]F-011` | [ ] |
| 2.24 | Hapus atau implementasikan badge "Hemat!" — mengklaim diskon yang tidak ada (klaim menyesatkan konsumen) | `CheckoutForm.tsx:38,119` | `[06]F-010` | [ ] |

**✅ Gerbang Fase 2:** test satu transaksi end-to-end (Rp 10.000.000, 3 bulan, DP 60%) — angka di checkout, kartu dashboard, invoice, dan DB harus **identik**. Refund atas transaksi itu tidak boleh melebihi uang yang masuk.

---

# FASE 3 — SKEMA & INTEGRITAS DATA *(urutan eksekusi: 4) · 3 agent*

> **D3 = data boleh hilang.** Fase ini runtuh dari 8 migrasi bertahap menjadi **satu kali tulis ulang `schema.prisma` → `migrate reset` → reseed**. 4–5 hari → **~1,5 hari**.
>
> **Kenapa sebelum Fase 2:** skema final (`Decimal`, enum) mendarat lebih dulu, jadi kode uang ditulis **sekali** terhadap tipe yang benar. Urutan terbalik memaksa seluruh kode Fase 2 disentuh ulang.
>
> **Kenapa setelah Fase 4:** `backend/prisma/schema.prisma` sudah lenyap, jadi tidak perlu sinkronisasi dua skema.

```bash
npx prisma migrate reset --force
```

**Pembagian agent:**

| Agent | Task | Wilayah | Catatan |
|---|---|---|---|
| **E** | 3.1–3.8, 3.18, 3.19, 3.26, 3.28 | `prisma/schema.prisma` + kode pemanggil enum | **Solo** untuk skema & migrasi — tidak pernah paralel |
| **F** | 3.13, 3.14, 3.17 | `src/lib/safe-json.ts` (baru) + call site `JSON.parse` | Boleh jalan bersama E |
| **G** | 3.20–3.25, 3.27 | SQL RLS, `prisma/seed.ts` | Boleh jalan bersama E |

Agent F & G menunggu E menyelesaikan `schema.prisma` bila task-nya menyentuh bentuk tabel (3.14, 3.27).

## 3A. State machine rusak

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 3.1 | ⚠️ `PAID_CONFIRMED` **dibaca 10×, ditulis 0×** — query pendapatan menghitung status yang tidak pernah terjadi. Tulis di webhook, atau hapus statusnya | `payments.service.ts:28`; dibaca `page.tsx:33`, `actions.ts:45`, `OrderActions.tsx:111` | `[02]DB-24` `[06]F-012` | [ ] |
| 3.2 | ⚠️ Tab refund admin memfilter `REFUND_REQUESTED` yang **tidak pernah ditulis** (kode menulis `REVIEW_REFUND`) → **semua pengajuan refund tak terlihat admin** | `orders/page.tsx:34` vs `request-refund/route.ts:15` | `[02]DB-25` | [ ] |
| 3.3 | Satukan `sender: 'AGENT'` vs `'ADMIN'` — balasan CS dirender sebagai pesan pelanggan (rata-kiri, tanpa label) | `CS_InboxLayout.tsx:212,223` vs `ChatWidget.tsx:144-148` | `[02]DB-28` | [ ] |

## 3B. Enum (mengunci 3A)

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 3.4 | Konversi `String` bebas → `enum` untuk role, booking status, `publishStatus`, `authProvider`, chat sender/status | `schema.prisma:32,45,73,74,114,118,175,186` | `[02]DB-12` | [ ] |
| 3.5 | Enum `BillboardStatus` — `status` TitleCase satu-satunya di repo; `!== 'Available'` gagal senyap bila casing beda | `schema.prisma:73` | `[02]DB-31` | [ ] |
| 3.6 | Enum `DesignOption` — lowercase & dipakai sebagai boolean; typo casing membelokkan fulfillment tanpa error | `schema.prisma:116`, `payment/notify/route.ts:24` | `[02]DB-32` | [ ] |
| 3.7 | Masukkan role `"CS"` ke enum — dipakai `seed.ts:47` tapi tidak ada di komentar skema | `prisma/seed.ts:47` vs `schema.prisma:32` | `[02]DB-21` | [ ] |

## 3C. Performa DB

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 3.8 | ⚠️ Tambah `@@index` — **nol indeks non-unique**; semua FK & kolom status tak terindeks; `Booking.status` difilter di 11 lokasi (daftar lengkap di `[02]` Bagian 5). Sekalian tambah `EXCLUDE USING gist` anti-overlap (SQL di `[02]` Bagian 7) | `schema.prisma` + migrasi | `[02]DB-10` `[02]DB-02` | [ ] |
| **3.29** | ⚠️ **Dipromosikan dari Fase 2.** Ubah 6 kolom uang `Float` → `Decimal @db.Decimal(14,2)` — DP render "Rp 8.252.221,548" | `schema.prisma:70,112,113,131,154,200` | `[02]DB-08` `[06]F-023` | [ ] |
| **3.30** | **Dipromosikan dari Fase 2.** Tambah kolom `basePrice`, `taxAmount`, `adminFee`, `unitPrice`, `npwp`, `expiresAt` di `Booking` — PPN & admin fee tidak pernah disimpan, mustahil direkonsiliasi | `schema.prisma:103-146` | `[06]F-024` `[02]DB-09` `[06]F-007` `[06]F-021` | [ ] |
| 3.9 | Tambah paginasi `take`/`skip` pada daftar admin | `users/page.tsx:7`, `orders/page.tsx:37`, `billboards/page.tsx:21` | `[02]DB-13` `[05]F-24` | [ ] |
| 3.10 | Hitung spending via `groupBy`/`_sum` di server — sekarang 1.000 user × 20 booking = 20.000 baris ke client tiap buka halaman | `users/page.tsx:7-8` | `[05]F-10` | [ ] |
| 3.11 | Indeks `publishStatus` + cache + `take` untuk chat-server — full-scan `Billboard` tiap pesan masuk | `chat-server/index.js:33-36` | `[02]DB-29` | [ ] |
| 3.12 | Konfigurasi pooling serverless — `?pgbouncer=true&connection_limit=1` | `src/lib/prisma.ts:1-9` | `[02]DB-17` | [ ] |

## 3D. Ketahanan data

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 3.13 | ⚠️ Bungkus **13 `JSON.parse` tanpa guard** dengan helper `safeJsonParse(json, fallback)` — satu baris DB rusak = halaman produk publik crash total, tanpa error boundary | `BillboardDetailClient.tsx:37-40`, `TransactionClient.tsx:272-274`, `billboards/form/page.tsx:52-54` | `[02]DB-11` `[04]S-02` `[05]F-29` | [ ] |
| 3.14 | Pertimbangkan kolom `Json` native menggantikan JSON-dalam-`String` untuk `gallery`/`specs` | `schema.prisma` | `[02]DB-11` | [ ] |
| 3.15 | ⚠️ Bungkus `users/delete` dalam `$transaction` — hapus bookings lalu user tanpa transaksi; gagal separuh = **kehilangan data permanen** | `src/app/api/admin/users/delete/route.ts:31` | `[03]#14` `[02]DB-14` | [ ] |
| 3.16 | Terapkan soft delete / `onDelete: Restrict` eksplisit — penghapusan user membuang bukti transaksi selesai | `schema.prisma:167,170` | `[02]DB-14` | [ ] |
| 3.17 | Audit 32 route lain yang tidak memakai `$transaction` (hanya 2 dari 34 memakainya) | seluruh `src/app/api/**` | `[03]#14` | [ ] |
| 3.18 | Tambah `@updatedAt` pada `User`, `BillboardHistory`, `AdditionalCharge` | `schema.prisma:25-58,149-156,192-209` | `[02]DB-15` | [ ] |
| 3.19 | Sertakan `excludes` di payload update billboard — data exclusions basi permanen. Verifikasi terbawa saat porting Fase 4 | route update billboard Next | `[02]DB-26` | [ ] |

## 3E. RLS & enkripsi

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 3.20 | ⚠️ **Jalankan skrip hardening RLS** (`[02]` Bagian 6) — nol `CREATE POLICY` di repo. **Catatan penting:** Prisma connect sebagai role `postgres` yang bypass RLS, jadi ini bukan perbaikan jalur utama, melainkan menutup PostgREST/anon key. Skrip me-revoke `anon`/`authenticated` se-schema — **staging dulu** | seluruh DB | `[02]DB-04` | [ ] |
| 3.21 | Verifikasi apakah PostgREST Supabase aktif untuk schema `public` — bila ya, anon key bisa baca hash password `User` + `otpCode` + `SystemSetting` | Supabase dashboard | `[02]DB-04` | [ ] |
| 3.22 | Enkripsi API key di `SystemSetting` (pgcrypto / Supabase Vault), atau pindah ke env var | `schema.prisma:164-165` | `[02]DB-16` | [ ] |
| 3.23 | ⚠️ Enkripsi/mask KTP & NPWP saat diam; batasi akses ke `SUPER_ADMIN`; tambah audit log akses | `schema.prisma:38-41`, `users/[userId]/page.tsx:43-45`, `UserProfileForm.tsx:117-120` | `[06]F-020` | [ ] |

## 3F. Seed

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 3.24 | Ganti password seed `123456` (5 akun termasuk SUPER_ADMIN) dengan acak; cetak sekali ke stdout saat seed | `prisma/seed.ts:18-56` | `[02]DB-19` | [ ] |
| 3.25 | ⚠️ Tambah guard `NODE_ENV` pada `seed.ts` — `deleteMany` seluruh data tanpa konfirmasi. **Kritis setelah D3:** reset direncanakan sekali di fase ini, jangan sampai terulang tak sengaja nanti | `prisma/seed.ts:11-15` | `[02]DB-20` | [ ] |
| 3.26 | ~~Satukan skema duplikat `backend/prisma/schema.prisma`~~ → **otomatis selesai** via task 4.9 | — | `[02]DB-18` | [!] |
| 3.27 | Implementasikan atau hapus `otpCode`/`otpExpires` — dead code, 0 referensi | `schema.prisma:48-49` | `[01]F-30` `[06]F-019` | [ ] |
| 3.28 | Masukkan `'CS'` & `'OPERATOR'` ke `allowedRoles` layout admin | `admin/(dashboard)/layout.tsx:89-96` | `[02]DB-27` `[05]F-02` | [ ] |

---

# FASE 4 — KONSOLIDASI BACKEND *(urutan eksekusi: 3) · 1 agent, tanpa paralel*

> **Akar masalah "backend semrawut":** `RANGKUMAN_MIGRASI.md` adalah checklist migrasi Next→NestJS yang **berhenti di tengah**. Route yang dokumen itu sendiri nyatakan usang masih hidup dan melayani traffic. Dua sistem berjalan bersamaan dengan aturan berbeda.
>
> **D1 = Next.js.** `backend/` dihapus seluruhnya. `chat-server/` tetap hidup sebagai relay ber-auth.
>
> **Kenapa naik ke urutan 3:** membuang 178 file duplikat sebelum Fase 3 berarti enum & `Decimal` cukup diterapkan ke satu basis kode. Dan dua bug uang terbesar (2.1 refund, 2.2 harga) ada di `backend/src/bookings/bookings.service.ts` — memperbaikinya sebelum fase ini = menulis kode yang langsung dihapus.
>
> **Satu agent, serial.** Refactor lintas-modul + penghapusan direktori; paralelisme di sini menghasilkan kekacauan, bukan kecepatan.

**Task NestJS-hardening gugur karena D1** — tidak ada gunanya mengamankan kode yang dihapus di task 4.9:
~~4.2 daftarkan `APP_GUARD`~~ · ~~4.4 cabut `@Public()`~~ · ~~4.5 guard controller~~ · ~~4.6 `ValidationPipe`~~ · ~~4.7 aktifkan helmet~~ · ~~4.11 bersihkan riwayat git~~ (gugur karena D5)

Perlindungan yang task-task itu maksudkan **tetap harus ada** — ditulis di route Next pengganti, tercakup di task 4.3a–4.3e.

## 4A. Gerbang — pindahkan alur booking ke Next

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 4.3 | ⚠️ **Repoint `CheckoutForm.tsx:71` dari NestJS ke `/api/booking/create`.** Gerbang semua perbaikan uang. Sekarang order dibuat via NestJS dengan user hardcode `'clerk-user-id'` → **setiap order yatim**, tidak terhubung user manapun. Ambil `userId` dari sesi | `CheckoutForm.tsx:71` → `src/app/api/booking/create/route.ts` | `[06]F-002` `[03]#8` | [x] |
| 4.3a | Port cancel + refund ke route Next **berikut cek kepemilikan** (menggantikan 1.16) | `api/booking/{cancel,request-refund}/` | `[02]DB-05` | [x] |
| 4.3b | Port list/detail billboard publik **dengan gate `publishStatus: 'PUBLISHED'`** (menggantikan 1.21) | route Next baru | `[06]F-017` | [x] |
| 4.3c | Port upload **dengan auth + cek kepemilikan `orderId`** (menggantikan 1.30) | `api/upload/design/` | `[06]F-016` | [x] |
| 4.3d | Port update-status order **dengan gate role** — di NestJS siapa pun bisa set order jadi `ACTIVE` | route Next baru | `[06]F-004` | [x] |
| 4.3e | Terapkan allowlist field (pengganti `ValidationPipe`) di seluruh route hasil porting — `...rest` NestJS mengalir ke Prisma | route Next baru | `[01]F-21` | [ ] |

## 4B. Penghapusan

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 4.8 | Diff logika bisnis Next vs NestJS (booking create, cancel, refund) & catat divergensi **sebelum** menghapus — beberapa perilaku mungkin hanya ada di NestJS | `[03]` matriks duplikasi | `[03]` | [x] |
| 4.9 | ⚠️ **Hapus `backend/`** setelah 4.3a–4.3e mendarat & 4.8 bersih | `backend/` | `[03]` | [x] |
| 4.10 | `git rm -r --cached backend/dist` + tambahkan ke `.gitignore` — 128 file build output ter-track. Jalankan **sebelum** 4.9 agar riwayat bersih | `backend/dist/` | `[01]F-07` | [x] |
| 4.12 | Hapus `backend/backend/node_modules` & `backend/chat-server/node_modules` (prisma client bersarang) | — | `[03]#1` | [x] |
| 4.19 | Hapus generator `backendClient` dari `prisma/schema.prisma` (dari 3 generator jadi 2) | `schema.prisma` | `[02]DB-18` | [x] |
| 4.20 | Perbarui `RANGKUMAN_MIGRASI.md` — tandai migrasi ditinggalkan, arah final Next.js, agar tidak menyesatkan lagi | `RANGKUMAN_MIGRASI.md` | `[03]` | [x] |
## 4C. Route hilang & email

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 4.13 | **Buat route `/api/admin/orders/detail`** — dipanggil tapi tidak ada → halaman detail order admin **terhenti di `Loading...` selamanya** | `admin/(dashboard)/orders/[id]/page.tsx:22,39` | `[06]F-053` | [x] |
| 4.14 | **Buat route `/api/chat/history`** — dipanggil 3 komponen, tidak ada, 404 senyap | — | `[03]#15` | [ ] |
| 4.15 | ~~Perbaiki `backend/.env`~~ → **gugur**, direktori dihapus. Masalahnya sendiri (email gagal → user lihat "Error Server" walau order tersimpan) hilang begitu alur pindah ke Next | — | `[06]F-014` | [!] |
| 4.16 | Kirim email **async di luar** transaksi di route Next — kegagalan SMTP tidak boleh membatalkan respons booking | `api/booking/create/route.ts` | `[06]F-014` | [ ] |
| 4.17 | Ganti link email hardcode `http://localhost:4000` dengan `NEXTAUTH_URL` | `src/lib/mail.ts` | `[03]#6` | [x] |
| 4.18 | ~~Satukan `mail.ts` & `mail.service.ts`~~ → **otomatis selesai** via 4.9; verifikasi `src/lib/mail.ts` memuat semua template yang dipakai | `src/lib/mail.ts` | `[03]` | [ ] |
| 4.21 | **Nonaktifkan `POST /api/payment/notify` sementara** — kembalikan `503` sampai verifikasi signature mendarat di task 2.3. D4 memilih gateway sungguhan, jadi route ini dipertahankan (tidak dihapus) tapi tidak boleh bisa dipanggil tanpa verifikasi: saat ini `POST {orderId}` saja menandai order LUNAS + memicu email "Uang Masuk" | `api/payment/notify/route.ts` | `D4` `[01]F-04` | [x] |
| 4.22 | **`installationProof` diabaikan route update-order** — admin lihat "Update Sukses", status jadi `ACTIVE`, tapi foto bukti pemasangan tidak tersimpan; `isLive` tidak pernah `true` | `api/admin/update-order/route.ts:15` | `[03]` | [x] |
| 4.23 | **Port 4001 dicabut dari `ChatWidget.tsx`** → `NEXT_PUBLIC_CHAT_URL` / `:3001`, plus simpan & kirim `guestToken` saat handshake dan `claimGuestSession`. Live chat tamu sebelumnya tidak pernah tersambung | `src/components/ChatWidget.tsx` | `[01]F-13` | [x] |
| 4.24 | **`withCredentials: true` pada socket admin** — tanpa ini cookie sesi tidak terkirim lintas origin, admin diperlakukan tamu, inbox CS kosong senyap | `admin/_components/cs/CS_InboxLayout.tsx:177` | `[01]F-13` | [x] |
| 4.25 | **Origin `:4000` ditambahkan ke CORS chat-server** — aplikasi jalan di port 4000 (`next dev -p 4000`), bukan 3000; daftar fallback lama memblokir semua koneksi dev | `chat-server/index.js` | `[01]F-13` | [x] |

## 4D. Temuan baru dari porting (belum dikerjakan)

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 4.26 | **Cek role tidak konsisten antar route billboard** — `detail` izinkan `ADMIN/SUPER_ADMIN/CS/OPERATOR`, `update` hanya `ADMIN/SUPER_ADMIN`, `create` & `rollback` hanya `role !== 'ADMIN'`. Akibat: `SUPER_ADMIN` bisa mengedit tapi tidak bisa membuat/rollback, dan tombol Simpan gagal 401 hanya di mode tambah | `api/admin/billboards/{create,update,detail,rollback}/route.ts` | `[03]` | [ ] |
| 4.27 | **Rollback tidak memulihkan seluruh field** — snapshot simpan `{...oldData}` lengkap tapi update hanya kembalikan 10 kolom; `specs`, `includes`, `excludes`, `gallery`, `smartsucoUrl`, `publishStatus` tertinggal → data campuran lama/baru | `api/admin/billboards/rollback/route.ts` | `[03]` | [ ] |
| 4.28 | **`create` tidak cek keunikan slug** padahal `update` cek — slug duplikat gagal di level DB dan muncul sebagai "Gagal menyimpan data" generik, bukan pesan bentrok yang jelas | `api/admin/billboards/create/route.ts` | `[03]` | [ ] |
| 4.29 | **Route `/api/proxy/*` dirujuk `.next/dev/types/validator.ts` tapi filenya tidak ada** — kemungkinan cache `.next` basi; pastikan tidak ada pemanggil `/api/proxy/*` lalu bersihkan `.next/` | `.next/` | `[03]` | [ ] |
| 4.30 | **Hapus `NEXT_PUBLIC_API_URL`** dari `.env:14` dan `.env.local:1` — sudah nol pemanggil di `src/`; membiarkannya menyesatkan, seolah masih ada backend kedua | `.env`, `.env.local` | `[03]` | [ ] |
| 4.31 | **`booking/create` tidak validasi `duration` maupun tumpang-tindih tanggal** — dua order bisa memesan billboard sama di rentang yang sama | `api/booking/create/route.ts` | `[03]` | [ ] |

---

# FASE 5 — DASHBOARD ADMIN *(urutan eksekusi: 6) · 5 agent · boleh bersamaan dengan Fase 6*

> Keluhanmu: *"kurang responsif dan banyak fitur yang belum ada dan belum sempurna"* — terkonfirmasi. Task 5.1–5.3 adalah fitur yang **ada tombolnya tapi mati**.
>
> Fase paling cocok untuk paralel: 33 task tersebar di komponen yang saling lepas.
>
> **[!] Diblokir D2** — task 5.3 butuh keputusanmu soal `ChatInterface.tsx` + `UserActions.tsx`. Task lain jalan terus.

| Agent | Task | File eksklusif |
|---|---|---|
| **J** | 5.1, 5.14, 5.17, 5.33 | `OrderActions.tsx`, `orders/[id]/page.tsx` |
| **K** | 5.2, 5.4, 5.9, 5.12 | `admin/(dashboard)/layout.tsx`, `page.tsx` |
| **L** | 5.5, 5.6, 5.10, 5.13, 5.16, 5.19 | `UserClientPage.tsx`, `billboards/page.tsx`, `TransactionClient.tsx` |
| **M** | 5.7, 5.11, 5.31, 5.32 | `CS_InboxLayout.tsx` |
| **N** | 5.18, 5.20–5.29 | Komponen bersama baru (`Pagination`, `DataTable`, `ExportButton`) |

## 5A. Fitur mati (CRITICAL)

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 5.1 | ⚠️ **Bangun modal transfer refund** — `setShowTransferModal(true)` dipanggil tapi **JSX modalnya sudah dihapus** (sisa komentar di `:214-215`). Tombol "Trf Sekarang" mati total → **admin tidak bisa memproses refund sama sekali**, uang pelanggan tertahan | `src/components/admin/OrderActions.tsx:174,214-215` | `[05]F-01` | [ ] |
| 5.2 | ⚠️ **Perbaiki urutan role gate** — `allowedRoles` hanya `['ADMIN','SUPER_ADMIN']` di `:89-93`, sehingga cabang `if (userRole === 'CS')` di `:96` **tidak pernah jalan**. Seluruh `CS_*` unreachable; `OPERATOR` kena "Akses Ditolak" | `admin/(dashboard)/layout.tsx:89-98` | `[05]F-02` | [ ] |
| 5.3 | [!] **KEPUTUSAN + wiring:** `ChatInterface.tsx` (223 baris) & `UserActions.tsx` (119 baris) punya **nol importer**. Fitur Join Chat / ambil alih bot / AI assist / hapus user semuanya terkubur; yang dirender `CS_InboxLayout` yang jauh lebih miskin. Pakai atau hapus | `src/components/admin/ChatInterface.tsx`, `UserActions.tsx` | `[05]F-49` | [ ] |

## 5B. Responsif

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 5.4 | ⚠️ **Tambah drawer mobile + hamburger** — sidebar `hidden md:flex` tanpa pengganti; **di bawah 768px admin tidak bisa navigasi ke halaman manapun**. `@headlessui/react` sudah terpasang | `layout.tsx:39`, header `:68` | `[05]F-05` | [ ] |
| 5.5 | Ganti `overflow-hidden` → `overflow-x-auto` pada tabel Users — sekarang **memotong** kolom Aksi di <768px, tombol edit tidak bisa diklik | `UserClientPage.tsx:36-37` | `[05]F-15` | [ ] |
| 5.6 | Bungkus tabel Inventory dengan `overflow-x-auto` — scroll horizontal bocor ke `<body>` | `billboards/page.tsx:52-53` | `[05]F-16` | [ ] |
| 5.7 | Perbaiki `h-screen` bersarang di live chat — kotak input balasan **terdorong keluar layar di semua breakpoint**; di mobile jadi 3 layar bertumpuk tanpa navigasi balik | `CS_InboxLayout.tsx:230,231,238` | `[05]F-17` | [ ] |
| 5.8 | `grid-cols-2` → `grid-cols-1 md:grid-cols-2` pada detail order — area upload tak terpakai di 375px | `orders/[id]/page.tsx:48` | `[05]F-18` | [ ] |
| 5.9 | Kartu KPI `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` — sekarang lompat 1→4, nilai rupiah terpotong di 768–1023px | `page.tsx:80` | `[05]F-19` | [ ] |
| 5.10 | Master-detail panel transaksi di `<lg` + buang tinggi tetap `calc(100vh-200px)` — scroll bersarang 3 lapis, klik transaksi tidak memindahkan tampilan | `TransactionClient.tsx:194` | `[05]F-20` | [ ] |

## 5C. Data palsu & feedback palsu

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 5.11 | ⚠️ Hapus/isi detail pengunjung chat hardcode (`Indonesia`/`127.0.0.1`/`Chrome`/`Windows`) — **CS bisa salah mengambil keputusan** | `CS_InboxLayout.tsx:156-159` | `[05]F-26` | [ ] |
| 5.12 | Ganti widget "Fast Action" dengan hitungan asli — kalimat *"Ada orderan yang butuh persetujuan manual"* selalu muncul tanpa query | `page.tsx:105` | `[05]F-27` | [ ] |
| 5.13 | Ambil identitas penjual dari `SystemSetting` — hardcode `"Iklan Jaya Group"`, `"Jl. Melati No. 10, Jakarta"` vs brand "Utero Cloud" | `TransactionClient.tsx:245-246` | `[05]F-28` | [ ] |
| 5.14 | Cek `res.ok` sebelum alert sukses — "Bukti Tayang Disimpan!" muncul walau server gagal | `orders/[id]/page.tsx:27-36` | `[05]F-12` | [ ] |
| 5.15 | Bedakan `error` vs `empty` di Inventory — **backend mati dibaca admin sebagai inventory kosong** | `billboards/page.tsx:23-34,65` | `[05]F-14` | [ ] |
| 5.16 | Peta warna badge per status — selalu hijau, `CANCELLED`/`REFUNDED` terbaca sukses | `TransactionClient.tsx:172`, `page.tsx:141` | `[05]F-30` | [ ] |
| 5.17 | ⚠️ Tampilkan bukti transfer di layar verifikasi pembayaran — admin menekan "Verifikasi pembayaran diterima?" **tanpa melihat bukti apa pun** | `OrderActions.tsx:72` | `[05]` | [ ] |

## 5D. Fitur belum ada

| # | Task | Ref | Status |
|---|---|---|---|
| 5.18 | Komponen paginasi bersama (nol pagination di seluruh admin) | `[05]F-24` | [ ] |
| 5.19 | Hubungkan search box yang mati — tanpa `value`/`onChange`, user mengetik dan tidak terjadi apa-apa | `[05]F-25` | [ ] |
| 5.20 | Filter & sort pada tabel admin | `[05]` | [ ] |
| 5.21 | Export CSV/Excel | `[05]` | [ ] |
| 5.22 | Date-range filter di dashboard/revenue | `[05]` | [ ] |
| 5.23 | Kalender ketersediaan / timeline booking untuk admin | `[05]` | [ ] |
| 5.24 | Audit log viewer | `[05]` | [ ] |
| 5.25 | Notification center + unread badge | `[05]` | [ ] |
| 5.26 | Bulk actions | `[05]` | [ ] |
| 5.27 | UI manajemen role (4 role di skema, nol diferensiasi di UI) | `[05]` | [ ] |
| 5.28 | Tombol test SMTP di Settings | `[05]` | [ ] |
| 5.29 | KPI yang hilang: occupancy rate, revenue MoM, antrian pending, kontrak akan berakhir | `[05]` | [ ] |

## 5E. UX & kualitas

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 5.30 | ⚠️ Modal rollback dengan **diff sebelum/sesudah** + ketik-untuk-konfirmasi — sekarang `confirm('Rollback data?')` lalu overwrite produksi tanpa preview & tanpa undo | `billboards/form/page.tsx:111-121` | `[05]F-11` | [ ] |
| 5.31 | Perbaiki reconnect storm socket.io — dependency `[selectedSession]` bikin connect/disconnect tiap klik; race condition, pesan hilang/ganda | `CS_InboxLayout.tsx:176-193` | `[05]F-06` | [ ] |
| 5.32 | Ganti socket URL hardcode `http://localhost:3001` dengan `NEXT_PUBLIC_SOCKET_URL` — **live chat mati total di produksi** | `CS_InboxLayout.tsx:177` | `[05]F-07` | [ ] |
| 5.33 | Satukan 2 alur upload bukti tayang (base64 vs URL → dua format di kolom DB yang sama) | `OrderActions.tsx:196-212` vs `orders/[id]/page.tsx:50-58` | `[05]F-13` | [ ] |

---

# FASE 6 — UI PUBLIK & ALUR BELI *(urutan eksekusi: 7) · 4 agent · boleh bersamaan dengan Fase 5*

> Task 6.1–6.2 memblokir bisnis: **pesanan masuk tanpa identitas penyewa.**
>
> Wilayah file terpisah bersih dari Fase 5 (`src/app/(public)/**` vs `src/app/admin/**`), jadi kedua fase boleh jalan serentak — total 9 agent.

| Agent | Task | File eksklusif |
|---|---|---|
| **O** | 6.1, 6.2, 6.23, 6.24 | `CheckoutForm.tsx` |
| **P** | 6.3–6.6, 6.20 | `BookingCard.tsx`, sistem toast baru |
| **Q** | 6.7–6.10 | `billboard/[slug]/page.tsx`, `ChatWidget.tsx`, `chat-server/index.js` |
| **R** | 6.11–6.19, 6.21, 6.22, 6.25–6.29 | `tailwind.config.ts`, `loading.tsx`/`error.tsx` per segmen, `Navbar.tsx`, halaman baru |

⚠️ Task 6.1 & 6.2 bergantung pada kolom `npwp` dari task 3.30 (Fase 3) — pastikan sudah mendarat.

## 6A. Alur beli rusak (CRITICAL)

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 6.1 | ⚠️ **Bind field Nama/WhatsApp/Email checkout** — tanpa `id`/`value`/`onChange`, tidak pernah masuk payload `:59-67`. **Data penyewa dibuang diam-diam** | `CheckoutForm.tsx:141-154` | `[04]F-01` `[06]F-021` | [ ] |
| 6.2 | ⚠️ **Bind field NPWP** — tidak pernah dikirim meski checkbox faktur aktif; tambah kolom NPWP di `Booking` | `CheckoutForm.tsx:163-168` | `[04]F-02` `[06]F-021` | [ ] |
| 6.3 | ⚠️ Ganti `confirm()` bertuliskan `[SIMULASI XENDIT]` dengan modal pembayaran sesungguhnya — **teks itu terlihat end user** | `BookingCard.tsx:116` | `[04]F-03` | [ ] |
| 6.4 | Modal konfirmasi pembatalan pesanan (aksi tak dapat dibatalkan, sekarang `confirm()` bawaan) | `BookingCard.tsx:102` | `[04]F-04` | [ ] |
| 6.5 | Cek `res.ok` di handler refund & cancel — alert sukses tampil meski request gagal | `BookingCard.tsx:101-112,135-171` | `[04]F-05` | [ ] |
| 6.6 | Proteksi double-submit di seluruh aksi `BookingCard` | `BookingCard.tsx:228,229,235,242` | `[04]F-09` | [ ] |

## 6B. Konfigurasi mematikan produksi

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 6.7 | ⚠️ Ganti hardcode `http://localhost:4001` di fetch detail billboard — halaman detail mati di produksi | `billboard/[slug]/page.tsx:14` | `[04]S-03` | [ ] |
| 6.8 | ⚠️ Ganti hardcode `localhost:4001` di ChatWidget (socket + REST) — komponen ini dirender di **semua** halaman publik | `ChatWidget.tsx:20,57` | `[04]S-04` | [ ] |
| 6.9 | ⚠️ **Chatbot AI publik mati total** — widget konek port **4001**, bot dengar di **3001**. Fitur unggulan tidak pernah merespons pengunjung (tak terlihat dari sisi admin karena inbox pakai port benar) | `ChatWidget.tsx:20` vs `chat-server/index.js:20` | `[06]F-043` | [ ] |
| 6.10 | Bot harus baca `chatSession.status` sebelum `getGeminiResponse` — setelah admin "Join Chat", **bot tetap membalas**, bot & manusia menjawab bersamaan di depan pelanggan | `chat-server/index.js:120` | `[06]F-044` | [ ] |
| 6.11 | Install `tailwindcss-animate` + daftarkan di config — **tidak terpasang** padahal `animate-in`/`fade-in`/`zoom-in` dipakai di 10 lokasi, semua mati | `tailwind.config.ts:21` | `[04]C-01` | [ ] |

## 6C. Responsif publik

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 6.12 | Search bar `w-[800px]` terpotong `overflow-hidden` induk — tombol cari tak dapat diklik di 768–831px → `w-full max-w-[800px]` | `SearchFilter.tsx:103` + `page.tsx:48,54,55` | `[04]R-01` | [ ] |
| 6.13 | Panel chat `w-[350px]` meluber 54px di 320px; `h-[500px]` menutupi 92% layar SE → `w-[calc(100vw-2rem)] sm:w-[350px]`, `h-[70dvh] sm:h-[500px]` | `ChatWidget.tsx:117` | `[04]R-02` | [ ] |
| 6.14 | Timeline 6 langkah butuh 576px tanpa scroll wrapper — label tumpang tindih di 320/375px | `dashboard/order/[id]/page.tsx:101-127` | `[04]R-03` | [ ] |
| 6.15 | Invoice `max-w-[21cm]` + `p-12` sisakan 224px isi di 320px; tabel tanpa scroll wrapper → `p-4 md:p-12` + `overflow-x-auto` | `invoice/[id]/page.tsx:36,72-95` | `[04]R-04` | [ ] |
| 6.16 | Audit sisa 59 temuan Medium responsif di `[04]` §3.3 | `[04]` | [ ] |

## 6D. State & error handling

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 6.17 | ⚠️ **Tambah `loading.tsx` + `error.tsx` per segmen route** — nol di seluruh 19 segmen aplikasi | `src/app/**` | `[04]S-01` `[03]#14` | [ ] |
| 6.18 | Tambah `not-found.tsx` di root | `src/app/` | `[04]S-01` | [ ] |
| 6.19 | Perbaiki 3 soft-404 yang mengembalikan HTTP 200 | `billboard/[slug]:58-65`, `invoice/[id]:27`, `order/[id]:23` | `[04]S-01` | [ ] |
| 6.20 | Ganti 17 `alert()` di kode publik dengan sistem toast + error inline | `BookingCard.tsx` ×12, `AccountSettingsForm.tsx:62,65,74,89,92`, `CheckoutForm.tsx:47,53,80,83,88`, `register/page.tsx:35`, `ImageUpload.tsx:34,47,49` | `[04]F-06` | [ ] |
| 6.21 | Ganti sisa `confirm()`/`prompt()` di admin (total 53 native dialog di 12 file) | `[05]` §6 | `[05]F-22` | [ ] |
| 6.22 | Ganti 2× `window.location.reload()` dengan `router.refresh()` | `billboards/form/page.tsx:120,153` | `[05]F-23` | [ ] |

## 6E. Form & navigasi

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 6.23 | `type="number"` → `type="tel"` + `inputMode="numeric"` untuk telepon/NPWP/rekening — **nol di depan terhapus (bug data)** | `register/page.tsx:72`, `CheckoutForm.tsx:148,166`, `BookingCard.tsx:392` | `[04]F-07` | [ ] |
| 6.24 | Ganti pembacaan DOM langsung dengan controlled state untuk tanggal mulai | `CheckoutForm.tsx:51,126-131` | `[04]F-08` | [ ] |
| 6.25 | Perbaiki 4 link 404 di Navbar | `Navbar.tsx:55,56,155,156` | `[04]` §4 | [ ] |
| 6.26 | Perbaiki 3 CTA mati | `[04]` §4 | `[04]` | [ ] |
| 6.27 | Halaman browse/list billboard sebagai alternatif peta-saja | `[06]` | [ ] |
| 6.28 | Halaman hasil pencarian | `[06]` | [ ] |
| 6.29 | Halaman konfirmasi pesanan | `[06]` | [ ] |

---

# FASE 7 — A11Y, SEO, KEPATUHAN *(urutan eksekusi: 8) · 3 agent*

| Agent | Task | Wilayah |
|---|---|---|
| **S** | 7.1–7.12 | Komponen form & modal (pakai `@headlessui/react` yang sudah terpasang) |
| **T** | 7.13–7.15 | `metadata`, `sitemap.ts`, `robots.ts`, JSON-LD |
| **U** | 7.16–7.18 | Alur lupa password, halaman kebijakan privasi & S&K |

## 7A. Aksesibilitas

> Kondisi sekarang: **1** `aria-*` di seluruh aplikasi publik, **0** `role=`, **0** focus trap, **2** `htmlFor` dari ~20 field, **0** `focus-visible`.

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 7.1 | ⚠️ Ganti `<div onClick>` pemilih durasi → `<button type="button" aria-pressed>` — **user keyboard/screen reader tidak bisa menyelesaikan pembelian** | `CheckoutForm.tsx:110-122` | `[04]A-01` | [ ] |
| 7.2 | ⚠️ Ganti `<div onClick>` pemilih materi desain | `CheckoutForm.tsx:179,184` | `[04]A-02` | [ ] |
| 7.3 | Ganti 4 modal `BookingCard` dengan `@headlessui/react` `<Dialog>` (sudah terpasang) — tanpa `role="dialog"`/`aria-modal`/focus trap/Escape/backdrop-close | `BookingCard.tsx:328,370,384,401` | `[04]A-03` | [ ] |
| 7.4 | Modal trafik: sama | `TrafficReportModal.tsx:21-58` | `[04]A-04` | [ ] |
| 7.5 | Modal admin: sama (4 modal) | `UserFormModal.tsx:104`, `UserActions.tsx:85`, `OrderActions.tsx:197,219` | `[05]F-21` | [ ] |
| 7.6 | Perbaiki `<button disabled>` bersarang di `<Link>` — HTML invalid; keyboard dapat **menembus guard tanggal** | `BillboardDetailClient.tsx:176-187` | `[04]A-05` | [ ] |
| 7.7 | `aria-label` + label `sr-only` pada launcher chat — tombol tanpa nama di perangkat sentuh | `ChatWidget.tsx:111-112` | `[04]A-06` | [ ] |
| 7.8 | Tombol hapus gambar selalu tampil di `md:` ke bawah — hover-only, tak terjangkau di sentuh | `ImageUpload.tsx:127` | `[04]A-07` | [ ] |
| 7.9 | Tambah `htmlFor`/`id` pada ~18 field form yang belum punya | seluruh form | `[04]` §3.2 | [ ] |
| 7.10 | Tambah style `focus-visible` global | `globals.css` | `[04]` §3.2 | [ ] |
| 7.11 | Tambah skip link | `layout.tsx` | `[04]` §3.2 | [ ] |
| 7.12 | Audit sisa temuan a11y Medium di `[04]` §3.3 | `[04]` | [ ] |

## 7B. SEO

| # | Task | Ref | Status |
|---|---|---|---|
| 7.13 | ⚠️ **Nol metadata SEO di seluruh aplikasi** (0 hasil grep `metadata`) — tambah `metadata` root + `generateMetadata` di `[slug]`. Klaim "SEO Friendly" di dokumentasi gagal total | `[06]F-018` | [ ] |
| 7.14 | Tambah `sitemap.ts` & `robots.ts` | `[06]F-018` | [ ] |
| 7.15 | Tambah Open Graph + JSON-LD structured data | `[06]F-018` | [ ] |

## 7C. Kepatuhan & akun

| # | Task | Ref | Status |
|---|---|---|---|
| 7.16 | ⚠️ **Bangun alur lupa password** — tidak ada sama sekali; `otpCode` menganggur. **User registrasi manual tidak bisa memulihkan akun selamanya** | `[06]F-019` | [ ] |
| 7.17 | ⚠️ Terbitkan halaman **Kebijakan Privasi & S&K** — mengumpulkan KTP + NPWP tanpa keduanya = risiko UU PDP | `[06]F-020` | [ ] |
| 7.18 | Tegakkan `isVerified` (email verification) — kolom ada, tidak pernah di-gate | `[01]F-30` | [ ] |

---

# FASE 8 — HIGIENE & INFRA *(urutan eksekusi: 9) · 2 agent*

> Sengaja terakhir: task 8.1 (matikan `ignoreBuildErrors`) memunculkan 160 error tsc. Menjalankannya lebih awal berarti memperbaiki error di file yang akan dihapus Fase 4 atau ditulis ulang Fase 2–3. Setelah delapan fase, hitungannya sudah jauh lebih kecil.

| Agent | Task | Wilayah |
|---|---|---|
| **V** | 8.1–8.4 | `next.config.ts`, `package.json`, perbaikan tsc |
| **W** | 8.5–8.12 | `docker-compose.yml`, `.env`, pembersihan file, `chat-server/index.js` |

| # | Task | File | Ref | Status |
|---|---|---|---|---|
| 8.1 | ⚠️ **Matikan `ignoreBuildErrors` & `ignoreDuringBuilds`** — menyembunyikan **160 error tsc** + **239 masalah lint** | `next.config.ts:29-34` | `[03]#13` `[01]F-24` | [ ] |
| 8.2 | Perbaiki 160 error TypeScript (bertahap, setelah 8.1) | — | `[03]#13` | [ ] |
| 8.3 | Perbaiki script lint — `next lint` sudah dihapus di Next 16, `npm run lint` rusak | `package.json` | `[03]#13` | [ ] |
| 8.4 | Tambah security headers: CSP, HSTS, X-Frame-Options via `headers()` | `next.config.ts:27-33` | `[01]F-24` | [ ] |
| 8.5 | Ganti kredensial default & jangan publish port di `docker-compose.yml` | `docker-compose.yml:6-8` | `[01]F-31` | [ ] |
| 8.6 | Hapus baris password Supabase yang dikomentari di `.env:10-12,20` | `.env` | `[01]F-32` | [ ] |
| 8.7 | Perbaiki nama file rusak `prisma.config-ts` (titik hilang → tidak pernah terbaca) | `prisma.config-ts` | `[03]#9` | [ ] |
| 8.8 | Hapus `@clerk/nextjs` bila tidak dipakai (terpasang berdampingan dengan `next-auth`) | `package.json` | `[03]#7` | [ ] |
| 8.9 | Audit dependency tak terpakai lain | `package.json` | `[03]#7` | [ ] |
| 8.10 | Tentukan nasib `src/lib/dummy-data.ts` (tidak di-import admin; data palsu berasal dari hardcode inline) | — | `[05]` | [ ] |
| 8.11 | Tentukan nasib `manager.js`, `.continue/` | — | `[03]#9` | [ ] |
| 8.12 | Mitigasi prompt injection Gemini — delimiter + sanitasi input user | `chat-server/index.js:65` | `[01]F-29` | [ ] |

---

# Lampiran A — Temuan yang dikonfirmasi ≥3 agent independen

Temuan ini ditemukan terpisah oleh beberapa agent tanpa saling tahu. Prioritas tertinggi, risiko false-positive nol.

| Temuan | Ditemukan oleh | Task |
|---|---|---|
| Harga dipercaya dari client | `[01]F-13` `[02]DB-03` `[06]F-001` `[03]#4` | 2.2 |
| `admin/users/*` tanpa auth | `[01]F-01,F-06` `[02]DB-00` `[03]#1,#2,#3` | 1.1–1.3 |
| Proxy SSRF + bypass auth | `[01]F-02,F-03` `[06]F-050,F-051` `[03]#9,#10` | 1.10–1.11 |
| NestJS tanpa `APP_GUARD` | `[01]F-08` `[06]F-002,F-004` `[03]#6` | 4.2 |
| Double-booking tak dicegah | `[02]DB-02` `[06]F-006` | 2.4 |
| API key bocor via GET | `[01]F-05` `[02]DB-01` `[06]F-052` | 1.4 |
| Hash password ke browser | `[01]F-16` `[02]DB-06,DB-07` | 1.18 |
| IDOR `order/[id]` | `[01]F-23` `[06]F-009` `[04]#12` | 1.14 |

# Lampiran B — Kerugian uang terkuantifikasi

| Bug | Dampak | Butuh penyerang? | Task |
|---|---|---|---|
| Refund bruto `× 0.9` | **−Rp 10.005.000 per refund** | **Tidak** | 2.1 |
| Harga dari client | Billboard berapa pun → Rp 1 | Ya | 2.2 |
| Webhook tanpa signature | Order manapun → LUNAS gratis | Ya | 2.3 |
| Rekening refund bisa ditimpa | Dana dialihkan ke penyerang | Ya | 1.5 |
| DP ditagih 100% | Salah tagih pelanggan | Tidak | 2.6 |
| Omzet hitung `REFUNDED` | Keputusan bisnis dari angka salah | Tidak | 2.16 |

# Lampiran C — Yang sudah benar (jangan diutak-atik)

- `.env` **tidak pernah** ter-commit — diverifikasi `git log --all` `[02]DB-23`
- `prisma/dev.db` tidak ter-track, sudah di-gitignore `[02]DB-23`
- Nol XSS sink, nol secret di `NEXT_PUBLIC_`, `remotePatterns` ketat `[01]`
- `src/app/api/user/change-password/route.ts` — implementasi benar, pakai sebagai contoh `[01]`
- `src/app/invoice/[id]/page.tsx:30` — cek kepemilikan benar, **tiru pola ini** untuk task 1.14 `[04]`
- `POST /api/admin/settings:16-20` — gate `SUPER_ADMIN` benar, tiru untuk GET (task 1.4) `[06]`
- `src/app/api/admin/billboards/update/route.ts:8-12` — pola auth benar, tiru untuk task 1.6 `[06]`
- Rollback `BillboardHistory` **benar-benar berfungsi** `billboards/form/page.tsx:271-293` `[05]`
- Migrasi bersih: nol drift, nol SQLite-ism `[02]DB-22`

# Lampiran D — Keputusan

## Sudah diputuskan (21 Sep 2026)

| # | Keputusan | Jawaban | Dampak |
|---|---|---|---|
| D1 | Backend tunggal | **Next.js**, `backend/` dihapus | Fase 4 naik ke urutan 3; 6 task NestJS-hardening gugur, diganti 4.3a–4.3e di route Next |
| D3 | Data sekarang | **Boleh hilang** | Fase 3 jadi `migrate reset` sekali jalan; 4–5 hari → ~1,5 hari |
| D5 | Pernah online | **Belum pernah** | Task 0.5–0.9 & 4.11 gugur; Fase 0 jadi 20 menit |
| — | Ritme review | **Per fase** | Tiap fase berakhir dengan laporan + diff, tunggu approval |
| D4 *(22 Sep)* | Pembayaran | **Payment gateway sungguhan** | Webhook `payment/notify` dipertahankan tapi wajib verifikasi signature, cek nominal, idempotency. Task 2.3 & 6.3 tetap hidup; task 4.21 ditambahkan (nonaktifkan webhook sementara) |
| — *(22 Sep)* | `next-auth` di `chat-server/package.json` | **Boleh ditambahkan** | Sudah didaftarkan `^4.24.13`, sama dengan root |

## Masih menunggu

| # | Keputusan | Memblokir | Kapan dibutuhkan |
|---|---|---|---|
| **D2** | `ChatInterface.tsx` (223 baris), `UserActions.tsx` (119 baris), **+ `ChatRoom.tsx`** — semuanya nol importer. Pakai atau hapus? | task 5.3, **4.14** | sebelum Fase 5 (urutan 6) |
| **D4a** | Gateway mana — Midtrans / Xendit / lainnya? Perlu kredensial merchant | task 2.3 (bentuk akhir) | sebelum Fase 2 (urutan 5) |

**Perluasan D2 (22 Sep 2026):** `ChatRoom.tsx` juga nol importer — `CS_InboxLayout.tsx:60` mendefinisikan komponen `ChatRoom`-nya **sendiri** secara lokal, bukan mengimpor file itu. Akibatnya **seluruh** pemanggil `/api/chat/history` berada di komponen mati (`ChatInterface.tsx:44`, `ChatRoom.tsx:21,43`). Maka **task 4.14 menjadi bergantung pada D2**: bila ketiga komponen dihapus, route itu tidak perlu dibuat sama sekali.
