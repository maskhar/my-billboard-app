# Audit Mendalam: Admin Dashboard (Back-Office)

**Aplikasi:** Utero Cloud — Billboard Rental
**Tanggal audit:** 2026-09-21
**Branch:** `master` @ `f1f5eba`
**Keluhan user (verbatim):** _"Untuk dashboard sepertinya kurang responsif dan banyak fitur yang belum ada dan belum sempurna"_

---

## 1. Executive Summary

Keluhan user **terbukti benar dan sebenarnya lebih parah dari yang dirasakan**. Tiga temuan struktural:

**A. Dashboard tidak bisa dipakai di HP sama sekali — bukan "kurang responsif", tapi "tidak ada versi mobile".**
Sidebar di `src/app/admin/(dashboard)/layout.tsx:39` memakai class `hidden md:flex`. Di bawah 768px sidebar **menghilang total dan tidak ada hamburger/drawer pengganti**. Artinya di HP, admin yang sudah login **tidak punya cara apa pun untuk navigasi** antar menu Overview / Transaksi / Inventory / Users / Live Chat — satu-satunya link yang tersisa adalah "Keluar ke Web Utama" di header. Ini bukan masalah kosmetik, ini **dead-end navigasi**. Diperparah: dari 3 tabel data utama, hanya **1** yang punya `overflow-x-auto` (`page.tsx:125`); tabel Inventory (5 kolom) dan tabel Users (6 kolom) tidak dibungkus apa pun sehingga memaksa horizontal scroll pada `<body>` di 375px.

**B. Ada BUG ANGKA di KPI utama — omzet yang ditampilkan SALAH (severity HIGH).**
`src/app/admin/(dashboard)/page.tsx:33` dan `src/app/admin/(dashboard)/actions.ts:45` sama-sama menghitung omzet dengan `status: { in: ['PAID_CONFIRMED', 'ACTIVE', 'REFUNDED'] }`. Status **`REFUNDED` ikut dijumlahkan sebagai pendapatan**. Uang yang sudah dikembalikan ke pelanggan tetap dihitung sebagai omzet, di kartu "Total Omzet" maupun di grafik "Tren Pendapatan". Selain itu `additionalCharges` (biaya tambahan yang bisa diinput admin di `TransactionClient.tsx:261`) **tidak pernah masuk** ke perhitungan omzet dashboard, sementara di layar detail order dia dihitung sebagai `grandTotal` (`TransactionClient.tsx:191`). Jadi dua layar di aplikasi yang sama menampilkan definisi "total" yang berbeda.

**C. "Banyak fitur belum ada" — konfirmasi: back-office ini hanya CRUD dasar.**
Tidak ada **pagination sama sekali** (semua `findMany` tanpa `take`/`skip`), tidak ada **export CSV/Excel**, tidak ada **bulk action**, tidak ada **kalender ketersediaan billboard**, tidak ada **audit log viewer**, tidak ada **notification center**, tidak ada **date-range filter** di dashboard, tidak ada **halaman `/admin/reporting`** (padahal di-link dari `CS_Sidebar.tsx:12` → 404). Kotak search di `TransactionClient.tsx:198` dan `CS_InboxLayout.tsx:16` adalah **input mati** — tidak ada `value`, tidak ada `onChange`, tidak ada handler. Murni hiasan.

**D. Dead code & arsitektur kembar.**
`src/components/admin/ChatInterface.tsx` (223 baris, UI chat paling lengkap: AI assist, template balasan, join/leave chat) dan `src/components/admin/UserActions.tsx` (119 baris, modal ubah role + hapus user) **tidak di-import di mana pun** — nol referensi. Fitur "Join Chat / ambil alih percakapan dari bot" yang jadi inti live chat **ada kodenya tapi tidak pernah dirender**. Sementara itu seluruh set `CS_*` **unreachable karena role gate**: `layout.tsx:89-93` menolak semua role selain `ADMIN`/`SUPER_ADMIN` **sebelum** percabangan `if (userRole === 'CS')` di baris 96 sempat dievaluasi.

**E. Kualitas interaksi setara prototipe.**
53 pemakaian `confirm()` / `alert()` / `prompt()` native tersebar di 12 file. Aksi destruktif (hapus billboard permanen) dan aksi finansial (verifikasi pembayaran, batal paksa) semuanya lewat dialog browser. Ada 2 `window.location.reload()` (`billboards/form/page.tsx:120,153`) yang membuang seluruh state React. Tidak ada satu pun `loading.tsx` atau `error.tsx` di seluruh tree `src/app/admin/`.

**Vonis:** dashboard ini layak disebut **MVP internal desktop-only**, belum layak disebut back-office produksi. Prioritas perbaikan: (1) fix angka omzet, (2) mobile shell, (3) pagination, (4) hidupkan kembali `ChatInterface`, (5) ganti `confirm()` dengan dialog proper.

---

## 2. Apa yang Sebenarnya Ada vs Apa yang Diklaim Dokumentasi

Legenda status: **ADA** = berfungsi penuh · **PARSIAL** = ada tapi tidak lengkap/cacat · **TIDAK ADA** = tidak dibangun · **DEAD CODE** = kode ada, tidak pernah dirender.

### 2.1 Navigasi & Shell

| Fitur | Status | Bukti (file:line) |
|---|---|---|
| Sidebar desktop | ADA | `src/app/admin/(dashboard)/layout.tsx:39-66` |
| Mobile drawer / hamburger | **TIDAK ADA** | `layout.tsx:39` — `className="w-64 ... hidden md:flex"`, tidak ada state/toggle/`<Dialog>` di seluruh file |
| Active-state pada menu sidebar | **TIDAK ADA** | `layout.tsx:46` — `<Link>` tanpa `usePathname()`; semua menu terlihat sama (bandingkan `CS_Sidebar.tsx:27` yang justru punya) |
| Breadcrumb | **TIDAK ADA** | Header hardcode `"Panel Kontrol"` di `layout.tsx:69` untuk semua halaman |
| Halaman `/admin/reporting` | **TIDAK ADA (404)** | Di-link dari `CS_Sidebar.tsx:12`, tidak ada `src/app/admin/(dashboard)/reporting/page.tsx` |
| Role gating UI (4 role) | **PARSIAL / CACAT** | `layout.tsx:89-98` — lihat F-02 |
| `loading.tsx` / `error.tsx` | **TIDAK ADA** | Nol file `loading.tsx`/`error.tsx`/`not-found.tsx` di `src/app/admin/**` |

### 2.2 Tabel & Data Grid

| Fitur | Status | Bukti (file:line) |
|---|---|---|
| Pagination (server) | **TIDAK ADA** | `users/page.tsx:7` `findMany` tanpa `take`/`skip`; `orders/page.tsx:37` idem; `billboards/page.tsx:21` fetch semua |
| Pagination (kontrol UI) | **TIDAK ADA** | Tidak ada komponen pagination di seluruh `src/app/admin` |
| Search transaksi | **DEAD INPUT** | `orders/TransactionClient.tsx:198` — `<input type="search">` tanpa `value`/`onChange`/handler |
| Search chat | **DEAD INPUT** | `_components/cs/CS_InboxLayout.tsx:16` — idem |
| Search billboard | **TIDAK ADA** | `billboards/page.tsx:40-115` — tidak ada input search |
| Search user | **TIDAK ADA** | `users/UserClientPage.tsx:19-121` — tidak ada input search |
| Sort per-kolom | **TIDAK ADA** | Semua `<th>` statis, cth `billboards/page.tsx:56-60` |
| Filter status order | ADA | `orders/page.tsx:29-35` + tab di `:58-64` |
| Date-range filter | **TIDAK ADA** | Tidak ada di manapun; `RevenueSection.tsx:19-26` hanya preset periode |
| Bulk action / checkbox | **TIDAK ADA** | Tidak ada `<input type="checkbox">` untuk baris di tabel manapun |
| Export CSV / Excel | **TIDAK ADA** | Nol referensi export di `src/app/admin` |
| `overflow-x-auto` pada tabel | **PARSIAL (1 dari 3)** | ADA: `page.tsx:125`. TIDAK: `billboards/page.tsx:53`, `users/UserClientPage.tsx:37` |
| Card layout mobile untuk tabel | **TIDAK ADA** | Nol; semua `<table>` tanpa alternatif |
| Empty state | **PARSIAL (1 dari 3)** | ADA: `billboards/page.tsx:65`. TIDAK: `users/UserClientPage.tsx:49`, `page.tsx:136` (`.map()` langsung ke array kosong) |
| Loading skeleton | **TIDAK ADA** | Hanya teks `"Loading..."` di `billboards/form/page.tsx:159` dan `orders/[id]/page.tsx:39` |
| Error state per-list | **PARSIAL** | `billboards/page.tsx:23-34` return `[]` senyap → error dibaca user sebagai "Belum ada data" (lihat F-14) |

### 2.3 Fitur Bisnis Billboard

| Fitur | Status | Bukti (file:line) |
|---|---|---|
| CRUD billboard | ADA | `billboards/page.tsx`, `billboards/form/page.tsx` |
| Ubah status (Available/Booked/publish) | ADA | `src/components/admin/StatusChanger.tsx:33-61` |
| Hapus billboard | ADA (tanpa dialog proper) | `src/components/admin/DeleteBillboardBtn.tsx:14` |
| Upload gambar + galeri | ADA | `billboards/form/page.tsx:236-258` |
| **Billboard history / rollback UI** | **ADA (klaim dokumentasi TERVERIFIKASI)** | `billboards/form/page.tsx:271-293`; rollback handler `:111-121`. Model `prisma/schema.prisma:192-209`. Klaim di `billboard-system.md:63` benar. **Tapi** lihat F-11: UI-nya hanya menampilkan harga lama, tidak ada diff, dan pakai `window.location.reload()` |
| **Kalender ketersediaan / booking timeline** | **TIDAK ADA** | Tidak ada komponen kalender di `src/app/admin`; admin tidak bisa lihat slot tanggal terisi |
| Peta lokasi billboard (admin) | **TIDAK ADA** | Hanya input lat/lng mentah di `billboards/form/page.tsx:229` |

### 2.4 Fitur Bisnis Order & Keuangan

| Fitur | Status | Bukti (file:line) |
|---|---|---|
| List + detail transaksi | ADA | `orders/page.tsx`, `orders/TransactionClient.tsx` |
| **Payment verification screen** | **PARSIAL** | `src/components/admin/OrderActions.tsx:71-82` — hanya `confirm()`; **tidak ada tampilan bukti transfer dari user** untuk diverifikasi |
| **Production stepper (Cetak → Pasang → Tayang)** | **PARSIAL** | Transisi status ADA (`OrderActions.tsx:85-100`), tapi **tidak ada komponen stepper visual**; admin harus menebak tahap dari warna tombol |
| Upload bukti tayang | **ADA (2 implementasi berbeda, membingungkan)** | `OrderActions.tsx:196-212` (modal, base64) **dan** `orders/[id]/page.tsx:50-58` (halaman terpisah). Lihat F-13 |
| **Refund processing UI (upload bukti transfer)** | **RUSAK / DIHAPUS SEBAGIAN** | `OrderActions.tsx:214-215` — komentar literal: *"Modal Lain (Transfer Refund / Preview) biarkan logic sebelumnya tetap ada jika perlu..."*. State `showTransferModal` di-set `true` di `:174` tapi **JSX modalnya tidak ada** → tombol "Trf Sekarang" **tidak melakukan apa-apa**. Lihat F-01 |
| Tambah biaya tambahan | ADA | `TransactionClient.tsx:75-137` |
| Approve/reject desain | ADA (pakai `prompt()`) | `TransactionClient.tsx:143-169` |
| Invoice / print | ADA (link keluar) | `OrderActions.tsx:191` → `/invoice/${order.id}` |
| **Perhitungan omzet benar** | **TIDAK — BUG** | `page.tsx:33`, `actions.ts:45` — `REFUNDED` dihitung sebagai omzet. Lihat F-03 |
| PPN / pajak di perhitungan | **TIDAK ADA** | "PPN 11%" hanya checkbox teks di `billboards/form/page.tsx:30`, tidak pernah masuk kalkulasi |
| DP vs pelunasan | **TIDAK ADA di UI** | `prisma/schema.prisma:113` punya `dpAmount`, **nol referensi** di seluruh UI admin |

### 2.5 User Management & Keamanan

| Fitur | Status | Bukti (file:line) |
|---|---|---|
| List user + total spending | ADA | `users/UserClientPage.tsx:36-120` |
| Tambah user + set role | ADA | `users/UserFormModal.tsx:113-135` |
| Edit profil & role user | ADA | `users/[userId]/UserProfileForm.tsx:145-151` |
| Hapus user | **DEAD CODE** | `src/components/admin/UserActions.tsx:17-37` — **nol importer** |
| Modal ubah role cepat dari tabel | **DEAD CODE** | `UserActions.tsx:84-116` — nol importer |
| **Role/permission management UI** | **TIDAK ADA** | Role hanya `String` (`prisma/schema.prisma:32`), tidak ada matriks permission. Lihat F-02 untuk inkonsistensi daftar role |
| **Audit log viewer** | **TIDAK ADA** | Tidak ada model `AuditLog` di schema, tidak ada halaman |
| **Notification center / unread badge** | **TIDAK ADA** | Tidak ada model `Notification`, nol badge di `layout.tsx:43-54` |
| Upload foto profil user | **STUB** | `UserProfileForm.tsx:141` — `<button>Change Picture</button>` tanpa `onClick` |

### 2.6 Live Chat & Settings

| Fitur | Status | Bukti (file:line) |
|---|---|---|
| Inbox chat + kirim balasan | ADA | `_components/cs/CS_InboxLayout.tsx:168-251` |
| Realtime socket.io | ADA (bocor) | `CS_InboxLayout.tsx:176-193` — lihat F-06 |
| **Take over chat dari bot ("Join Chat")** | **DEAD CODE** | `src/components/admin/ChatInterface.tsx:76-81,185-192` — **nol importer** |
| **AI assist / template balasan** | **DEAD CODE** | `ChatInterface.tsx:107-118` (AI), `:22-27,179-183` (template) — nol importer |
| Detail pengunjung (IP/OS/browser) | **DATA PALSU HARDCODE** | `CS_InboxLayout.tsx:156-159` — `Indonesia` / `127.0.0.1` / `Chrome` / `Windows` ditulis literal |
| Status online pengunjung | **HARDCODE** | `CS_InboxLayout.tsx:95` — selalu `Online`, tidak baca `session.isOnline` (field ADA di `schema.prisma:176`) |
| Settings: identitas site | ADA | `settings/page.tsx:59-73` |
| Settings: API key Gemini + test | ADA | `settings/page.tsx:91-113` |
| Settings: API key Google Maps | ADA (tanpa test) | `settings/page.tsx:76-88` |
| **Settings: SMTP + tombol test** | **TIDAK ADA** | Tidak ada field SMTP di `settings/page.tsx` meski `src/lib/mail.ts` ada |
| **Settings: konfigurasi bisnis** (PPN, rekening, jam kerja) | **TIDAK ADA** | `prisma/schema.prisma:160-167` `SystemSetting` hanya punya 4 field |

### 2.7 Klarifikasi soal `src/lib/dummy-data.ts`

File `src/lib/dummy-data.ts` **ADA**, tetapi hasil grep menunjukkan **nol import dari `src/app/admin` maupun `src/components/admin`**. Jadi dashboard admin **tidak** memakai dummy-data. Data placeholder di admin muncul dari sumber lain (hardcode inline): lihat F-07 (`CS_Dashboard.tsx`) dan `CS_InboxLayout.tsx:156-159`, serta nama perusahaan hardcode di `TransactionClient.tsx:245-246` (`"Iklan Jaya Group"`, `"Jl. Melati No. 10, Jakarta"`).

---

## 3. Audit Per-Layar

### 3.1 Shell Admin — `src/app/admin/(dashboard)/layout.tsx`

**Responsivitas**

| Baris | className | Masalah | Breakpoint rusak |
|---|---|---|---|
| `:39` | `w-64 bg-[#0F172A] text-white flex-shrink-0 hidden md:flex flex-col` | Sidebar hilang total, **tanpa pengganti**. Tidak ada state hamburger, tidak ada `@headlessui/react` `Dialog` (padahal library-nya sudah terpasang) | **< 768px** — navigasi mati total |
| `:68` | `h-16 flex-shrink-0 flex items-center justify-between px-8 z-20` | `px-8` (32px kiri+kanan) di layar 320px menyisakan 256px untuk judul + tombol | **≤ 375px** — tombol "Keluar ke Web Utama" terdesak/wrap |
| `:74` | `flex-1 overflow-y-auto p-8 pb-32` | Padding 32px di semua sisi, tidak turun ke `p-4` di mobile. Konten efektif hanya 311px di layar 375px | **≤ 375px** |
| `:67` | `flex-1 flex flex-col overflow-hidden h-screen` | `h-screen` + `overflow-hidden` di mobile bertabrakan dengan address-bar dinamis browser HP (harus `dvh`) | **< 768px** |

**Fungsional**
- `:89-98` — **bug urutan guard**: `allowedRoles = ['ADMIN','SUPER_ADMIN']` mem-block role `CS` di baris 91-93, sehingga `if (userRole === 'CS')` di baris 96 **tidak akan pernah true**. Seluruh `CS_Layout`/`CS_Sidebar`/`CS_Dashboard` unreachable. Role `OPERATOR` (ada di `UserFormModal.tsx:122` dan `schema.prisma:32`) juga di-block → user dengan role OPERATOR melihat layar "Akses Ditolak".
- `:46` — tidak ada highlight menu aktif; admin tidak tahu sedang di halaman mana.
- `:13` — `({ session }: { session: any })`, `:37` — `session: any, menus: any[]`. Typing hilang.

### 3.2 Dashboard Utama — `src/app/admin/(dashboard)/page.tsx`

**Informasi & angka**
- KPI yang ADA (`:51-56`): Total Omzet, Total Pesanan, Titik Billboard, Pelanggan. Semuanya **counter kumulatif sepanjang masa** — tanpa periode, tanpa perbandingan, tanpa tren. Untuk operasional harian nyaris tidak berguna.
- KPI yang **TIDAK ADA**: occupancy rate (berapa % titik tersewa), revenue MoM/YoY, antrean tindakan (order menunggu verifikasi, desain menunggu review, refund menunggu transfer), kontrak akan berakhir (`Booking.endDate` ADA di `schema.prisma:110` tapi tak pernah dipakai di admin), rata-rata nilai order.
- `:33` — **BUG HIGH**: `status: { in: ['PAID_CONFIRMED','ACTIVE','REFUNDED'] }` → order yang sudah direfund tetap dihitung omzet.
- `:48` — `revenueResult._sum.totalPrice` tidak menambahkan `AdditionalCharge`, sehingga berbeda dengan `grandTotal` di `TransactionClient.tsx:191`.
- `:102-114` — widget "🔥 Fast Action" menulis *"Ada orderan yang butuh persetujuan manual"* **secara hardcode**, tanpa query apa pun. Kalimat ini muncul bahkan ketika tidak ada satu pun order pending. Ini **placeholder yang menyamar sebagai data**.
- `:52` — `totalRevenue.toLocaleString('id-ID')` ✅ benar. `:148` — `order.totalPrice.toLocaleString()` ❌ **tanpa locale**, jatuh ke locale server. Dua format berbeda di halaman yang sama.
- `:141-146` — pewarnaan status hanya meng-handle `PENDING_PAYMENT` dan `ACTIVE`; **11 status lain** (`IN_PRODUCTION`, `INSTALLATION`, `DESIGN_RECEIVED`, `PROCESS_REFUND`, dll.) semuanya jatuh ke `else` → **merah**, seolah-olah error.

**Responsivitas**

| Baris | className | Masalah | Breakpoint rusak |
|---|---|---|---|
| `:80` | `grid grid-cols-1 md:grid-cols-4 gap-6` | Lompat 1 → 4 kolom. Di tablet 768px, 4 kartu berisi "Rp 125.000.000" dipaksa ke ~170px/kartu → angka terpotong. Butuh `sm:grid-cols-2 lg:grid-cols-4` | **768–1023px** |
| `:95` | `grid grid-cols-1 lg:grid-cols-3 gap-8` | OK, tapi di 768–1023px chart jadi full-width dengan tinggi tetap 400px | 768–1023px (minor) |
| `:125` | `overflow-x-auto` | ✅ **satu-satunya tabel yang benar** di seluruh admin | — |
| `:129` | `px-8 py-3 pl-8` | Padding 32px per sel memperlebar tabel tanpa guna di mobile | ≤ 375px (minor) |

**A11y**
- `:126` — `<table>` tanpa `<caption>`; `:129-132` — `<th>` **tanpa `scope="col"`**.
- `:136` — jika `recentOrders` kosong, `<tbody>` render kosong melompong tanpa empty state.

### 3.3 Inventory Billboard — `src/app/admin/(dashboard)/billboards/page.tsx`

**Responsivitas**

| Baris | className | Masalah | Breakpoint rusak |
|---|---|---|---|
| `:52-53` | `bg-white rounded-xl ...` lalu `<table className="w-full text-left">` | **TIDAK ADA `overflow-x-auto`**. 5 kolom (Foto 96px + Info 250px + Audit + Status + Aksi ~3 tombol) ≈ 700px minimum. Di 375px memaksa scroll horizontal pada seluruh halaman, header ikut bergeser | **< 1024px**, parah di **≤ 375px** |
| `:75` | `px-6 py-3 max-w-[250px]` | `max-width` fixed tidak turun di mobile | < 768px |
| `:103` | `flex justify-center gap-2` | 3 tombol aksi 36px tanpa wrap | ≤ 375px |

**Fungsional & keamanan**
- `:17-18` — komentar literal: *"WARNING: This is now an unauthenticated call for debugging purposes."* Endpoint admin `/api/billboards/admin` dipanggil **tanpa autentikasi**, dan `BACKEND_API_URL` fallback ke `http://localhost:4001` **hardcode**. Ini kode debug yang bocor ke `master`.
- `:23-34` — error di-swallow, `return []`. UI lalu menampilkan `"Belum ada data."` (`:65`). **Backend mati = admin percaya inventory-nya kosong.** Berbahaya.
- `:71` — `<img src={item.mainImage} />` tanpa `alt` (a11y) dan tanpa `next/image` (performa).
- Tidak ada: search, filter status, sort, pagination, bulk action, export.

**A11y**: `:56-60` `<th>` tanpa `scope`. `:104-106` tombol ikon (Eye/Edit/Trash) hanya punya `title`, **tanpa `aria-label`**.

### 3.4 Form Billboard — `src/app/admin/(dashboard)/billboards/form/page.tsx`

- `:91` — `alert("Isi Nama Dulu")` sebagai validasi.
- `:112` — `confirm('Rollback data?')` untuk aksi **rollback data produksi** — pesan tidak menyebut versi mana yang akan dipulihkan, tidak menyebut data saat ini akan tertimpa.
- `:120` dan `:153` — **`window.location.reload()`**. Full page reload, buang seluruh state React, kedipan putih, dan pada `:153` terjadi **setelah** `alert("Sukses!")` sehingga user menekan OK lalu halaman blank sesaat.
- `:147-155` — pada error, `alert("Gagal: " + msg.message)` — input user **tidak hilang** (form state dipertahankan) ✅, tapi tidak ada inline field error; user tidak tahu field mana yang salah.
- `:52-54` — `JSON.parse(data.gallery || "[]")` **tanpa try/catch**. JSON rusak di DB → komponen crash, dan karena tidak ada `error.tsx` di admin, user dapat error overlay/blank.
- `:272-293` — panel Riwayat Revisi (rollback UI) **ADA dan terverifikasi**, namun hanya menampilkan `log.price` (`:285`) — tidak ada diff field lain, tidak ada preview snapshot (`snapshot` ADA di `schema.prisma:208`), tidak ada nama field yang berubah. `:291` — footer literal `"*Audit Log V1"`.
- `:285` — `log.price.toLocaleString()` **tanpa `'id-ID'`**.
- **Responsivitas**: `:171` `grid-cols-1 lg:grid-cols-3` OK. Tapi `:180` `grid grid-cols-2 gap-2` dan `:213` `grid grid-cols-2 gap-x-8` **tidak punya breakpoint** → tetap 2 kolom di 320px, tiap kolom ~140px, label "Pengawasan Media / Maintenance" (`:29`) pecah/terpotong. Rusak di **≤ 375px**.
- **A11y**: seluruh `<input>`/`<select>` memakai `<label>` **tanpa `htmlFor`** dan input tanpa `id` (cth `:178`, `:191`) → label tidak terasosiasi, klik label tidak memfokuskan input, screen reader tidak membacakan.

### 3.5 Transaksi — `orders/page.tsx` + `orders/TransactionClient.tsx`

**Responsivitas**

| Baris | className | Masalah | Breakpoint rusak |
|---|---|---|---|
| `TransactionClient.tsx:194` | `grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-200px)]` | Di bawah 1024px, list dan detail jadi **bertumpuk vertikal** di dalam kontainer **tinggi tetap** `calc(100vh-200px)`. Efeknya: dua area scroll bersarang di dalam satu area scroll induk (`layout.tsx:74`) — "scroll dalam scroll dalam scroll". Di mobile memilih transaksi tidak menggulirkan tampilan ke detail, sehingga **user mengira klik tidak berfungsi** | **< 1024px** |
| `TransactionClient.tsx:220` | `h-full p-8 relative overflow-y-auto` | Padding 32px + tinggi induk yang sudah sempit | ≤ 375px |
| `TransactionClient.tsx:236` | `grid grid-cols-1 md:grid-cols-2 gap-8` | OK | — |
| `orders/page.tsx:58` | `flex flex-wrap gap-2 p-1` | ✅ `flex-wrap` benar | — |

**Fungsional**
- `TransactionClient.tsx:198` — **search box mati** (tanpa `value`/`onChange`).
- `TransactionClient.tsx:140` — `useState(transactions[0])` auto-select item pertama; setelah `router.refresh()` seleksi **kembali ke item pertama**, admin kehilangan konteks di tengah kerja.
- `TransactionClient.tsx:245-246` — data penjual **hardcode**: `"Iklan Jaya Group"`, `"Jl. Melati No. 10, Jakarta"`. Inkonsisten dengan brand "Utero Cloud" di `layout.tsx:41`.
- `TransactionClient.tsx:172` — `StatusBadge` selalu `bg-green-100 text-green-700` untuk **semua** status, termasuk `CANCELLED`/`REFUNDED`. Order batal ditampilkan hijau = salah baca.
- `TransactionClient.tsx:272-274` — `JSON.parse(selected.billboard.specs)` dipanggil **3× berturut-turut tanpa try/catch**; `specs` null/rusak → crash.
- `orders/page.tsx:37` — `findMany` tanpa `take`. `:54` — `transactions.length` ditampilkan sebagai "Total", padahal itu jumlah baris yang ter-load, bukan total DB.
- `orders/page.tsx:25` — `searchParams` di-akses langsung (`:29`) tanpa `await`; di Next.js 15 `searchParams` adalah Promise.
- `orders/page.tsx:1-18` — 18 baris kosong di awal file.

**A11y**: `TransactionClient.tsx:221` tombol close hanya ikon `<X>` **tanpa `aria-label`**.

### 3.6 Detail Order — `orders/[id]/page.tsx`

Halaman ini **paling belum jadi** dari semua layar admin:
- `:48` — `grid grid-cols-2 gap-10` **tanpa breakpoint apa pun**. Di 375px jadi dua kolom masing-masing ~155px; area upload (`:50`, `p-6` + border dashed) praktis tidak bisa dipakai. **Rusak di semua layar < 768px.**
- `:61-65` — kolom kanan hanya 2 baris teks, dengan komentar literal `{/* Info biasa ... */}` — **jelas belum selesai**.
- `:23` — `useEffect(..., [])` dengan dependency array kosong padahal memakai `params.id`.
- `:22` — fetch tanpa error handling; API gagal → `order` tetap `null` → **stuck selamanya di `"Loading..."`** (`:39`) tanpa pesan error.
- `:27-34` — POST tanpa header `Content-Type: application/json`.
- `:35-36` — `alert()` lalu `router.refresh()`, tanpa cek `res.ok`. **Gagal simpan tetap menampilkan "Bukti Tayang Disimpan!"** — feedback palsu.
- `:10` — `params` diakses langsung, bukan `use(params)` (Next.js 15).
- Halaman ini **tidak di-link dari mana pun** di UI admin (tabel billboards/orders tidak punya link ke `/admin/orders/[id]`) → praktis orphan route.

### 3.7 Manajemen User — `users/page.tsx`, `UserClientPage.tsx`, `UserFormModal.tsx`

**Responsivitas**

| Baris | className | Masalah | Breakpoint rusak |
|---|---|---|---|
| `UserClientPage.tsx:36-37` | `overflow-hidden` lalu `<table className="w-full text-left">` | **TIDAK ADA `overflow-x-auto`** — dan `overflow-hidden` di pembungkus justru **memotong** kolom yang meluber, bukan menggulirkannya. **6 kolom** (~850px) di layar 375px → kolom "Aksi" (tombol edit) **terpotong dan tidak bisa diakses** | **< 1024px**, kritis di **≤ 768px** |
| `UserClientPage.tsx:23` | `flex justify-between items-center` | Tanpa `flex-col md:flex-row`; judul + tombol "+ Tambah User Baru" berdesakan | ≤ 375px |
| `UserFormModal.tsx:105` | `fixed inset-0 ... flex justify-center items-center` | Tanpa padding tepi dan tanpa `overflow-y-auto`; di layar pendek (mis. HP landscape) isi modal terpotong tanpa bisa di-scroll | < 768px tinggi rendah |
| `UserFormModal.tsx:106` | `w-full max-w-2xl` | Tanpa margin/padding luar → modal menempel ke tepi layar di mobile | ≤ 375px |

**Fungsional**
- `users/page.tsx:7-8` — `findMany` **tanpa pagination** dan dengan `include: { bookings: true }` → **memuat SELURUH booking SETIAP user** ke memori hanya untuk menghitung total spending di client (`UserClientPage.tsx:50-52`). Dengan 1.000 user × 20 booking = 20.000 baris di-serialize ke payload client setiap kali halaman dibuka. Masalah performa serius.
- `UserClientPage.tsx:51` — `filter(b => b.status === 'ACTIVE' || b.status === 'REFUNDED')`. **Sama seperti bug omzet**: order yang direfund dihitung sebagai "Total Spending" pelanggan. Juga tidak menyertakan `PAID_CONFIRMED`, sehingga definisinya berbeda lagi dari dashboard (`page.tsx:33`). **Tiga definisi "uang masuk" berbeda di tiga tempat.**
- `UserClientPage.tsx:49` — tidak ada empty state.
- Tidak ada: search, filter role, sort, pagination, bulk action, export, tombol hapus (ada tapi dead code di `UserActions.tsx`).

**A11y (modal)** — `UserFormModal.tsx:104-138`:
- **Tidak ada focus trap** — Tab keluar ke konten di belakang.
- **Escape tidak menutup modal** — tidak ada listener `keydown`.
- **Tidak ada `role="dialog"` / `aria-modal="true"` / `aria-labelledby`.**
- **Fokus tidak dikembalikan** ke tombol pemicu saat modal ditutup.
- **Tidak ada scroll lock** pada `<body>`.
- `@headlessui/react` sudah terpasang di `package.json` dan `<Dialog>`-nya menyelesaikan semua poin di atas — tapi **tidak dipakai**. Masalah identik pada `UserActions.tsx:85` dan `OrderActions.tsx:197,219`.

**Form state saat error**: `UserFormModal.tsx:97-101` — pada error hanya `alert()`, state form dipertahankan ✅. Tapi `:50-61` me-reset form setiap kali `isOpen` berubah, sehingga menutup modal karena salah klik = **semua ketikan hilang**.

### 3.8 Profil User — `users/[userId]/UserProfileForm.tsx`

- `:141` — `<button type="button">Change Picture</button>` **tanpa `onClick`** → tombol mati (stub).
- `:145-151` — dropdown Role memuat `OPERATOR` dan `CS`, padahal `layout.tsx:89` memblokir kedua role tersebut dari panel admin. **Admin bisa menetapkan role yang membuat user tidak bisa masuk ke mana pun.**
- `:58-107` — dua form terpisah berbagi **satu** state `loading` (`:55`); submit form A mendisable tombol form B.
- `:67,99` — `if (!res.ok) throw new Error('Server error')` → pesan error server yang sebenarnya dibuang, user hanya melihat `"Failed to update..."`.
- `:18` — `<input {...props} />` menyebar props setelah `className`, berisiko menimpa styling.
- **Responsivitas**: `:110` `grid-cols-1 lg:grid-cols-3` ✅, `:114` `md:grid-cols-2` ✅. Layar ini **paling responsif** di seluruh admin.
- **A11y**: ✅ satu-satunya layar dengan `htmlFor`+`id` yang benar (`:10-13`).

### 3.9 Settings — `settings/page.tsx`

- `:27-30` — `fetch` POST **tanpa header `Content-Type: application/json`**, body JSON mentah.
- `:19-23` — fetch tanpa `.catch()`; API gagal → form kosong senyap tanpa indikasi error, dan **menyimpan dari kondisi itu bisa menimpa setting yang ada dengan string kosong**.
- `:84,:100` — API key dirender dengan `type="password"` tetapi **nilai asli dikirim ke client**; siapa pun yang membuka DevTools/React state bisa membaca key. Seharusnya di-mask di server (`sk-...abcd`) dan hanya dikirim saat diubah.
- `:115` — `fixed bottom-0 left-0 right-0 ... md:pl-72`: bar aksi menempel di bawah dengan offset sidebar **hardcode `pl-72` (288px)** padahal sidebar `w-64` (256px) → misalignment 32px di desktop. Di mobile (`< 768px`) offset hilang tetapi sidebar juga tidak ada, jadi kebetulan tidak fatal.
- `:115` — bar `fixed` ini **menutupi konten** di layar pendek; `pb-20` di `:52` sering tidak cukup.
- **TIDAK ADA**: konfigurasi SMTP + tombol test kirim email (meski `src/lib/mail.ts` ada), rekening perusahaan untuk transfer, PPN/pajak, jam operasional, template notifikasi, upload logo/favicon.
- `:32` — `alert("Pengaturan Berhasil Disimpan!")`.

### 3.10 Live Chat — `live-chat/page.tsx` + `CS_InboxLayout.tsx`

**Responsivitas — rusak paling parah setelah shell**

| Baris | className | Masalah | Breakpoint rusak |
|---|---|---|---|
| `CS_InboxLayout.tsx:230` | `grid grid-cols-12 h-screen w-full overflow-hidden` | **`h-screen` di dalam** `layout.tsx:74` yang **sudah** `overflow-y-auto` + header 64px → total tinggi melebihi viewport, bagian bawah (kotak input balasan) **terdorong keluar layar**. Ini terjadi **di semua ukuran layar, termasuk desktop** | **semua breakpoint** |
| `CS_InboxLayout.tsx:231` | `col-span-12 md:col-span-3 h-screen overflow-y-auto` | Di < 768px list chat mengambil **penuh satu layar (100vh)**… | **< 768px** |
| `CS_InboxLayout.tsx:238` | `col-span-12 md:col-span-6 h-screen overflow-y-auto` | …lalu ruang chat **satu layar penuh lagi di bawahnya**. Memilih percakapan **tidak menggulirkan** ke ruang chat → tampak seperti tidak ada yang terjadi. Tidak ada tombol "kembali ke inbox" | **< 768px** — alur chat mobile mati |
| `CS_InboxLayout.tsx:246` | `hidden md:block md:col-span-3` | Panel detail pengunjung hilang di mobile (dapat diterima, tapi isinya data palsu) | < 768px |

**Fungsional**
- `:16` — search inbox **mati** (tanpa `value`/`onChange`).
- `:156-159` — Lokasi/IP/Browser/OS **hardcode**: `Indonesia`, `127.0.0.1`, `Chrome`, `Windows`.
- `:95` — badge `Online` hardcode; field `isOnline` ada di `schema.prisma:176` tapi tidak dibaca.
- `:97-99` — tombol `<SlidersHorizontal>` **tanpa `onClick`** → stub.
- `:22-29` — `<div onClick>` untuk item chat: **bukan `<button>`**, tidak bisa di-Tab, tidak bisa Enter. Bandingkan `TransactionClient.tsx:201` yang memakai `<button>` dengan benar.
- `:177` — URL socket `"http://localhost:3001"` **hardcode** → live chat **mati total di produksi**. Perhatikan `ChatInterface.tsx` justru memakai polling ke API relatif, dan `CS_InboxLayout` memakai socket — dua mekanisme realtime berbeda di satu aplikasi.
- **TIDAK ADA**: fitur ambil-alih dari bot (ada di `ChatInterface.tsx` yang dead code), penanda unread, assignment agent, riwayat chat tertutup, canned response.

**Kebocoran socket (F-06)** — `:176-193`: `useEffect` punya dependency `[selectedSession]`, sehingga **setiap kali admin mengklik percakapan yang berbeda**, socket lama di-`disconnect()` dan **koneksi socket baru dibuat**. Admin yang menyisir 30 percakapan = 30 siklus connect/disconnect. Di jaringan lambat, disconnect dan connect bisa saling mendahului → pesan hilang atau ganda. Perbaikan: socket dibuat sekali dengan `[]`, dan `selectedSession` dibaca lewat ref di dalam handler.

### 3.11 CS_Dashboard — `_components/cs/CS_Dashboard.tsx` (UNREACHABLE)

Seluruh isi layar ini adalah **angka palsu hardcode**:
- `:42` — `value="1"`, `change={75}` → *"+75% vs 7 hari lalu"* untuk "Pengunjung Aktif"
- `:43` — `value="0"`, `change={-100}` → *"-100% vs 7 hari lalu"* untuk "Total Obrolan"
- `:44,:45` — `value="-"` untuk "Waktu Respon" dan "Tingkat Kepuasan"
- `:53-55` — *"Data riwayat akan muncul di sini."* (placeholder eksplisit)
- `:62-69` — dua kartu "Informasi & Update" berisi teks pemasaran hardcode
- `:49` — `grid grid-cols-3 gap-6` **tanpa breakpoint** (child-nya punya `lg:`, tapi grid induknya tetap 3 kolom di 320px)

Untungnya **tidak pernah tampil** karena role gate. Jika role gate diperbaiki tanpa mengganti layar ini, admin CS akan melihat dashboard berisi angka fiksi.

### 3.12 Login Admin — `src/app/admin/login/page.tsx`

Layar paling rapi. Catatan kecil:
- `:65,:75` — `<label>` tanpa `htmlFor`, input tanpa `id`.
- `:31` — semua error digeneralisasi jadi `"Akun tidak ditemukan atau password salah!"` — baik untuk keamanan, tapi error jaringan/server juga masuk ke pesan yang sama sehingga membingungkan.
- Tidak ada: rate limiting UI, "lupa password", show/hide password, 2FA.
- **Responsivitas**: `:55` `w-full max-w-sm` ✅ aman di semua breakpoint. Satu-satunya layar yang benar-benar responsif.

---

## 4. Laporan Dead Code

### 4.1 Dead code mutlak — nol importer (terverifikasi via grep seluruh `src/`)

| File | Baris | Isi | Dampak |
|---|---|---|---|
| `src/components/admin/ChatInterface.tsx` | 223 | UI chat **terlengkap** di repo: Join Chat (`:76-81`), End Chat (`:83-91`), AI Magic Reply (`:107-118`), template balasan (`:22-27`), notifikasi suara (`:29-32`), panel info pengunjung (`:210-220`) | **Fitur inti CS (ambil alih chat dari bot) tidak pernah bisa diakses.** Yang dirender justru `CS_InboxLayout` yang jauh lebih miskin fitur |
| `src/components/admin/UserActions.tsx` | 119 | Hapus user (`:17-37`) + modal ubah role (`:84-116`) | **Admin tidak punya tombol hapus user di UI mana pun.** Halaman Users (`UserClientPage.tsx:111`) hanya punya link edit |
| `src/components/admin/ChatRoom.tsx` | 93 | Chat polling 3 detik, versi paling primitif | Aman dihapus. Catatan: `:93` — `import { MessageCircle }` ditaruh **di baris terakhir file**, setelah `export default` |

### 4.2 Unreachable karena bug role gate (kode ada, di-import, tapi tak pernah dieksekusi)

| File | Di-import oleh | Mengapa tak pernah jalan |
|---|---|---|
| `_components/cs/CS_Layout.tsx` | `layout.tsx:9,97` | `layout.tsx:89-93` menolak role `CS` **sebelum** cek `CS` di `:96` |
| `_components/cs/CS_Sidebar.tsx` | `CS_Layout.tsx:1,6` | Anak dari `CS_Layout` |
| `_components/cs/CS_Dashboard.tsx` | `page.tsx:10,22` | `layout.tsx` sudah memblokir role `CS` sebelum `page.tsx` dirender |

**LIVE (bukan dead code)**: `CS_InboxLayout.tsx` — di-import oleh `live-chat/page.tsx:1` yang berada di bawah role gate `ADMIN`/`SUPER_ADMIN`, jadi **inilah UI chat yang benar-benar dipakai admin**. Penamaan `CS_` menyesatkan.

### 4.3 Route orphan / rusak

| Route | Status |
|---|---|
| `/admin/reporting` | **404** — di-link dari `CS_Sidebar.tsx:12`, direktori tidak ada |
| `/admin/orders/[id]` | Ada tetapi **tidak di-link dari UI manapun**; isinya juga belum selesai (§3.6) |

### 4.4 Duplikasi yang harus dikonsolidasi

| Fungsi | Implementasi ganda | Rekomendasi |
|---|---|---|
| UI chat admin | `ChatInterface.tsx` (dead, kaya fitur) vs `CS_InboxLayout.tsx` (live, miskin fitur) vs `ChatRoom.tsx` (dead) | Port fitur `ChatInterface` ke `CS_InboxLayout`, hapus 2 sisanya |
| Mekanisme realtime | Polling 1 detik (`ChatInterface.tsx:70`) vs socket.io (`CS_InboxLayout.tsx:177`) vs polling 3 detik (`ChatRoom.tsx:27`) | Pilih socket.io saja, URL dari env |
| Upload bukti tayang | Modal di `OrderActions.tsx:196-212` vs halaman `orders/[id]/page.tsx:50-58` | Pertahankan modal, hapus halaman |
| Ubah role user | `UserProfileForm.tsx:145` (live) vs `UserActions.tsx:95` (dead) | Hapus `UserActions.tsx` atau pasang di tabel |
| Header "Tren Pendapatan" | `RevenueSection.tsx:46` **dan** `RevenueChart.tsx:9` — dua kartu bersarang, judul sama muncul **dua kali** | Hapus wrapper di `RevenueChart` |

---

## 5. Tabel Temuan

Severity: **CRITICAL** (fitur mati / angka salah di produksi) · **HIGH** · **MEDIUM** · **LOW**

| ID | Severity | Kategori | Judul | File:line | Dampak | Perbaikan |
|---|---|---|---|---|---|---|
| F-01 | CRITICAL | Fitur hilang | Modal transfer refund dihapus, tombol "Trf Sekarang" mati | `src/components/admin/OrderActions.tsx:174`, komentar di `:214-215` | `setShowTransferModal(true)` dipanggil tapi JSX modal tidak ada → **admin tidak bisa memproses refund sama sekali**. Uang pelanggan tertahan | Bangun modal refund: input nominal, upload bukti transfer, pilih rekening, lalu `updateStatus('REFUNDED', { refundProof, refundAmount })` |
| F-02 | CRITICAL | Auth/Role | Role gate memblokir `CS` & `OPERATOR` sebelum percabangan layout | `src/app/admin/(dashboard)/layout.tsx:89-98` | `allowedRoles` hanya `['ADMIN','SUPER_ADMIN']`; cek `CS` di `:96` **mati**. Seluruh `CS_*` unreachable; user `OPERATOR` lihat "Akses Ditolak" | Tambah `'CS'`,`'OPERATOR'` ke `allowedRoles`, lalu routing per-role. Tetapkan enum role di Prisma (`schema.prisma:32` masih `String`) |
| F-03 | HIGH | Angka salah | **Omzet menghitung order `REFUNDED` sebagai pendapatan** | `src/app/admin/(dashboard)/page.tsx:33`; `actions.ts:45` | Kartu "Total Omzet" dan grafik "Tren Pendapatan" **melebih-lebihkan pendapatan** sebesar total refund. Keputusan bisnis diambil dari angka salah | ✅ **SELESAI** — bukan lewat daftar status pesanan (lihat catatan di bawah tabel), melainkan `Payment` berstatus `PAID` sebagai satu-satunya bukti uang masuk, dengan refund selesai sebagai pengurang terpisah |
| F-04 | HIGH | Angka salah | "Total Spending" pelanggan juga memasukkan `REFUNDED` dan melewatkan `PAID_CONFIRMED` | `src/app/admin/(dashboard)/users/UserClientPage.tsx:51` | Definisi "uang masuk" berbeda dari dashboard (`page.tsx:33`) → tiga definisi di tiga tempat | ✅ **SELESAI** — ketiga definisi dihapus, semuanya membaca `uangMasuk()`/`uangMasukSemua()` di `src/lib/pembayaran.ts`. Helper `isRevenueStatus(status)` yang disarankan di sini TIDAK dibuat; alasannya di catatan di bawah tabel |
| F-05 | HIGH | Responsif | **Sidebar hilang di < 768px tanpa pengganti — navigasi admin mati di HP** | `src/app/admin/(dashboard)/layout.tsx:39` (`hidden md:flex`) | Admin yang login di HP **tidak bisa berpindah halaman sama sekali** | Tambah `@headlessui/react` `<Dialog>` sebagai drawer + tombol hamburger di header (`:68`). Library sudah terpasang |
| F-06 | HIGH | Performa/Bug | Socket.io dibuat ulang setiap ganti percakapan (reconnect storm) | `src/app/admin/_components/cs/CS_InboxLayout.tsx:176-193` | Dependency `[selectedSession]` → connect/disconnect tiap klik; race condition, pesan hilang/ganda | Ubah dependency ke `[]`, simpan `selectedSession` di `useRef` dan baca di dalam handler `newMessage` |
| F-07 | HIGH | Konfigurasi | URL socket hardcode `http://localhost:3001` | `src/app/admin/_components/cs/CS_InboxLayout.tsx:177` | **Live chat mati total di produksi** | Pakai `process.env.NEXT_PUBLIC_SOCKET_URL` |
| F-08 | HIGH | Keamanan | Endpoint admin billboard dipanggil tanpa autentikasi (kode debug lolos ke master) | `src/app/admin/(dashboard)/billboards/page.tsx:17-21` | Komentar literal *"unauthenticated call for debugging purposes"*; `BACKEND_API_URL` fallback `http://localhost:4001` | Teruskan cookie sesi / token ke backend, hapus fallback localhost |
| F-09 | HIGH | Keamanan | API key dikirim utuh ke client | `src/app/admin/(dashboard)/settings/page.tsx:20-22,84,100` | `type="password"` hanya menyembunyikan visual; nilai asli ada di React state dan payload jaringan | Kirim versi ter-mask dari server; POST hanya jika field diubah |
| F-10 | HIGH | Performa | Halaman Users memuat **seluruh** relasi bookings semua user tanpa pagination | `src/app/admin/(dashboard)/users/page.tsx:7-8` | 1.000 user × 20 booking = 20.000 baris ke payload client tiap buka halaman | Hitung spending via `groupBy`/`_sum` di server, `take: 25` + `skip` |
| F-11 | HIGH | Data hilang | Rollback billboard tanpa preview & tanpa undo, konfirmasi lewat `confirm()` | `src/app/admin/(dashboard)/billboards/form/page.tsx:111-121` | `confirm('Rollback data?')` lalu overwrite data produksi; tidak ada diff, tidak ada info versi, `:120` `window.location.reload()` | Modal dengan diff sebelum/sesudah, nama field yang berubah, ketik-untuk-konfirmasi |
| F-12 | HIGH | Feedback palsu | Halaman detail order menampilkan "Berhasil" tanpa cek `res.ok` | `src/app/admin/(dashboard)/orders/[id]/page.tsx:27-36` | `alert("Bukti Tayang Disimpan!")` muncul walau server gagal; tanpa header `Content-Type` | Cek `res.ok`, tampilkan error asli, tambah header JSON |
| F-13 | MEDIUM | Duplikasi | Dua alur upload bukti tayang yang berbeda | `OrderActions.tsx:196-212` vs `orders/[id]/page.tsx:50-58` | Modal simpan base64, halaman simpan URL → dua format di kolom DB yang sama | Pertahankan satu alur (modal), hapus halaman `[id]` |
| F-14 | MEDIUM | Error state | Kegagalan backend ditampilkan sebagai "Belum ada data" | `billboards/page.tsx:23-34` + `:65` | **Backend mati = admin percaya inventory kosong** | Bedakan `error` vs `empty`; tampilkan banner error + tombol "Coba lagi" |
| F-15 | MEDIUM | Responsif | Tabel Users tidak di-scroll, justru **dipotong** oleh `overflow-hidden` | `users/UserClientPage.tsx:36-37` | 6 kolom (~850px) di 375px → kolom "Aksi" terpotong, **tombol edit tidak bisa diklik** | Ganti ke `overflow-x-auto`, atau card layout di `< md` |
| F-16 | MEDIUM | Responsif | Tabel Inventory tanpa `overflow-x-auto` | `billboards/page.tsx:52-53` | Scroll horizontal bocor ke `<body>`, header ikut bergeser | Bungkus `<div className="overflow-x-auto">` |
| F-17 | MEDIUM | Responsif | Live chat `h-screen` bersarang di dalam kontainer yang sudah scroll | `CS_InboxLayout.tsx:230,231,238` | Kotak input balasan **terdorong keluar layar di semua breakpoint**; di mobile jadi 3 layar bertumpuk tanpa navigasi balik | Ganti ke `h-[calc(100vh-4rem)]`; di mobile pakai master-detail satu panel + tombol kembali |
| F-18 | MEDIUM | Responsif | Detail order `grid-cols-2` tanpa breakpoint | `orders/[id]/page.tsx:48` | Dua kolom ~155px di 375px; area upload tidak bisa dipakai | `grid-cols-1 md:grid-cols-2` |
| F-19 | MEDIUM | Responsif | Kartu KPI lompat 1 → 4 kolom | `page.tsx:80` | Di 768–1023px nilai rupiah terpotong | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` |
| F-20 | MEDIUM | Responsif | Panel transaksi tinggi tetap `calc(100vh-200px)` + tumpuk di mobile | `TransactionClient.tsx:194` | Scroll bersarang 3 lapis; klik transaksi tidak memindahkan tampilan → terkesan tidak berfungsi | Master-detail: di `< lg` tampilkan satu panel + tombol kembali; buang tinggi tetap |
| F-21 | MEDIUM | A11y | Semua modal tanpa focus trap, Escape, `role="dialog"`, scroll lock | `UserFormModal.tsx:104`; `UserActions.tsx:85`; `OrderActions.tsx:197,219` | Tidak bisa dipakai via keyboard; fokus lolos ke belakang | Ganti dengan `@headlessui/react` `<Dialog>` (sudah terpasang) |
| F-22 | MEDIUM | UX | 53 `confirm()`/`alert()`/`prompt()` native di 12 file | Lihat §6 untuk daftar lengkap | Tidak bisa di-style, memblokir thread, tidak konsisten, mudah diabaikan; `prompt()` untuk alasan pembatalan tanpa validasi | Ganti dengan komponen dialog + toast |
| F-23 | MEDIUM | UX | 2× `window.location.reload()` setelah mutasi | `billboards/form/page.tsx:120,153` | Full reload, state hilang, kedipan putih | `router.refresh()` |
| F-24 | MEDIUM | Fitur hilang | Nol pagination di seluruh admin | `users/page.tsx:7`; `orders/page.tsx:37`; `billboards/page.tsx:21` | Halaman melambat linier terhadap pertumbuhan data; tak terpakai pada skala produksi | `take`/`skip` + komponen pagination bersama |
| F-25 | MEDIUM | Fitur hilang | Search box mati (hiasan) | `TransactionClient.tsx:198`; `CS_InboxLayout.tsx:16` | User mengira bisa mencari, mengetik, tidak terjadi apa-apa | Hubungkan ke `useState` + filter, atau hapus |
| F-26 | MEDIUM | Data palsu | Detail pengunjung chat hardcode | `CS_InboxLayout.tsx:156-159` | `Indonesia`/`127.0.0.1`/`Chrome`/`Windows` ditampilkan seolah data asli → **CS bisa salah mengambil keputusan** | Simpan user-agent & IP saat sesi dibuat, atau hapus panel |
| F-27 | MEDIUM | Data palsu | Widget "Fast Action" mengklaim ada order pending tanpa query | `page.tsx:105` | Kalimat *"Ada orderan yang butuh persetujuan manual"* selalu muncul | Ganti dengan hitungan asli order `PENDING_PAYMENT`/`PAID_CONFIRMED` |
| F-28 | MEDIUM | Data palsu | Identitas penjual hardcode & salah brand | `TransactionClient.tsx:245-246` | `"Iklan Jaya Group"`, `"Jl. Melati No. 10, Jakarta"` vs brand "Utero Cloud" | Ambil dari `SystemSetting` |
| F-29 | MEDIUM | Crash | `JSON.parse` tanpa try/catch di render path | `TransactionClient.tsx:272-274`; `billboards/form/page.tsx:52-54` | Data rusak di DB → halaman crash; tanpa `error.tsx` di admin → layar blank | Bungkus helper `safeJsonParse` + tambah `error.tsx` |
| F-30 | MEDIUM | UX | Badge status selalu hijau, apapun statusnya | `TransactionClient.tsx:172` | `CANCELLED`/`REFUNDED` ditampilkan hijau = salah baca | Peta warna per status, dipakai bersama dengan `page.tsx:141` |
| F-31 | MEDIUM | UX | Peta warna status di dashboard hanya meng-handle 2 dari 13 status | `page.tsx:141-146` | 11 status lain jadi **merah** seolah error | Ekstrak `getStatusColor()` bersama |
| F-32 | LOW | UI | Judul "Tren Pendapatan" muncul 2× (kartu bersarang) | `RevenueSection.tsx:46` + `RevenueChart.tsx:9` | Duplikat visual, padding ganda | Hapus wrapper+judul di `RevenueChart.tsx:8-9` |
| F-33 | LOW | Chart | `h-[400px]` fixed + `ResponsiveContainer height="100%"` | `RevenueChart.tsx:8,10` | Tinggi induk sudah terpakai judul `mb-6` → chart meluber/terpotong. Di mobile 400px memakan seluruh layar | Beri tinggi ke `ResponsiveContainer` langsung; responsif via `h-[280px] md:h-[400px]` |
| F-34 | LOW | Chart | Label sumbu Y pecah untuk nilai kecil | `RevenueChart.tsx:14` | `Rp ${value/1000000}Jt` → `Rp 0.5Jt`, `Rp 0.05Jt`. Desimal dengan titik (bukan koma), tidak sesuai locale id-ID | Formatter adaptif (Rb/Jt/M) + `Intl.NumberFormat('id-ID')` |
| F-35 | LOW | Chart | Tooltip tanpa locale | `RevenueChart.tsx:18` | `value.toLocaleString()` tanpa `'id-ID'` | Tambah `'id-ID'` |
| F-36 | LOW | Chart | `barSize={40}` fixed | `RevenueChart.tsx:20` | Mode harian = 30 bar × 40px = 1200px dipaksa ke lebar container → bar bertumpuk | Hapus `barSize`, pakai `maxBarSize` |
| F-37 | LOW | Format | `toLocaleString()` tanpa `'id-ID'` di 3 tempat | `page.tsx:148`; `billboards/form/page.tsx:285`; `RevenueChart.tsx:18` | Format bergantung locale server; bisa `1,000,000` bukan `1.000.000` | Helper `formatRupiah()` bersama |
| F-38 | LOW | A11y | `<th>` tanpa `scope="col"` di semua tabel | `page.tsx:129-132`; `billboards/page.tsx:56-60`; `UserClientPage.tsx:40-45` | Screen reader tidak mengasosiasikan sel dengan header | Tambah `scope="col"` |
| F-39 | LOW | A11y | Tombol ikon tanpa `aria-label` | `billboards/page.tsx:104-106`; `TransactionClient.tsx:221`; `CS_InboxLayout.tsx:97`; `OrderActions.tsx:201,223` | Screen reader membaca "button" tanpa konteks. `title` saja tidak cukup | Tambah `aria-label` |
| F-40 | LOW | A11y | `<div onClick>` untuk item chat | `CS_InboxLayout.tsx:22-29` | Tidak bisa di-Tab/Enter | Ganti ke `<button>` (lihat `TransactionClient.tsx:201` sebagai contoh benar) |
| F-41 | LOW | A11y | Menu status pakai `<a href="#">` bukan `<button>` | `StatusChanger.tsx:94-102` | Semantik salah; ada `role="menu"` (`:90`) tanpa `role="menuitem"` pada anaknya | `<button type="button" role="menuitem">` |
| F-42 | LOW | A11y | `<label>` tanpa `htmlFor`, input tanpa `id` | `billboards/form/page.tsx:178-208`; `settings/page.tsx:65-100`; `login/page.tsx:65,75` | Klik label tidak memfokuskan input | Pasangkan `htmlFor`/`id` |
| F-43 | LOW | A11y | `<img>` tanpa `alt` | `billboards/page.tsx:71`; `UserClientPage.tsx:61` | — | Tambah `alt` deskriptif |
| F-44 | LOW | Next.js 15 | `params`/`searchParams` diakses tanpa `await`/`use()` | `orders/page.tsx:25,29`; `orders/[id]/page.tsx:10` | Warning sekarang, breaking di rilis berikutnya. Catatan: `users/[userId]/page.tsx:15` **sudah benar** | Samakan dengan pola `users/[userId]/page.tsx` |
| F-45 | LOW | Bug | `useEffect` dependency array kosong padahal memakai `params.id` | `orders/[id]/page.tsx:19-23` | Tidak refetch saat id berubah | Tambah `[params.id]` |
| F-46 | LOW | Konsistensi | Bar aksi settings offset `md:pl-72` vs sidebar `w-64` | `settings/page.tsx:115` vs `layout.tsx:39` | Misalignment 32px | `md:pl-64` |
| F-47 | LOW | Stub | Tombol tanpa `onClick` | `UserProfileForm.tsx:141` ("Change Picture"); `CS_InboxLayout.tsx:97` | Tombol mati, user mengira rusak | Implementasi atau hapus |
| F-48 | LOW | Route | `/admin/reporting` 404 | `CS_Sidebar.tsx:12` | Link mati | Bangun halaman atau hapus item menu |
| F-49 | LOW | Dead code | 3 komponen tanpa importer (435 baris) | `ChatInterface.tsx`, `UserActions.tsx`, `ChatRoom.tsx` | Bundle & beban maintenance; fitur bagus terkubur | Port `ChatInterface` ke live, hapus sisanya |
| F-50 | LOW | Kebersihan | 18 baris kosong di awal file; `import` setelah `export default` | `orders/page.tsx:1-18`; `ChatRoom.tsx:93` | — | Rapikan |
| F-51 | LOW | UX | Seleksi transaksi ter-reset ke item pertama setelah refresh | `TransactionClient.tsx:140` | Admin kehilangan konteks setiap mutasi | Simpan `selectedId`, cari ulang objeknya dari props |
| F-52 | LOW | UX | Modal user me-reset form saat dibuka/ditutup | `UserFormModal.tsx:50-61` | Salah klik = semua ketikan hilang tanpa peringatan | Reset hanya setelah submit sukses |
| F-53 | LOW | Fitur hilang | Tidak ada active state pada menu sidebar | `layout.tsx:46` | Admin tidak tahu posisi halaman. `CS_Sidebar.tsx:27` justru sudah benar | Pakai `usePathname()` |

### Catatan penyelesaian F-03 & F-04 (27 Sep 2026)

Laporan ini menyarankan dua hal yang **tidak dikerjakan**, dan keduanya sengaja
ditinggalkan karena premisnya salah:

1. **`status: { in: ['PAID_CONFIRMED','ACTIVE'] }`** (F-03). Status *pesanan*
   bukan bukti uang masuk. `PAID_CONFIRMED` hanya berarti seseorang menekan
   tombol verifikasi di dashboard admin — tidak ada nominal, tidak ada waktu
   terima, tidak ada bukti. Menghitung omzet dari daftar status berarti
   membukukan seluruh `totalPrice` setiap pesanan yang lolos daftar itu,
   termasuk pesanan DP yang uangnya baru masuk sebagian.
2. **Helper `isRevenueStatus(status)`** (F-04). Helper berbasis status hanya
   menyeragamkan kesalahan yang sama ke tiga tempat sekaligus. Yang dibutuhkan
   bukan satu daftar status bersama, tapi satu *sumber angka* bersama.

Yang benar-benar dipasang:

- **`Payment` berstatus `PAID` adalah satu-satunya bukti uang masuk.** Setiap
  baris punya nominalnya sendiri (`jumlah`), waktu terimanya sendiri (`paidAt`),
  dan tujuannya (`DP` / `FULL` / `PELUNASAN` / `TAMBAHAN`). Status ini hanya
  ditulis webhook Xendit, bukan tombol admin.
- **Semua pembaca lewat [`src/lib/pembayaran.ts`](../../src/lib/pembayaran.ts)**
  (`uangMasuk()`, `uangMasukSemua()`, `sisaTagihan()`, `sisaTambahan()`). Tiga
  definisi yang berbeda di `page.tsx`, `actions.ts`, dan `UserClientPage.tsx`
  sudah tidak ada lagi.
- **Refund selesai menjadi pengurang terpisah**, dibaca dari
  `Booking.refundAmount` pada pesanan `REFUNDED` — bukan status yang dikeluarkan
  dari daftar. Bedanya nyata: pesanan yang direfund sebagian tetap membukukan
  uang yang memang tidak dikembalikan.
- **Grafik tren membukukan tiap penerimaan pada `Payment.paidAt` miliknya
  sendiri.** Sebelumnya seluruh nilai kontrak jatuh di bulan pesanan dibuat,
  sehingga pelunasan yang masuk tiga bulan kemudian tercatat di bulan DP.
- **`UserClientPage.tsx:51` tidak lagi menghitung apa pun.** Angkanya disusun
  server di `users/page.tsx` dan diserahkan sebagai angka jadi, sejalan dengan
  batas "Client Component hanya menerima hasil hitung server".

---

## 6. Inventaris `confirm()` / `alert()` / `prompt()` / `reload()`

53 kemunculan di 12 file. Yang **paling berisiko** (aksi destruktif/finansial) ditandai ⚠️.

| File:line | Jenis | Konteks |
|---|---|---|
| ⚠️ `src/components/admin/DeleteBillboardBtn.tsx:14` | `confirm` | **Hapus billboard permanen** |
| `src/components/admin/DeleteBillboardBtn.tsx:26,30,33` | `alert` | Hasil hapus |
| ⚠️ `src/components/admin/OrderActions.tsx:72` | `confirm` | **Verifikasi pembayaran diterima** |
| ⚠️ `src/components/admin/OrderActions.tsx:64` | `prompt` | **Alasan pembatalan paksa** (tanpa validasi panjang) |
| ⚠️ `src/components/admin/OrderActions.tsx:125` | `prompt` | **Alasan tolak order** |
| `src/components/admin/OrderActions.tsx:86,92` | `confirm` | Mulai cetak / mulai pasang |
| `src/components/admin/OrderActions.tsx:56,98` | `alert` | Validasi ukuran file / wajib foto |
| ⚠️ `src/components/admin/UserActions.tsx:19` | `confirm` | **Hapus user** (dead code) |
| `src/components/admin/UserActions.tsx:30,33,35,50,54,56` | `alert` | Hasil aksi user (dead code) |
| ⚠️ `src/app/admin/(dashboard)/billboards/form/page.tsx:112` | `confirm` | **Rollback data produksi** |
| ⚠️ `src/app/admin/(dashboard)/billboards/form/page.tsx:120` | `window.location.reload()` | Setelah rollback |
| ⚠️ `src/app/admin/(dashboard)/billboards/form/page.tsx:153` | `alert` + `window.location.reload()` | Setelah simpan |
| `src/app/admin/(dashboard)/billboards/form/page.tsx:91,154,155` | `alert` | Validasi & error |
| ⚠️ `src/app/admin/(dashboard)/orders/TransactionClient.tsx:148` | `prompt` | **Alasan penolakan desain** |
| `src/app/admin/(dashboard)/orders/TransactionClient.tsx:39,43,46,83,94,99,102,161,164,167` | `alert` | Hasil aksi |
| ⚠️ `src/app/admin/(dashboard)/orders/[id]/page.tsx:35` | `alert` | **"Disimpan!" tanpa cek `res.ok`** (F-12) |
| `src/app/admin/(dashboard)/settings/page.tsx:32,35,41,47` | `alert` | Simpan & test AI |
| `src/app/admin/(dashboard)/users/UserFormModal.tsx:73,94,98` | `alert` | Validasi & hasil |
| `src/app/admin/(dashboard)/users/[userId]/UserProfileForm.tsx:68,71,80,100,103` | `alert` | Hasil update |
| `src/components/admin/StatusChanger.tsx:54,57` | `alert` | Error update status |
| `src/components/admin/ChatInterface.tsx:85` | `confirm` | Tinggalkan chat (dead code) |

---

## 7. Data Freshness & State Management

| Layar | Setelah mutasi | Nilai |
|---|---|---|
| `TransactionClient.tsx:41,97,162` | `router.refresh()` | ✅ Benar |
| `StatusChanger.tsx:51` | `router.refresh()` | ✅ Benar |
| `DeleteBillboardBtn.tsx:27` | `router.refresh()` | ✅ Benar |
| `OrderActions.tsx:49` | `router.refresh()` | ✅ Benar, tapi tanpa cek `res.ok` (`:41-45`) — gagal tetap dianggap sukses |
| `UserFormModal.tsx:96` | `router.refresh()` | ✅ Benar |
| `UserProfileForm.tsx:69,101` | `router.refresh()` | ✅ Benar |
| `billboards/form/page.tsx:120,153` | ❌ `window.location.reload()` | **Salah** (F-23) |
| `orders/[id]/page.tsx:36` | `router.refresh()` **tapi data dimuat via `useEffect`** | **Tidak berefek** — `router.refresh()` menyegarkan Server Component, halaman ini `'use client'` dengan fetch di `useEffect`. Data tetap basi |
| `settings/page.tsx:31-37` | ❌ Tidak ada refetch | State lokal saja; jika server menormalisasi nilai, UI tidak tahu |

**Optimistic update**: hanya ada di chat — `CS_InboxLayout.tsx:218` dan `ChatInterface.tsx:99`. Keduanya **tanpa rollback saat gagal**: pesan tampil terkirim walau request gagal.

**Form state saat error**: umumnya dipertahankan ✅ (hanya `alert()` lalu return). Pengecualian F-52.

**Nol** `revalidatePath`/`revalidateTag` di seluruh admin, padahal `actions.ts` dan `live-chat/actions.ts` adalah Server Actions.

---

## 8. Walkthrough Alur Admin

### (a) Membuat Billboard Baru

`/admin` → sidebar "Inventory Billboard" → tombol "Tambah Titik Baru" (`billboards/page.tsx:47`) → form (`billboards/form/page.tsx`) → isi ~20 field → "Simpan Data" → `alert("Sukses!")` → `router.push('/admin/billboards')`.

**Friksi:**
1. **Di HP alur ini mati di langkah pertama** — tidak ada sidebar (F-05).
2. Slug harus di-generate manual lewat tombol "Auto" (`:179`); jika lupa, validasi `required` baru muncul saat submit.
3. Tidak ada validasi inline. `:91` `alert("Isi Nama Dulu")` untuk generate slug.
4. Lat/lng diketik manual (`:229`) — tidak ada map picker. Default `-7.9666, 112.6326` (Malang) tertinggal jika lupa diubah → **billboard muncul di lokasi salah di peta publik**.
5. `:181` field `status` di-bind ke `form.status` yang **tidak ada di state awal** (`:33-42` tidak mendefinisikan `status`) → select mulai sebagai uncontrolled, React warning, nilai tidak terkirim untuk billboard baru.
6. Tidak ada auto-save/draft. Kegagalan jaringan setelah 20 field = semua hilang (form state bertahan, tapi `alert` saja tanpa retry).
7. Tidak ada preview sebelum publish.
8. Setelah sukses langsung redirect; tidak ada link "Lihat billboard yang baru dibuat".

### (b) Menyetujui Order

`/admin/orders` → klik transaksi di kolom kiri (`TransactionClient.tsx:201`) → panel detail → bagian "Actions" (`:249`) → `OrderActions` → tombol centang → `confirm('Verifikasi pembayaran diterima?')` → status berubah.

**Friksi:**
1. ⚠️ **Tidak ada bukti pembayaran yang bisa dilihat.** Admin diminta "Verifikasi pembayaran diterima?" **tanpa ditunjukkan bukti transfer apa pun.** Ini kelemahan proses, bukan sekadar UI — verifikasi keuangan dilakukan buta.
2. ⚠️ Transisi status **bercabang otomatis** (`OrderActions.tsx:75-81`): `service` → `IN_PRODUCTION`, selain itu → `DESIGN_RECEIVED` atau `IN_PRODUCTION`. Admin **tidak diberi tahu** ke status mana order akan pindah.
3. `:41-45` — `fetch` tanpa cek `res.ok`; gagal server tetap lanjut `router.refresh()` → **UI terlihat sukses padahal tidak**.
4. Status ditampilkan hijau apa pun nilainya (`TransactionClient.tsx:172`) → sulit memastikan transisi berhasil.
5. Tidak ada stepper visual; tahapan Cetak → Pasang → Tayang harus ditebak dari tombol yang muncul.
6. Tidak ada undo, tidak ada jejak audit siapa mem-verifikasi kapan.
7. Setelah refresh, seleksi lompat ke transaksi pertama (F-51) — admin kehilangan tempat.
8. Di `< 1024px` panel bertumpuk; klik transaksi tidak memindahkan tampilan → terasa rusak (F-20).

### (c) Memproses Refund — **DEAD END**

`/admin/orders?status=REFUND` → pilih transaksi berstatus `PROCESS_REFUND` → `OrderActions.tsx:174` tombol "Trf Sekarang" → `setShowTransferModal(true)` → **tidak terjadi apa-apa.**

JSX modal transfer **tidak ada di file**; yang tersisa hanya komentar `:214-215`: *"Modal Lain (Transfer Refund / Preview) biarkan logic sebelumnya tetap ada jika perlu..."*. State `showProofModal` (`:18`) dan `proofData` (`:24`) masih dideklarasikan tapi tidak punya konsumen selain `:173`.

**Akibatnya:** **refund tidak bisa diselesaikan lewat admin panel sama sekali.** Admin harus mengubah status langsung di database. Alur `REVIEW_REFUND` (`:169`) hanya dua tombol emoji ✅/❌ tanpa label, dan `WAITING_BANK` (`:168`) hanya teks statis `"Wait User..."` tanpa aksi. Ini **temuan paling kritis** dalam audit (F-01).

### (d) Mengambil Alih Live Chat — **FITUR TERKUBUR**

`/admin/live-chat` → `CS_InboxLayout` → klik percakapan → baca pesan → ketik balasan → Enter.

**Friksi:**
1. ⚠️ **Tidak ada tombol "Join Chat".** Fitur ambil-alih dari bot ada lengkap di `ChatInterface.tsx:76-81` (+ tombol di `:185-192`) tetapi file itu **tidak pernah di-import** (F-49). Yang dirender adalah `CS_InboxLayout` yang tidak punya konsep status `OPEN`/`AGENT`/`CLOSED`. Admin **membalas berdampingan dengan bot tanpa bisa mematikan bot.**
2. Tidak ada penanda unread; admin harus membuka percakapan satu per satu.
3. `:177` socket `localhost:3001` → **di produksi tidak ada pesan masuk sama sekali** (F-07).
4. Setiap ganti percakapan membuat socket baru (F-06).
5. Panel kanan menampilkan IP/OS/browser palsu (F-26).
6. `:97` tombol pengaturan percakapan mati.
7. Tidak ada AI assist / template balasan (keduanya ada di `ChatInterface.tsx`, dead code).
8. Di `< 768px` alur chat praktis mati (F-17).
9. Search inbox mati (F-25).

---

## 9. Roadmap Perbaikan Berprioritas

### Fase 0 — Hentikan Pendarahan (1–2 hari)
Perbaikan kecil, dampak besar. Kerjakan lebih dulu.

1. ~~**F-03 + F-04** — Perbaiki perhitungan omzet.~~ ✅ **SELESAI (27 Sep 2026).** Dikerjakan lebih dalam daripada rencana ini: bukan menambal daftar status dan mengekstrak `isRevenueStatus()`, melainkan menjadikan `Payment` berstatus `PAID` satu-satunya bukti uang masuk, dibaca semua halaman lewat `src/lib/pembayaran.ts`, dengan refund selesai sebagai pengurang terpisah. Alasan lengkapnya di "Catatan penyelesaian F-03 & F-04" setelah tabel temuan. *(Perkiraan 1 jam di sini terlalu rendah — perbaikan yang benar butuh tabel `Payment` beserta webhook penulisnya.)*
2. **F-02** — Tambah `'CS'`,`'OPERATOR'` ke `allowedRoles` di `layout.tsx:89`; jadikan enum role di `schema.prisma:32`.
3. **F-07** — `NEXT_PUBLIC_SOCKET_URL` menggantikan `localhost:3001`. *(Menghidupkan live chat di produksi)*
4. **F-08** — Kembalikan autentikasi pada `billboards/page.tsx:17-21`, hapus fallback localhost.
5. **F-12** — Cek `res.ok` sebelum menampilkan pesan sukses (`orders/[id]/page.tsx`, `OrderActions.tsx:41`).
6. **F-16 + F-15** — Bungkus tabel Inventory & Users dengan `overflow-x-auto`. *(2 baris, memperbaiki 2 tabel)*

### Fase 1 — Kembalikan Fitur yang Hilang (3–5 hari)

7. **F-01** — Bangun ulang modal transfer refund. **Ini yang membuat back-office tidak bisa memproses refund.**
8. **F-49** — Port fitur `ChatInterface.tsx` (Join Chat, AI assist, template) ke `CS_InboxLayout.tsx`; hapus `ChatRoom.tsx` dan `ChatInterface.tsx`.
9. **Layar verifikasi pembayaran** — tampilkan bukti transfer user sebelum meminta admin menekan "Verifikasi".
10. **F-06** — Perbaiki lifecycle socket (dependency `[]` + ref).
11. **F-13** — Konsolidasi dua alur upload bukti tayang jadi satu.

### Fase 2 — Mobile Shell (3–4 hari) — menjawab langsung keluhan user

12. **F-05** — Drawer sidebar + hamburger memakai `@headlessui/react` `<Dialog>` (sudah terpasang).
13. **F-17 + F-20** — Pola master-detail responsif untuk Live Chat dan Transaksi: di `< lg` satu panel + tombol kembali.
14. **F-15** — Card layout mobile untuk tabel Users & Inventory (bukan sekadar scroll).
15. **F-18 + F-19** — Perbaiki breakpoint grid di `orders/[id]` dan kartu KPI.
16. **F-33/F-34/F-36** — Chart responsif: tinggi adaptif, formatter locale, `maxBarSize`.
17. Uji di **320 / 375 / 768 / 1024 / 1280**.

### Fase 3 — Skala & Kepercayaan Data (4–6 hari)

18. **F-24** — Pagination server-side + komponen pagination bersama untuk 3 list.
19. **F-10** — Hitung spending user via `groupBy`/`_sum` di server.
20. **F-25** — Hidupkan search (debounce + query param) di Transaksi, Users, Inventory, Chat.
21. **F-14 + F-29** — `error.tsx` + `loading.tsx` di setiap segmen admin; `safeJsonParse`; bedakan error vs empty.
22. **F-26/F-27/F-28** — Ganti semua data hardcode dengan query asli (IP/UA pengunjung, hitungan order pending, identitas penjual dari `SystemSetting`).
23. **F-30/F-31/F-37** — Peta warna status bersama + helper `formatRupiah()`.

### Fase 4 — Kelas Back-Office Sungguhan (2–3 minggu)

24. **Stepper produksi visual** (Bayar → Desain → Cetak → Pasang → Tayang) dengan timestamp; field-nya sudah ada di `schema.prisma:122-125`.
25. **Kalender ketersediaan / booking timeline** — memakai `Booking.startDate`/`endDate`.
26. **KPI baru**: occupancy rate, revenue MoM, antrean tindakan, kontrak akan berakhir + **date-range filter**.
27. **Export CSV/Excel** untuk orders, users, billboards.
28. **Bulk action** (checkbox + ubah status massal).
29. **Audit log** — model `AuditLog` + halaman; `BillboardHistory` sudah jadi preseden.
30. **Notification center** + badge unread di sidebar.
31. **F-21 + F-22** — Ganti seluruh `confirm()`/`alert()`/`prompt()` dengan `<Dialog>` + toast. Dahulukan aksi ⚠️ di §6.
32. **Role/permission matrix** untuk keempat role.
33. **Settings**: SMTP + tombol test, rekening, PPN, upload logo; mask API key di server (**F-09**).
34. **A11y sweep**: F-38 s/d F-43.
35. **F-44** — Migrasi pola `params`/`searchParams` Next.js 15.

---

## 10. Ringkasan Statistik

| Metrik | Angka |
|---|---|
| File admin diaudit | 30 |
| Total temuan | 53 |
| CRITICAL | 2 |
| HIGH | 10 |
| MEDIUM | 20 |
| LOW | 21 |
| Tabel data dengan `overflow-x-auto` | **1 dari 3** |
| Tabel dengan card layout mobile | **0** |
| `confirm()`/`alert()`/`prompt()` | **53** di 12 file |
| `window.location.reload()` | 2 |
| File `loading.tsx` di admin | **0** |
| File `error.tsx` di admin | **0** |
| Komponen dead code (nol importer) | **3** (435 baris) |
| Komponen unreachable (role gate) | **3** |
| Route 404 yang di-link | 1 (`/admin/reporting`) |
| Query `findMany` tanpa pagination | **3 dari 3** |
| Input search yang hiasan | 2 |
| Definisi "uang masuk" yang berbeda | **3** |
| Tombol tanpa `onClick` (stub) | 2 |
| Nilai hardcode yang menyamar sebagai data | 4 lokasi |
