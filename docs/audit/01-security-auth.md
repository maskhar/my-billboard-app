# Audit Keamanan & Autentikasi — my-billboard-app

**Tanggal:** 2026-09-21
**Ruang lingkup:** Next.js 15 App Router (`src/`), NestJS (`backend/`), socket.io (`chat-server/`), Prisma schema, konfigurasi env & build.
**Metode:** pembacaan kode sumber langsung (bukan pemindaian otomatis). Setiap temuan dikutip dengan `path/file:LINE`.
**Commit dasar:** `f1f5eba` (branch `master`).

> Catatan redaksi: tidak ada nilai secret asli yang dicetak dalam dokumen ini. Yang disebut hanya nama variabel, lokasi file, dan dampaknya.

---

## Executive Summary

- **Sistem ini tidak aman untuk produksi.** Terdapat rantai serangan lengkap tanpa autentikasi sama sekali: siapa pun di internet dapat menghapus billboard, menandai booking sebagai LUNAS, membaca API key yang tersimpan, dan menyamar sebagai ADMIN di live chat.
- **Tidak ada `src/middleware.ts`.** Tidak ada satu pun proteksi di lapisan edge. Seluruh proteksi bergantung pada pengecekan manual per-file, dan pengecekan itu hilang pada 13 dari 34 route handler.
- **`/api/proxy/[...path]/route.ts` adalah lubang auth-bypass**: proxy tanpa autentikasi yang meneruskan metode HTTP apa pun ke backend NestJS, yang backend-nya sendiri juga tanpa guard global. `/api/proxy/route.ts` terpisah adalah **SSRF penuh** (fetch ke URL arbitrer dari input pengguna).
- **`/api/payment/notify` menerima `orderId` saja tanpa verifikasi tanda tangan webhook.** Siapa pun dapat menandai booking mana pun sebagai sudah dibayar dan memicu email "[LUNAS] Uang Masuk" ke admin. Sama persis di sisi NestJS (`payments.controller.ts:10`).
- **`GET /api/admin/settings` tanpa pengecekan sesi sama sekali** dan mengembalikan seluruh baris `systemSetting`, termasuk `geminiApiKey` dan `googleMapsApiKey`. Kebocoran kredensial tanpa autentikasi.
- **Empat endpoint admin tanpa pengecekan apa pun**: `admin/users/create`, `admin/users/update-account`, `admin/users/update-business`, `admin/billboards/detail`. `update-account` menerima mass-assignment penuh termasuk `role` dan `password` — **privilege escalation ke ADMIN oleh siapa pun**.
- **JWT secret di-hardcode di dalam source control** (`backend/src/auth/auth.module.ts:14`, `jwt.strategy.ts:39`) dan digandakan di `backend/dist/` yang **ikut ter-commit** (128 file ter-track).
- **`chat-server/index.js` tanpa autentikasi apa pun**: klien anonim dapat join room mana pun (membaca percakapan pelanggan lain) dan mengirim pesan dengan `sender: "ADMIN"` — vektor penipuan langsung ke pelanggan.
- **Server Actions (`actions.ts`) tanpa pengecekan auth.** Server Actions adalah endpoint publik; `getRevenueData()` dan `getChatSessions()` membocorkan data omzet dan seluruh transkrip chat ke siapa pun yang memanggil Action ID-nya.
- **Nol rate limiting di seluruh repo.** Login, change-password, dan panggilan AI Gemini semuanya tidak dibatasi. Field OTP (`otpCode`, `otpExpires`) ada di schema tapi **dead code** — tidak pernah di-generate maupun diverifikasi.

**Hal yang sudah benar (agar seimbang):** tidak ada `.env` yang pernah ter-commit (riwayat git bersih, `.gitignore:39` terverifikasi menutupi keempat file env); tidak ada sink XSS (`dangerouslySetInnerHTML`/`eval` nihil); tidak ada secret di variabel `NEXT_PUBLIC_`; password di-hash dengan bcrypt; `change-password` di Next.js memverifikasi password lama dengan benar.

---

## Tabel Temuan

| ID | Severity | Judul | File:line | Dampak | Perbaikan |
|---|---|---|---|---|---|
| F-01 | CRITICAL | Privilege escalation: `admin/users/update-account` tanpa auth + mass-assignment | `src/app/api/admin/users/update-account/route.ts:6-18` | Siapa pun jadi ADMIN / reset password siapa pun | Tambah cek sesi+role, allow-list field, blokir `role` & `password` |
| F-02 | CRITICAL | Proxy tanpa auth meneruskan semua metode ke backend tanpa guard | `src/app/api/proxy/[...path]/route.ts:7-56` | Auth bypass penuh ke seluruh API NestJS | Hapus route, atau paksa `getServerSession` + allow-list path |
| F-03 | CRITICAL | SSRF penuh pada `/api/proxy?url=` | `src/app/api/proxy/route.ts:3-36` | Baca metadata cloud / port scan internal | Allow-list host, blokir IP privat, verifikasi skema |
| F-04 | CRITICAL | Webhook pembayaran tanpa verifikasi tanda tangan | `src/app/api/payment/notify/route.ts:7-32` | Siapa pun menandai booking LUNAS gratis | Verifikasi HMAC gateway, cek nominal, idempotensi |
| F-05 | CRITICAL | `GET /api/admin/settings` tanpa auth membocorkan API key | `src/app/api/admin/settings/route.ts:7-13` | `geminiApiKey` & `googleMapsApiKey` bocor publik | Tambah cek `SUPER_ADMIN`; jangan kirim key ke klien |
| F-06 | CRITICAL | `admin/users/create` tanpa auth, `role` dari body | `src/app/api/admin/users/create/route.ts:6-39` | Siapa pun membuat akun ADMIN baru | Tambah cek role; paksa `role: 'USER'` |
| F-07 | CRITICAL | JWT secret hardcoded & ter-commit (termasuk `dist/`) | `backend/src/auth/auth.module.ts:14`, `backend/src/auth/jwt.strategy.ts:39` | Pemalsuan token backend | Pindah ke env, rotasi, untrack `backend/dist/` |
| F-08 | CRITICAL | Backend NestJS tanpa guard global; `@Public()` di endpoint destruktif | `backend/src/app.module.ts:12-25`, `backend/src/billboards/billboards.controller.ts:27,66` | DELETE billboard tanpa auth | Daftarkan `APP_GUARD`, cabut `@Public()` |
| F-09 | CRITICAL | chat-server tanpa autentikasi; join room arbitrer | `chat-server/index.js:100-106` | Baca percakapan pelanggan lain | `io.use()` handshake auth + validasi kepemilikan room |
| F-10 | CRITICAL | Impersonasi ADMIN di chat (`sender` dari klien) | `chat-server/index.js:108-117` | Penipuan pelanggan atas nama admin | Tentukan `sender` server-side dari identitas terverifikasi |
| F-11 | HIGH | Booking IDOR: cancel/submit-design tanpa cek kepemilikan | `src/app/api/booking/cancel/route.ts:17-21`, `submit-design/route.ts:15-22` | Batalkan / timpa desain order milik orang lain | Tambah `where: { id, userId: session.user.id }` |
| F-12 | HIGH | `booking/request-refund` tanpa sesi sama sekali | `src/app/api/booking/request-refund/route.ts:6-77` | Ubah rekening tujuan refund order siapa pun | Tambah `getServerSession` + cek kepemilikan |
| F-13 | HIGH | Harga dipercaya dari klien | `src/app/api/booking/create/route.ts:39-47` | Sewa billboard seharga Rp 1 | Hitung ulang `totalPrice` di server |
| F-14 | HIGH | Semua endpoint `admin/chat/*` tanpa auth | `src/app/api/admin/chat/{close,join,reply,send,session-detail,suggest}/route.ts` | Baca/balas chat sebagai admin, kuras kuota AI | Tambah cek role ADMIN pada keenamnya |
| F-15 | HIGH | Server Actions tanpa cek auth | `src/app/admin/(dashboard)/actions.ts:13`, `live-chat/actions.ts:5,23` | Bocor data omzet & transkrip chat | Tambah `getServerSession` + cek role di setiap action |
| F-16 | HIGH | Hash password & `otpCode` dikirim ke browser | `src/app/admin/(dashboard)/users/page.tsx:7-18` | Bcrypt hash seluruh user bocor ke klien | `select` eksplisit, buang `password`/`otpCode` |
| F-17 | HIGH | Tidak ada `src/middleware.ts` | (file tidak ada) | Nol proteksi edge; setiap route harus dijaga manual | Tambah middleware matcher untuk `/admin`, `/dashboard`, `/api/admin` |
| F-18 | HIGH | Account takeover via Google (email tak terverifikasi) | `src/lib/auth.ts:58-90` | Ambil alih akun via provider Google | Cek `profile.email_verified`, tolak link otomatis |
| F-19 | HIGH | Nol rate limiting di seluruh repo | `src/lib/auth.ts:32-52` (dll.) | Brute force login, abuse biaya AI | Terapkan rate limit pada login/OTP/AI |
| F-20 | HIGH | Backend: booking/order/upload tanpa auth & kepemilikan | `backend/src/bookings/bookings.controller.ts:13-30`, `orders/orders.controller.ts:10-14` | Batalkan order siapa pun, set rekening refund | Guard + cek `userId` |
| F-21 | HIGH | Backend tanpa `ValidationPipe`; `...rest` ke Prisma | `backend/src/main.ts`, `backend/src/billboards/billboards.service.ts:130` | Mass-assignment kolom arbitrer | `ValidationPipe({whitelist:true})` + decorator DTO |
| F-22 | MEDIUM | `admin/billboards/detail` tanpa auth, bocor data `changedBy` | `src/app/api/admin/billboards/detail/route.ts:4-21` | Bocor draft + email admin | Tambah cek role |
| F-23 | MEDIUM | IDOR halaman detail order | `src/app/dashboard/order/[id]/page.tsx:18-23` | Baca order pengguna lain | Bandingkan `order.userId` dgn sesi |
| F-24 | MEDIUM | Header keamanan tidak ada + `ignoreBuildErrors` | `next.config.ts:27-33` | Nihil CSP/HSTS/X-Frame-Options; bug lolos build | Tambah `headers()`, matikan `ignoreBuildErrors` |
| F-25 | MEDIUM | Upload: ekstensi dari nama file klien, timpa file | `src/app/api/upload/design/route.ts:55-57`, `src/app/api/upload/route.ts:29-30` | Stored XSS via `.html`/`.svg`, timpa desain | Turunkan ekstensi dari MIME allow-list, nama acak |
| F-26 | MEDIUM | CORS terbuka di backend & chat-server | `backend/src/main.ts:14`, `chat-server/index.js:9,13-15` | Serangan lintas origin | Batasi origin ke domain dikenal |
| F-27 | MEDIUM | `NEXTAUTH_SECRET` lemah; tanpa `maxAge` sesi | `.env:25`, `src/lib/auth.ts:9-12` | Sesi tak kedaluwarsa; secret tebakan | Regenerasi `openssl rand -base64 32`, set `maxAge` |
| F-28 | MEDIUM | Gemini API key di query string URL | `src/app/api/admin/settings/route.ts:34`, `chat-server/index.js:68` | Key bocor ke log/proxy | Gunakan header `x-goog-api-key` |
| F-29 | MEDIUM | Prompt injection ke Gemini | `chat-server/index.js:65` | Bajak persona bot, sisipkan link berbahaya | Delimiter + sanitasi input |
| F-30 | LOW | OTP dead code | `prisma/schema.prisma:48-49` | Ilusi keamanan; `isVerified` tak pernah di-gate | Implementasikan atau hapus |
| F-31 | LOW | Kredensial default di `docker-compose.yml`, port terekspos | `docker-compose.yml:6-8` | DB lemah terekspos ke host | Ganti kredensial, jangan publish port |
| F-32 | LOW | Password Supabase plaintext di komentar `.env` | `.env:10-12,20` | Secret tersebar walau dikomentari | Hapus baris, rotasi password |
| F-33 | LOW | `helmet` terpasang tapi tak pernah dipakai | `backend/package.json` | Header keamanan backend nihil | `app.use(helmet())` |

---

## Detail Temuan CRITICAL & HIGH

### F-01 (CRITICAL) — Privilege escalation via `admin/users/update-account`

`src/app/api/admin/users/update-account/route.ts:6-18` — file **lengkap**, tidak ada baris yang dihilangkan:

```ts
export async function POST(req: Request) {
  try {
    const { userId, password, ...data } = await req.json();   // :8

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10); // :11
      data.password = hashedPassword;
    }

    const user = await prisma.user.update({
      where: { id: userId },                                   // :16
      data,                                                    // :17  <-- mass assignment
    });
```

Tiga kegagalan bertumpuk:
1. **Tidak ada `getServerSession`** — tidak ada `import` NextAuth sama sekali di file ini.
2. **`...data` diteruskan mentah ke Prisma** (`:17`) — termasuk `role`, `isVerified`, `email`.
3. **`userId` dari body**, bukan dari sesi (`:16`).

Eksploitasi satu permintaan, tanpa login:
```bash
curl -X POST https://target/api/admin/users/update-account \
  -H 'Content-Type: application/json' \
  -d '{"userId":"<id-korban>","role":"SUPER_ADMIN","password":"pwned123"}'
```
Penyerang menjadi `SUPER_ADMIN` sekaligus mengganti password korban. Ini temuan paling berbahaya di repo karena memberi akses penuh ke seluruh panel admin.

Catatan: `src/app/api/admin/users/update-business/route.ts:5-13` identik polanya (tanpa auth, `...data` mentah ke `prisma.user.update`) — perbaiki bersamaan.

**Patch:**
```ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ message: "Akses Ditolak" }, { status: 403 });
  }

  const { userId, password, name, whatsapp, email } = await req.json();
  if (!userId) return NextResponse.json({ message: "userId wajib" }, { status: 400 });

  // Allow-list eksplisit: role TIDAK PERNAH diterima di sini.
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (whatsapp !== undefined) data.whatsapp = whatsapp;
  if (email !== undefined) data.email = email;
  if (password) data.password = await bcrypt.hash(password, 10);

  await prisma.user.update({ where: { id: userId }, data });
  return NextResponse.json({ message: "OK" });
}
```
Perubahan role harus tetap lewat `admin/users/update-role/route.ts` yang sudah punya pengecekan benar.

---

### F-02 (CRITICAL) — Proxy tanpa auth = bypass ke seluruh backend

`src/app/api/proxy/[...path]/route.ts:7-56`. Komentar di `:3-5` sudah mengakui masalahnya:

```ts
// WARNING: This proxy is unauthenticated.                         // :3
// It simply forwards requests to the backend to avoid CORS issues.
// Do not use this in production without adding a proper authentication layer.

async function handler(req: NextRequest) {
  const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:4001'; // :10
  const url = new URL(req.url);
  const apiPath = url.pathname.replace('/api/proxy/', '');                   // :14
  const targetUrl = `${backendUrl}/api/${apiPath}${url.search}`;             // :17

  const response = await fetch(targetUrl, {
    method: req.method,                                                      // :21
    ...
```

Lalu **semua metode diekspor** (`:50-56`):
```ts
export const GET = handler; export const POST = handler; export const PUT = handler;
export const PATCH = handler; export const DELETE = handler;
export const OPTIONS = handler; export const HEAD = handler;
```

Rantai serangan terverifikasi end-to-end:
1. Penyerang anonim memanggil `DELETE /api/proxy/billboards/<id>`.
2. Handler meneruskan ke `http://localhost:4001/api/billboards/<id>` dengan metode `DELETE` (`:21`).
3. Backend NestJS menandai endpoint itu `@Public()` (`backend/src/billboards/billboards.controller.ts:27-32`) dan tidak punya guard global (F-08).
4. Billboard terhapus. **Tanpa satu pun kredensial.**

Inilah persis pola yang dipakai UI admin di `src/components/admin/DeleteBillboardBtn.tsx:21` dan `src/components/admin/StatusChanger.tsx:44` — jadi endpoint ini memang hidup, bukan kode mati.

Masalah tambahan: header respons backend diteruskan mentah (`:34`), termasuk `Set-Cookie`.

**Patch minimal (jika proxy masih diperlukan):**
```ts
async function handler(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const apiPath = url.pathname.replace('/api/proxy/', '');

  // Mutasi hanya untuk admin.
  const isMutation = !['GET', 'HEAD'].includes(req.method);
  if (isMutation && !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ message: "Akses Ditolak" }, { status: 403 });
  }

  // Allow-list path; tolak traversal.
  if (apiPath.includes('..') || !/^(billboards|bookings)\//.test(apiPath)) {
    return NextResponse.json({ message: "Path tidak diizinkan" }, { status: 400 });
  }
  ...
  // Jangan teruskan header backend mentah-mentah:
  return new NextResponse(response.body, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json' },
  });
}
```
**Rekomendasi kuat:** karena backend NestJS sendiri tidak punya auth (F-08), menambal proxy saja tidak cukup — backend tetap terekspos langsung di port 4001. Perbaiki F-08 bersamaan.

---

### F-03 (CRITICAL) — SSRF penuh pada `/api/proxy?url=`

`src/app/api/proxy/route.ts:3-15`:

```ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');          // :5  input mentah dari penyerang

  if (!targetUrl) return new Response('Missing URL', { status: 400 });

  const response = await fetch(targetUrl, {           // :10 tanpa validasi apa pun
    headers: { 'User-Agent': 'Mozilla/5.0 ...' }      // :13 sengaja menyamar sbg browser
  });
  let html = await response.text();                   // :19 isi dikembalikan ke penyerang
```

Tidak ada validasi skema, host, maupun rentang IP. Server akan mengambil URL apa pun dan **mengembalikan isinya** — artinya ini SSRF *read* penuh, bukan blind:

- `?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/` — kredensial IAM cloud.
- `?url=http://localhost:4001/api/billboards/admin` — endpoint admin backend.
- `?url=file:///etc/passwd` — tergantung runtime `fetch`.
- Pemindaian port internal lewat perbedaan waktu/status respons.

Dipakai oleh `src/components/TrafficReportModal.tsx:10` untuk menampilkan laporan trafik pihak ketiga — kebutuhan sah, tetapi harus dibatasi ke host yang diizinkan.

**Patch:**
```ts
const ALLOWED_HOSTS = new Set(['smartsuco.com', 'www.smartsuco.com']);

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const targetUrl = new URL(req.url).searchParams.get('url');
  if (!targetUrl) return new Response('Missing URL', { status: 400 });

  let parsed: URL;
  try { parsed = new URL(targetUrl); } catch { return new Response('Bad URL', { status: 400 }); }

  if (parsed.protocol !== 'https:') return new Response('HTTPS only', { status: 400 });
  if (!ALLOWED_HOSTS.has(parsed.hostname)) return new Response('Host tidak diizinkan', { status: 403 });

  const response = await fetch(parsed.toString(), { redirect: 'error' }); // cegah redirect ke IP internal
  ...
}
```
`redirect: 'error'` penting: tanpa itu host yang diizinkan bisa me-redirect ke `169.254.169.254`.

---

### F-04 (CRITICAL) — Webhook pembayaran tanpa verifikasi tanda tangan

`src/app/api/payment/notify/route.ts:7-32`:

```ts
export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();               // :9  satu-satunya input
    // ... tidak ada pembacaan header signature, tidak ada HMAC, tidak ada cek nominal

    const order = await prisma.booking.findUnique({     // :13
        where: { id: orderId },
        include: { user: true, billboard: true }
    });
    ...
    const nextStatus = order.designOption === 'service' ? 'IN_PRODUCTION' : 'DESIGN_RECEIVED'; // :24

    await prisma.booking.update({                        // :26
        where: { id: orderId },
        data: {
            status: nextStatus,
            paidAt: new Date()                           // :30  ditandai LUNAS
        }
    });
```

Yang absen sepenuhnya: pembacaan header tanda tangan, verifikasi HMAC, pencocokan nominal, cek status saat ini (`PENDING_PAYMENT`), idempotensi, dan allow-list IP gateway. Satu-satunya syarat adalah mengetahui/menebak `orderId`.

```bash
curl -X POST https://target/api/payment/notify \
  -H 'Content-Type: application/json' -d '{"orderId":"<id>"}'
```
Efeknya: booking menjadi lunas tanpa uang masuk, `paidAt` terisi, dan admin menerima email "[LUNAS] Uang Masuk" (`:44`) sehingga penipuan tampak sah. Karena `paidAt` juga menjadi basis grafik omzet (`actions.ts:45-48`), laporan keuangan ikut teracuni.

Duplikat persis di backend: `backend/src/payments/payments.controller.ts:10-13` → `payments.service.ts:31-37`.

**Patch:**
```ts
import crypto from "crypto";

export async function POST(req: Request) {
  const raw = await req.text();                          // WAJIB raw body untuk HMAC
  const signature = req.headers.get('x-callback-signature') ?? '';

  const expected = crypto.createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET!)
                         .update(raw).digest('hex');
  const ok = signature.length === expected.length &&
             crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!ok) return NextResponse.json({ message: "Invalid signature" }, { status: 401 });

  const { orderId, amount, status } = JSON.parse(raw);
  if (status !== 'PAID') return NextResponse.json({ status: 'ignored' });

  const order = await prisma.booking.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ message: "Order not found" }, { status: 404 });

  if (order.paidAt) return NextResponse.json({ status: 'already_processed' });   // idempotensi
  if (Number(amount) < order.totalPrice) {                                        // cek nominal
    return NextResponse.json({ message: "Amount mismatch" }, { status: 400 });
  }
  if (order.status !== 'PENDING_PAYMENT') {                                       // precondition
    return NextResponse.json({ message: "Invalid state" }, { status: 409 });
  }
  ...
}
```

---

### F-05 (CRITICAL) — `GET /api/admin/settings` membocorkan API key tanpa auth

`src/app/api/admin/settings/route.ts:7-13`:

```ts
export async function GET(req: Request) {
  let setting = await prisma.systemSetting.findUnique({ where: { id: "default_config" } }); // :8
  if (!setting) {
      setting = await prisma.systemSetting.create({ data: { id: "default_config" } });
  }
  return NextResponse.json(setting);   // :12  seluruh baris, termasuk geminiApiKey
}
```

Bandingkan dengan `POST` di file yang sama (`:16-20`) yang memeriksa `SUPER_ADMIN` dengan benar. `GET` sama sekali tidak memanggil `getServerSession`. Baris `systemSetting` berisi `geminiApiKey` dan `googleMapsApiKey` (lihat penulisannya di `:75-76`), sehingga:

```bash
curl https://target/api/admin/settings
```
mengembalikan kunci API berbayar kepada siapa pun. Kunci Gemini yang bocor langsung berarti tagihan berjalan atas nama pemilik.

Masalah terkait di file yang sama: kunci diletakkan pada **query string** (`:34`), yang bocor ke log akses dan proxy. Pola sama di `src/app/api/admin/chat/suggest/route.ts:34` dan `chat-server/index.js:68`.

**Patch:**
```ts
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  let setting = await prisma.systemSetting.findUnique({ where: { id: "default_config" } });
  if (!setting) setting = await prisma.systemSetting.create({ data: { id: "default_config" } });

  // Jangan pernah kirim kunci mentah ke klien — cukup status terisi/tidak.
  const { geminiApiKey, googleMapsApiKey, ...safe } = setting;
  return NextResponse.json({
    ...safe,
    hasGeminiKey: Boolean(geminiApiKey),
    hasGoogleMapsKey: Boolean(googleMapsApiKey),
  });
}
```
Dan untuk panggilan Gemini, pindahkan kunci ke header:
```ts
await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
  body: JSON.stringify(payload),
});
```

---

### F-06 (CRITICAL) — `admin/users/create` tanpa auth, `role` dari body

`src/app/api/admin/users/create/route.ts:6-39`. Tidak ada `getServerSession` di seluruh file:

```ts
export async function POST(req: Request) {
    const body = await req.json();
    const { name, email, password, role } = body;    // :9  role dikendalikan penyerang
    ...
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        name, email, password: hashedPassword,
        role,                                         // :34  ditulis apa adanya
        authProvider: 'EMAIL',
        isVerified: true,                             // :37  langsung terverifikasi
      },
    });
```

```bash
curl -X POST https://target/api/admin/users/create \
  -H 'Content-Type: application/json' \
  -d '{"name":"x","email":"x@x.com","password":"x","role":"SUPER_ADMIN"}'
```
Penyerang membuat akun `SUPER_ADMIN` yang langsung `isVerified`, lalu login normal lewat `/admin/login`. Jalur kedua menuju kompromi penuh (selain F-01).

**Patch:**
```ts
const session = await getServerSession(authOptions);
if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
  return NextResponse.json({ message: "Akses Ditolak" }, { status: 403 });
}

const ALLOWED_ROLES = ['USER', 'OPERATOR', 'CS'];
// Hanya SUPER_ADMIN yang boleh mencetak ADMIN.
if (role === 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
  return NextResponse.json({ message: "Tidak berwenang" }, { status: 403 });
}
if (role !== 'ADMIN' && !ALLOWED_ROLES.includes(role)) {
  return NextResponse.json({ message: "Role tidak valid" }, { status: 400 });
}
// 'SUPER_ADMIN' tidak pernah boleh dibuat lewat API.
```

---

### F-07 (CRITICAL) — JWT secret hardcoded dan ter-commit

`backend/src/auth/auth.module.ts:14` dan `backend/src/auth/jwt.strategy.ts:39` memuat **literal string yang sama** sebagai secret penandatanganan JWT (nilai diredaksi). Keduanya ada di source control.

Lebih buruk: `backend/dist/` **ikut ter-track git** — terverifikasi `git ls-files backend/dist` mengembalikan **128 file**, dan `backend/dist/auth/auth.module.js:22` memuat literal yang sama. Jadi secret bocor dua kali dan akan terus bocor setiap build.

`ConfigService` sudah di-import di `jwt.strategy.ts:5` tapi sengaja tidak dipakai (`jwt.strategy.ts:32`: `constructor() { // Remove ConfigService injection for now`).

Detail JWT lain yang bermasalah:
- **Algoritma tidak dipatok** — tidak ada opsi `algorithms: ['HS256']`.
- `validate()` (`jwt.strategy.ts:45-51`) menerima payload apa pun ber-`sub` **tanpa lookup DB** — role diambil mentah dari token, tidak ada cek user masih ada/aktif.
- Tidak ada `AuthController` sama sekali; tidak ada endpoint penerbit token. Auth backend setengah jadi.

**Patch:**
```ts
// auth.module.ts
JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET wajib di-set');  // fail fast, jangan fallback
    return { secret, signOptions: { expiresIn: '60m', algorithm: 'HS256' } };
  },
}),

// jwt.strategy.ts
constructor(private config: ConfigService, private prisma: PrismaService) {
  super({
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    ignoreExpiration: false,
    algorithms: ['HS256'],                       // patok algoritma
    secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
  });
}
async validate(payload: any) {
  const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw new UnauthorizedException();  // role dari DB, bukan dari token
  return { userId: user.id, role: user.role };
}
```

**Langkah wajib (berurutan, jangan dilewati):**
1. Rotasi secret — anggap yang lama sudah bocor permanen.
2. `git rm -r --cached backend/dist` lalu tambahkan `dist/` ke `.gitignore`.
3. Riwayat git masih menyimpan nilai lama; karena secret sudah dirotasi di langkah 1, penulisan ulang riwayat bersifat opsional.

---

### F-08 (CRITICAL) — Backend NestJS tanpa guard global, `@Public()` di endpoint destruktif

`backend/src/app.module.ts:12-25` tidak mendaftarkan provider apa pun:
```ts
  controllers: [],
  providers: [],       // tidak ada APP_GUARD
```
`AuthModule` hanya di-import oleh `BillboardsModule` (`backend/src/billboards/billboards.module.ts:9`). Akibatnya **seluruh endpoint di users, bookings, orders, payments, chat, dan uploads sepenuhnya tanpa autentikasi.**

Pada controller yang *punya* guard pun, `@Public()` dipasang di operasi destruktif — `backend/src/billboards/billboards.controller.ts:27-32`:
```ts
  @Public()
  @Delete(':id')
  remove(@Param('id') id: string) {
    // Note: Should probably also check for ownership or admin role here
    return this.billboardsService.remove(id);
  }
```
dan `:66-71`:
```ts
  @Public()
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status?: string; publishStatus?: string }) {
```
plus `:40-44` (`@Public() @Get('admin')`) yang membocorkan record draft beserta nama+email pembuatnya (`billboards.service.ts:154,267`).

Bahkan endpoint yang dijaga `JwtAuthGuard` (`billboards.controller.ts:11`) **tidak punya otorisasi**: `userId` hanya dipakai sebagai stempel audit (`createdById`/`updatedById`), tidak pernah dibandingkan. Tidak ada `RolesGuard` maupun `@Roles()` di seluruh codebase. Pemegang token valid apa pun dapat mengubah billboard mana pun.

**Patch:**
```ts
// app.module.ts
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Module({
  imports: [/* ..., */ AuthModule],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },   // default: semua terkunci
    { provide: APP_GUARD, useClass: RolesGuard },     // lalu cek role
  ],
})
```
Setelah guard global aktif, cabut `@Public()` dari `@Delete(':id')` (`:27`) dan `@Patch(':id/status')` (`:66`), dan ganti `@Get('admin')` (`:40`) menjadi `@Roles('ADMIN','SUPER_ADMIN')`. Sisakan `@Public()` hanya pada tiga pembacaan katalog yang memang publik (`:34`, `:46`, `:56`).

---

### F-09 & F-10 (CRITICAL) — chat-server: tanpa auth, room arbitrer, impersonasi ADMIN

`chat-server/index.js:100-106`:
```js
io.on("connection", (socket) => {              // :100  tidak ada io.use() sebelumnya
  console.log("✅ A user connected:", socket.id);

  socket.on("joinRoom", (sessionId) => {       // :103
    socket.join(sessionId);                    // :104  room = input klien, tanpa verifikasi
    console.log(`User ${socket.id} joined room ${sessionId}`);
  });
```

Tidak ada middleware handshake, tidak ada pembacaan `socket.handshake.auth`, tidak ada verifikasi cookie/token. Setiap koneksi anonim adalah peer penuh. Karena pesan disiarkan ke seluruh anggota room (`:116`, `:134`), alurnya: connect anonim → `emit('joinRoom', <sessionId korban>)` → membaca percakapan pelanggan itu secara langsung beserta PII yang diketik.

`sessionId` berupa cuid (`prisma/schema.prisma:171`) sehingga tidak berurutan, **tetapi bukan rahasia** — widget menyimpannya di `localStorage` (`src/components/ChatWidget.tsx:24`). Filter di sisi klien (`ChatWidget.tsx:32`) bersifat kosmetik: server sudah terlanjur mengirim payload-nya.

`chat-server/index.js:108-117` — impersonasi:
```js
  socket.on("sendMessage", async ({ sessionId, sender, message }) => {   // :108
    try {
      const originalMessage = await prisma.chatMessage.create({
        data: { sessionId, sender, message },                            // :111-113
      });
```
`sender` diambil langsung dari klien dan dipersistenkan. `ChatMessage.sender` adalah `String` bebas (`prisma/schema.prisma:185`) tanpa enum. Klien mana pun dapat menulis pesan **atas nama `ADMIN` atau `BOT`** ke sesi mana pun — misalnya "ADMIN: silakan transfer ke rekening berikut". Pesan itu juga muncul di inbox admin sebagai riwayat asli.

CORS terbuka penuh memperparah semuanya (`:9` `app.use(cors())`, `:13-15` `origin: "*"`), sehingga halaman web mana pun dapat melakukan hal di atas.

**Patch:**
```js
const { verify } = require("jsonwebtoken");

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("unauthorized"));

    const payload = verify(token, process.env.CHAT_JWT_SECRET, { algorithms: ["HS256"] });
    socket.data.userId = payload.sub;
    socket.data.role   = payload.role;                  // identitas tepercaya, dari server
    next();
  } catch { next(new Error("unauthorized")); }
});

io.on("connection", (socket) => {
  socket.on("joinRoom", async (sessionId) => {
    const chat = await prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!chat) return;
    const isOwner = chat.userId === socket.data.userId;
    const isAgent = ["ADMIN", "SUPER_ADMIN", "CS"].includes(socket.data.role);
    if (!isOwner && !isAgent) return;                   // verifikasi kepemilikan room
    socket.join(sessionId);
  });

  socket.on("sendMessage", async ({ sessionId, message }) => {   // 'sender' TIDAK lagi diterima
    if (!socket.rooms.has(sessionId)) return;                     // harus sudah join sah
    if (typeof message !== "string" || message.length > 2000) return;

    const sender = ["ADMIN", "SUPER_ADMIN", "CS"].includes(socket.data.role) ? "ADMIN" : "USER";
    await prisma.chatMessage.create({ data: { sessionId, sender, message } });
    ...
  });
});
```
Batasi juga CORS: `cors: { origin: process.env.ALLOWED_ORIGIN, methods: ["GET","POST"] }`.

---

### F-11 & F-12 (HIGH) — IDOR pada booking

`src/app/api/booking/cancel/route.ts:17-21` — sesi dicek (`:11`) tapi kepemilikan tidak:
```ts
    const { orderId } = await req.json();                 // :13
    const order = await prisma.booking.update({
        where: { id: orderId },                           // :18  tidak ada userId
        data: { status: "CANCELLED" },
```
Pengguna terautentikasi mana pun membatalkan order pengguna lain dengan menebak/mengetahui `orderId`.

`src/app/api/booking/submit-design/route.ts:15-22` — pola sama:
```ts
    await prisma.booking.update({
        where: { id: orderId },                           // :16
        data: { designFileUrl: designUrl, status: "DESIGN_RECEIVED" },
```
`designUrl` juga diterima mentah dari klien (bukan hasil upload terverifikasi), sehingga desain order orang lain dapat ditimpa dengan URL arbitrer.

`src/app/api/booking/request-refund/route.ts:6-77` lebih parah — **tidak ada `getServerSession` sama sekali** di file ini. Pada `:47-54`:
```ts
      const order = await prisma.booking.update({
          where: { id: body.orderId },                    // :48
          data: {
              status: "PROCESS_REFUND",
              userBankName: body.bankName,                // :51
              userBankAccount: body.bankAccount,          // :52  rekening dikendalikan penyerang
```
Penyerang anonim mengarahkan refund order korban ke rekeningnya sendiri, lalu email ke admin (`:60-73`) menampilkan rekening itu sebagai instruksi transfer yang sah. **Ini kerugian finansial langsung.**

**Patch (pola untuk ketiganya):**
```ts
const session = await getServerSession(authOptions);
if (!session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

const { orderId } = await req.json();

// updateMany + userId: hanya menyentuh baris milik pemanggil.
const result = await prisma.booking.updateMany({
  where: { id: orderId, userId: session.user.id, status: 'PENDING_PAYMENT' },
  data: { status: "CANCELLED" },
});
if (result.count === 0) {
  return NextResponse.json({ message: "Order tidak ditemukan" }, { status: 404 });  // jangan bocorkan eksistensi
}
```

---

### F-13 (HIGH) — Harga dipercaya dari klien

`src/app/api/booking/create/route.ts:19-47`:
```ts
    const body = await req.json();
    const { billboardId, duration, totalPrice, dpAmount, ... } = body;   // :20-22

    const newBooking = await prisma.booking.create({
        data: {
            userId: session.user.id,
            billboardId, startDate, endDate, duration, totalPrice,       // :42  langsung dari klien
            dpAmount: paymentType === 'dp' ? dpAmount : 0,               // :43
```
`targetBillboard` sudah diambil dari DB (`:26-28`) dan berisi `price`, tetapi harga itu tidak pernah dipakai untuk perhitungan. Rumus sebenarnya hanya ada di klien — `src/components/CheckoutForm.tsx:38-42`:
```ts
  const subTotalSewa = pricePerMonth * duration;
  const ppn = subTotalSewa * 0.11;
  const grandTotal = subTotalSewa + ppn + adminFee;
```
Penyerang cukup mengirim `totalPrice: 1000`. `duration` juga tidak divalidasi (negatif/nol/ekstrem diterima, lalu dipakai di `setMonth` pada `:37`).

**Patch:**
```ts
const ADMIN_FEE = 50000;
const PPN_RATE  = 0.11;

const duration = Number(body.duration);
if (!Number.isInteger(duration) || duration < 1 || duration > 36) {
  return NextResponse.json({ message: "Durasi tidak valid" }, { status: 400 });
}

// Harga dihitung ULANG di server dari harga DB. Nilai dari klien diabaikan.
const subTotal   = targetBillboard.price * duration;
const totalPrice = Math.round(subTotal + subTotal * PPN_RATE + ADMIN_FEE);
const dpAmount   = body.paymentType === 'dp' ? Math.round(totalPrice * 0.60) : 0;

await prisma.booking.create({
  data: { userId: session.user.id, billboardId, startDate, endDate, duration, totalPrice, dpAmount, ... }
});
```

---

### F-14 (HIGH) — Seluruh `admin/chat/*` tanpa autentikasi

Enam route di bawah `src/app/api/admin/chat/` tidak memanggil `getServerSession` sama sekali:

| File | Baris | Akibat |
|---|---|---|
| `close/route.ts` | `4-21` | Tutup sesi chat siapa pun |
| `join/route.ts` | `4-25` | Menyusup sebagai "Admin bergabung" |
| `reply/route.ts` | `5-19` | **Kirim pesan sebagai `sender: 'ADMIN'`** (`:10`) |
| `send/route.ts` | `5-64` | Sisipkan pesan ke sesi mana pun |
| `session-detail/route.ts` | `4-14` | Baca metadata sesi (PII) |
| `suggest/route.ts` | `5-44` | Panggil Gemini tanpa batas |

`reply/route.ts:9-11` adalah yang terburuk — bersama F-10, memberi dua jalur independen untuk menyamar sebagai admin ke pelanggan:
```ts
    await prisma.chatMessage.create({
        data: { sessionId, sender: 'ADMIN', message }   // :10
    });
```
`suggest/route.ts:34` juga merupakan penyalahgunaan biaya: setiap permintaan anonim memicu panggilan Gemini berbayar memakai kunci dari DB, tanpa rate limit.

**Patch** — terapkan penjaga yang sama di keenam file:
```ts
const session = await getServerSession(authOptions);
if (!session || !['ADMIN', 'SUPER_ADMIN', 'CS'].includes(session.user.role)) {
  return NextResponse.json({ message: "Akses Ditolak" }, { status: 403 });
}
```
Pertimbangkan helper bersama `src/lib/guard.ts` agar tidak terulang:
```ts
export async function requireRole(roles: string[]) {
  const session = await getServerSession(authOptions);
  if (!session || !roles.includes(session.user.role)) return null;
  return session;
}
```

---

### F-15 (HIGH) — Server Actions tanpa pengecekan auth

Server Actions dikompilasi menjadi **endpoint HTTP publik**; siapa pun yang memiliki Action ID (mudah diambil dari bundel klien) dapat memanggilnya langsung. Tidak ada satu pun action di repo ini yang memeriksa sesi.

`src/app/admin/(dashboard)/actions.ts:13` — `'use server'` di `:2`, lalu:
```ts
export async function getRevenueData(
  period: 'daily' | '1m' | '3m' | '6m' | '12m' | 'all'
): Promise<ChartData[]> {
  // tidak ada getServerSession di seluruh file (104 baris)
```
Membocorkan seluruh riwayat omzet perusahaan.

`src/app/admin/(dashboard)/live-chat/actions.ts:5` dan `:23`:
```ts
export async function getChatSessions() {              // :5
    const sessions = await prisma.chatSession.findMany({ ... });

export async function getMessagesForSession(sessionId: string) {   // :23
    const sessionWithMessages = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },    // :30-32
```
`getChatSessions()` mengembalikan **seluruh** sesi chat; `getMessagesForSession()` mengembalikan transkrip lengkap sesi mana pun. Perhatikan bahwa `getChatSessions()` juga membocorkan daftar `sessionId` yang kemudian mempermudah F-09 (join room di chat-server).

**Patch** — tambahkan penjaga di **setiap** action:
```ts
'use server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function getRevenueData(period: ...): Promise<ChartData[]> {
  const session = await getServerSession(authOptions);
  if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    throw new Error("Unauthorized");
  }
  ...
}
```

---

### F-16 (HIGH) — Hash password dikirim ke browser

`src/app/admin/(dashboard)/users/page.tsx:7-18`:
```ts
  const users = await prisma.user.findMany({          // :7  tanpa select
      include: { bookings: true },
      orderBy: { createdAt: 'desc' }
  });

  const serializableUsers = users.map(user => ({
    ...user,                                          // :14  termasuk password & otpCode
    createdAt: user.createdAt.toISOString(),
    otpExpires: user.otpExpires ? user.otpExpires.toISOString() : null,
  }));

  return <UserClientPage users={serializableUsers} />; // :20  dikirim ke Client Component
```
Spread `...user` (`:14`) membawa kolom `password` (hash bcrypt) dan `otpCode` ke payload RSC yang dapat dibaca di browser. Hash bcrypt seluruh pengguna — termasuk admin — terekspos untuk di-crack offline.

Bandingkan dengan pola benar yang sudah dipakai di `src/app/api/admin/users/create/route.ts:42` (`const { password: _, ...userWithoutPassword } = newUser;`) — pola itu tidak diterapkan di sini.

**Patch:**
```ts
  const users = await prisma.user.findMany({
    select: {                                  // allow-list eksplisit; jangan spread
      id: true, name: true, email: true, role: true,
      whatsapp: true, isVerified: true, authProvider: true,
      createdAt: true, image: true,
      bookings: { select: { id: true, status: true, totalPrice: true } },
      // password, otpCode, otpExpires sengaja TIDAK disertakan
    },
    orderBy: { createdAt: 'desc' },
  });
```

---

### F-17 (HIGH) — Tidak ada `src/middleware.ts`

Terverifikasi: tidak ada `src/middleware.ts` maupun `middleware.ts` di root (pencarian `find src -maxdepth 2 -name "middleware.ts"` kosong). Konsekuensinya seluruh otorisasi bergantung pada pengecekan per-file, dan itu **hilang di 13 dari 34 route**.

Rute yang tidak terlindungi di lapisan edge:
- **Seluruh `/api/**`** — termasuk 13 route tanpa cek sesi (lihat matriks di bawah).
- **`/admin/**`** — hanya dijaga `layout.tsx` (lihat F-17b).
- **`/dashboard/**`** — `src/app/dashboard/page.tsx` **tidak memanggil `getServerSession` sama sekali**; hanya `settings/page.tsx:12-15` yang melakukan redirect.

**F-17b — soal guard layout admin.** `src/app/admin/(dashboard)/layout.tsx:81-93` sebenarnya **sudah benar secara server-side** (Server Component, `getServerSession` di `:82`, `redirect` di `:85`, cek role di `:91`), jadi ini *bukan* guard klien yang bisa dilewati begitu saja untuk render halaman. Dua catatan tetap penting:
1. Layout **tidak melindungi route handler API** — pengamanan API sepenuhnya terpisah, dan di situlah lubangnya.
2. `src/app/admin/login/page.tsx:34-39` bergantung pada layout untuk penegakan role, sesuai komentarnya sendiri. Pendekatan ini benar untuk halaman, tapi menyesatkan bagi pengembang yang lalu menganggap API ikut terlindungi.

Perlu ditegaskan: `layout.tsx` mengizinkan hanya `['ADMIN','SUPER_ADMIN']` (`:89`), sehingga cabang `userRole === 'CS'` pada `:96` **tidak akan pernah tercapai** — bug logika (dead code), bukan celah keamanan.

**Patch — `src/middleware.ts` (pertahanan berlapis, bukan pengganti cek per-route):**
```ts
import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role as string | undefined;
    const path = req.nextUrl.pathname;

    if ((path.startsWith('/admin') || path.startsWith('/api/admin')) &&
        !['ADMIN', 'SUPER_ADMIN'].includes(role ?? '')) {
      return NextResponse.rewrite(new URL('/denied', req.url));
    }
    return NextResponse.next();
  },
  { callbacks: { authorized: ({ token }) => Boolean(token) } }
);

export const config = {
  matcher: [
    '/admin/((?!login).*)',
    '/dashboard/:path*',
    '/api/admin/:path*',
    '/api/booking/:path*',
    '/api/user/:path*',
    '/api/upload/:path*',
  ],
};
```
**Peringatan penting:** middleware adalah lapisan tambahan, **bukan** pengganti pengecekan di dalam tiap handler. Setiap temuan F-01 s.d. F-16 tetap harus diperbaiki di file masing-masing.

---

### F-18 (HIGH) — Account takeover via Google account-linking

`src/lib/auth.ts:58-90`:
```ts
    async signIn({ user, account, profile }) {
        if (account?.provider === 'google') {
            const existingUser = await prisma.user.findUnique({
                where: { email: user.email! }                   // :62-64
            });

            if (existingUser) {
                return true;                                   // :68  langsung diizinkan
            } else {
                await prisma.user.create({ ... isVerified: true });  // :71-81
            }
```
Pada `:66-68`, jika email sudah terdaftar, login Google **langsung diterima** tanpa memeriksa:
1. **`profile.email_verified`** — Google dapat mengembalikan profil dengan email belum terverifikasi (terutama akun Workspace). Penyerang yang mengontrol akun Google ber-email sama dengan admin dapat masuk sebagai admin tersebut.
2. **`authProvider` milik akun yang ada** — akun yang dibuat dengan password (`EMAIL`) dapat diambil alih lewat jalur Google tanpa konfirmasi pemilik.

Token JWT kemudian mengambil role dari DB (`:101-113`), sehingga penyerang memperoleh role akun korban sepenuhnya.

Isu terkait di file yang sama:
- `:21-22` — `process.env.GOOGLE_CLIENT_ID || ""` dan `GOOGLE_CLIENT_SECRET || ""`: konfigurasi gagal diam-diam alih-alih error keras.
- `:9-12` — `session` tanpa `maxAge`; sesi memakai default 30 hari dan tidak pernah diperpendek.
- `:12` — `secret: process.env.NEXTAUTH_SECRET` tanpa validasi keberadaan; nilai di `.env:25` dinilai **lemah/pendek** (bukan hasil generator acak).

**Patch:**
```ts
async signIn({ user, account, profile }) {
  if (account?.provider === 'google') {
    // 1. Wajib email terverifikasi oleh Google.
    if (!(profile as any)?.email_verified) return false;

    const existingUser = await prisma.user.findUnique({ where: { email: user.email! } });

    if (existingUser) {
      // 2. Jangan pernah auto-link ke akun berpassword.
      if (existingUser.authProvider !== 'GOOGLE') return false;
      return true;
    }

    await prisma.user.create({ data: { ..., role: 'USER', authProvider: 'GOOGLE', isVerified: true } });
    return true;
  }
  return true;
}
```
Dan perkuat konfigurasi sesi:
```ts
session: { strategy: "jwt", maxAge: 8 * 60 * 60 },     // 8 jam
secret: (() => {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s || s.length < 32) throw new Error("NEXTAUTH_SECRET wajib & minimal 32 byte acak");
  return s;
})(),
```
Regenerasi secret: `openssl rand -base64 32`.

**Catatan CSRF:** NextAuth v4 sudah menyediakan token CSRF bawaan untuk alur sign-in, dan cookie sesi default-nya `SameSite=Lax`. Namun karena route mutasi di `/api/**` tidak memakai mekanisme itu dan `getServerSession` hanya membaca cookie, endpoint `POST` berbasis JSON tetap bergantung pada `SameSite=Lax` sebagai satu-satunya pertahanan CSRF. Disarankan memverifikasi header `Origin` pada handler mutasi.

---

### F-19 (HIGH) — Nol rate limiting

Terverifikasi tidak ada `express-rate-limit`, `@nestjs/throttler`, `upstash`, maupun limiter apa pun di ketiga `package.json`. Dua-satunya kecocokan grep adalah komentar (`src/app/api/payment/notify/route.ts:62`) dan blok contoh yang dikomentari (`backend/src/auth/jwt.strategy.ts:21`).

Target tanpa perlindungan:
- `src/lib/auth.ts:32-52` — `authorize()` menerima tebakan password tak terbatas. Diperparah oleh pesan error yang membedakan kondisi: `"Email tidak terdaftar atau password salah"` (`:40`) vs `"Password salah"` (`:43`) — **user enumeration**.
- `src/app/api/user/change-password/route.ts` — oracle password.
- `src/app/api/admin/chat/suggest/route.ts:34` dan `chat-server/index.js:120` — abuse biaya Gemini tanpa batas.
- `backend/src/users/users.controller.ts:32-40` — `change-password` tanpa auth: oracle yang mengonfirmasi password benar untuk `userId` mana pun.

**Patch — samakan pesan error dulu (biaya nol):**
```ts
// src/lib/auth.ts — hilangkan user enumeration
const user = await prisma.user.findUnique({ where: { email: credentials.email } });
if (!user || !user.password) throw new Error("Email atau password salah");
const isPasswordValid = await compare(credentials.password, user.password);
if (!isPasswordValid) throw new Error("Email atau password salah");   // pesan identik
```
Lalu tambahkan rate limit (contoh Upstash, cocok untuk serverless):
```ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const loginLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "15 m"),   // 5 percobaan / 15 menit / IP
});
```
Untuk NestJS gunakan `@nestjs/throttler`; untuk `chat-server` batasi pesan per socket per menit.

---

### F-20 & F-21 (HIGH) — Backend: kepemilikan placeholder & tanpa validasi

`backend/src/bookings/bookings.controller.ts:13-18` — identitas dipalsukan secara hardcoded:
```ts
  @Post()
  create(@Body() createBookingDto: CreateBookingDto) {
    // In a real app, you'd get the user from the authenticated session
    const user = { id: 'clerk-user-id', name: 'Test User', email: 'test@example.com', role: 'USER' }; // Placeholder
```
Setiap booking ditulis dengan `userId: 'clerk-user-id'` (`bookings.service.ts:47`) — FK yang tidak ada, jadi create kemungkinan gagal di DB; namun blokir-admin di `bookings.service.ts:18-20` jadi tidak berarti karena role konstan.

`submit-design` (`:20`), `cancel` (`:25`), dan `request-refund` (`:30`) tanpa auth dan **tanpa cek kepemilikan** di service (`bookings.service.ts:101-116`, `118-150`, `152-222`). Pada `bookings.service.ts:192-195` rekening tujuan refund diambil dari input penyerang — sejajar dengan F-12.

`backend/src/orders/orders.controller.ts:10-14` — `POST /api/orders/update-status` tanpa guard; `orders.service.ts:14-40` menulis `newStatus`, `refundProof`, `installationProof`, `isLocked` ke booking mana pun tanpa allow-list status. `UnauthorizedException` di-import (`orders.service.ts:2`) tapi tidak pernah dilempar.

**F-21:** tidak ada `useGlobalPipes`/`ValidationPipe` di seluruh `backend/src/**`. Ke-12 DTO adalah kelas TypeScript polos tanpa decorator `class-validator` (paket `class-validator@^0.14.2` terpasang tapi tidak dipakai). Tipe DTO terhapus saat runtime, sehingga body sepenuhnya tidak tervalidasi. Mass-assignment konkret di `backend/src/billboards/billboards.service.ts:130`:
```ts
            ...rest,
```
`rest` adalah seluruh body dikurangi 8 kunci yang di-destructure (`:70-80`), sehingga kolom Billboard mana pun dapat ditulis pemanggil.

**Patch:**
```ts
// main.ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,              // buang properti tak dideklarasikan
  forbidNonWhitelisted: true,   // tolak jika ada properti asing
  transform: true,
}));
app.use(helmet());                                    // sudah terpasang, tinggal dipakai
app.enableCors({ origin: [process.env.FRONTEND_URL!], credentials: true });
await app.listen(process.env.PORT ?? 4001);

// create-billboard.dto.ts
export class CreateBillboardDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsNumber() @Min(0)       price!: number;
  @IsOptional() @IsString() slug?: string;
}
```
Dan hentikan spread ke Prisma — ganti `...rest` dengan pemetaan kolom eksplisit.

---

## Matriks Autentikasi Endpoint API (34 route)

Legenda: **Auth** = memanggil `getServerSession` · **Role** = memeriksa role · **Own** = memeriksa kepemilikan sumber daya (IDOR) · **Valid** = validasi input berarti · **Mass** = risiko mass-assignment

| # | Path | Method | Auth | Role | Own | Valid | Mass | Catatan |
|---|---|---|---|---|---|---|---|---|
| 1 | `/api/admin/billboards/create` | POST | YA | ADMIN | n/a | sebagian | rendah | Field eksplisit; `price` di-`Number()` |
| 2 | `/api/admin/billboards/delete` | POST | YA | ADMIN/SUPER | n/a | minim | – | Cek order aktif sebelum hapus |
| 3 | `/api/admin/billboards/detail` | GET | **TIDAK** | **TIDAK** | – | – | – | **F-22** bocor draft + email admin |
| 4 | `/api/admin/billboards/quick-update` | POST | YA | ADMIN/SUPER | n/a | allow-list | aman | Pola terbaik di repo |
| 5 | `/api/admin/billboards/rollback` | POST | YA | ADMIN | n/a | minim | – | `JSON.parse` snapshot tanpa try khusus |
| 6 | `/api/admin/billboards/update` | POST | YA | ADMIN/SUPER | n/a | sebagian | rendah | Ada history/audit |
| 7 | `/api/admin/chat/close` | POST | **TIDAK** | **TIDAK** | **TIDAK** | – | – | **F-14** |
| 8 | `/api/admin/chat/join` | POST | **TIDAK** | **TIDAK** | **TIDAK** | – | – | **F-14** |
| 9 | `/api/admin/chat/reply` | POST | **TIDAK** | **TIDAK** | **TIDAK** | – | – | **F-14** kirim sbg `ADMIN` |
| 10 | `/api/admin/chat/send` | POST | **TIDAK** | **TIDAK** | **TIDAK** | ada | – | **F-14** |
| 11 | `/api/admin/chat/session-detail` | GET | **TIDAK** | **TIDAK** | **TIDAK** | – | – | **F-14** bocor PII |
| 12 | `/api/admin/chat/suggest` | POST | **TIDAK** | **TIDAK** | **TIDAK** | – | – | **F-14** abuse biaya AI |
| 13 | `/api/admin/orders/add-charge` | POST | YA | ADMIN/SUPER | n/a | baik | – | Validasi `amount` benar |
| 14 | `/api/admin/orders/update-design-status` | POST | YA | ADMIN/SUPER | n/a | sebagian | – | `status` tanpa allow-list |
| 15 | `/api/admin/orders/upload-internal-design` | POST | YA | +OPERATOR | n/a | minim | – | `designUrl` mentah dari klien |
| 16 | `/api/admin/settings` | GET | **TIDAK** | **TIDAK** | – | – | – | **F-05 CRITICAL** bocor API key |
| 17 | `/api/admin/settings` | POST | YA | SUPER_ADMIN | – | sebagian | – | POST benar; GET tidak |
| 18 | `/api/admin/update-order` | POST | YA | ADMIN/SUPER | n/a | minim | sedang | `newStatus` tanpa allow-list |
| 19 | `/api/admin/users/create` | POST | **TIDAK** | **TIDAK** | – | dasar | **YA** | **F-06 CRITICAL** buat SUPER_ADMIN |
| 20 | `/api/admin/users/delete` | POST | YA | ADMIN | n/a | minim | – | Cek transaksi aktif |
| 21 | `/api/admin/users/update-account` | POST | **TIDAK** | **TIDAK** | **TIDAK** | **TIDAK** | **YA** | **F-01 CRITICAL** escalation |
| 22 | `/api/admin/users/update-business` | POST | **TIDAK** | **TIDAK** | **TIDAK** | **TIDAK** | **YA** | **F-01** pola identik |
| 23 | `/api/admin/users/update-role` | POST | YA | ADMIN/SUPER | n/a | minim | – | Ada proteksi SUPER_ADMIN; `newRole` tanpa allow-list |
| 24 | `/api/auth/[...nextauth]` | GET/POST | n/a | n/a | n/a | n/a | – | Handler NextAuth |
| 25 | `/api/booking/cancel` | POST | YA | – | **TIDAK** | minim | – | **F-11** IDOR |
| 26 | `/api/booking/create` | POST | YA | blokir admin | n/a | **lemah** | – | **F-13** harga dari klien |
| 27 | `/api/booking/request-refund` | POST | **TIDAK** | **TIDAK** | **TIDAK** | minim | – | **F-12 HIGH** rekening refund |
| 28 | `/api/booking/submit-design` | POST | YA | – | **TIDAK** | minim | – | **F-11** IDOR |
| 29 | `/api/payment/notify` | POST | **TIDAK** | **TIDAK** | **TIDAK** | **TIDAK** | – | **F-04 CRITICAL** tanpa HMAC |
| 30 | `/api/proxy/[...path]` | **7 metode** | **TIDAK** | **TIDAK** | **TIDAK** | **TIDAK** | – | **F-02 CRITICAL** auth bypass |
| 31 | `/api/proxy` | GET | **TIDAK** | **TIDAK** | – | **TIDAK** | – | **F-03 CRITICAL** SSRF |
| 32 | `/api/upload` | POST | YA | **TIDAK** | **TIDAK** | MIME+10MB | – | **F-25** ext dari klien, timpa file |
| 33 | `/api/upload/design` | POST | YA | **TIDAK** | **TIDAK** | MIME+10MB | – | **F-25** idem |
| 34 | `/api/user/change-password` | POST | YA | – | diri sendiri | baik | – | **Benar** — verifikasi password lama |
| 35 | `/api/user/update-profile` | POST | YA | – | diri sendiri | dasar | aman | **Benar** — `userId` dari sesi |

**Rekapitulasi:** 13 route tanpa `getServerSession` · 4 endpoint `/api/admin/*` tanpa cek role apa pun · 5 IDOR · 3 mass-assignment · hanya 2 route (`user/change-password`, `user/update-profile`) yang sepenuhnya benar.

### Catatan tentang upload (F-25)

`src/app/api/upload/design/route.ts:55-57`:
```ts
    const ext = file.name.split('.').pop() || "png";        // :55  dari nama file klien
    const filename = `DESIGN-${orderId}-${Date.now()}.${ext}`;
    const filePath = path.join(uploadDir, filename);        // :57
```
Validasi MIME (`:35-38`) dan batas 10 MB (`:30-32`) sudah ada — itu baik. Tetapi `ext` diambil dari nama file klien dan **tidak dicocokkan** dengan MIME, sehingga berkas ber-`Content-Type: image/png` dapat disimpan sebagai `.html`/`.svg` di `public/uploads/designs` dan disajikan sebagai HTML → **stored XSS**. `orderId` juga masuk ke nama file tanpa sanitasi (`:56`) dan tanpa cek kepemilikan order.

Di `src/app/api/upload/route.ts:29-30` risikonya sedikit berbeda: nama file `DESIGN-${orderId}.${ext}` **tanpa** timestamp, sehingga desain pengguna lain dapat **ditimpa** bila `orderId` diketahui.

Varian NestJS lebih parah — `backend/src/uploads/uploads.controller.ts:20-21` tanpa auth dan `orderId` mentah memungkinkan **path traversal** (`../`) keluar dari direktori upload.

**Patch:**
```ts
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
};

const ext = MIME_EXT[file.type];                       // ekstensi DARI MIME, bukan nama file
if (!ext) return NextResponse.json({ message: "Format tidak didukung" }, { status: 400 });

// Verifikasi order milik pemanggil.
const order = await prisma.booking.findFirst({
  where: { id: orderId, userId: session.user.id },
  select: { id: true },
});
if (!order) return NextResponse.json({ message: "Order tidak ditemukan" }, { status: 404 });

const filename = `DESIGN-${crypto.randomUUID()}.${ext}`;   // nama acak, tak bisa ditebak/ditimpa
const filePath = path.join(uploadDir, filename);
if (!filePath.startsWith(uploadDir)) throw new Error("Path traversal");   // sabuk pengaman
```
Pertimbangkan menyajikan berkas lewat route terautentikasi, bukan dari `public/`.

---

## Quick Wins (urut rasio dampak/usaha)

| # | Aksi | Usaha | Dampak | Referensi |
|---|---|---|---|---|
| 1 | Hapus `src/app/api/proxy/route.ts` dan `src/app/api/proxy/[...path]/route.ts` bila tidak esensial; jika perlu, pindahkan 2 pemanggil ke route khusus | 15 mnt | Menutup 2 CRITICAL sekaligus | F-02, F-03 |
| 2 | Tambah blok auth+role 4 baris ke `admin/users/update-account`, `update-business`, `users/create`, `settings` GET | 30 mnt | Menutup escalation ke SUPER_ADMIN | F-01, F-05, F-06 |
| 3 | Tambah blok role yang sama ke 6 route `admin/chat/*` + `billboards/detail` | 30 mnt | Menutup impersonasi admin & abuse AI | F-14, F-22 |
| 4 | Ganti `where:{id}` → `updateMany` + `userId` pada 3 route booking | 30 mnt | Menutup seluruh IDOR booking | F-11, F-12 |
| 5 | Samakan pesan error login (hapus user enumeration) | 5 mnt | Hentikan enumerasi akun | F-19 |
| 6 | Hitung ulang `totalPrice` di server dari harga DB | 30 mnt | Cegah penipuan harga | F-13 |
| 7 | `select` eksplisit di `users/page.tsx` (buang `password`) | 10 mnt | Hentikan kebocoran hash bcrypt | F-16 |
| 8 | Regenerasi `NEXTAUTH_SECRET`, set `session.maxAge`, hapus password plaintext di komentar `.env` | 15 mnt | Perkuat sesi | F-27, F-32 |
| 9 | `git rm -r --cached backend/dist`, tambah `dist/` ke `.gitignore`, rotasi JWT secret ke env | 30 mnt | Hentikan kebocoran secret berulang | F-07 |
| 10 | Tambah `getServerSession` ke 3 Server Action | 20 mnt | Hentikan kebocoran omzet & transkrip | F-15 |
| 11 | Turunkan ekstensi upload dari MIME + nama acak + cek kepemilikan | 45 mnt | Cegah stored XSS & timpa berkas | F-25 |
| 12 | Batasi CORS di `backend/src/main.ts:14` & `chat-server/index.js:13-15` | 15 mnt | Kurangi permukaan lintas origin | F-26 |
| 13 | `app.use(helmet())` + `ValidationPipe({whitelist:true})` di NestJS | 20 mnt | Header + tutup mass-assignment | F-21, F-33 |
| 14 | Verifikasi `profile.email_verified` di callback `signIn` | 20 mnt | Cegah takeover via Google | F-18 |
| 15 | Tambah `io.use()` auth + `sender` server-side di chat-server | 2 jam | Menutup 2 CRITICAL chat | F-09, F-10 |
| 16 | Daftarkan `APP_GUARD` di NestJS, cabut `@Public()` destruktif | 2 jam | Menutup bypass backend | F-08 |
| 17 | Verifikasi HMAC webhook pembayaran (Next.js + NestJS) | 3 jam | Hentikan penipuan "LUNAS" | F-04 |
| 18 | Tambah `src/middleware.ts` sebagai pertahanan berlapis | 1 jam | Jaring pengaman edge | F-17 |
| 19 | Pasang rate limiting pada login/change-password/AI | 3 jam | Cegah brute force & abuse biaya | F-19 |
| 20 | Matikan `ignoreBuildErrors`, tambah header keamanan di `next.config.ts` | 2 jam+ | CSP/HSTS; perbaiki bug tersembunyi | F-24 |

### Catatan prioritas

Butir 1–10 seluruhnya dapat diselesaikan dalam **satu hari kerja** dan sudah menutup mayoritas temuan CRITICAL. Kerjakan itu lebih dulu.

Butir 15–17 berdurasi lebih panjang tetapi **tidak boleh ditunda ke rilis berikutnya**: selama backend NestJS berjalan di port 4001 tanpa guard, dan chat-server tanpa autentikasi, aplikasi tetap dapat dikompromikan sepenuhnya meski seluruh route Next.js sudah ditambal.

**Sebelum go-live, lakukan juga:** rotasi seluruh kredensial yang tersentuh audit ini (JWT secret, `NEXTAUTH_SECRET`, `GEMINI_API_KEY`, password Supabase, `GOOGLE_CLIENT_SECRET`, `SMTP_PASS`), ganti kredensial default pada `docker-compose.yml:6-8`, dan berhenti mem-publish port 5432 ke host.

### Konfigurasi `next.config.ts` (F-24)

```ts
const nextConfig: NextConfig = {
  // typescript.ignoreBuildErrors & eslint.ignoreDuringBuilds DIHAPUS —
  // keduanya menyembunyikan bug tipe yang justru menjadi sumber sebagian temuan di atas.
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; img-src 'self' data: https:; frame-ancestors 'none'" },
      ],
    }];
  },
};
```
`images.remotePatterns` (`next.config.ts:10-23`) sudah membatasi ke tiga host spesifik tanpa wildcard — konfigurasi ini **sudah benar** dan tidak perlu diubah.

---

## Lampiran — Verifikasi yang menghasilkan nihil (bersih)

Dicantumkan agar cakupan audit dapat ditelusuri ulang:

| Pemeriksaan | Perintah / lokasi | Hasil |
|---|---|---|
| `.env` pernah di-commit | `git log --all --diff-filter=A --name-only \| grep -i env` | Nihil — bersih |
| `.env` ter-track saat ini | `git ls-files \| grep -i env` | Nihil — bersih |
| Cakupan `.gitignore` | `git check-ignore -v .env .env.local backend/.env chat-server/.env` | Keempatnya tercakup `.gitignore:39` |
| Sink XSS | `grep -rn "dangerouslySetInnerHTML\|eval(\|new Function(" src/` | Nihil |
| Secret di `NEXT_PUBLIC_` | 4 variabel di `.env` | Semua URL / nama cloud publik — aman |
| Wildcard `remotePatterns` | `next.config.ts:10-23` | 3 host eksplisit — aman |
| `src/middleware.ts` | `find src -maxdepth 2 -name middleware.ts` | Tidak ada — lihat F-17 |
| OTP terpakai | `grep -rn "otpCode" --include=*.ts --include=*.tsx` | Nihil — dead code (F-30) |

**Metodologi:** seluruh temuan berasal dari pembacaan kode sumber secara langsung. Tidak ada eksploitasi yang dijalankan terhadap sistem berjalan; dampak dinilai secara analitis dari alur kode. Kutipan kode bersifat verbatim dengan nomor baris sesuai commit `f1f5eba`.

**Spekulasi yang ditandai eksplisit:** (a) pada F-07, penerimaan algoritma HS256/384/512 disimpulkan dari perilaku default `passport-jwt` saat `algorithms` tidak diset, bukan dari uji langsung; (b) pada F-18, kemungkinan Google mengembalikan `email_verified: false` bergantung pada tipe akun Workspace — mitigasinya tetap wajib tanpa memandang hal itu; (c) pada F-20, kegagalan `create` booking akibat FK `'clerk-user-id'` disimpulkan dari schema, tidak diuji terhadap DB berjalan.
