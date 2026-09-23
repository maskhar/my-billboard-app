# Audit 02 — Database, Prisma & Row Level Security

**Proyek:** `my-billboard-app` (Next.js + NestJS backend + Prisma 5 + PostgreSQL/Supabase)
**Tanggal audit:** 2026-09-21
**Cakupan:** `prisma/schema.prisma`, `prisma/migrations/**`, `prisma/seed.ts`, `prisma/set-admin.ts`, `src/**`, `backend/src/**`, `chat-server/**`, konfigurasi `.env` (nama variabel saja — semua nilai rahasia DIREDAKSI).

---

## 1. Executive Summary

Database secara struktural **berjalan** (migrasi bersih, tidak ada drift, tidak ada SQLite-ism yang bocor ke migrasi Postgres), tetapi **lapisan integritas dan otorisasi data hampir seluruhnya absen**. Temuan paling berat bukan pada RLS, melainkan pada asumsi yang keliru tentang RLS itu sendiri.

Enam hal yang paling mendesak:

0. **Pengambilalihan akun tanpa autentikasi.** `src/app/api/admin/users/update-account/route.ts:6-24` dan `update-business/route.ts:5-18` **tidak memiliki pengecekan sesi sama sekali**, menyebar `...data` mentah dari request body langsung ke `prisma.user.update()`, lalu **mengembalikan baris User utuh termasuk hash `password`**. Siapa pun di internet dapat menetapkan `password` atau `role: "SUPER_ADMIN"` pada akun mana pun. Ini temuan terberat dalam audit ini dan harus diperbaiki sebelum yang lain.

1. **`GET /api/admin/settings` tidak punya pengecekan autentikasi sama sekali** (`src/app/api/admin/settings/route.ts:7-13`). Endpoint ini mengembalikan baris `SystemSetting` utuh — termasuk `geminiApiKey` dan `googleMapsApiKey` dalam **plaintext** — kepada siapa pun yang memanggilnya tanpa login. Ini kebocoran kredensial pihak ketiga yang bisa dieksploitasi hari ini, tanpa perlu menyentuh database.

2. **Double-booking tidak dicegah di level manapun.** Tidak ada constraint database, tidak ada pengecekan tumpang-tindih tanggal di aplikasi, dan tidak ada transaksi. `src/app/api/booking/create/route.ts:26-47` dan `backend/src/bookings/bookings.service.ts:32-57` hanya memeriksa `billboard.status !== 'Available'` — sebuah flag global yang tidak pernah diubah saat booking dibuat. Dua user bisa menyewa billboard yang sama pada rentang tanggal yang sama.

3. **Harga dikirim oleh klien dan dipercaya mentah-mentah.** `totalPrice` dan `dpAmount` diambil dari request body dan langsung disimpan tanpa dihitung ulang dari `billboard.price` (`src/app/api/booking/create/route.ts:20-47`). Penyerang dapat memesan billboard Rp 30.000.000 seharga Rp 1. Ini bug bisnis dengan dampak finansial langsung.

4. **RLS tidak berperan sama sekali, dan itu bukan masalah selama kunci `anon` tidak pernah dipakai — tetapi tabel-tabel tetap telanjang.** Prisma terhubung sebagai role `postgres` (superuser) yang **mem-bypass RLS secara definisi**. Tidak ada satu pun policy RLS di repo. Jika PostgREST Supabase aktif pada schema `public` (default pada proyek Supabase), kunci `anon` dapat membaca tabel `User` — **termasuk kolom `password` berisi hash bcrypt** — dan `SystemSetting`. Lihat Bagian 4 untuk penilaian dan skrip perbaikan.

5. **IDOR pada pembatalan & refund.** `backend/src/bookings/bookings.service.ts:118-150` dan `:152-222` melakukan `update` berdasarkan `orderId` saja, tanpa memverifikasi kepemilikan `userId`. User A dapat membatalkan atau menarik refund atas pesanan user B.

Di luar itu: uang disimpan sebagai `Float` (galat pembulatan pada akumulasi pendapatan), seluruh kolom status/role berupa `String` bebas (terbukti menghasilkan nilai mati `REFUND_REQUESTED` yang tak pernah ditulis), tidak ada satu pun indeks non-unique padahal foreign key dan kolom status dipakai berat di `where`/`orderBy`, hash password dikirim ke komponen klien, dan daftar admin tidak berpaginasi.

**Kabar baik:** `prisma/dev.db` **tidak** ter-track git (`.gitignore:44`), dan `.env` juga tidak pernah ter-commit sepanjang riwayat repo — dua risiko CRITICAL yang dihipotesiskan di awal audit terbukti **tidak terjadi**.

---

## 2. Tabel Temuan

| ID | Severity | Area | Judul | File:line | Dampak | Perbaikan |
|----|----------|------|-------|-----------|--------|-----------|
| DB-00 | **CRITICAL** | AuthZ | Account takeover tanpa auth: mass-assignment + hash password dikembalikan | `src/app/api/admin/users/update-account/route.ts:6-24`, `update-business/route.ts:5-18` | Siapa pun mengubah `password`/`role` user mana pun tanpa login, lalu menerima hash-nya | Tambah cek sesi+role, allowlist field, `select` tanpa `password` |
| DB-01 | **CRITICAL** | RLS/AuthZ | `GET /api/admin/settings` tanpa auth, membocorkan API key plaintext | `src/app/api/admin/settings/route.ts:7-13` | Siapa pun tanpa login membaca `geminiApiKey` & `googleMapsApiKey`. Penyalahgunaan kuota & tagihan Google | Tambah `getServerSession` + cek role; jangan pernah kembalikan kolom kunci ke klien |
| DB-01b | **HIGH** | AuthZ | Endpoint admin `@Public()` tanpa guard, tanpa paginasi | `backend/src/billboards/billboards.controller.ts:34-44` | `GET /billboards/admin` membuka listing admin (termasuk DRAFT) ke anonim | Pasang guard role; tambah paginasi |
| DB-01c | **HIGH** | Integrity | Socket chat menerima `sender` dari klien tanpa validasi | `chat-server/index.js:108-112` | Klien mana pun memalsukan `sender: 'ADMIN'`/`'SYSTEM'`; UI merendernya dengan badge "Admin Support" | Tentukan `sender` di server dari identitas koneksi |
| DB-02 | **CRITICAL** | Integrity | Double-booking: tidak ada cek tumpang-tindih tanggal | `src/app/api/booking/create/route.ts:26-47`, `backend/src/bookings/bookings.service.ts:32-57` | Dua penyewa pada slot & tanggal sama. Sengketa komersial, refund paksa | `EXCLUDE USING gist` + transaksi (Bagian 7) |
| DB-03 | **CRITICAL** | Integrity | Harga dipercaya dari body request (price tampering) | `src/app/api/booking/create/route.ts:20-47`, `backend/src/bookings/bookings.service.ts:22-57` | Pesanan dengan `totalPrice` arbitrer, kerugian langsung | Hitung ulang server-side dari `billboard.price × duration` |
| DB-04 | **CRITICAL** | RLS | Tidak ada RLS sama sekali; tabel `public` berpotensi terekspos PostgREST | seluruh repo (0 hasil `CREATE POLICY`) | Kunci `anon` berpotensi membaca hash password `User` & `SystemSetting` | Jalankan skrip Bagian 6 |
| DB-05 | **HIGH** | AuthZ | IDOR pada cancel & refund — tanpa cek kepemilikan | `backend/src/bookings/bookings.service.ts:118-150`, `:152-222` | User membatalkan/refund pesanan milik user lain | Sertakan `userId` pada klausa `where` |
| DB-06 | **HIGH** | Perf/Leak | Hash password & OTP dikirim ke Client Component | `src/app/admin/(dashboard)/users/page.tsx:7-18` | `password`, `otpCode` ter-serialize ke HTML payload browser | Pakai `select` eksplisit tanpa kolom rahasia |
| DB-07 | **HIGH** | Perf/Leak | `include: { user: true }` membawa hash password | `src/app/admin/(dashboard)/orders/page.tsx:42-46`, `backend/src/bookings/bookings.service.ts:125`, `:163`, `:197` | Over-fetch kredensial ke UI & email handler | Ganti dengan `select` bersarang |
| DB-08 | **HIGH** | Schema | Uang memakai `Float` (DOUBLE PRECISION) | `schema.prisma:70,112,113,131,154,200`; migrasi `:33,61,62,76,91,139` | Galat pembulatan biner pada `_sum`, `reduce`, refund 0.9× | `Decimal @db.Decimal(14,2)` |
| DB-09 | **HIGH** | Schema | Harga tidak di-snapshot; `Booking` bergantung harga `Billboard` berjalan | `schema.prisma:103-146` | Perubahan harga billboard mendistorsi laporan historis | Simpan `unitPrice` pada `Booking` saat pembuatan |
| DB-10 | **HIGH** | Perf | Nol indeks non-unique; semua FK & kolom status tak terindeks | `schema.prisma` (tidak ada `@@index`), migrasi `:148-158` | Seq scan pada tiap query booking/billboard; memburuk linear | Tambah `@@index` (Bagian 5) |
| DB-11 | **HIGH** | Integrity | `JSON.parse` tanpa `try/catch` pada halaman publik | `src/app/billboard/[slug]/BillboardDetailClient.tsx:37-40` | Satu baris `gallery`/`specs` rusak → halaman detail crash (DoS data) | Kolom `Json` + parser defensif |
| DB-12 | **MEDIUM** | Schema | Kolom status/role berupa `String` bebas, tanpa domain | `schema.prisma:32,45,73,74,114,118,175,186` | Nilai mati `REFUND_REQUESTED` tak pernah ditulis; filter UI diam-diam kosong | Konversi ke `enum` (Bagian 5) |
| DB-13 | **MEDIUM** | Perf | `findMany` tanpa paginasi pada daftar admin | `src/app/admin/(dashboard)/users/page.tsx:7`, `orders/page.tsx:37` | Memori & waktu render tumbuh tanpa batas | `take`/`skip` + cursor |
| DB-14 | **MEDIUM** | Integrity | `onDelete` default `RESTRICT` pada `Booking`; penghapusan user menghapus riwayat finansial | migrasi `:167,170`; `src/app/api/admin/users/delete/route.ts:31` | `deleteMany` membuang bukti transaksi selesai | Soft delete; `onDelete: Restrict` eksplisit |
| DB-15 | **MEDIUM** | Schema | `User` tanpa `updatedAt`; `BillboardHistory`/`AdditionalCharge` tanpa jejak update | `schema.prisma:25-58,149-156,192-209` | Tidak ada audit trail perubahan akun | Tambah `@updatedAt` |
| DB-16 | **MEDIUM** | RLS | API key disimpan plaintext di `SystemSetting` | `schema.prisma:164-165`; migrasi `:102-103` | Siapa pun dengan akses baca DB memperoleh kunci aktif | `pgcrypto`/Supabase Vault, atau pindah ke env var |
| DB-17 | **MEDIUM** | Perf | Singleton Prisma tanpa tuning pooling serverless | `src/lib/prisma.ts:1-9` | Kehabisan koneksi di serverless; `pgbouncer` tak dikonfigurasi konsisten | Tambah `?pgbouncer=true&connection_limit=1` |
| DB-18 | **MEDIUM** | Schema | Skema & migrasi terduplikasi di `backend/prisma/` | `backend/prisma/schema.prisma` (identik, timestamp migrasi beda) | Dua sumber kebenaran; drift senyap di masa depan | Satu skema, referensi bersama |
| DB-19 | **LOW** | Seed | Password seed lemah & seragam (`123456`) untuk 5 akun termasuk SUPER_ADMIN | `prisma/seed.ts:18-56` | Jika ter-seed di produksi → takeover admin instan | Password acak; guard `NODE_ENV` |
| DB-20 | **LOW** | Seed | `seed.ts` menghapus seluruh data tanpa konfirmasi | `prisma/seed.ts:11-15` | `deleteMany` pada DB produksi jika salah `DATABASE_URL` | Guard lingkungan eksplisit |
| DB-21 | **LOW** | Seed | Role `"CS"` dipakai seed tetapi tak ada di komentar skema | `prisma/seed.ts:47` vs `schema.prisma:32` | Bukti domain tak terkendali | Masukkan ke enum |
| DB-22 | **INFO** | Migration | Tidak ada drift; tidak ada SQLite-ism | migrasi `:1-183` | — | Pertahankan |
| DB-23 | **INFO** | Hygiene | `prisma/dev.db` **tidak** ter-track; `.env` tak pernah ter-commit | `.gitignore:39,44` | Risiko yang dihipotesiskan tidak terjadi | Pertahankan |
| DB-24 | **HIGH** | Integrity | `PAID_CONFIRMED` dibaca 10×, ditulis 0× — transisi hilang | `src/app/admin/(dashboard)/page.tsx:33`, `actions.ts:45`, `OrderActions.tsx:111` | Query pendapatan menghitung status yang tak pernah terjadi | Tulis status ini di webhook pembayaran, atau hapus |
| DB-25 | **HIGH** | Integrity | Tab refund admin memfilter `REFUND_REQUESTED` yang tak pernah ditulis | `src/app/admin/(dashboard)/orders/page.tsx:34` vs `request-refund/route.ts:15` | Pengajuan refund (`REVIEW_REFUND`) tidak muncul di tab-nya | Perbaiki filter; tegakkan lewat enum |
| DB-26 | **MEDIUM** | Integrity | `excludes` tak pernah ikut di-update pada jalur backend | `backend/src/billboards/billboards.service.ts:108-138` | Data exclusions basi secara permanen via API backend | Sertakan `excludes` di payload update |
| DB-27 | **MEDIUM** | Integrity | Role `CS` terkunci dari UI CS yang dibangun untuknya | `src/app/admin/(dashboard)/layout.tsx:89-96` | `allowedRoles` hanya ADMIN/SUPER_ADMIN; cabang `CS` tak terjangkau | Masukkan `CS` ke allowlist |
| DB-28 | **MEDIUM** | Integrity | `sender: 'AGENT'` dirender sebagai pesan pelanggan | `src/app/admin/_components/cs/CS_InboxLayout.tsx:212,223` vs `ChatWidget.tsx:144-148` | Balasan CS tampil rata-kiri tanpa label | Satukan ke `ADMIN` via enum `ChatSender` |
| DB-29 | **MEDIUM** | Perf | `chat-server` full-scan `Billboard` tiap pesan masuk | `chat-server/index.js:33-36` | Scan + prompt LLM tumbuh tanpa batas | Indeks `publishStatus` + cache + `take` |
| DB-30 | **MEDIUM** | Integrity | `totalSpent` menghitung pesanan `REFUNDED` sebagai belanja | `src/app/dashboard/DashboardWrapper.tsx:39` | Angka belanja pelanggan terlalu besar | Keluarkan `REFUNDED` dari agregasi |
| DB-31 | **LOW** | Integrity | `Billboard.status` TitleCase, satu-satunya di repo | `schema.prisma:73` | `!== 'Available'` gagal senyap bila casing beda | Enum `BillboardStatus` |
| DB-32 | **LOW** | Integrity | `designOption` lowercase & berfungsi sebagai boolean | `schema.prisma:116`, `payment/notify/route.ts:24` | Typo casing membelokkan alur fulfillment tanpa error | Enum `DesignOption` |

---

## 3. Temuan CRITICAL & HIGH — Rincian

### DB-00 — Account takeover tanpa autentikasi (CRITICAL — perbaiki pertama)

Dua endpoint, pola identik, keduanya tanpa `getServerSession`:

```ts
// src/app/api/admin/users/update-account/route.ts:6-24
export async function POST(req: Request) {
  try {
    const { userId, password, ...data } = await req.json();   // tanpa cek sesi
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      data.password = hashedPassword;                          // klien menentukan password
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data,                                                    // mass-assignment: role, isVerified, email
    });
    return NextResponse.json(user);                            // mengembalikan hash password
  } catch (error) { ... }
}
```

Tiga cacat bertumpuk dalam 18 baris:

1. **Tanpa autentikasi.** Bandingkan `src/app/api/admin/users/update-role/route.ts:8-13` yang memeriksa role dengan benar — kedua endpoint ini tidak.
2. **Mass-assignment.** `...data` masuk utuh ke `data:`, sehingga penyerang dapat menulis kolom apa pun: `role`, `isVerified`, `email`, `otpCode`.
3. **Hash dikembalikan.** Respons memuat kolom `password`.

Eksploitasi satu langkah — promosi diri menjadi super admin:

```bash
curl -X POST https://<host>/api/admin/users/update-account \
  -H 'Content-Type: application/json' \
  -d '{"userId":"<id korban>","password":"punyasaya","role":"SUPER_ADMIN"}'
```

`userId` mudah diperoleh karena DB-06 sudah membocorkan daftar user ke payload halaman admin. Perbaikan:

```ts
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !['ADMIN','SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { userId, password, name, whatsapp, companyName } = await req.json();  // allowlist
  const data: Prisma.UserUpdateInput = { name, whatsapp, companyName };
  if (password) data.password = await bcrypt.hash(password, 10);

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, email: true, role: true },   // tanpa password
  });
  return NextResponse.json(user);
}
```

Perlakukan **seluruh password pengguna sebagai sudah terkompromi** dan wajibkan reset setelah perbaikan diterapkan.

### DB-01 — `GET /api/admin/settings` tanpa autentikasi (CRITICAL)

Handler `POST` memeriksa sesi dengan benar; handler `GET` **tidak memeriksa apa pun**.

```ts
// src/app/api/admin/settings/route.ts:7-13
export async function GET(req: Request) {
  let setting = await prisma.systemSetting.findUnique({ where: { id: "default_config" } });
  if (!setting) {
      setting = await prisma.systemSetting.create({ data: { id: "default_config" } });
  }
  return NextResponse.json(setting);   // <-- geminiApiKey + googleMapsApiKey plaintext
}
```

Bandingkan dengan `POST` pada baris 16-20 yang menuntut `SUPER_ADMIN`. Objek `setting` dikembalikan utuh, sehingga kedua kolom kunci ikut terserialisasi.

Eksploitasi: `curl https://<host>/api/admin/settings` — tanpa cookie, tanpa token.

Perbaikan minimum:

```ts
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const setting = await prisma.systemSetting.findUnique({
    where: { id: "default_config" },
    select: { id: true, siteName: true, siteDesc: true, updatedAt: true,
              // kembalikan status saja, bukan nilai kunci:
              geminiApiKey: false, googleMapsApiKey: false },
  });
  return NextResponse.json({ ...setting, hasGeminiKey: Boolean(setting?.geminiApiKey) });
}
```

Catatan tambahan: `src/app/api/admin/chat/suggest/route.ts:34` menyisipkan kunci ke URL query string, sehingga kunci berpotensi tercatat di log proxy/akses.

### DB-02 — Double-booking (CRITICAL)

Tidak ada constraint, tidak ada pengecekan overlap, tidak ada transaksi. Satu-satunya "penjagaan" adalah flag boolean global:

```ts
// src/app/api/booking/create/route.ts:26-47
const targetBillboard = await prisma.billboard.findUnique({ where: { id: billboardId } });
if (!targetBillboard || targetBillboard.status !== 'Available') {
     return NextResponse.json({ message: "Billboard tidak tersedia." }, { status: 400 });
}
const startDate = new Date(startDateString);
const endDate = new Date(startDate);
endDate.setMonth(endDate.getMonth() + duration);
const newBooking = await prisma.booking.create({ data: { ... } });   // tanpa cek overlap
```

Tiga cacat bertumpuk:

1. **`status` tidak pernah diubah menjadi `'Booked'`** saat booking dibuat — pencarian kode atas penulisan `status: 'Booked'` hanya menemukan data dummy (`src/lib/dummy-data.ts:65`). Jadi gerbang pada baris 30 selalu terbuka.
2. **Model `status` tunggal memang salah secara konseptual** — billboard disewa *per rentang waktu*, sehingga ketersediaan adalah fungsi dari `(billboardId, startDate, endDate)`, bukan satu flag.
3. **Race condition** — bahkan bila cek overlap ditambahkan di aplikasi, pola read-then-write tanpa transaksi tetap bocor: dua request paralel sama-sama membaca "kosong", lalu sama-sama menulis.

Rentang tanggal memang sudah tersedia untuk ditampilkan (`backend/src/billboards/billboards.service.ts:170-176` meng-include booking aktif), tetapi data itu hanya dipakai untuk render kalender — tidak pernah untuk menolak penulisan.

Desain perbaikan lengkap ada di **Bagian 7**.

### DB-03 — Price tampering (CRITICAL)

```ts
// src/app/api/booking/create/route.ts:20-23, 39-47
const { billboardId, duration, totalPrice, dpAmount, paymentType, designOption, startDateString } = body;
...
const newBooking = await prisma.booking.create({
    data: { userId: session.user.id, billboardId, startDate, endDate, duration, totalPrice,
            dpAmount: paymentType === 'dp' ? dpAmount : 0, status: "PENDING_PAYMENT", designOption }
});
```

`totalPrice` dan `dpAmount` berasal langsung dari `req.json()`. `targetBillboard.price` sudah diambil pada baris 26 tetapi **tidak pernah dipakai untuk menghitung atau memvalidasi**. Jalur NestJS identik (`backend/src/bookings/bookings.service.ts:22-57`), dan `CreateBookingDto` menerima `totalPrice` sebagai input tepercaya.

Perbaikan: hitung di server dan abaikan angka dari klien.

```ts
const unitPrice = targetBillboard.price;                 // Decimal setelah DB-08
const totalPrice = unitPrice.mul(duration);
const dpAmount   = paymentType === 'dp' ? totalPrice.mul(0.3) : new Prisma.Decimal(0);
```

### DB-05 — IDOR pada cancel & refund (HIGH)

```ts
// backend/src/bookings/bookings.service.ts:122-126
const order = await this.prisma.booking.update({
  where: { id: orderId },                  // <-- hanya id, tanpa userId
  data: { status: 'CANCELLED' },
  include: { billboard: true, user: true },
});
```

Pola sama pada `requestRefund` (baris 157-164 dan 189-198), di mana penyerang juga dapat menyuntikkan `bankName`/`bankAccount` miliknya ke pesanan korban — mengarahkan dana refund. `bookings.controller.ts` tidak menambahkan filter kepemilikan.

Perbaikan:

```ts
const result = await this.prisma.booking.updateMany({
  where: { id: orderId, userId: user.id, status: 'PENDING_PAYMENT' },
  data: { status: 'CANCELLED' },
});
if (result.count === 0) throw new ForbiddenException('Pesanan tidak ditemukan.');
```

### DB-06 / DB-07 — Hash password bocor ke klien (HIGH)

```ts
// src/app/admin/(dashboard)/users/page.tsx:7-18
const users = await prisma.user.findMany({
    include: { bookings: true },        // tanpa select -> seluruh kolom User
    orderBy: { createdAt: 'desc' }
});
const serializableUsers = users.map(user => ({ ...user, ... }));
return <UserClientPage users={serializableUsers} />;   // Client Component
```

Karena `UserClientPage` adalah Client Component, seluruh array ini diserialisasi ke payload RSC yang **terkirim ke browser** — memuat `password` (hash bcrypt), `otpCode`, `otpExpires`, `ktp`, dan `npwp`. Hash bcrypt yang terekspos membuka serangan cracking offline; `ktp`/`npwp` adalah data pribadi.

Pola identik pada `src/app/admin/(dashboard)/orders/page.tsx:42-46` melalui `include: { user: true }`, dan pada tiga lokasi NestJS (`bookings.service.ts:125`, `:163`, `:197`).

Perbaikan — `select` eksplisit di mana-mana:

```ts
const users = await prisma.user.findMany({
  select: { id: true, name: true, email: true, role: true, isVerified: true,
            companyName: true, whatsapp: true, createdAt: true,
            _count: { select: { bookings: true } } },
  orderBy: { createdAt: 'desc' },
  take: 50, skip: (page - 1) * 50,
});
```

### DB-08 — Uang sebagai `Float` (HIGH)

Kolom terdampak — `schema.prisma`: `Billboard.price:70`, `Booking.totalPrice:112`, `Booking.dpAmount:113`, `Booking.refundAmount:131`, `AdditionalCharge.amount:154`, `BillboardHistory.price:200`. Semuanya menjadi `DOUBLE PRECISION` (migrasi baris 33, 61, 62, 76, 91, 139).

Lokasi aritmetika yang memperbesar galat:

| Lokasi | Operasi |
|---|---|
| `src/app/admin/(dashboard)/page.tsx:32,48` | `_sum: { totalPrice: true }` — agregasi seluruh pendapatan |
| `src/app/admin/(dashboard)/actions.ts:76,99` | `currentTotal + record.totalPrice` akumulatif per bulan/hari |
| `src/app/admin/(dashboard)/users/UserClientPage.tsx:52` | `reduce((acc, curr) => acc + curr.totalPrice, 0)` |
| `src/app/admin/(dashboard)/orders/TransactionClient.tsx:191` | `totalPrice + reduce(charges)` |
| `src/app/api/booking/request-refund/route.ts:45` | `(orderData?.totalPrice \|\| 0) * 0.90` |
| `backend/src/bookings/bookings.service.ts:187` | `(orderData?.totalPrice \|\| 0) * 0.9` |

Perkalian 0.9 pada nominal rupiah besar adalah kasus terburuk: hasil seperti `26999999.999999996` akan tampil atau tersimpan apa adanya. Untuk mata uang tanpa desimal seperti IDR, `Decimal(14,2)` menghapus seluruh kelas galat ini.

### DB-10 — Nol indeks non-unique (HIGH)

Migrasi hanya membuat empat indeks unik (baris 148-158): `User.email`, `User.username`, `Billboard.slug`, `Billboard.sku`. **Postgres tidak membuat indeks otomatis untuk kolom foreign key**, sehingga seluruh FK berikut tidak terindeks: `Booking.userId`, `Booking.billboardId`, `AdditionalCharge.bookingId`, `ChatMessage.sessionId`, `BillboardHistory.billboardId`, `BillboardHistory.changedById`, `Billboard.createdById`, `Billboard.updatedById`.

Kolom yang terbukti dipakai pada `where`/`orderBy` tanpa indeks:

| Kolom | Bukti penggunaan |
|---|---|
| `Booking.status` | `orders/page.tsx:32-35`, `billboards.service.ts:172`, `users/delete/route.ts:21`, `billboards/delete/route.ts:20` |
| `Booking.userId` | `DashboardWrapper.tsx:29`, `users/delete/route.ts:20` |
| `Booking.billboardId` | `billboards/delete/route.ts:19` |
| `Booking.createdAt` (orderBy) | `orders/page.tsx:41`, `admin/page.tsx:59` |
| `Booking.paidAt` | `actions.ts:43-51` (laporan pendapatan) |
| `Booking.startDate`/`endDate` | akan menjadi kritis setelah cek overlap DB-02 |
| `User.createdAt` (orderBy) | `users/page.tsx:9` |
| `Billboard.publishStatus` | filter katalog publik |

Dampak: setiap penghapusan billboard/user memicu seq scan tabel `Booking`; dashboard admin men-scan penuh lalu mengurutkan di memori.

### DB-11 — `JSON.parse` tanpa penjaga di halaman publik (HIGH)

```ts
// src/app/billboard/[slug]/BillboardDetailClient.tsx:37-40
const gallery  = JSON.parse(rawData.gallery) as string[];
const specs    = JSON.parse(rawData.specs) as { label: string; value: string }[];
const includes = JSON.parse(rawData.includes) as string[];
const excludes = JSON.parse(rawData.excludes) as string[];
```

Tanpa `|| "[]"` dan tanpa `try/catch`. Kolom-kolom ini `String` NOT NULL, tetapi string kosong `""` adalah nilai yang sah di database dan **bukan** JSON yang valid — `JSON.parse("")` melempar `SyntaxError`. `backend/src/billboards/billboards.service.ts:48-54` menulis default untuk beberapa kolom, tetapi satu baris hasil impor/edit manual sudah cukup untuk membuat halaman detail publik gagal render.

Bandingkan dengan `src/app/admin/(dashboard)/billboards/form/page.tsx:52-54` yang memakai `|| "[]"` — penjagaan ada di admin, tidak ada di halaman publik. `orders/TransactionClient.tsx:272-274` juga tanpa penjaga dan memanggil `JSON.parse` tiga kali berturut-turut pada nilai yang sama.

Perbaikan struktural: ubah ke tipe `Json` Postgres (Bagian 5) sehingga validitas dijamin database, plus helper defensif:

```ts
function parseJsonArray<T>(raw: unknown, fallback: T[] = []): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : fallback; }
  catch { return fallback; }
}
```

### DB-12 — Domain string tak terkendali (MEDIUM, bukti kuat)

Inventaris literal yang benar-benar dipakai di `src/**`, `backend/src/**`, `prisma/**`:

**`User.role`** — komentar skema (`:32`) menyebut `USER, ADMIN, SUPER_ADMIN, OPERATOR`, tetapi kode juga memakai **`CS`** (`prisma/seed.ts:47`, dan 6 kemunculan lain). Komentar sudah usang terhadap kenyataan.

**`Booking.status`** — 13 nilai berbeda, tak satu pun didokumentasikan di skema: `PENDING_PAYMENT`, `PAID_CONFIRMED`, `ACTIVE`, `DESIGN_RECEIVED`, `IN_PRODUCTION`, `INSTALLATION`, `CANCELLED`, `REVIEW_REFUND`, `PROCESS_REFUND`, `WAITING_BANK`, `REFUNDED`, `DONE`, `REFUND_REQUESTED`.

Dua di antaranya membuktikan kerusakan nyata:

- **`REFUND_REQUESTED`** hanya muncul **satu kali**, sebagai filter di `src/app/admin/(dashboard)/orders/page.tsx:34`. Tidak ada satu pun kode yang pernah *menulis* status ini — alur refund sebenarnya menulis `REVIEW_REFUND` (`bookings.service.ts:160`). Filter tersebut secara diam-diam tidak pernah cocok. Ini persis kelas bug yang dicegah oleh enum saat kompilasi.
- **`DONE`** dipakai sebagai nama filter UI (`orders/page.tsx:35,63`) padahal bukan nilai status yang tersimpan — memperkuat kebingungan domain.

**`Billboard.status`** — `Available` (7×) dan `Booked` (1×, hanya di `src/lib/dummy-data.ts:65`). Perbandingan bersifat case-sensitive (`!== 'Available'`), sehingga satu baris dengan `"available"` akan senyap menonaktifkan billboard.

**`Booking.designStatus`** — `PENDING_REVIEW`, `APPROVED`, `REJECTED` (komentar `:118`). Namun `PENDING_REVIEW` **tak pernah ditulis**: state "menunggu" sesungguhnya adalah SQL `NULL`, dan kode hanya memakainya sebagai fallback tampilan (`TransactionClient.tsx:311`, `BookingCard.tsx:281`). Dua representasi untuk satu keadaan.

**`User.authProvider`** — `EMAIL`, `GOOGLE`. Satu-satunya field yang bersih dari sembilan.

**`ChatSession.status`** — `OPEN`, `CLOSED`, dan **`AGENT`** yang tak terdokumentasi (`chat/join/route.ts:11`). `AGENT` adalah flag penekan bot, sehingga `OPEN` sebenarnya berarti "bot yang menangani" (`ChatInterface.tsx:128`) — tiga sumbu makna dipaksakan ke satu kolom.

**`ChatMessage.sender`** — lima nilai: `USER`, `ADMIN`, `BOT`, `SYSTEM`, `AGENT`. `AGENT` (`CS_InboxLayout.tsx:212,223`) bertabrakan nama dengan `ChatSession.status = 'AGENT'` yang maknanya berbeda total, dan seluruh perender hanya mengenali `ADMIN` — sehingga balasan CS tampil seolah dari pelanggan (DB-28).

**`Booking.designOption`** — `upload`, `service`, keduanya **lowercase**. Tidak ada kode yang membandingkan `upload`; semua menguji `=== 'service'`, sehingga field ini efektif boolean. Typo seperti `"Service"` membelokkan seluruh alur fulfillment di `payment/notify/route.ts:24` tanpa error (DB-32).

**`User.role`** juga memuat **`USER_AIDA`** (`src/components/Navbar.tsx:19,31`, `login/page.tsx:38`) — nilai hantu yang diperlakukan sebagai admin saat redirect, tetapi ditolak `layout.tsx:89`.

Ringkasan: **empat konvensi penulisan berbeda** (TitleCase, SCREAMING_SNAKE, lowercase, prosa Indonesia) tersebar di sembilan field; enam di antaranya tanpa komentar skema sama sekali.

---

## 4. Row Level Security — model keamanan sebenarnya

### 4.1 Hasil pencarian

Pencarian menyeluruh atas `row level security`, `ENABLE ROW`, `CREATE POLICY`, `auth.uid()`, `service_role`, `anon key`, `createClient`, `supabase` pada `*.sql`, `*.ts`, `*.tsx`, `*.js`, `*.md` (di luar `node_modules`) menghasilkan:

- **Nol** policy RLS.
- **Nol** pemakaian `@supabase/supabase-js` — tidak ada di `package.json`, `backend/package.json`, maupun `chat-server/`.
- Satu-satunya penyebutan "Supabase" hanya berupa catatan perencanaan migrasi di file markdown (`billboard-system.md:9,76`, `progres-22-12-2025.md:19-25`, dll.).

### 4.2 Apakah RLS berperan? Tidak — dan itu perlu dipahami dengan tepat

**Prisma tidak tunduk pada RLS di aplikasi ini.** `DATABASE_URL` terhubung sebagai role **`postgres`**, yaitu superuser pemilik tabel. Di PostgreSQL, superuser dan pemilik tabel **mem-bypass seluruh policy RLS secara definisi** (kecuali `FORCE ROW LEVEL SECURITY` diaktifkan). Konsekuensinya:

- Mengaktifkan RLS **tidak akan merusak** aplikasi yang berjalan sekarang.
- Mengaktifkan RLS **juga tidak akan melindungi** apa pun dari bug di kode aplikasi — seluruh otorisasi (DB-01, DB-05) tetap harus diperbaiki di lapisan aplikasi. RLS bukan substitusi untuk itu.

Jadi keluhan "RLS berantakan" perlu dirumuskan ulang: **RLS tidak berantakan — RLS tidak ada, dan yang berantakan adalah otorisasi di lapisan aplikasi.** RLS tetap layak dinyalakan, tetapi sebagai *pertahanan berlapis* terhadap jalur akses kedua yang dijelaskan berikut.

### 4.3 Eksposur nyata: PostgREST + kunci `anon`

Nama variabel di `.env` (nilai diredaksi seluruhnya):

```
DATABASE_URL, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_APP_URL, NEXTAUTH_URL, NEXTAUTH_SECRET,
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, NEXT_PUBLIC_CLOUDINARY_PRESET,
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
MAIL_FROM, ADMIN_EMAIL,
SUPABASE_ID, SUPABASE_NAME, SUPABASE_PASSWORD, SUPABASE_URL, SUPABASE_API_KEY, SUPABSE_CONNECTION
```

Penilaian:

1. **`SUPABASE_API_KEY` TIDAK berawalan `NEXT_PUBLIC_`.** Ini kabar baik — kunci tersebut tidak di-inline ke bundel JavaScript klien oleh Next.js. Pencarian juga mengonfirmasi variabel ini **tidak pernah dibaca di kode mana pun**; ia hanya menganggur di `.env`.

2. **Namun kunci `anon` Supabase memang dirancang untuk bersifat publik** dan dapat diambil siapa pun dari dashboard/endpoint proyek. Keamanan tabel pada Supabase **sepenuhnya bergantung pada RLS**, bukan pada kerahasiaan kunci `anon`. Karena tidak ada satu pun policy dan (kemungkinan besar) RLS tidak pernah diaktifkan, maka **jika PostgREST aktif pada schema `public` — yang merupakan default proyek Supabase — siapa pun yang mengetahui `SUPABASE_URL` dapat melakukan:**

   ```
   GET https://<project>.supabase.co/rest/v1/User?select=*
       apikey: <anon key>
   ```

   dan memperoleh seluruh baris `User` **termasuk kolom `password` berisi hash bcrypt**, `otpCode` (yang memungkinkan pengambilalihan akun via alur verifikasi OTP), `ktp`, `npwp`, serta seluruh isi `SystemSetting` berisi API key plaintext. Penulisan (`POST`/`PATCH`/`DELETE`) juga akan terbuka.

3. **Faktor peringan:** `DATABASE_URL` yang aktif saat ini menunjuk ke `localhost:5432/utero-cloud-db` (baris terakhir menimpa tiga baris `DATABASE_URL` sebelumnya di `.env`), sehingga instans Supabase mungkin belum berisi data produksi. Terdapat pula **empat definisi `DATABASE_URL` bertumpuk** dalam satu file `.env` — konfigurasi yang rapuh dan mudah salah-arah saat deploy.

4. **Ketidakmampuan verifikasi jarak jauh:** audit ini tidak melakukan panggilan jaringan ke Supabase, sehingga status `rowsecurity` aktual per tabel **belum terverifikasi**. Perlu dikonfirmasi langsung:

   ```sql
   SELECT schemaname, tablename, rowsecurity
   FROM pg_tables WHERE schemaname = 'public';
   ```

**Severity: CRITICAL apabila proyek Supabase tersebut menyimpan data nyata dan PostgREST aktif; HIGH sebagai utang keamanan yang harus dilunasi sebelum produksi.** Skrip Bagian 6 dirancang aman untuk dijalankan dalam kedua kondisi.

### 4.4 Catatan `NEXT_PUBLIC_*` lain

`NEXT_PUBLIC_CLOUDINARY_PRESET` menyiratkan unsigned upload preset. Di luar cakupan audit database, tetapi perlu ditinjau pada audit storage: preset unsigned yang terekspos memungkinkan pihak luar mengunggah ke akun Cloudinary.

---

## 5. Usulan `schema.prisma` — target beranotasi

Perubahan ditandai `// [+]` (tambahan), `// [~]` (ubahan). Enum dijalankan lewat migrasi bertahap (lihat catatan di akhir bagian).

```prisma
// ---------- ENUMS [+] ----------
enum Role            { USER ADMIN SUPER_ADMIN OPERATOR CS }
enum AuthProvider    { EMAIL GOOGLE }
enum BillboardStatus { AVAILABLE BOOKED MAINTENANCE }
enum PublishStatus   { DRAFT PUBLISHED ARCHIVED }
enum DesignStatus    { PENDING_REVIEW APPROVED REJECTED }
enum ChatStatus      { OPEN CLOSED }
enum ChatSender      { GUEST ADMIN SYSTEM }

enum BookingStatus {
  PENDING_PAYMENT PAID_CONFIRMED ACTIVE
  DESIGN_RECEIVED IN_PRODUCTION INSTALLATION
  COMPLETED CANCELLED
  REVIEW_REFUND PROCESS_REFUND WAITING_BANK REFUNDED
}

model User {
  id            String       @id @default(cuid())
  name          String?
  email         String       @unique
  password      String?
  image         String?
  role          Role         @default(USER)              // [~] String -> enum
  whatsapp      String?
  companyName   String?
  ktp           String?
  npwp          String?
  ktpAddress    String?
  officeAddress String?
  username      String?      @unique
  authProvider  AuthProvider @default(EMAIL)             // [~]
  isVerified    Boolean      @default(false)
  otpCode       String?
  otpExpires    DateTime?
  deletedAt     DateTime?                                // [+] soft delete (DB-14)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt                  // [+] DB-15

  bookings          Booking[]
  createdBillboards Billboard[] @relation("CreatedBy")
  updatedBillboards Billboard[] @relation("UpdatedBy")
  auditLogs         BillboardHistory[]

  @@index([role])                                        // [+]
  @@index([createdAt])                                   // [+]
}

model Billboard {
  id            String          @id @default(cuid())
  slug          String          @unique @default(cuid())
  title         String
  sku           String?         @unique
  address       String
  type          String
  price         Decimal         @db.Decimal(14, 2)       // [~] Float -> Decimal (DB-08)
  lat           Float                                    //     Float benar untuk koordinat
  lng           Float
  status        BillboardStatus @default(AVAILABLE)      // [~]
  publishStatus PublishStatus   @default(DRAFT)          // [~]

  mainImage    String
  gallery      Json            @default("[]")            // [~] String -> Json (DB-11)
  videoUrl     String?
  smartsucoUrl String?
  specs        Json            @default("[]")            // [~]
  includes     Json            @default("[]")            // [~]
  excludes     Json            @default("[]")            // [~]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  createdById String?
  createdBy   User?   @relation("CreatedBy", fields: [createdById], references: [id], onDelete: SetNull)  // [+]
  updatedById String?
  updatedBy   User?   @relation("UpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)  // [+]

  bookings Booking[]
  history  BillboardHistory[]

  @@index([publishStatus, status])                       // [+] katalog publik
  @@index([createdById])                                 // [+]
  @@index([updatedById])                                 // [+]
}

model Booking {
  id          String @id @default(cuid())
  userId      String
  billboardId String

  startDate DateTime @db.Date                            // [~] presisi hari
  duration  Int
  endDate   DateTime @db.Date                            // [~]

  unitPrice  Decimal  @db.Decimal(14, 2)                 // [+] snapshot harga (DB-09)
  totalPrice Decimal  @db.Decimal(14, 2)                 // [~]
  dpAmount   Decimal? @db.Decimal(14, 2)                 // [~]
  status     BookingStatus @default(PENDING_PAYMENT)     // [~]

  designOption          String
  designFileUrl         String?
  designStatus          DesignStatus?                    // [~]
  designRejectionReason String?

  paidAt              DateTime?
  designApprovedAt    DateTime?
  productionStartedAt DateTime?
  updatedAt           DateTime @updatedAt

  cancelReason    String?
  refundProof     String?
  userBankName    String?
  userBankAccount String?
  refundAmount    Decimal?  @db.Decimal(14, 2)           // [~]
  refundedAt      DateTime?
  isLocked        Boolean   @default(false)

  user      User      @relation(fields: [userId], references: [id], onDelete: Restrict)       // [+] eksplisit
  billboard Billboard @relation(fields: [billboardId], references: [id], onDelete: Restrict)  // [+] eksplisit

  createdAt DateTime @default(now())

  installationProof String?
  installedAt       DateTime?

  additionalCharges AdditionalCharge[]

  @@index([userId])                                      // [+]
  @@index([billboardId])                                 // [+]
  @@index([status])                                      // [+]
  @@index([createdAt])                                   // [+]
  @@index([paidAt])                                      // [+] laporan pendapatan
  @@index([billboardId, startDate, endDate])             // [+] cek overlap (DB-02)
}

model AdditionalCharge {
  id          String   @id @default(cuid())
  bookingId   String
  booking     Booking  @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  description String
  amount      Decimal  @db.Decimal(14, 2)                // [~]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt                        // [+]

  @@index([bookingId])                                   // [+]
}

model SystemSetting {
  id       String   @id @default("default_config")
  siteName String   @default("Utero Cloud")
  siteDesc String   @default("Platform Sewa Billboard Terlengkap")
  // [~] DB-16: jangan simpan kunci plaintext. Opsi terbaik: pindahkan ke env var.
  // Bila harus di DB, simpan terenkripsi (pgcrypto/Supabase Vault) + metadata saja.
  geminiApiKeyEnc     Bytes?                             // [~]
  googleMapsApiKeyEnc Bytes?                             // [~]
  updatedAt DateTime @updatedAt
}

model ChatSession {
  id         String     @id @default(cuid())
  guestName  String
  guestEmail String
  guestPhone String
  status     ChatStatus @default(OPEN)                   // [~]
  isOnline   Boolean    @default(true)
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
  messages   ChatMessage[]

  @@index([status, updatedAt])                           // [+]
}

model ChatMessage {
  id        String      @id @default(cuid())
  sessionId String
  sender    ChatSender                                   // [~]
  message   String
  createdAt DateTime    @default(now())
  session   ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade) // [~] Restrict -> Cascade

  @@index([sessionId, createdAt])                        // [+]
}

model BillboardHistory {
  id          String    @id @default(cuid())
  billboardId String
  billboard   Billboard @relation(fields: [billboardId], references: [id], onDelete: Cascade)
  title       String
  price       Decimal   @db.Decimal(14, 2)               // [~]
  status      BillboardStatus                            // [~]
  changedById String?
  changedBy   User?     @relation(fields: [changedById], references: [id], onDelete: SetNull) // [+]
  archivedAt  DateTime  @default(now())
  snapshot    Json                                       // [~] String -> Json

  @@index([billboardId, archivedAt])                     // [+]
  @@index([changedById])                                 // [+]
}
```

**Catatan migrasi enum.** Konversi `String` → `enum` tidak boleh langsung karena data lama mengandung nilai bercampur huruf besar/kecil (`'Available'` vs `AVAILABLE`). Urutan aman:

```sql
-- 1) Normalisasi data lama lebih dulu
UPDATE "Billboard" SET status = UPPER(status);
UPDATE "Booking"  SET status = 'COMPLETED' WHERE status IN ('DONE');
-- 2) Buat tipe enum, lalu ALTER dengan USING
CREATE TYPE "BillboardStatus" AS ENUM ('AVAILABLE','BOOKED','MAINTENANCE');
ALTER TABLE "Billboard"
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE "BillboardStatus" USING status::"BillboardStatus",
  ALTER COLUMN status SET DEFAULT 'AVAILABLE';
```

Konversi `Float` → `Decimal` aman secara otomatis (`ALTER ... TYPE numeric(14,2)`), tetapi **kode TypeScript harus disesuaikan**: Prisma mengembalikan `Prisma.Decimal`, sehingga `+`, `*`, dan `reduce` pada semua lokasi di tabel DB-08 harus diganti ke `.add()`, `.mul()`, `.toNumber()` pada batas presentasi.

**Perbaikan `src/lib/prisma.ts` (DB-17):**

```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // jangan pernah 'query' di produksi — parameter query memuat data pribadi
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

Untuk serverless + Supabase pgBouncer, pakai dua URL terpisah dan **hapus tiga baris `DATABASE_URL` duplikat** dari `.env`:

```
DATABASE_URL="postgresql://USER:[REDACTED]@<host>:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://USER:[REDACTED]@<host>:5432/postgres"
```

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")   // dipakai migrate/introspect
}
```

---

## 6. Skrip Hardening RLS — siap jalan

Jalankan di **Supabase SQL Editor** (sebagai `postgres`). Skrip bersifat idempoten dan **tidak akan memutus Prisma**, karena role `postgres` mem-bypass RLS.

> **Peringatan — tindakan ini mengubah hak akses di seluruh schema `public`.**
> Baca poin berikut sebelum mengeksekusi:
> 1. Setelah skrip ini dijalankan, **setiap klien yang memakai kunci `anon` atau `authenticated` akan kehilangan seluruh akses** ke tabel-tabel ini. Saat ini tidak ada klien semacam itu di repo, sehingga aplikasi tetap berjalan — tetapi bila ada integrasi eksternal yang tidak terdokumentasi, integrasi tersebut akan berhenti bekerja.
> 2. Jalankan di lingkungan **staging** terlebih dahulu dan verifikasi aplikasi masih berfungsi.
> 3. Ambil **backup** (Supabase → Database → Backups) sebelum mengeksekusi di produksi.
> 4. Bagian rotasi kunci di akhir skrip **tidak reversibel** untuk kunci lama — pastikan kunci pengganti sudah siap.

```sql
-- =====================================================================
-- RLS HARDENING — my-billboard-app
-- Model: Prisma terhubung sebagai role `postgres` (bypass RLS).
--        PostgREST (anon/authenticated) harus ditolak sepenuhnya.
-- Idempoten: aman dijalankan berulang.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Audit awal — catat kondisi sebelum perubahan
-- ---------------------------------------------------------------------
SELECT tablename, rowsecurity AS rls_enabled_before
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- ---------------------------------------------------------------------
-- 1. Aktifkan RLS pada SEMUA tabel di schema public.
--    Tanpa policy apa pun => default DENY untuk role non-bypass.
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE '\_prisma%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    -- FORCE: berlaku juga bagi pemilik tabel, kecuali superuser.
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 2. Cabut seluruh privilege dari role publik PostgREST.
--    Ini pertahanan utama: RLS aktif TANPA grant = tertutup rapat.
-- ---------------------------------------------------------------------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
REVOKE USAGE ON SCHEMA public FROM anon, authenticated;

-- Cegah tabel baru otomatis mewarisi hak akses di masa depan.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Pastikan role aplikasi (Prisma) tetap berfungsi penuh.
--    Prisma saat ini memakai `postgres`; blok ini menyiapkan role
--    khusus yang lebih aman untuk dipakai ke depan.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_prisma') THEN
    -- Ganti kata sandi di bawah dengan nilai acak yang kuat.
    CREATE ROLE app_prisma LOGIN PASSWORD 'REPLACE_WITH_STRONG_SECRET';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_prisma;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO app_prisma;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO app_prisma;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_prisma;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_prisma;

-- Penting: app_prisma BUKAN pemilik tabel, sehingga TIDAK mem-bypass RLS.
-- Beri policy menyeluruh agar backend tepercaya tetap leluasa,
-- sambil mempertahankan RLS sebagai penjaga bagi role lain.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS app_full_access ON public.%I;', t);
    EXECUTE format($f$
      CREATE POLICY app_full_access ON public.%I
        FOR ALL TO app_prisma
        USING (true) WITH CHECK (true);
    $f$, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 4. Sembunyikan schema public dari PostgREST sepenuhnya (disarankan).
--    Setelah ini, REST API Supabase tidak lagi mengekspos tabel aplikasi.
--    Terapkan juga via Dashboard: Settings > API > Exposed schemas
--    (hapus `public` dari daftar).
-- ---------------------------------------------------------------------
COMMENT ON SCHEMA public IS NULL;

COMMIT;

-- ---------------------------------------------------------------------
-- 5. VERIFIKASI — semua baris harus rls_enabled = true
-- ---------------------------------------------------------------------
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Pastikan anon/authenticated tidak menyisakan privilege apa pun.
-- Hasil yang diharapkan: 0 baris.
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated');
```

**Uji negatif setelah eksekusi** — harus mengembalikan error perizinan, bukan data:

```bash
curl "https://<project>.supabase.co/rest/v1/User?select=id,email,password" \
     -H "apikey: <ANON_KEY_REDACTED>"
# Diharapkan: {"message":"permission denied for schema public"} atau 404.
```

**Tindak lanjut wajib (di luar SQL):**

1. **Rotasi `geminiApiKey` dan `googleMapsApiKey` sekarang juga** — keduanya harus dianggap sudah bocor akibat DB-01. Batasi kunci Google Maps berdasarkan HTTP referrer di Google Cloud Console.
2. **Rotasi kredensial database** — kata sandi Postgres tertulis plaintext di `.env` lokal dan muncul dalam empat baris `DATABASE_URL`.
3. **Pindahkan Prisma dari role `postgres` ke `app_prisma`** agar RLS benar-benar berlaku sebagai lapisan pertahanan, bukan sekadar dekorasi.
4. **Enkripsi `SystemSetting` (DB-16)** — atau lebih baik, pindahkan kunci ke environment variable dan hapus kolomnya dari database.

---

## 7. Desain Pencegahan Double-Booking

Pertahanan berlapis: database sebagai penentu akhir, aplikasi sebagai pemberi pesan ramah.

### Lapis 1 — Constraint `EXCLUDE USING gist` (sumber kebenaran)

Constraint ini membuat tumpang-tindih **mustahil secara fisik**, bahkan di bawah konkurensi penuh, tanpa bergantung pada tingkat isolasi transaksi.

```sql
-- Prasyarat: tipe rentang atas kolom tanggal.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Status yang dianggap "menduduki" slot billboard.
-- CANCELLED / REFUNDED sengaja dikecualikan agar slot bisa dipakai ulang.
ALTER TABLE "Booking"
  ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    "billboardId" WITH =,
    daterange("startDate"::date, "endDate"::date, '[)') WITH &&
  )
  WHERE (status NOT IN ('CANCELLED', 'REFUNDED'));
```

Catatan desain:

- `'[)'` — batas bawah inklusif, batas atas eksklusif. Booking yang berakhir 1 Maret dan yang mulai 1 Maret **tidak** dianggap bentrok; ini perilaku yang diinginkan untuk sewa bulanan.
- Klausa `WHERE` menjadikannya *partial constraint*, sehingga pesanan batal tidak memblokir slot.
- Indeks GiST yang menyertainya sekaligus mempercepat query ketersediaan.
- Jalankan lebih dulu untuk mendeteksi data bentrok yang sudah terlanjur ada:

```sql
SELECT a.id, b.id, a."billboardId", a."startDate", a."endDate", b."startDate", b."endDate"
FROM "Booking" a
JOIN "Booking" b
  ON a."billboardId" = b."billboardId"
 AND a.id < b.id
 AND daterange(a."startDate"::date, a."endDate"::date, '[)')
  && daterange(b."startDate"::date, b."endDate"::date, '[)')
WHERE a.status NOT IN ('CANCELLED','REFUNDED')
  AND b.status NOT IN ('CANCELLED','REFUNDED');
```

Data bentrok harus diselesaikan secara manual sebelum constraint dapat dipasang.

### Lapis 2 — Transaksi aplikasi dengan penanganan error constraint

Menggabungkan perbaikan DB-02 dan DB-03 dalam satu alur:

```ts
// src/app/api/booking/create/route.ts
import { Prisma } from '@prisma/client';

const OCCUPYING: BookingStatus[] = [
  'PENDING_PAYMENT','PAID_CONFIRMED','ACTIVE',
  'DESIGN_RECEIVED','IN_PRODUCTION','INSTALLATION','COMPLETED',
];

try {
  const booking = await prisma.$transaction(async (tx) => {
    const billboard = await tx.billboard.findUnique({
      where: { id: billboardId },
      select: { id: true, price: true, status: true, publishStatus: true, title: true, address: true },
    });

    if (!billboard || billboard.publishStatus !== 'PUBLISHED' || billboard.status !== 'AVAILABLE') {
      throw new BookingError('Billboard tidak tersedia.');
    }

    // Harga dihitung server-side — input klien diabaikan (DB-03).
    const startDate = startOfDay(new Date(startDateString));
    const endDate   = addMonths(startDate, duration);
    const unitPrice = billboard.price;                       // Decimal
    const totalPrice = unitPrice.mul(duration);

    // Cek ramah untuk pesan error yang baik; constraint tetap penentu akhir.
    const clash = await tx.booking.findFirst({
      where: {
        billboardId,
        status: { in: OCCUPYING },
        startDate: { lt: endDate },
        endDate:   { gt: startDate },
      },
      select: { startDate: true, endDate: true },
    });
    if (clash) throw new BookingError('Tanggal tersebut sudah dipesan.');

    return tx.booking.create({
      data: {
        userId: session.user.id, billboardId, startDate, endDate, duration,
        unitPrice, totalPrice,                                // snapshot harga (DB-09)
        dpAmount: paymentType === 'dp' ? totalPrice.mul(0.3) : new Prisma.Decimal(0),
        status: 'PENDING_PAYMENT', designOption,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  // Kirim email SETELAH transaksi commit — jangan pernah di dalamnya.
  await sendBookingEmails(booking);

} catch (e) {
  // 23P01 = exclusion_violation: pemenang race condition sudah tercatat.
  if (e instanceof Prisma.PrismaClientKnownRequestError && (e.meta as any)?.code === '23P01') {
    return NextResponse.json({ message: 'Tanggal baru saja dipesan orang lain.' }, { status: 409 });
  }
  if (e instanceof BookingError) {
    return NextResponse.json({ message: e.message }, { status: 400 });
  }
  throw e;
}
```

Poin penting:

- **`ReadCommitted` sudah memadai** justru karena constraint `EXCLUDE` yang menegakkan invarian. Tanpa constraint, dibutuhkan `Serializable` plus logika retry — lebih mahal dan lebih rapuh.
- **Pengiriman email dikeluarkan dari transaksi.** Kode saat ini melakukan dua panggilan SMTP berurutan (`route.ts:52-89`) yang, bila dibungkus transaksi, akan menahan koneksi database selama hitungan detik.
- **Error 23P01 wajib ditangani**, bukan dibiarkan jatuh ke `500`. Kode saat ini menelan seluruh error menjadi `"Error Server"` (`route.ts:93-96`), menyembunyikan penyebab sebenarnya dari pengguna maupun log.
- Terapkan perubahan yang sama pada `backend/src/bookings/bookings.service.ts:44-99`, karena kedua jalur menulis ke tabel yang sama.

### Lapis 3 — Konsistensi UI

`backend/src/billboards/billboards.service.ts:170-176` sudah mengambil rentang booking untuk kalender, tetapi daftar statusnya (`['ACTIVE','PENDING_PAYMENT','PAID_CONFIRMED']`) **berbeda** dari daftar yang dipakai saat penghapusan (`billboards.service.ts:194`, `:237`) dan dari `OCCUPYING` di atas. Ketiganya harus mengacu pada satu konstanta bersama agar kalender tidak menampilkan slot sebagai tersedia padahal constraint akan menolaknya.

---

## 8. Migrasi & Kebersihan Repo

**Drift.** `npx prisma migrate status` gagal terhubung (`P1000: Authentication failed ... at localhost`) karena `DATABASE_URL` aktif menunjuk ke Postgres lokal yang tidak berjalan dengan kredensial tersebut. Verifikasi dilakukan **secara manual**: setiap model, kolom, tipe, default, indeks unik, dan foreign key pada `prisma/schema.prisma:24-209` cocok satu-per-satu dengan `prisma/migrations/20251222070417_init_local_db/migration.sql:1-183`. **Tidak ditemukan drift.**

**SQLite-isms.** Tidak ada. Migrasi memakai tipe Postgres yang benar (`TEXT`, `DOUBLE PRECISION`, `TIMESTAMP(3)`, `BOOLEAN`), sintaks `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` yang sah, dan `migration_lock.toml` berisi `provider = "postgresql"`. Migrasi SQLite→Postgres pada aspek ini bersih.

**Duplikasi skema (DB-18).** `backend/prisma/schema.prisma` **identik byte-per-byte** dengan `prisma/schema.prisma`, dan `backend/prisma/migrations/20251222173703_init/migration.sql` identik dengan migrasi root (hanya nama folder/timestamp yang berbeda). Dua sumber kebenaran dengan dua riwayat migrasi terpisah berisiko menimbulkan drift senyap begitu salah satu diubah. Konsolidasikan ke satu skema; `backend` dapat menunjuk ke sana lewat `--schema` atau generator output yang sudah ada di `schema.prisma:8-17`.

**`prisma/dev.db` (DB-23 — risiko TIDAK terjadi).** File SQLite 131 KB memang ada di disk, tetapi:
- `git ls-files prisma/` hanya mencantumkan `migration.sql`, `migration_lock.toml`, `schema.prisma`, `seed.ts`, `set-admin.ts` — `dev.db` **tidak ter-track**.
- `git check-ignore -v` mengonfirmasi `.gitignore:44` mengabaikannya.
- `git log --all -- 'prisma/dev.db'` **kosong** — tidak pernah ter-commit sepanjang riwayat.

Penilaian awal sebagai calon CRITICAL **tidak terbukti**. Tetap disarankan menghapus file lokal tersebut untuk menghindari kebingungan.

**`.env` juga aman.** `git log --all -- '*.env'` kosong dan `.gitignore:39` (`.env*`) mencakup `.env`, `.env.local`, `backend/.env`, `chat-server/.env`. Tidak ada rahasia dalam riwayat git.

**Seed (DB-19/20/21).** `prisma/seed.ts:11-15` menjalankan `deleteMany()` atas `booking`, `billboardHistory`, `billboard`, dan `user` tanpa konfirmasi. Dengan `DATABASE_URL` yang salah arah, satu perintah `npx prisma db seed` menghapus seluruh data produksi. Seluruh lima akun — termasuk `SUPER_ADMIN` — memakai password `"123456"` (`:18-56`). Guard yang disarankan:

```ts
if (process.env.NODE_ENV === 'production' || !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error('Seed dibatalkan: hanya untuk database lokal.');
}
```

`prisma/set-admin.ts:6` memuat email target hardcoded (`admin@gmail.com`) dan mempromosikan akun apa pun dengan email itu menjadi `ADMIN` tanpa konfirmasi — jadikan argumen CLI dan beri guard serupa.

---

## 9. Urutan Perbaikan yang Disarankan

**Segera (hari ini)**
0. **DB-00 — tutup `update-account` & `update-business`.** Account takeover tanpa login. Setelah diperbaiki, paksa reset password seluruh pengguna.
1. DB-01 — tambahkan auth pada `GET /api/admin/settings`; **rotasi kedua API key**.
2. DB-03 — hitung harga di server pada kedua jalur booking.
3. DB-05 — tambahkan cek kepemilikan pada cancel & refund.
4. DB-06/07 — ganti `include` dengan `select` di seluruh query yang menyentuh `User`.
4b. DB-01b/DB-01c — pasang guard pada endpoint `@Public()` backend; tentukan `sender` chat di sisi server.

**Minggu ini**
5. DB-04 — jalankan skrip RLS (Bagian 6) setelah verifikasi staging; konfirmasi status `rowsecurity` sebenarnya di Supabase.
6. DB-02 — pasang constraint `EXCLUDE` + transaksi (Bagian 7).
7. DB-10 — tambahkan seluruh `@@index`.
8. DB-11 — amankan seluruh pemanggilan `JSON.parse`.

**Sprint berikutnya**
9. DB-08/09 — migrasi `Float` → `Decimal` + snapshot `unitPrice` (perlu penyesuaian kode aritmetika menyeluruh).
10. DB-12 — konversi enum bertahap dengan normalisasi data lebih dulu.
11. DB-16/17/18 — enkripsi setelan, tuning pooling, konsolidasi skema ganda.
12. DB-19/20/21 — guard seed dan kredensial acak.
