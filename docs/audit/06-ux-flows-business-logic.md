# Audit 06 — UX Flow, Information Architecture & Business-Logic Correctness
**Proyek:** Utero Cloud (`my-billboard-app`)
**Tanggal audit:** 21 September 2026
**Scope:** Verifikasi klaim dokumentasi vs kode, korektnes perhitungan uang, state machine booking, information architecture, error/edge-case UX, dan kepatuhan data pribadi.

---

## 1. Executive Summary

Keluhan user bahwa sebagian layar "belum terbuat dan terimplementasikan dengan baik secara informasi dan layout" **terkonfirmasi**, tetapi akar masalahnya jauh lebih dalam daripada sekadar layout. Temuan utama:

1. **Harga total dihitung di CLIENT dan dipercaya mentah-mentah oleh SERVER.** `CheckoutForm.tsx:62` mengirim `totalPrice` hasil hitungan browser, dan `bookings.service.ts:53` menyimpannya apa adanya tanpa recompute. Penyerang bisa memesan billboard Rp 300 juta seharga Rp 1.
2. **Backend NestJS praktis tanpa autentikasi.** `bookings.controller.ts:16` memakai user hardcoded `{ id: 'clerk-user-id' }`. Controller `orders`, `payments`, `uploads`, `users` tidak punya guard sama sekali — siapa pun bisa `POST /api/orders/update-status` dan mengubah pesanan mana pun menjadi `ACTIVE`, atau `POST /api/payments/notify` untuk menandai order lunas tanpa membayar.
3. **Refund bisa melebihi uang yang diterima.** `bookings.service.ts:187` menghitung refund `totalPrice * 0.9` (bruto), padahal user DP hanya menyetor 60%. Pada contoh Rp 10 juta × 3 bulan: user menyetor Rp 20.010.000, sistem memerintahkan transfer Rp 30.015.000 — rugi bersih **Rp 10.005.000 per transaksi**.
4. **Invoice secara aritmetika tidak koheren dan bukan faktur pajak sah.** PPN tidak pernah dirinci, `additionalCharges` tidak pernah muncul, dan blok total menampilkan "Subtotal 33.350.000 − DP 20.010.000 = Total 33.350.000" (`invoice/[id]/page.tsx:102,108,113`).
5. **Double-booking tidak dicegah.** Tidak ada satu pun pengecekan tumpang-tindih tanggal di jalur pembuatan booking.
6. **Timer 24 jam murni kosmetik.** Tidak ada cron/job/scheduler mana pun di repo; status `EXPIRED` hanya hidup di state React (`BookingCard.tsx:33`).
7. **Information architecture sangat tipis.** Hanya ada 12 halaman publik/user. Tidak ada `/about`, `/contact`, `/faq`, `/terms`, `/privacy`, halaman daftar billboard non-peta, halaman hasil pencarian, `not-found.tsx`, `error.tsx`, lupa password, maupun verifikasi email.
8. **Nol SEO.** Tidak ada satu pun `export const metadata` atau `generateMetadata` di seluruh `src/`, tidak ada `sitemap.ts`/`robots.ts`/Open Graph/structured data — bertentangan langsung dengan klaim "SLUG URL (SEO Friendly)" di `info.txt`.
9. **Isu data pribadi.** Sistem mengumpulkan KTP, NPWP, dan alamat KTP dalam kolom plaintext tanpa halaman Kebijakan Privasi maupun Syarat & Ketentuan.
10. **Dua route proxy membatalkan seluruh kontrol akses.** `src/app/api/proxy/route.ts:5,10` adalah SSRF terbuka yang memantulkan respons (metadata cloud, backend internal, rentang privat) dan menyajikannya sebagai `text/html` dari origin sendiri. `src/app/api/proxy/[...path]/route.ts:3-5` memperingatkan dirinya sendiri sebagai "unauthenticated... Do not use this in production", mengekspor `DELETE`, dan tidak meneruskan kredensial — menghasilkan penghapusan billboard tanpa login.
11. **Chatbot AI publik mati.** `ChatWidget.tsx:20` menyambung ke port 4001 (NestJS, tanpa socket server) sedangkan bot mendengarkan di 3001. Fitur unggulan yang diklaim selesai tidak pernah merespons satu pengunjung pun.

Penilaian keseluruhan: aplikasi ini adalah **prototipe demo**, bukan produk siap transaksi. Dokumentasi (`info.txt`, `billboard-system.md`) melebih-lebihkan status penyelesaian secara signifikan — banyak fitur yang diklaim "Completed" ternyata STUB atau BROKEN.

---

## 2. CLAIM VERIFICATION MATRIX

Status: **IMPLEMENTED** (berfungsi sesuai klaim) / **PARTIAL** (sebagian) / **STUB** (UI ada, logika kosong) / **MISSING** (tidak ada) / **BROKEN** (ada tapi salah/berbahaya).

| Fitur yang diklaim | Sumber klaim | Status | Bukti (file:line) | Catatan |
|---|---|---|---|---|
| Peta interaktif full-screen (Leaflet) | `info.txt` §1 | IMPLEMENTED | `src/app/page.tsx:10`, `src/components/HeroMap.tsx` | Fetch ke backend `/api/billboards`, dirender di peta. |
| Smart Search Bar (lokasi/tipe/tanggal) | `info.txt` §1 | PARTIAL | `src/app/page.tsx:31-45`, `SearchFilter.tsx:24,141` | Filter `q` (judul+alamat) dan `type` berfungsi di server (`page.tsx:38-42`). **Filter tanggal kosmetik**: `SearchFilter.tsx:24` menulis `params.set('date', …)` tapi `page.tsx:31-32` hanya membaca `q` dan `type` — `date` tidak pernah dikonsumsi, tidak ada cek ketersediaan (F-049). Input tanggal desktop juga tanpa `value` binding (`SearchFilter.tsx:141`). |
| SEO slug URL (`/billboard/baliho-ijen`) | `info.txt` §1 | PARTIAL | `src/app/billboard/[slug]/page.tsx:57`, `prisma/schema.prisma:64` | Slug berfungsi sebagai routing, **tetapi nilai default-nya `cuid()`** dan **nol metadata SEO** (lihat F-018). Klaim "SEO Friendly" tidak terpenuhi. |
| Location Visualizer + Google Street View | `info.txt` §1 | BROKEN | `LocationVisualizer.tsx:88-96` vs `:97-118`; `billboard/[slug]/page.tsx:35` | Kode embed Street View asli ada (`:88-96`), tapi `apiKey` selalu `null` karena `getSystemSettings()` adalah dummy hardcoded → **selalu jatuh ke placeholder** foto stok Unsplash + teks "Fitur Embed belum dikonfigurasi." (`:100,:106`). Tab peta sendiri nyata (Leaflet/OSM, `:68-84`). |
| Cek fasilitas Include/Exclude 2 kolom | `info.txt` §1 | IMPLEMENTED | `prisma/schema.prisma:82-83`, `BillboardDetailClient.tsx` | Tersimpan sebagai string. |
| Kalender ketersediaan visual | `info.txt` §1 | PARTIAL | `src/components/AvailabilityCalendar.tsx:20-30` | Tanggal terbooking di-disable, tapi hanya visual. Server **tidak memvalidasi** pilihan tanggal (lihat F-006). Legenda warna kosong (`AvailabilityCalendar.tsx:108-110`). |
| Smart Action: bawa tanggal ke checkout | `info.txt` §1 | PARTIAL | `BillboardDetailClient.tsx:177` | Link selalu meng-hardcode `&duration=1`; pilihan durasi user di halaman detail tidak terbawa. |
| Kalkulator durasi 1/3/6/12 bulan | `info.txt` §2 | IMPLEMENTED | `CheckoutForm.tsx:111,38` | Opsi 1/3/6/12 tersedia. |
| Diskon durasi ("Hemat!" di 12 bulan) | `CheckoutForm.tsx:119` | BROKEN | `CheckoutForm.tsx:38,119` | Badge "Hemat!" ditampilkan, tetapi harga **linier murni** `pricePerMonth * duration`. 12 bulan = tepat 12×. Klaim hemat menyesatkan konsumen (lihat F-010). |
| PPN 11% | `info.txt` §2 | BROKEN | `CheckoutForm.tsx:39` | Dihitung benar di client (`subTotal * 0.11`), tapi **tidak pernah dihitung/divalidasi server**, tidak disimpan terpisah, dan **tidak pernah dirinci di invoice** (lihat F-002, F-004). |
| Biaya admin otomatis | `info.txt` §2 | PARTIAL | `CheckoutForm.tsx:36` | Hardcoded `const adminFee = 50000` di komponen client. Tidak bisa dikonfigurasi admin, tidak tersimpan di DB, tidak muncul di invoice. |
| Opsi DP 60% | `info.txt` §2 | BROKEN | `CheckoutForm.tsx:42`, `BookingCard.tsx:116` | DP dihitung dari **bruto** (termasuk PPN + admin fee). Lebih parah: tombol bayar di dashboard menagih `order.totalPrice` (100%) walau user memilih DP (lihat F-005). |
| Input NPWP untuk faktur pajak | `info.txt` §2 | STUB | `CheckoutForm.tsx:163-168` | Field NPWP **tidak ter-bind ke state apa pun** dan **tidak ikut dikirim** dalam payload (`CheckoutForm.tsx:59-67`). Data yang diketik user hilang total. Sama untuk Nama/WhatsApp/Email (baris 144,148,153). |
| Perlindungan role: Admin dilarang order | `info.txt` §2 | PARTIAL | `CheckoutForm.tsx:46`, `bookings.service.ts:18` | Cek ada, tapi tidak berarti karena backend memakai user placeholder hardcoded ber-role `'USER'` (`bookings.controller.ts:16`) — cek tidak pernah bisa true. |
| Tracking status PENDING → ACTIVE → CANCELLED | `info.txt` §2 | PARTIAL | `BookingCard.tsx:181-187` | Badge ada, tapi `PAID_CONFIRMED` tidak pernah diproduksi backend (lihat F-012). |
| Hitung mundur pembayaran 24 jam | `info.txt` §2 | BROKEN | `BookingCard.tsx:29-40` | **Murni kosmetik.** Tidak ada cron/scheduler/job di seluruh repo. Order tetap `PENDING_PAYMENT` selamanya dan tetap bisa dibayar setelah "EXPIRED" (lihat F-007). |
| Upload desain (kompresi `sharp`) | `info.txt` §2 | PARTIAL | `backend/src/uploads/uploads.controller.ts:38-75` | Upload via `multer` ke disk lokal. **Tidak ada kompresi `sharp`** di jalur backend. Endpoint **tanpa auth** dan nama file `DESIGN-${orderId}` bisa ditimpa siapa saja (lihat F-016). |
| Invoice generator (PDF/Print) | `info.txt` §2 | BROKEN | `src/app/invoice/[id]/page.tsx:100-115` | "PDF" hanya Ctrl+P. Rincian harga tidak koheren, PPN tidak ada, `additionalCharges` tidak ada (lihat F-004). |
| Refund system (alasan + rekening) | `info.txt` §2 | BROKEN | `bookings.service.ts:152-222` | Form ada, tapi refund dihitung dari bruto sehingga melebihi uang yang diterima pada skema DP, dan tidak ada guard status (lihat F-003, F-008). |
| Login admin terpisah `/admin/login` | `info.txt` §3 | IMPLEMENTED | `src/app/admin/login/page.tsx`, `src/app/admin/(dashboard)/layout.tsx:13-34` | Ada gate role dengan halaman Access Denied. |
| CRUD billboard lengkap | `info.txt` §3 | PARTIAL | `backend/src/billboards/billboards.controller.ts:15-83` | CRUD ada, tapi `@Delete(':id')` dan `@Patch(':id/status')` ditandai `@Public()` — **tanpa autentikasi** (baris 27,66). Komentar di kode sendiri mengakui ini (baris 30,69). |
| Auto generate slug | `info.txt` §3 | IMPLEMENTED | `backend/src/billboards/billboards.service.ts:83` | Ada pengecekan slug unik. |
| Audit trail (siapa & kapan edit) | `info.txt` §3 | PARTIAL | `admin/billboards/update/route.ts:48-60`, `billboards.service.ts:116-140` | History ditulis dalam transaksi bersama update penuh. **Tapi tidak semua update mencatat history**: `admin/billboards/quick-update/route.ts:30-36` mengubah `status`/`publishStatus` tanpa baris history, begitu pula `billboards.service.ts:179` (F-047). |
| Rollback / History | `info.txt` §3 | PARTIAL | `admin/billboards/rollback/route.ts:22-41`, `billboards.service.ts:296-328` | Restore dari snapshot berfungsi, tapi **hanya sebagian field** (`rollback/route.ts:32-38`) — `specs`, `includes`, `excludes`, `gallery`, `publishStatus`, `smartsucoUrl` tidak dipulihkan meski ada di snapshot. Rollback sendiri **tidak diaudit** (tidak bisa di-undo) dan `rollback/route.ts:9` **memblokir `SUPER_ADMIN`** (F-048). |
| Order management + tombol aksi cerdas | `info.txt` §3 | PARTIAL | `src/components/admin/OrderActions.tsx:65-169` | Tombol ada, tapi **tanpa guard transisi** — admin bisa memindahkan status ke mana saja (lihat F-011). |
| Proses refund + upload bukti transfer | `info.txt` §3 | IMPLEMENTED | `OrderActions.tsx:169`, `orders.service.ts:26-31` | `refundedAt` tercatat, bukti tersimpan. |
| AI Chatbot Gemini + link produk | `info.txt` §4 | BROKEN | `chat-server/index.js:21,24-92,120-136`; `src/components/ChatWidget.tsx:20` | Logika bot + prompt link produk benar-benar ada dan link markdown dirender klik-able (`ChatWidget.tsx:88-106`). **Tapi widget publik menyambung ke port yang salah** — `io("http://localhost:4001")` (NestJS, tanpa socket server) sedangkan bot mendengarkan di 3001 (`chat-server/index.js:20`). Chatbot publik mati total (lihat F-043). |
| Konsolidasi chat-server ke backend | `progres-22-12-2025.md:15` | MISSING | `backend/src/chat/chat.module.ts:7-12`, `backend/package.json` | Klaim "chat-server dihilangkan" **tidak benar**. `backend/src/chat/` hanya HTTP (`chat.controller.ts:9-12`, satu endpoint `start`); tidak ada gateway, tidak ada `socket.io` maupun `@google/generative-ai` di `backend/package.json`. |
| Human take-over (Join Chat matikan bot) | `info.txt` §4 | BROKEN | `chat/join/route.ts:8-14`; `chat-server/index.js:120` | Status di-set `'AGENT'` dan jalur HTTP menghormatinya (`chat/send/route.ts:54-56`), **tetapi bot socket tidak pernah membaca `chatSession.status`** — `chat-server/index.js:120` membalas setiap pesan `USER` tanpa syarat. "Join Chat" tidak membungkam bot (F-044). |
| Magic Reply (AI drafting balasan admin) | `info.txt` §4 | STUB | `src/app/api/admin/chat/suggest/route.ts:10-40`; `ChatInterface.tsx:107-118,198` | Endpoint berfungsi dan membaca key dari DB, **tapi satu-satunya pemanggilnya ada di komponen yang tidak pernah di-import** (`ChatInterface.tsx` = dead code). Tidak terjangkau user. Endpoint juga **tanpa auth** (F-046). |
| Notifikasi bunyi "Ting!" | `info.txt` §4 | STUB | `src/components/admin/ChatInterface.tsx:29-32,56` | Kode `new Audio(...)` ada, **tapi meng-hotlink aset pihak ketiga** (`codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3`) — tidak ada file suara di `public/`. Berada di komponen mati, jadi tidak pernah berbunyi. |
| Realtime chat (Socket.IO) | `info.txt` §4, `progres-21-12` | PARTIAL | `ChatWidget.tsx:4,20`; `CS_InboxLayout.tsx:3,177` | Komponen yang benar-benar dirender **memakai socket.io**, bukan polling. Admin inbox (`live-chat/page.tsx:8` → `CS_InboxLayout:177`) menyambung ke port 3001 yang benar; widget publik ke 4001 yang salah (F-043). Polling hanya ada di komponen mati (F-045). |
| Konfigurasi API key dinamis dari dashboard | `info.txt` §4 | BROKEN | `src/app/billboard/[slug]/page.tsx:29-38` | `getSystemSettings()` adalah **stub hardcoded** yang mengembalikan `geminiApiKey: null, googleMapsApiKey: null`. Key yang disimpan admin di DB tidak pernah dipakai di halaman detail. |
| Notifikasi email (order, lunas, refund, update) | `billboard-system.md` §1C | BROKEN | `backend/.env` (hanya `DATABASE_URL`), `backend/src/lib/mail.service.ts:9-17` | NestJS tidak punya `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`ADMIN_EMAIL`/`NEXTAUTH_URL`. Semua email dari backend gagal, dan link invoice jadi `undefined/invoice/...` (lihat F-014). |
| Timeline produksi 6 tahap | `billboard-system.md` §1A | PARTIAL | `src/app/dashboard/order/[id]/page.tsx:57-64` | Visual 6 tahap ada, tapi tahap 3 (`designApprovedAt`) & 4 (`productionStartedAt`) bergantung field yang jarang/tidak pernah diisi oleh jalur backend. |
| Payment Gateway Xendit | `info.txt` TODO, `billboard-system.md` §3 | MISSING | `BookingCard.tsx:115-132` | Tombol berlabel "Bayar via Xendit" (`CheckoutForm.tsx:268`) tapi hanya `confirm()` lalu memanggil webhook sendiri. Diakui di dokumen. |
| Migrasi PostgreSQL | `progres-22-12` | IMPLEMENTED | `prisma/schema.prisma:20-21` | `provider = "postgresql"`. |
| Cloud Storage (Cloudinary/GCS) | `progres-kerja.md` | MISSING | `uploads.controller.ts:41` | Masih `./public/uploads/designs`. Diakui di dokumen. |
| Lupa password / reset password | `project-awal.md` §2A | MISSING | — | Tidak ada UI maupun API. Kolom `otpCode`/`otpExpires` (`schema.prisma:48-49`) **tidak pernah dibaca/ditulis** di mana pun (lihat F-019). |
| Verifikasi email (`isVerified`) | `schema.prisma:46` | MISSING | `src/lib/auth.ts:32-53` | `isVerified` **tidak pernah dicek** saat login. Field mati. |
| Login Google | `project-awal.md` §2A | IMPLEMENTED | `src/lib/auth.ts:20-23,58-90` | Auto-register user Google. |
| Visitor tracking / analytics internal | `project-awal.md` §2B | MISSING | — | Tidak ada model `VisitorLog` di schema. Diakui di dokumen. |
| Input kode Google Analytics di admin | `project-awal.md` §2C | MISSING | `prisma/schema.prisma:160-167` | `SystemSetting` tidak punya field tracking code. |

---

## 3. MONEY MATH — Telusur Numerik Konkret

### 3.1 Skenario acuan
Billboard harga **Rp 10.000.000/bulan**, durasi **3 bulan**, metode **DP 60%**.

### 3.2 Langkah demi langkah lintas file

| # | Lokasi | Perhitungan | Nilai |
|---|---|---|---|
| 1 | `CheckoutForm.tsx:35` | `pricePerMonth = billboard.price` | 10.000.000 |
| 2 | `CheckoutForm.tsx:36` | `adminFee = 50000` (hardcoded client) | 50.000 |
| 3 | `CheckoutForm.tsx:38` | `subTotalSewa = 10.000.000 × 3` | 30.000.000 |
| 4 | `CheckoutForm.tsx:39` | `ppn = 30.000.000 × 0.11` | 3.300.000 |
| 5 | `CheckoutForm.tsx:40` | `grandTotal = 30.000.000 + 3.300.000 + 50.000` | **33.350.000** |
| 6 | `CheckoutForm.tsx:42` | `mustPayNow = 33.350.000 × 0.60` | **20.010.000** |
| 7 | `CheckoutForm.tsx:62,64` | Dikirim ke server: `totalPrice: 33.350.000`, `dpAmount: 20.010.000` | — |
| 8 | `bookings.service.ts:53` | Disimpan **apa adanya**, tanpa recompute | `totalPrice=33.350.000`, `dpAmount=20.010.000` |

**Catatan kritis pada langkah 8:** server tidak pernah membaca `targetBillboard.price` untuk memverifikasi. `targetBillboard` hanya dipakai untuk judul & alamat di email (`bookings.service.ts:67-68`).

### 3.3 Titik divergensi antar layar

Setelah booking tersimpan, angka yang sama ditampilkan berbeda-beda:

| Layar | Yang ditampilkan | Nilai | Benar? |
|---|---|---|---|
| Checkout (`CheckoutForm.tsx:256`) | "Total Tagihan" | 33.350.000 | Ya |
| Checkout (`CheckoutForm.tsx:265`) | "Nominal dibayar sekarang" | 20.010.000 | Ya |
| Dashboard (`BookingCard.tsx:222`) | "Total Tagihan" = `order.totalPrice` | 33.350.000 | Menyesatkan — sisa 40% (13.340.000) tidak pernah ditampilkan |
| Tombol bayar (`BookingCard.tsx:116`) | "Bayar tagihan sebesar Rp …" | **33.350.000** | **SALAH** — user DP ditagih 100% |
| Email lunas (`payments.service.ts:44,46`) | "[LUNAS] Uang Masuk" / "sudah membayar **lunas**" | 33.350.000 | **SALAH** — user baru bayar DP |
| Invoice "Jumlah" item (`invoice:91`) | `order.totalPrice` | 33.350.000 | **SALAH** — baris item seharusnya 30.000.000 (harga pokok) |
| Invoice "Subtotal" (`invoice:102`) | `order.totalPrice` | 33.350.000 | **SALAH** — subtotal seharusnya pra-pajak |
| Invoice "DP Masuk" (`invoice:108`) | `- Rp {dpAmount}` | − 20.010.000 | Tanda minus menyiratkan pengurangan |
| Invoice "Total" (`invoice:113`) | `order.totalPrice` | **33.350.000** | **SALAH** — DP tidak dikurangkan |
| Admin (`TransactionClient.tsx:191`) | `totalPrice + Σ additionalCharges` | 33.350.000 + biaya | Berbeda dari invoice user |

**Invoice tidak koheren secara aritmetika.** User membaca: `Subtotal 33.350.000` − `DP 20.010.000` = `Total 33.350.000`. Angka tidak menjumlah.

### 3.4 PPN diterapkan pada basis yang salah untuk admin fee

`CheckoutForm.tsx:39-40`: PPN dihitung **hanya** atas `subTotalSewa`, lalu `adminFee` ditambahkan **setelah** pajak. Biaya admin Rp 50.000 tidak dikenai PPN. Jika biaya admin adalah jasa kena pajak, basis PPN seharusnya `30.050.000` → PPN `3.305.500`, selisih **Rp 5.500 per transaksi** yang kurang dipungut.

Lebih serius: **PPN tidak pernah disimpan sebagai kolom tersendiri.** `schema.prisma:112-113` hanya punya `totalPrice` dan `dpAmount`. Tidak ada `basePrice`, `taxAmount`, `adminFee`. Konsekuensinya PPN tidak dapat direkonsiliasi, dan invoice **tidak memenuhi syarat faktur pajak** meski user mencentang "Saya butuh Faktur Pajak" (`CheckoutForm.tsx:159`).

### 3.5 DP dihitung dari bruto

`CheckoutForm.tsx:42` menghitung DP atas `grandTotal` (sudah termasuk PPN + admin fee). Artinya pelanggan mem-prabayar 60% dari PPN (Rp 1.980.000) sebelum jasa diberikan. Praktik lazim adalah DP atas nilai pokok, dengan PPN dipungut penuh saat penyerahan. Keputusan ini harus eksplisit, bukan efek samping.

### 3.6 Refund melebihi uang yang diterima — kerugian riil

`bookings.service.ts:186-187`:
```ts
const orderData = await this.prisma.booking.findUnique({ where: { id: orderId } });
const refundNominal = (orderData?.totalPrice || 0) * 0.9;
```

Untuk skenario acuan:
- Uang yang benar-benar diterima (DP): **Rp 20.010.000**
- Refund yang diperintahkan sistem: `33.350.000 × 0.9` = **Rp 30.015.000**
- **Kerugian bersih: Rp 10.005.000 per transaksi**

Email ke admin (`bookings.service.ts:205`) menyatakan "Mohon segera transfer pengembalian dana Rp 30.015.000", jadi admin yang patuh akan benar-benar mentransfernya. Refund juga mengembalikan PPN yang mungkin sudah disetor ke negara. Ini adalah **bug uang paling mahal** dalam audit ini.

### 3.7 Floating-point money (`Float` di Prisma)

`schema.prisma:112,113,131,154` memakai `Float` (IEEE-754 double) untuk semua kolom uang. Kasus gagal konkret — billboard Rp 12.345.678/bulan, 1 bulan, DP:

```
ppn        = 12.345.678 × 0.11 = 1358024.58
grandTotal = 13753702.58
dp60       = 13753702.58 × 0.60 = 8252221.5479999995   ← galat biner
```

`toLocaleString('id-ID')` merender ini sebagai **"8.252.221,548"** — tiga desimal pada mata uang yang tidak punya pecahan sen. Contoh lain, harga Rp 3.333.333 × 3 bulan menghasilkan `dp60 = 6689999.334`. Nilai-nilai ini masuk ke database, ke email, dan ke instruksi transfer bank. Perbaikan: simpan rupiah sebagai `Int` (satuan rupiah bulat) atau `Decimal`, dan bulatkan setiap hasil perkalian pajak.

### 3.8 Pricing durasi: tidak ada tier diskon

`CheckoutForm.tsx:38` adalah `pricePerMonth * duration` — linier murni. Namun `CheckoutForm.tsx:119` menampilkan badge **"Hemat!"** pada opsi 12 bulan. Tidak ada diskon apa pun di client maupun server. UI menjanjikan penghematan yang tidak pernah diberikan — berisiko sebagai klaim menyesatkan terhadap konsumen.

### 3.9 Tanggal: month-overflow dan pencampuran UTC/lokal

`bookings.service.ts:40-42` (dan duplikatnya `booking/create/route.ts:35-37`):
```ts
const startDate = new Date(startDateString);      // "2026-01-31" → diparse sebagai UTC midnight
const endDate = new Date(startDate);
endDate.setMonth(endDate.getMonth() + duration);  // operasi pada komponen LOKAL
```

Diverifikasi pada TZ `Asia/Jakarta`:
- `startDate = 2026-01-31`, `duration = 1` → `endDate` = **3 Maret 2026**, bukan 28/29 Februari. Februari hanya 28 hari, `setMonth` meluap ke bulan berikutnya.
- Pelanggan membayar 1 bulan namun menerima 31 hari tayang; untuk sewa 3 bulan mulai 31 Januari, `endDate` meluap ke 1 Mei.

Selain itu string `"YYYY-MM-DD"` diparse sebagai **UTC** oleh `new Date()`, sedangkan `setMonth`/`getMonth` beroperasi pada waktu **lokal**. Pada deployment dengan offset UTC negatif, tanggal tersimpan mundur satu hari (bug off-by-one klasik). `date-fns` terdaftar di `package.json:26` namun **tidak pernah diimpor** di `src/` maupun `backend/src/` — dependensi mati sementara aritmetika tanggal ditulis manual dan salah.

### 3.10 Ringkasan verdict money math

| Pertanyaan | Jawaban |
|---|---|
| Total dihitung client & dipercaya server? | **Ya — CRITICAL.** `CheckoutForm.tsx:62` → `bookings.service.ts:53`, tanpa recompute. |
| PPN 11% benar & basisnya tepat? | Rumus benar, basis mengecualikan admin fee, dan **tidak pernah divalidasi/disimpan/dirinci**. |
| Admin fee sebelum atau sesudah pajak? | Sesudah (`CheckoutForm.tsx:40`) — tidak dikenai PPN. |
| DP 60% atas bruto atau neto? | **Bruto**, termasuk PPN dan admin fee. |
| Invoice recompute atau baca nilai tersimpan? | Baca `order.totalPrice` mentah; tidak merinci PPN/admin/`additionalCharges`. |
| Checkout, dashboard, invoice cocok? | **Tidak.** Lihat §3.3 — empat divergensi, termasuk user DP ditagih 100%. |

---

## 4. Booking State Machine — Aktual vs Intended

### 4.1 Inventaris status (literal hasil grep)

| Status | Ditulis di | Dibaca di |
|---|---|---|
| `PENDING_PAYMENT` | `bookings.service.ts:54` | Banyak |
| `DESIGN_RECEIVED` | `payments.service.ts:28`, `bookings.service.ts:109` | Banyak |
| `IN_PRODUCTION` | `payments.service.ts:28`, `OrderActions.tsx:76,80,87` | Banyak |
| `INSTALLATION` | `OrderActions.tsx:93` | Banyak |
| `ACTIVE` | `OrderActions.tsx:99,169` | Banyak |
| `CANCELLED` | `bookings.service.ts:124`, `OrderActions.tsx:125` | Banyak |
| `REVIEW_REFUND` | `bookings.service.ts:160` | `OrderActions.tsx:169` |
| `WAITING_BANK` | `OrderActions.tsx:65,169` | `BookingCard.tsx:187,241` |
| `PROCESS_REFUND` | `bookings.service.ts:192` | `OrderActions.tsx:171` |
| `REFUNDED` | `orders.service.ts:26` (via `newStatus`) | Banyak |
| `PAID_CONFIRMED` | **TIDAK PERNAH** | 7 file (lihat F-012) |
| `EXPIRED` | **TIDAK PERNAH** (hanya state React) | `BookingCard.tsx:33,182` |
| `PENDING_VERIFICATION` | hanya teks email `bookings.service.ts:89` | — |

### 4.2 State machine AKTUAL (sesuai kode)

```
                    [create] bookings.service.ts:54
                             |
                             v
                    PENDING_PAYMENT ----[user cancel]----> CANCELLED
                             |                              (bookings.service.ts:124)
              payments.service.ts:28
              (TANPA AUTH, TANPA CEK NOMINAL)
                             |
              +--------------+--------------+
              |                             |
   designOption=='service'         designOption=='upload'
              |                             |
              v                             v
       IN_PRODUCTION  <---------------  DESIGN_RECEIVED
              |         OrderActions.tsx:80
              | OrderActions.tsx:93
              v
        INSTALLATION
              | OrderActions.tsx:99
              v
           ACTIVE  <------------------+
              |                       |
              | BookingCard.tsx:235   | OrderActions.tsx:169 (tombol "X")
              v                       |
       REVIEW_REFUND ----------------+
              |
              | OrderActions.tsx:169 (tombol "OK")
              v
        WAITING_BANK
              | bookings.service.ts:192 (user isi rekening)
              v
       PROCESS_REFUND
              | orders.service.ts:26
              v
          REFUNDED

  PAID_CONFIRMED  <-- TIDAK TERJANGKAU (yatim; dibaca 7 file, ditulis 0)
  EXPIRED         <-- TIDAK PERNAH PERSISTEN (hanya useState di browser)

  CATATAN: `orders.service.ts:33` menerima newStatus APA PUN tanpa guard.
           CANCELLED -> ACTIVE, REFUNDED -> ACTIVE: DIIZINKAN.
```

### 4.3 State machine INTENDED (sesuai `billboard-system.md` §1A)

```
  Pesan  ->  Bayar  ->  Desain  ->  Cetak  ->  Pasang  ->  Tayang
    |          |           |           |          |           |
PENDING_   PAID_      DESIGN_     IN_         INSTAL-      ACTIVE
PAYMENT    CONFIRMED  RECEIVED    PRODUCTION  LATION
    |          |
    |          +-- (verifikasi manual admin)
    |
    +-- 24 jam lewat --> EXPIRED (otomatis, server-side)

  Jalur refund hanya dari state pasca-bayar, satu arah, tidak dapat dibalik.
```

### 4.4 Selisih (gap)

1. **`PAID_CONFIRMED` hilang dari alur.** `payments.service.ts:28` melompat langsung dari `PENDING_PAYMENT` ke `DESIGN_RECEIVED`/`IN_PRODUCTION`, menghapus tahap "verifikasi pembayaran oleh admin" yang diklaim dokumen. Badge "MENUNGGU VERIFIKASI" (`BookingCard.tsx:183`) mati. Dashboard pendapatan admin (`admin/(dashboard)/page.tsx:33`, `actions.ts:45`) memfilter `PAID_CONFIRMED` → **pendapatan under-reported**.
2. **`EXPIRED` tidak pernah persisten.** Hanya `useState` di browser (`BookingCard.tsx:33`).
3. **Tidak ada guard transisi.** `orders.service.ts:15-33` menulis `newStatus` apa pun. `CANCELLED → ACTIVE` dan `REFUNDED → ACTIVE` diizinkan — order yang sudah direfund bisa diaktifkan kembali.
4. **Refund tidak punya prasyarat status.** `bookings.service.ts:156-164` menerima `step: 'reason'` pada status apa pun, termasuk `CANCELLED` atau `REFUNDED` (lihat F-008).
5. **Timeline 6 tahap tidak selaras dengan status.** `dashboard/order/[id]/page.tsx:57-64` memakai stempel waktu (`paidAt`, `designApprovedAt`, `productionStartedAt`, `installedAt`), sedangkan badge memakai string status. Dua sumber kebenaran yang bisa berbeda.

### 4.5 Chat session status

Literal: `OPEN` (default, `schema.prisma:175`), `AGENT` (`chat/join/route.ts:11`, `chat/reply/route.ts:16`), `CLOSED` (`chat/close/route.ts:9`), `BOT` (`chat-server/index.js`, `ChatWidget.tsx`, `ChatInterface.tsx:?`, `ChatRoom.tsx:?`).
**Masalah:**
1. `'BOT'` dipakai sebagai nilai status di sisi client tetapi **tidak pernah ditulis ke kolom `ChatSession.status`** oleh API mana pun — percabangan UI atasnya mati.
2. Tidak ada transisi `CLOSED → OPEN` (sesi tertutup tidak bisa dibuka ulang).
3. **Status ini tidak mengikat pihak yang paling penting.** `chat-server/index.js:120` — satu-satunya proses yang benar-benar menjalankan bot — tidak pernah membaca `chatSession.status`. Transisi `OPEN → AGENT` yang ditulis `chat/join/route.ts:8-14` dihormati oleh jalur HTTP (`chat/send/route.ts:54-56`) tetapi diabaikan oleh bot socket. State machine ini efektif hanya berlaku untuk separuh sistem (F-044).

### 4.6 Billboard `publishStatus`

Literal: `DRAFT` (default, `schema.prisma:74`), `PUBLISHED`, `ARCHIVED` (`StatusChanger.tsx`).
**Masalah:** `ARCHIVED` dapat di-set admin tetapi tidak pernah difilter di mana pun — billboard ter-arsip tetap diperlakukan seperti `DRAFT`. Lebih serius, `billboards.service.ts:161` berbunyi `return this.prisma.billboard.findMany(); // Hapus filter publishStatus` — endpoint publik `GET /api/billboards` (`billboards.controller.ts:34-38`, `@Public()`) **membocorkan seluruh billboard `DRAFT` dan `ARCHIVED`** beserta harganya. Halaman depan menyaringnya di client (`page.tsx:34-36`), jadi UI terlihat benar sementara API tetap membocorkan (F-017).

---

## 5. Information Architecture

### 5.1 Route yang ADA

| Route | File | Auth | Catatan |
|---|---|---|---|
| `/` | `src/app/page.tsx` | Publik | Peta + filter client-side |
| `/billboard/[slug]` | `src/app/billboard/[slug]/page.tsx` | Publik | Detail; tanpa metadata SEO |
| `/checkout` | `src/app/checkout/page.tsx` | Publik(!) | Tidak memaksa login; redirect ke `/` bila param kurang (`:22-25`) |
| `/login` | `src/app/login/page.tsx` | Publik | — |
| `/register` | `src/app/register/page.tsx` | Publik | POST ke `/api/users/register` backend |
| `/dashboard` | `src/app/dashboard/page.tsx` | User | Redirect `/login` bila anonim |
| `/dashboard/order/[id]` | `.../order/[id]/page.tsx` | **RUSAK** | Tidak cek kepemilikan (F-009) |
| `/dashboard/settings` | `.../settings/page.tsx` | User | — |
| `/invoice/[id]` | `src/app/invoice/[id]/page.tsx` | User | Cek kepemilikan ada tapi melewatkan `SUPER_ADMIN` (F-013) |
| `/admin/login` | `src/app/admin/login/page.tsx` | Publik | Gerbang admin terpisah |
| `/admin` | `src/app/admin/(dashboard)/page.tsx` | Admin | Statistik pendapatan |
| `/admin/billboards`, `/billboards/form` | — | Admin | CRUD inventori |
| `/admin/orders` | — | Admin | Daftar pesanan |
| `/admin/orders/[id]` | `admin/(dashboard)/orders/[id]/page.tsx:22` | **RUSAK** | Memanggil `/api/admin/orders/detail` yang tidak ada → terhenti di `Loading...` (F-053) |
| `/admin/users`, `/users/[userId]` | — | Admin | Menampilkan KTP/NPWP (F-020) |
| `/admin/live-chat` | — | Admin/CS | Polling, bukan socket |
| `/admin/settings` | — | SUPER_ADMIN | API key dinamis (tidak terpakai) |

### 5.2 Route yang HILANG

| Route hilang | Dampak | Prioritas |
|---|---|---|
| `/forgot-password` + `/reset-password` | User registrasi manual **tidak bisa memulihkan akun selamanya**. Kolom `otpCode`/`otpExpires` menganggur. | **HIGH** |
| `/verify-email` | `isVerified` tidak pernah ditegakkan; email palsu bisa memesan. | HIGH |
| `/terms` (Syarat & Ketentuan) | Wajib untuk transaksi berbayar; kebijakan pembatalan/refund 90% hanya muncul sebagai teks kecil di modal (`BookingCard.tsx:375`). | **HIGH** |
| `/privacy` (Kebijakan Privasi) | Mengumpulkan KTP & NPWP tanpa pemberitahuan privasi. | **HIGH** |
| `/billboards` (daftar/browse non-peta) | Satu-satunya penemuan produk adalah peta. Pengguna mobile, pengguna low-bandwidth, dan **crawler mesin pencari** tidak dapat menelusuri inventori. | **HIGH** |
| `/search` (hasil pencarian ber-URL) | Pencarian tidak dapat dibagikan/di-bookmark/di-index. | MEDIUM |
| `not-found.tsx` (404) | URL salah menampilkan halaman default Next.js, keluar dari desain. | MEDIUM |
| `error.tsx` / `global-error.tsx` | Error runtime menampilkan layar error Next.js mentah. | MEDIUM |
| `/order/confirmation` | Setelah checkout hanya ada `alert()` lalu redirect (`CheckoutForm.tsx:80-81`). Tidak ada halaman konfirmasi/ringkasan pesanan. | MEDIUM |
| `/about`, `/contact`, `/faq` | Nol sinyal kepercayaan. `billboard-system.md` §4 bahkan merencanakan form kontak — tidak pernah dibuat. | MEDIUM |
| `/pricing` | Harga hanya terlihat setelah membuka detail satu per satu. | LOW |
| `sitemap.ts`, `robots.ts` | Tidak ada panduan crawler. | MEDIUM |

### 5.3 SEO & metadata

**Nol.** Grep `export const metadata|generateMetadata|openGraph` di seluruh `src/` → **0 hasil**. `src/app/layout.tsx:1-16` tidak mengekspor `metadata`; tidak ada `<title>` maupun `<meta name="description">`. Tidak ada `generateMetadata` di `billboard/[slug]` — setiap billboard berbagi judul kosong yang sama saat dibagikan ke WhatsApp/Facebook. Tidak ada JSON-LD (`Product`/`Offer`/`LocalBusiness`). Klaim "SLUG URL (SEO Friendly)" di `info.txt` §1 secara praktis kosong: slug rapi tanpa metadata tidak menghasilkan peringkat.

### 5.4 Kecukupan informasi per halaman publik

| Halaman | Kekurangan |
|---|---|
| `/` (peta) | Tidak ada penjelasan cara kerja sewa, tanpa rentang harga, tanpa proposisi nilai, tanpa footer, tanpa kontak. |
| `/billboard/[slug]` | Harga dibulatkan menyesatkan menjadi "Jt" (F-015); tidak ada lead time produksi, tanpa kebijakan pembatalan, tanpa spesifikasi materi (padahal checkout menuntut "PDF/TIFF Siap Cetak"), tombol "Hubungi Sales (WA)" **tanpa handler** (`BillboardDetailClient.tsx:188`) — tombol mati. |
| `/checkout` | Empat field data penyewa tidak ter-bind & tidak terkirim (F-021); tidak ada tautan Syarat & Ketentuan; tidak ada checkbox persetujuan; "Sisa 40% dibayar H-3 Tayang" (`:214`) tidak pernah ditegakkan sistem. |

---

## 6. Error & Edge-Case UX

| Skenario | Hasil aktual | Bukti | Penilaian |
|---|---|---|---|
| Slug billboard tidak ditemukan | Pesan "Billboard Tidak Ditemukan" + tautan kembali | `billboard/[slug]/page.tsx:58-65` | **Baik** |
| Backend mati saat buka detail | `fetch` gagal → `null` → tampil "Billboard Tidak Ditemukan" | `billboard/[slug]/page.tsx:22-25` | Menyesatkan — masalah server disajikan sebagai produk tidak ada |
| Backend mati saat buka homepage | `catch` → daftar kosong; peta tanpa penanda, tanpa pesan error | `page.tsx:17` | **Buruk** — terlihat seperti tidak ada inventori |
| Booking ID bukan milik user (`/dashboard/order/[id]`) | **Order tampil penuh** | `dashboard/order/[id]/page.tsx:23` | **CRITICAL IDOR** (F-009) |
| Booking ID bukan milik user (`/invoice/[id]`) | Pesan penolakan (kecuali `SUPER_ADMIN` diblokir keliru) | `invoice/[id]/page.tsx:30` | Sebagian baik (F-013) |
| Sesi habis saat checkout | Backend memakai user placeholder → **booking tetap dibuat** atas nama user palsu | `bookings.controller.ts:16` | **CRITICAL** |
| Checkout tanpa login | Halaman tetap terbuka penuh; gagal hanya saat submit | `checkout/page.tsx:12-35` | Buruk — usaha user terbuang di akhir alur |
| Upload gagal | `alert('Upload Gagal: ' + data.message)` | `BookingCard.tsx:87` | Fungsional, `alert()` kasar |
| Upload > 10MB | `alert('File terlalu besar! Maksimal 10MB.')` | `BookingCard.tsx:73` | Baik |
| Notifikasi pembayaran tak pernah tiba | Order menggantung `PENDING_PAYMENT` selamanya; timer "EXPIRED" tapi tidak ada yang kedaluwarsa; admin tidak diberi tahu | `BookingCard.tsx:33` | **Buruk** (F-007) |
| Chat server mati | `catch(e) {}` kosong — tidak ada umpan balik apa pun | `BookingCard.tsx:130` | **Buruk** — gagal senyap |
| Pengunjung membuka chat widget | Widget terbuka, pesan terkirim, **tidak ada balasan selamanya** — socket menyambung ke port tanpa server | `ChatWidget.tsx:20` | **Buruk** — tampak seperti diabaikan, bukan error; tidak ada indikator koneksi gagal (F-043) |
| Error server saat booking | `alert("Terjadi kesalahan sistem.")` | `CheckoutForm.tsx:88` | Minimal |
| Gagal kirim email (SMTP tidak terkonfigurasi di backend) | `await` melempar → tertangkap `catch` → booking dibatalkan sebagai "Error Server" meski **sudah tersimpan** | `bookings.service.ts:95-98` | **Buruk** — user melihat kegagalan padahal order berhasil dibuat (F-014) |

---

## 7. Trust & Compliance (Data Pribadi)

1. **Tidak ada halaman Kebijakan Privasi maupun Syarat & Ketentuan** sementara sistem mengumpulkan **KTP**, **NPWP**, **alamat KTP**, **alamat kantor**, dan **nomor rekening bank**. Untuk platform transaksi di Indonesia yang memproses data identitas, ketiadaan pemberitahuan privasi adalah masalah kepatuhan (UU PDP).
2. **Penyimpanan plaintext.** `schema.prisma:38-41` mendefinisikan `ktp`, `npwp`, `ktpAddress`, `officeAddress` sebagai `String?` biasa — tanpa enkripsi, tanpa masking, tanpa kolom terpisah dengan akses terbatas. Rekening bank (`schema.prisma:129-130`) juga plaintext.
3. **Akses baca terlalu luas.** `admin/(dashboard)/users/[userId]/page.tsx:43-45` mengirim KTP/NPWP/alamat ke client, lalu `UserProfileForm.tsx:117-120` merendernya sebagai input yang dapat diedit. Semua role admin — termasuk `CS` dan `ADMIN` biasa, bukan hanya `SUPER_ADMIN` — dapat membaca dan mengubah nomor identitas pelanggan. Tidak ada audit log untuk akses data pribadi (audit trail hanya ada untuk billboard).
4. **Pengumpulan tanpa tujuan.** Field NPWP di checkout (`CheckoutForm.tsx:166`) meminta nomor pajak lalu **membuangnya** — data diminta tanpa pernah dipakai, melanggar prinsip minimalisasi data.
5. **Kebijakan refund tidak dipublikasikan.** Potongan 10% hanya muncul sebagai teks kecil dalam modal setelah user menekan batal (`BookingCard.tsx:375`), bukan sebagai syarat yang disetujui sebelum membayar.
6. **Data tamu chat terekspos tanpa autentikasi.** `src/app/api/admin/chat/session-detail/route.ts:4` tidak memanggil `getServerSession` — nama, email, dan nomor telepon setiap tamu chat dapat diambil siapa pun yang menebak ID sesi. Seluruh API chat admin lain juga terbuka (F-046).
7. **Kredensial pihak ketiga dapat dibaca publik.** `src/app/api/admin/settings/route.ts:7-13` menyajikan `geminiApiKey` dan `googleMapsApiKey` dalam plaintext tanpa auth (F-052). Ini bukan data pribadi pelanggan, tetapi merupakan kebocoran rahasia dengan konsekuensi finansial langsung.

---

## 8. Findings Table

Severity: **S1** kritis (uang/keamanan, perbaiki sebelum transaksi nyata) · **S2** tinggi · **S3** sedang · **S4** rendah.

| ID | Sev | Judul | File:line | Dampak | Perbaikan |
|---|---|---|---|---|---|
| F-001 | **S1** | Harga dihitung client, dipercaya server (price tampering) | `CheckoutForm.tsx:62` → `bookings.service.ts:53` | Penyerang memesan billboard Rp 300jt seharga Rp 1 via `curl` | Hitung ulang seluruh harga di server dari `billboard.price`; abaikan `totalPrice`/`dpAmount` dari client sepenuhnya |
| F-002 | **S1** | Backend NestJS tanpa autentikasi; user hardcoded | `bookings.controller.ts:16` | Semua booking tercatat atas `'clerk-user-id'`; siapa pun dapat memesan | Terapkan `JwtAuthGuard` global; ambil user dari token terverifikasi |
| F-003 | **S1** | Refund dihitung dari bruto → melebihi uang diterima | `bookings.service.ts:187` | Rugi **Rp 10.005.000** per transaksi DP (§3.6) | Refund = `Σ pembayaran diterima × 0.9`; tambah tabel `Payment` |
| F-004 | **S1** | `orders`/`payments`/`uploads`/`users` controller tanpa guard | `orders.controller.ts:10`, `payments.controller.ts:25`, `uploads.controller.ts:38`, `users.controller.ts:22` | Siapa pun bisa menandai order lunas atau mengaktifkannya tanpa bayar | Pasang guard + pemeriksaan role; verifikasi tanda tangan webhook pembayaran |
| F-005 | **S1** | User DP ditagih 100% & diemail "LUNAS" | `BookingCard.tsx:116`, `payments.service.ts:44,46` | Salah tagih; user DP membayar penuh | Tagih `dpAmount` bila `dpAmount > 0`; bedakan email DP vs lunas |
| F-006 | **S1** | Double-booking tidak dicegah | `bookings.service.ts:36-57` | Dua user dapat menyewa billboard & rentang tanggal sama | Query tumpang-tindih (`startDate < newEnd AND endDate > newStart`) dalam transaksi + unique constraint |
| F-007 | **S1** | Timer 24 jam kosmetik; tidak ada job kedaluwarsa | `BookingCard.tsx:29-40` | Inventori terkunci selamanya oleh order tak dibayar | Tambah scheduled job (`@nestjs/schedule`) yang men-set `EXPIRED`; simpan `expiresAt` |
| F-008 | **S1** | Refund tanpa guard status | `bookings.service.ts:156-164` | Refund dapat diajukan pada order `CANCELLED`/`REFUNDED` → refund ganda | Izinkan hanya dari status pasca-bayar; tolak state terminal |
| F-009 | **S1** | IDOR: order siapa pun dapat dilihat | `dashboard/order/[id]/page.tsx:23` | Setiap user login melihat pesanan, harga, alamat user lain | Tambah `if (order.userId !== session.user.id) return notFound()` |
| F-010 | **S2** | Badge "Hemat!" tanpa diskon | `CheckoutForm.tsx:38,119` | Klaim menyesatkan konsumen | Implementasikan tier diskon di server, atau hapus badge |
| F-011 | **S2** | Transisi status tanpa guard | `orders.service.ts:15-33` | `CANCELLED → ACTIVE`, `REFUNDED → ACTIVE` diizinkan | Definisikan peta transisi legal; tolak selainnya |
| F-012 | **S2** | `PAID_CONFIRMED` tidak terjangkau; pendapatan salah hitung | `payments.service.ts:28`; dibaca `admin/(dashboard)/page.tsx:33`, `actions.ts:45` | Dashboard pendapatan admin under-report; tahap verifikasi hilang | Set `PAID_CONFIRMED` saat notifikasi bayar; admin yang memajukan ke tahap berikutnya |
| F-013 | **S2** | Cek akses invoice melewatkan `SUPER_ADMIN` | `invoice/[id]/page.tsx:30` | `SUPER_ADMIN` diblokir dari invoice | Ubah ke `!['ADMIN','SUPER_ADMIN'].includes(session.user.role)` |
| F-014 | **S2** | Email backend rusak; kegagalan membatalkan respons booking | `backend/.env` (hanya `DATABASE_URL`), `bookings.service.ts:95-98`, `mail.service.ts:78` | Semua email backend gagal; link invoice jadi `undefined/invoice/…`; user melihat "Error Server" walau order tersimpan | Tambah env SMTP/`ADMIN_EMAIL`/`NEXTAUTH_URL`; kirim email async di luar `try` transaksi |
| F-015 | **S2** | Harga dibulatkan menyesatkan di detail | `BillboardDetailClient.tsx:41,160` | Rp 8.500.000 ditampilkan "**9 Jt**"; Rp 500.000 jadi "1 Jt" | Tampilkan rupiah penuh terformat, atau `toFixed(1)` |
| F-016 | **S2** | Upload tanpa auth; nama file dapat ditimpa | `uploads.controller.ts:38-51` | Siapa pun menimpa desain order mana pun via `orderId` tebakan | Wajibkan auth + verifikasi kepemilikan; nama file acak |
| F-017 | **S2** | API publik membocorkan billboard `DRAFT`/`ARCHIVED` | `billboards.service.ts:161`, `billboards.controller.ts:34` | Inventori & harga belum rilis terekspos | Filter `publishStatus: 'PUBLISHED'` di server |
| F-018 | **S2** | Nol metadata SEO di seluruh aplikasi | `src/app/layout.tsx:1-16`; 0 hasil grep `metadata` | Tidak terindeks; preview share kosong; klaim "SEO Friendly" gagal | Tambah `metadata` root + `generateMetadata` di `[slug]`, `sitemap.ts`, `robots.ts`, JSON-LD |
| F-019 | **S2** | Lupa password tidak ada; `otpCode` menganggur | `schema.prisma:48-49` (0 referensi) | User registrasi manual tidak bisa memulihkan akun | Bangun alur OTP/token reset via email |
| F-020 | **S2** | KTP/NPWP plaintext, terbaca semua admin, tanpa halaman privasi | `schema.prisma:38-41`, `users/[userId]/page.tsx:43-45`, `UserProfileForm.tsx:117-120` | Risiko kepatuhan UU PDP | Enkripsi/mask saat diam; batasi ke `SUPER_ADMIN`; audit log akses; terbitkan Kebijakan Privasi & S&K |
| F-021 | **S2** | Data penyewa di checkout tidak ter-bind & tidak terkirim | `CheckoutForm.tsx:144,148,153,166` vs payload `:59-67` | Nama, WhatsApp, email, **NPWP** yang diketik user hilang total | Bind ke state, validasi, kirim, simpan; tambah kolom NPWP pada `Booking` |
| F-022 | **S2** | `endDate` meluap batas bulan | `bookings.service.ts:42`, `booking/create/route.ts:37` | 31 Jan + 1 bulan → **3 Maret**; durasi sewa salah | Gunakan `addMonths` dari `date-fns` (sudah terpasang) + clamp akhir bulan |
| F-023 | **S2** | Uang disimpan sebagai `Float` | `schema.prisma:112,113,131,154` | Tampil "Rp 8.252.221,548"; galat pembulatan pada instruksi transfer | Ubah ke `Int` (rupiah bulat) atau `Decimal`; bulatkan hasil pajak |
| F-024 | **S2** | PPN & admin fee tidak disimpan; invoice bukan faktur sah | `schema.prisma:112-113`, `invoice/[id]/page.tsx:100-115` | Tidak dapat direkonsiliasi; kewajiban PPN tidak dapat diaudit | Tambah `basePrice`, `taxAmount`, `adminFee`; rinci di invoice |
| F-025 | **S2** | Blok total invoice tidak koheren | `invoice/[id]/page.tsx:102,108,113` | "Subtotal 33.350.000 − DP 20.010.000 = Total 33.350.000" | Rinci: harga pokok, PPN, admin, biaya tambahan, dibayar, **sisa tagihan** |
| F-026 | **S2** | `additionalCharges` tidak pernah muncul di invoice user | `invoice/[id]/page.tsx:72-95` vs `TransactionClient.tsx:191` | User ditagih biaya yang tidak pernah terlihat | Sertakan `additionalCharges` di query & render invoice |
| F-027 | **S3** | Halaman `/checkout` tidak memaksa login | `checkout/page.tsx:12-35` | Usaha user terbuang; gagal di akhir alur | Redirect ke `/login?callbackUrl=` di awal |
| F-028 | **S3** | Tidak ada `not-found.tsx` / `error.tsx` | `src/app/` | Layar error Next.js mentah | Tambah halaman 404 & error bermerek |
| F-029 | **S3** | API key dinamis tidak terpakai (stub hardcoded) | `billboard/[slug]/page.tsx:29-38` | Fitur unggulan yang diklaim tidak berfungsi | Ambil `SystemSetting` sungguhan dari backend |
| F-030 | **S3** | Arsitektur chat terbelah: `chat-server/` terpisah, belum dikonsolidasi | `backend/src/chat/chat.module.ts:7-12`, `backend/package.json`, `progres-22-12-2025.md:15` | Tiga proses harus hidup bersamaan; ketidakcocokan port menyebabkan F-043; key Gemini terduplikasi di env dan DB | Selesaikan konsolidasi socket + bot ke NestJS sesuai rencana, atau perbarui dokumen agar jujur menyatakan chat-server tetap terpisah |
| F-031 | **S3** | Tidak ada halaman daftar/browse billboard | — | Discovery hanya lewat peta; crawler & user mobile tersendat | Bangun `/billboards` dengan filter + paginasi SSR |
| F-032 | **S3** | `isVerified` tidak pernah ditegakkan | `src/lib/auth.ts:32-53` | Email palsu dapat memesan | Cek `isVerified` saat login kredensial; kirim email verifikasi |
| F-033 | **S3** | Status `ARCHIVED` & `'BOT'` yatim | `StatusChanger.tsx`, `ChatWidget.tsx` | Cabang UI mati; arsip tidak berefek | Filter `ARCHIVED`; hapus atau implementasikan `'BOT'` |
| F-034 | **S3** | Kegagalan chat tertelan senyap | `BookingCard.tsx:130` (`catch(e) {}`) | User tidak tahu aksi gagal | Tampilkan pesan error |
| F-035 | **S3** | Tombol "Hubungi Sales (WA)" mati | `BillboardDetailClient.tsx:188` | CTA utama tidak melakukan apa pun | Tautkan ke `wa.me` |
| F-036 | **S3** | Durasi dari halaman detail selalu `1` | `BillboardDetailClient.tsx:177` | Pilihan user tidak terbawa | Teruskan durasi terpilih |
| F-037 | **S3** | Tidak ada halaman konfirmasi pesanan | `CheckoutForm.tsx:80-81` | Konfirmasi via `alert()`; tanpa ringkasan/instruksi bayar | Buat `/order/[id]/confirmation` |
| F-038 | **S3** | Duplikasi logika: route Next.js lama & NestJS hidup berdampingan | `src/app/api/booking/*` vs `backend/src/bookings/*` | Dua sumber kebenaran; perbaikan mudah terlewat di satu sisi | Hapus route Next.js yang sudah dimigrasi (sesuai `RANGKUMAN_MIGRASI.md`) |
| F-039 | **S4** | Secret JWT & konfigurasi hardcoded | `backend/src/auth/jwt.strategy.ts:39`, `auth.module.ts:66` | Token dapat dipalsukan bila dipakai di produksi | Pindahkan ke env via `ConfigService` |
| F-040 | **S4** | Legenda kalender kosong | `AvailabilityCalendar.tsx:108-110` | User tidak tahu arti warna | Isi legenda |
| F-041 | **S4** | `date-fns` terpasang tapi tidak pernah dipakai | `package.json:26` | Dependensi mati sementara logika tanggal ditulis manual & salah | Pakai untuk memperbaiki F-022 |
| F-042 | **S4** | `README.md` masih template Create Next App | `README.md` | Tidak ada panduan setup untuk 3 layanan (frontend/backend/chat) | Tulis README sesungguhnya |
| F-043 | **S2** | Chatbot publik mati: widget konek ke port yang salah | `ChatWidget.tsx:20` (`:4001`) vs `chat-server/index.js:20` (`3001`) | Fitur AI unggulan **tidak pernah merespons** pengunjung; admin inbox (`CS_InboxLayout.tsx:177`) memakai port benar sehingga bug tidak terlihat dari sisi admin | Arahkan widget ke port chat-server via env, atau selesaikan konsolidasi socket ke NestJS |
| F-044 | **S2** | Bot mengabaikan human take-over | `chat-server/index.js:120` (tidak pernah membaca `chatSession.status`) | Setelah admin "Join Chat", bot tetap membalas — bot dan manusia menjawab bersamaan di depan pelanggan | Baca `chatSession.status` sebelum `getGeminiResponse`; lewati bila `'AGENT'`/`'CLOSED'` |
| F-045 | **S3** | Dua komponen chat admin mati & memanggil route yang tidak ada | `ChatInterface.tsx` (0 import, `:44`), `ChatRoom.tsx` (0 import, `:21,43`) → `/api/chat/history` tidak ada | Magic Reply & notifikasi suara jadi tidak terjangkau; kode membingungkan maintainer | Hapus kedua komponen, atau pindahkan Magic Reply + suara ke `CS_InboxLayout` yang benar-benar dirender |
| F-046 | **S1** | Seluruh API chat admin tanpa autentikasi | `chat/join/route.ts:4`, `close/route.ts:4`, `reply/route.ts:5`, `send/route.ts:5`, `session-detail/route.ts:4`, `suggest/route.ts:5` | Siapa pun dapat membaca nama/email/telepon tamu, menyuntik pesan ber-label `ADMIN`, menutup sesi, dan menguras kuota Gemini | Tambahkan `getServerSession` + cek role seperti pada `admin/billboards/update/route.ts:8-12` |
| F-047 | **S3** | `quick-update` mengubah status tanpa mencatat history | `admin/billboards/quick-update/route.ts:30-36`; `billboards.service.ts:179` | Audit trail berlubang — perubahan `status`/`publishStatus` tak terlacak | Tulis baris `billboardHistory` pada semua jalur mutasi |
| F-048 | **S3** | Rollback parsial, tidak diaudit, dan menolak `SUPER_ADMIN` | `admin/billboards/rollback/route.ts:9,25,32-38` | Rollback membuat data campuran (spesifikasi/galeri versi baru + harga versi lama); tidak dapat di-undo; role tertinggi terkunci | Restore seluruh field snapshot; catat history sebelum rollback; izinkan `ADMIN` dan `SUPER_ADMIN` |
| F-049 | **S3** | Filter tanggal homepage kosmetik | `SearchFilter.tsx:24` vs `page.tsx:31-32` | User menyaring tanggal lalu melihat billboard yang tidak tersedia di tanggal itu | Konsumsi `date`; sisihkan billboard dengan booking tumpang-tindih |
| F-050 | **S1** | Open SSRF + XSS same-origin pada `/api/proxy` | `src/app/api/proxy/route.ts:5,10,19,28-32` | `?url=` tanpa allowlist, respons **dipantulkan** ke pemanggil → baca metadata cloud (`169.254.169.254`), backend `localhost:4001`, dan seluruh rentang RFC1918. Disajikan sebagai `text/html` dari origin sendiri → HTML penyerang berjalan di domain Anda | Hapus route ini. Bila benar-benar perlu: allowlist host eksplisit, blokir IP privat/link-local, wajibkan auth, sajikan sebagai `text/plain` |
| F-051 | **S1** | Proxy catch-all meneruskan permintaan tanpa kredensial → bypass auth | `src/app/api/proxy/[...path]/route.ts:3-5,20-28,50-56` | Komentarnya sendiri mengakui "unauthenticated... Do not use this in production". Tidak meneruskan `Authorization`/`Cookie` (hanya `Content-Type`), semua method diekspor termasuk `DELETE`. Digabung dengan `@Public()` backend menghasilkan `DELETE /api/proxy/billboards/:id` — **penghapusan billboard tanpa login** | Hapus route, atau teruskan header auth dan pasang guard di kedua sisi |
| F-052 | **S2** | `GET /api/admin/settings` tanpa auth membocorkan API key plaintext | `src/app/api/admin/settings/route.ts:7-13` | Siapa pun membaca `geminiApiKey` dan `googleMapsApiKey`; tagihan pihak ketiga dapat disalahgunakan. (POST sudah terjaga di `:16-20`) | Terapkan gate `SUPER_ADMIN` yang sama pada GET; jangan pernah kirim key ke client |
| F-053 | **S2** | Halaman detail order admin rusak permanen | `admin/(dashboard)/orders/[id]/page.tsx:22,39` | Memanggil `/api/admin/orders/detail?id=...` yang **tidak ada** → layar terhenti di `Loading...`. Admin tidak bisa membuka detail pesanan mana pun | Buat route tersebut, atau alihkan ke query server-side langsung |
| F-054 | **S4** | SMTP debug logging aktif | `src/lib/mail.ts:11-12` (`logger: true, debug: true`) | Kredensial & isi email terekspos di log produksi | Matikan di luar development |

---

## 9. Roadmap Prioritas

### Fase 0 — Penghenti transaksi (kerjakan sebelum menerima uang sungguhan)
Tidak boleh ada pembayaran nyata sebelum blok ini selesai.
1. **F-002, F-004** — Pasang autentikasi di seluruh backend NestJS; hapus user placeholder.
2. **F-001** — Hitung ulang harga di server; client hanya mengirim `billboardId`, `duration`, `startDate`, `paymentType`.
3. **F-003, F-005** — Perbaiki matematika refund & DP; tambah tabel `Payment` sebagai sumber kebenaran uang yang benar-benar diterima.
4. **F-006** — Cegah double-booking dengan pengecekan tumpang-tindih transaksional + constraint DB.
5. **F-009, F-013** — Tutup IDOR; audit seluruh cek kepemilikan.
6. **F-008, F-011** — Terapkan guard state machine.
7. **F-050, F-051** — Hapus kedua route `/api/proxy`. Keduanya adalah jalan pintas tanpa autentikasi yang melewati setiap kontrol akses lain; `[...path]/route.ts:3-5` bahkan memperingatkan hal ini pada dirinya sendiri.
8. **F-046, F-052** — Pasang autentikasi pada seluruh API chat admin dan pada `GET /api/admin/settings` yang membocorkan API key plaintext.

### Fase 1 — Integritas uang & data
7. **F-023, F-024** — Migrasi uang ke `Int`/`Decimal`; simpan `basePrice`/`taxAmount`/`adminFee` terpisah.
8. **F-025, F-026** — Tulis ulang invoice: rincian lengkap, biaya tambahan, sisa tagihan. Jadikan faktur pajak sah.
9. **F-022, F-041** — Perbaiki aritmetika tanggal dengan `date-fns`; normalisasi timezone.
10. **F-007** — Job kedaluwarsa server-side + kolom `expiresAt`.
11. **F-012** — Kembalikan `PAID_CONFIRMED`; perbaiki pelaporan pendapatan.
12. **F-014** — Perbaiki konfigurasi email backend; pindahkan pengiriman ke luar jalur transaksi.

### Fase 2 — Kepercayaan, kepatuhan, akun
13. **F-020** — Enkripsi/mask KTP & NPWP; batasi ke `SUPER_ADMIN`; audit log akses.
14. Terbitkan `/terms`, `/privacy`, `/contact`, `/faq`, `/about`.
15. **F-019, F-032** — Alur lupa password & verifikasi email.
16. **F-021** — Bind & simpan data penyewa/NPWP di checkout.
17. **F-010** — Implementasikan diskon durasi sungguhan, atau hapus klaim "Hemat!".

### Fase 3 — Information architecture & discovery
18. **F-031** — Halaman `/billboards` (daftar + filter + paginasi SSR).
19. **F-018** — Lapisan SEO penuh: `metadata`, `generateMetadata`, `sitemap.ts`, `robots.ts`, Open Graph, JSON-LD.
20. **F-027, F-028, F-037** — Gate login checkout, halaman 404/error, halaman konfirmasi pesanan.
21. **F-015, F-035, F-036, F-040** — Perbaiki tampilan harga, CTA mati, pass-through durasi, legenda kalender.

### Fase 4 — Kebersihan arsitektur
22. **F-038** — Hapus route API Next.js yang sudah dimigrasi; satu sumber kebenaran.
23. **F-029, F-030, F-033** — Aktifkan API key dinamis sungguhan; konsolidasikan chat ke Socket.IO di backend; bersihkan status yatim.
24. **F-043, F-044** — Perbaiki port widget chat dan buat bot menghormati status `AGENT`. Keduanya kecil tetapi memulihkan fitur AI yang saat ini mati sepenuhnya.
25. **F-045, F-047, F-048, F-053** — Hapus komponen chat mati; tutup lubang audit trail; perbaiki rollback parsial; buat route detail order admin yang hilang.
26. **F-039, F-042, F-054** — Pindahkan secret ke env; tulis README sesungguhnya; matikan SMTP debug logging.

---

## 10. Catatan tentang Akurasi Dokumentasi

`info.txt` menandai proyek sebagai **"Prototype V1 (Completed)"** dan `billboard-system.md` mengklaim sistem "sudah berfungsi secara **End-to-End**". Audit ini memeriksa ~46 klaim fitur: **9 IMPLEMENTED**, **16 PARTIAL**, **3 STUB**, **10 BROKEN**, dan **8 MISSING**.

Dua koreksi spesifik terhadap dokumen progres:
- `progres-22-12-2025.md:15` menyatakan `chat-server` sudah "dihilangkan" dan dikonsolidasi ke backend. **Tidak dilakukan.** `backend/src/chat/` hanya berisi satu endpoint HTTP (`chat.controller.ts:9-12`); `backend/package.json` tidak memuat `socket.io` maupun `@google/generative-ai`. Arsitektur masih terbelah, dan pembelahan itulah yang mematikan chatbot publik (F-043).
- `RANGKUMAN_MIGRASI.md` mengklaim "Validasi DTO ... meningkatkan keamanan". DTO backend adalah kelas biasa tanpa dekorator `class-validator` (mis. `backend/src/orders/dto/update-order.dto.ts:3`), dan `backend/src/main.ts` tidak pernah mendaftarkan `ValidationPipe`. Tidak ada validasi yang berjalan.

Yang paling perlu dikoreksi secara keseluruhan: dokumen progres konsisten menempatkan Cloud Storage dan Payment Gateway sebagai satu-satunya penghalang produksi. Audit ini menunjukkan penghalang sesungguhnya jauh lebih mendasar — **backend tanpa autentikasi, dua route proxy yang membatalkan seluruh kontrol akses, harga yang dapat dimanipulasi client, dan perhitungan refund yang mengembalikan lebih banyak uang daripada yang diterima**. Tidak satu pun disebutkan di dokumen mana pun. Disarankan memutakhirkan dokumen progres sebelum perencanaan sprint berikutnya.
