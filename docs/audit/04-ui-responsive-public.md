# Audit UI / Responsive / Accessibility — Sisi Publik (Non-Admin)

**Proyek:** `my-billboard-app` (Utero Cloud)
**Tanggal audit:** 2026-09-21
**Cakupan:** Semua halaman publik + dashboard user + komponen shared. Area `src/app/admin/**` DILUAR cakupan.
**Stack:** Next.js 15 App Router, React, Tailwind CSS 3, lucide-react, Leaflet (react-leaflet), react-calendar, @headlessui/react.

---

## 1. Executive Summary

Aplikasi ini secara visual sudah "jadi" — layout terasa modern, pakai kartu, `rounded-2xl`, gradient merah branding. Tapi di balik itu, fondasi UI-nya rapuh. Audit menemukan **138 temuan**: **18 Critical**, **46 High**, **59 Medium**, **15 Low** (tabel lengkap di Bagian 3).

Lima masalah terbesar:

1. **Plugin animasi tidak terpasang tapi dipakai di 10 tempat.** Class `animate-in`, `fade-in`, `zoom-in`, `slide-in-from-bottom-*` dipakai di modal dan ChatWidget, tetapi `tailwindcss-animate` TIDAK ada di `package.json` maupun `node_modules`, dan `tailwind.config.ts:21` punya `plugins: []`. Semua class itu di-strip Tailwind saat build. Akibatnya modal muncul **tanpa transisi sama sekali** (jump cut), dan lebih buruk: developer mengira ada animasi padahal tidak.
2. **Nol file `loading.tsx` / `error.tsx` / `not-found.tsx` di seluruh aplikasi.** Semua halaman publik adalah async Server Component yang `fetch` dari backend NestJS. Saat backend lambat, user melihat **layar putih kosong** tanpa batas waktu. Saat backend mati, `src/app/page.tsx:17` menelan error dan mengembalikan `[]` — peta tampil kosong seolah-olah "memang tidak ada billboard", bukan "server bermasalah".
3. **17 panggilan `alert()` dan 2 `confirm()` di jalur kritis** — termasuk konfirmasi pembayaran (`BookingCard.tsx:116`) dan sukses order (`CheckoutForm.tsx:80`). Ini bukan UX produksi. Dialog browser bawaan memblokir thread, tidak bisa di-style, dan di iOS Safari tampil dengan judul domain mentah.
4. **Search bar desktop punya lebar mati `w-[800px]`** (`SearchFilter.tsx:103`) di dalam container `max-w-[800px]` (`page.tsx:55`). Di viewport 768–820px elemen ini melebihi ruang dan memicu overflow horizontal pada halaman yang sudah `overflow-hidden` — hasilnya konten search terpotong, bukan scroll.
5. **Aksesibilitas hampir nol.** Di seluruh cakupan publik hanya ada **1** `aria-label` (di `ImageUpload.tsx:128`), **0** `role="dialog"`, **0** `aria-modal`, **0** focus trap, **0** handler Escape, **0** skip link, dan **hanya 2** `htmlFor`. Ada 5 modal fullscreen yang semuanya tidak bisa ditutup dengan keyboard.

Tema desain praktis tidak ada: `tailwind.config.ts` hanya mendefinisikan satu warna (`utero`). Sisanya 352 pemakaian `gray-*`, 60 `red-*`, 51 `blue-*` sebagai utility ad-hoc. Tidak ada dark mode (0 pemakaian `dark:`), tidak ada `next/font` (font bergantung default browser meski `font-sans` ditulis manual di 2 file), tidak ada `export const metadata` di satu halaman pun.

Estimasi: **~3 minggu kerja** untuk menutup Critical + High.

---

## 2. Audit Per-Halaman

### 2.1 `src/app/layout.tsx` — Root Layout

**Fungsi:** Root HTML shell. Membungkus semua halaman dengan `<Providers>` (NextAuth `SessionProvider`).

**Layout:** `<html lang="id">` → `<body>` → `<Providers>` → children. Tidak ada apa-apa lagi. 16 baris.

**Temuan:**

- **`layout.tsx:8`** — `<body>` tanpa `className` sama sekali. Tidak ada `font-sans`, tidak ada `antialiased`, tidak ada warna dasar. Akibatnya setiap halaman menulis ulang `font-sans` sendiri-sendiri, dan tidak konsisten: `checkout/page.tsx:38` dan `DashboardLayout.tsx:7` memakainya, sementara `login/page.tsx:60` dan `register/page.tsx:45` TIDAK. Dua halaman auth ini render dengan font serif default browser — beda dari halaman lain.
- **`layout.tsx:1-16`** — Tidak ada `export const metadata`. Seluruh aplikasi memakai title default Next.js. Tidak ada `description`, `openGraph`, atau favicon meta. Untuk aplikasi sewa billboard yang ingin ditemukan lewat search, ini merugikan langsung.
- **`layout.tsx:1-16`** — Tidak ada `export const viewport` dengan `themeColor` / `width=device-width`. Next.js 15 menyisipkan viewport default, tapi tidak ada kontrol `maximumScale` maupun `themeColor` untuk address bar mobile.
- **`layout.tsx:11`** — Tidak ada skip link (`<a href="#main">Lewati ke konten</a>`). Pengguna keyboard harus tab melewati seluruh Navbar (hingga ~12 elemen fokusable saat login) di setiap halaman.
- **`layout.tsx:10`** — `<Providers>` membungkus SELURUH aplikasi dengan client boundary. `Providers.tsx:6` adalah `'use client'` dengan `SessionProvider`. Ini sendiri wajar untuk NextAuth v4, tapi tidak ada `<main>` landmark di root, jadi struktur landmark halaman bergantung penuh pada tiap page.
- **Tidak ada `next/font`** — konfirmasi: `grep -rn "next/font" src/` = 0 hasil. Font sepenuhnya default sistem. Tidak ada `font-display: swap` yang dikelola, tidak ada preload. Class `font-sans` yang ditulis manual hanya memetakan ke font stack default Tailwind, jadi tidak ada CLS dari font — tapi juga tidak ada identitas tipografi sama sekali.

### 2.2 `src/app/globals.css` — Global Styles

**Fungsi:** Tiga direktif Tailwind + 2 override kecil untuk popup Leaflet. Total 12 baris.

**Temuan:**

- **`globals.css:1-12`** — Hanya 12 baris. Tidak ada `:focus-visible` style global. Kombinasikan dengan pemakaian `focus:outline-none` yang agresif (`Navbar.tsx:108`, `SearchFilter.tsx:45,72,87,115,127,141`, `CheckoutForm.tsx:130,144,148,153,166`, `BookingCard.tsx:358,376`) — hasilnya **indikator fokus keyboard hilang total** di sebagian besar input dan tombol, tanpa pengganti. Ini pelanggaran WCAG 2.4.7 (Focus Visible) level AA yang paling parah di codebase ini.
- **`globals.css:1-12`** — Tidak ada styling untuk `react-calendar`. `AvailabilityCalendar.tsx:5` mengimpor `react-calendar/dist/Calendar.css` mentah. CSS bawaan react-calendar memakai font, border, dan warna biru default yang **tidak nyambung** dengan sistem desain merah `utero`. Tile yang disabled pakai abu-abu default, tile aktif pakai `#006edc` (biru react-calendar) — bentrok dengan `tileClassName` custom di `AvailabilityCalendar.tsx:56` yang mengembalikan `bg-utero`. Spesifisitas CSS bawaan sering menang, jadi highlight tanggal terpilih tidak selalu muncul merah.
- **`globals.css:1-12`** — Tidak ada `scroll-behavior`, tidak ada `overflow-x: hidden` pengaman, tidak ada custom scrollbar. Beberapa overflow horizontal (lihat temuan R-01, R-02) jadi tidak ter-mitigasi.
- **`globals.css:6-12`** — Override `.request-popup` hanya mengatur padding dan radius. Tidak mengatur `max-width`, padahal `HeroMap.tsx:46` memaksa `w-[220px]` di dalamnya (lihat 2.4).

### 2.3 `tailwind.config.ts` — Konfigurasi Tema

**Isi:** 23 baris. `theme.extend.colors.utero` = `{ DEFAULT: '#ce181e', hover: '#a61318' }`. `plugins: []`.

**Temuan:**

- **`tailwind.config.ts:21`** — `plugins: []` KOSONG, tapi kode memakai class dari `tailwindcss-animate` di 10 lokasi (`animate-in`, `fade-in`, `zoom-in`, `slide-in-from-bottom-2/4/10`, `slide-in-from-bottom`). Plugin tidak ada di `package.json` maupun `node_modules`. **Semua class animasi ini mati.** Daftar lengkap lokasi:
  - `src/components/BookingCard.tsx:329` — `animate-in fade-in zoom-in duration-300`
  - `src/components/BookingCard.tsx:371` — `animate-in fade-in`
  - `src/components/BookingCard.tsx:385` — `animate-in fade-in`
  - `src/components/BookingCard.tsx:402` — `animate-in fade-in zoom-in duration-300`
  - `src/components/ChatWidget.tsx:111` — `animate-in slide-in-from-bottom-4`
  - `src/components/ChatWidget.tsx:117` — `animate-in slide-in-from-bottom-10 fade-in`
  - `src/components/SearchFilter.tsx:60` — `animate-in fade-in`
  - `src/components/SearchFilter.tsx:61` — `animate-in slide-in-from-bottom duration-300`
  - `src/components/TrafficReportModal.tsx:22` — `animate-in fade-in zoom-in duration-300`
  - `src/app/dashboard/order/[id]/page.tsx:137` — `animate-in fade-in slide-in-from-bottom-2`
- **`tailwind.config.ts:12-18`** — Hanya 1 warna custom. Tidak ada token untuk `success` / `warning` / `danger` / `info`, padahal aplikasi punya **12 status booking** (`PENDING_PAYMENT`, `PAID_CONFIRMED`, `DESIGN_RECEIVED`, `IN_PRODUCTION`, `INSTALLATION`, `ACTIVE`, `WAITING_BANK`, `REVIEW_REFUND`, `PROCESS_REFUND`, `REFUNDED`, `CANCELLED`) yang masing-masing diberi warna secara hardcode di `BookingCard.tsx:181-187`. Warna yang sama juga diduplikasi di `invoice/[id]/page.tsx:61-64` dan `Navbar.tsx:22-36` (untuk role) dengan mapping BERBEDA. Tidak ada satu sumber kebenaran.
- **`tailwind.config.ts:10-20`** — `theme.extend` tidak menyentuh `spacing`, `borderRadius`, `boxShadow`, `fontSize`, maupun `fontFamily`. Semua nilai memakai skala default Tailwind secara ad-hoc, tanpa aturan mana yang "benar" untuk kasus apa (lihat bagian 4, Design System Gaps).
- **`tailwind.config.ts:4-9`** — `content` mencakup `./src/pages/**`, padahal direktori `src/pages` tidak ada (proyek ini murni App Router). Glob mati, tidak berbahaya tapi menandakan config hasil salin-tempel yang tidak pernah ditinjau.
- **`tailwind.config.ts:1-23`** — Tidak ada `darkMode` config. Konfirmasi: `grep -rn "dark:" src/` = 0 hasil. Dark mode **tidak ada sama sekali** (bukan setengah jadi — memang nol). Ini konsisten, jadi bukan bug; tapi perlu dicatat sebagai gap produk.

### 2.4 `src/app/page.tsx` — Landing / Peta Interaktif Fullscreen

**Fungsi:** Halaman utama. Server Component async yang mengambil seluruh billboard dari backend NestJS (`http://localhost:4001/api/billboards`), memfilternya di server berdasar `status === 'Available'`, `publishStatus === 'PUBLISHED'`, query pencarian (`q`) dan tipe media (`type`), lalu menampilkannya sebagai marker di peta Leaflet fullscreen.

**Layout:** `<main>` fullscreen `h-screen` dengan `overflow-hidden`. Di dalamnya tiga lapisan bertumpuk absolut: (z-0) peta Leaflet memenuhi layar; (z-10) search bar mengambang di `top-20`, ter-center; (z-9999) ChatWidget floating kanan-bawah; dan Navbar fixed di atas semuanya (z-9999).

**Temuan Responsive:**

- **`page.tsx:48`** — `className="relative h-screen w-full bg-white overflow-hidden"`. Dua masalah bertumpuk:
  1. `h-screen` = `100vh`. Di mobile Safari/Chrome, `100vh` mengabaikan address bar, jadi tinggi elemen melebihi viewport terlihat. Karena `overflow-hidden` dipasang, bagian bawah peta (termasuk `ZoomControl` yang sengaja dipindah ke `bottomleft` di `HeroMap.tsx:37`) **terpotong permanen** di balik browser chrome pada 375px dan 320px. Harus `h-[100dvh]`.
  2. `overflow-hidden` di root mengubah overflow horizontal apa pun menjadi **konten terpotong**, bukan scrollbar. Ini menyembunyikan gejala bug R-02 di bawah alih-alih memperbaikinya.
- **`page.tsx:54`** — `className="absolute top-20 left-0 w-full z-10 px-4 pointer-events-none flex justify-center"`. `top-20` = 80px, sementara Navbar `h-16` = 64px (`Navbar.tsx:42`). Jarak hanya 16px. Tapi saat menu mobile dibuka, `Navbar.tsx:119` merender panel absolut yang tingginya ~400px — panel ini menimpa search bar. Karena panel bernilai `z-50` dan berada di dalam `<nav>` ber-`z-[9999]`, stacking context-nya menang, jadi search bar tertutup. Secara visual tidak fatal, tapi search bar tetap menerima klik? Tidak — `pointer-events-none` di parent, `pointer-events-auto` di anak (`page.tsx:55`). Anak tetap klikabel di balik panel yang menutupinya. **Klik hantu**: user menutup menu dengan tap di area kosong, tap tembus ke input search.
- **`page.tsx:55`** — `className="pointer-events-auto w-full max-w-[800px]"` dipasangkan dengan `SearchFilter.tsx:103` yang punya `w-[800px]` mati. Di viewport 768px (iPad portrait, breakpoint `md` aktif): container maksimum 800px tapi dibatasi `w-full` + `px-4` parent = 768 - 32 = **736px tersedia**, sementara anak memaksa **800px**. Selisih 64px meluber. Karena `page.tsx:48` `overflow-hidden`, tombol search (elemen paling kanan, `SearchFilter.tsx:147`) **terpotong dan tidak bisa diklik** di 768px–831px. Ini bug fungsional, bukan kosmetik.
- **`page.tsx:59`** — `<ChatWidget />` diposisikan `fixed bottom-6 right-6` (`ChatWidget.tsx:111`). Di halaman ini tidak menabrak apa pun karena peta fullscreen. Tapi di 320px, bubble chat 60x60px menutupi `ZoomControl` Leaflet yang ditempatkan di `bottomleft` — tidak bertabrakan langsung (kiri vs kanan), aman. Namun bubble menutupi atribusi OpenStreetMap di kanan-bawah (`HeroMap.tsx:32`), yang secara lisensi ODbL **wajib terlihat**.

**Temuan State / Data:**

- **`page.tsx:7-20`** — `getBillboards()` menangkap semua error dan mengembalikan `[]` (baris 13 dan 18). Tidak ada perbedaan antara "backend mati", "backend mengembalikan 500", dan "memang tidak ada billboard tersedia". Ketiganya menghasilkan **peta kosong tanpa pesan apa pun**. User tidak tahu harus refresh atau menyerah.
- **`page.tsx:34-45`** — Hasil filter `filteredBillboards` bisa kosong (misal user mencari "xyz"). Tidak ada empty state: peta tetap render, hanya tanpa marker. Tidak ada teks "Tidak ada billboard yang cocok dengan pencarian Anda". Di UI peta, nol marker terlihat identik dengan nol data.
- **Tidak ada `src/app/loading.tsx`.** Halaman ini `async` dan menunggu `fetch` dengan `cache: 'no-store'` (`page.tsx:10`) — artinya SETIAP kunjungan menunggu roundtrip penuh ke backend. Tanpa `loading.tsx`, Next.js tidak punya Suspense boundary, jadi user melihat **halaman putih** sampai fetch selesai. Pada koneksi 3G atau backend dingin ini bisa 3-8 detik.
- **Tidak ada `src/app/error.tsx`.** Jika `prisma` atau render melempar, user dapat error overlay Next.js (dev) atau halaman error generik (prod).
- **`page.tsx:9`** — `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001'`. Fallback hardcode ke localhost. Di produksi, jika env var lupa diset, aplikasi diam-diam mencoba localhost dan gagal — lalu `catch` mengubahnya jadi peta kosong (lihat di atas). Kegagalan konfigurasi jadi tidak terlihat.

**Temuan Perf:**

- **`page.tsx:52`** — `<MapWrapper data={filteredBillboards} />` meneruskan **seluruh array billboard** ke client. Tidak ada paginasi, tidak ada batas. Dengan 500 billboard, ini 500 marker Leaflet sekaligus + payload JSON penuh di HTML (serialisasi RSC). Perlu clustering (`leaflet.markercluster`) atau filter berbasis viewport.
- **`MapWrapper.tsx:6-9`** — Ini SUDAH BENAR: `dynamic(() => import('./HeroMap'), { ssr: false, loading: ... })`. Satu-satunya pemakaian `next/dynamic` yang tepat di cakupan publik. Namun fallback `loading`-nya (`MapWrapper.tsx:8`) memakai `h-screen` — masalah `100vh` yang sama, dan hanya teks "Memuat Peta..." tanpa skeleton.

### 2.5 `src/components/HeroMap.tsx` — Peta Leaflet

**Fungsi:** Komponen peta client-only. Merender `MapContainer` Leaflet dengan tile OpenStreetMap, `ZoomControl` dipindah ke kiri-bawah, dan satu `Marker` + `Popup` per billboard.

**Layout:** Div `h-screen w-full` berisi peta. Setiap popup adalah kartu vertikal: gambar 220x112px di atas, judul, lalu baris harga + tombol Detail.

**Temuan:**

- **`HeroMap.tsx:23`** — `className="h-screen w-full relative z-0"`. Bug `100vh` kedua (setelah `page.tsx:48`). Di dalam parent yang juga `h-screen`, ini redundan sekaligus salah. Ganti `h-full`.
- **`HeroMap.tsx:46`** — `className="w-[220px] font-sans"`. Lebar popup mati 220px. Ditambah padding wrapper Leaflet, popup total ~240px. Di viewport 320px ini memakan 75% lebar layar; ketika marker berada di tepi kiri/kanan peta, Leaflet menggeser popup ke dalam viewport, tapi panah popup jadi tidak sejajar marker. Lebih parah: judul di `HeroMap.tsx:59` pakai `line-clamp-2` pada lebar 220px — judul billboard panjang (umum: "Billboard Jl. Soekarno Hatta Depan Mall X Malang") terpotong menjadi tidak informatif.
- **`HeroMap.tsx:48-52`** — `<img src={board.mainImage} ... />` **tanpa atribut `alt`**. Gambar utama produk, tidak terbaca screen reader sama sekali. Juga `<img>` mentah, bukan `next/image` — tanpa optimasi, tanpa `sizes`, tanpa lazy loading eksplisit. Dengan 100+ marker, ini 100+ request gambar full-size.
- **`HeroMap.tsx:51`** — `onError={(e) => { e.currentTarget.src = "https://via.placeholder.com/300"; }}`. Fallback ke layanan **eksternal pihak ketiga** (`via.placeholder.com`). Jika layanan itu down atau diblokir jaringan korporat, gambar tetap rusak. Harus aset lokal di `public/`. (Catatan: `public/placeholder.jpg` yang dirujuk `BookingCard.tsx:206` juga TIDAK ADA — lihat temuan S-09.)
- **`HeroMap.tsx:67`** — `Rp {(board.price / 1000000).toFixed(0)} Jt`. Formatting mata uang manual dengan pembagian dan `.toFixed(0)`. Harga Rp 1.500.000 tampil sebagai **"Rp 2 Jt"** (pembulatan ke atas) — salah secara faktual di UI komersial. Harga Rp 900.000 tampil "Rp 1 Jt". Lihat bagian 6 (i18n/Currency) untuk pola lengkap.
- **`HeroMap.tsx:70`** — Tombol "Detail" `px-4 py-2` dengan `text-xs`. Tinggi terhitung: 12px teks × 1.33 line-height ≈ 16px + 16px padding = **32px**. Di bawah minimum 44x44px WCAG 2.5.5 / Apple HIG. Target sentuh terlalu kecil, dan ini adalah **CTA utama dari peta ke halaman produk**.
- **`HeroMap.tsx:9-15`** — Ikon marker diambil dari CDN `unpkg.com`. Dependensi eksternal untuk aset kritis; jika unpkg lambat, marker tidak muncul dan peta terlihat kosong.
- **`HeroMap.tsx:24-30`** — `MapContainer` tanpa `aria-label` atau alternatif teks. Seluruh daftar billboard **hanya tersedia sebagai peta visual**. Pengguna screen reader tidak punya jalan sama sekali untuk menelusuri inventaris. Ini adalah kegagalan aksesibilitas paling fundamental di aplikasi — butuh daftar teks alternatif (lihat rekomendasi A-01).
- **`HeroMap.tsx:27`** — `scrollWheelZoom={true}` pada peta fullscreen. Di desktop, user yang men-scroll halaman dengan kursor di atas peta akan men-zoom peta alih-alih scroll. Di halaman ini halaman memang tidak bisa di-scroll (`overflow-hidden`), jadi dampaknya kecil — tapi polanya berisiko jika layout berubah.

### 2.6 `src/components/SearchFilter.tsx` — Bar Pencarian & Filter

**Fungsi:** Dua UI terpisah dalam satu komponen. Mobile: pill search + tombol "Filter" yang membuka bottom sheet. Desktop: bar pill lebar ala Airbnb dengan 3 segmen (Lokasi / Tipe Media / Mulai Tayang) + tombol search bulat.

**Temuan Responsive:**

- **`SearchFilter.tsx:103`** — `className="hidden md:flex w-[800px] mx-auto ..."`. **Lebar mati 800px, aktif mulai breakpoint `md` (768px).** Ini adalah bug responsive paling parah di aplikasi. Rentang rusak: 768px hingga 831px (800px + padding parent 32px). Di iPad portrait (768px) dan banyak tablet Android, tombol search terpotong. Perbaikan: `w-full max-w-[800px]`.
- **`SearchFilter.tsx:121`** dan **`SearchFilter.tsx:138`** — `className="w-[180px] px-6 py-3 ..."`. Dua segmen lebar mati 180px masing-masing. Dengan `divide-x` dan segmen Lokasi `flex-1`, total minimum = 180+180+~48(tombol)+padding ≈ 450px sebelum segmen Lokasi dapat ruang. Tidak ada `shrink`, jadi bar tidak pernah beradaptasi — ia hanya meluber.
- **`SearchFilter.tsx:33`** — `className="md:hidden w-[95%] mx-auto mt-4"`. `w-[95%]` di dalam parent yang sudah `px-4` (`page.tsx:54`) menghasilkan padding ganda: di 320px, lebar efektif = (320-32) × 0.95 = **273px**. Input pencarian tersisa ~160px setelah ikon dan tombol Filter. Placeholder "Cari titik di kota / wilayah ..." terpotong di tengah.

**Temuan Touch / Mobile UX:**

- **`SearchFilter.tsx:48-54`** — Tombol Filter `p-2.5` = 10px padding + konten ~16px = **36px tinggi**. Di bawah 44px.
- **`SearchFilter.tsx:64`** — Tombol tutup modal `<button ...><X size={20}/></button>` dengan `p-2` = 20 + 16 = **36px**. Di bawah 44px, dan **tanpa `aria-label`** — screen reader membacanya sebagai "button" tanpa nama.
- **`SearchFilter.tsx:141`** — `onFocus={(e) => e.target.type = 'date'} onBlur={(e) => e.target.type = 'text'}`. Trik mengubah `type` input secara langsung lewat DOM. Ini rusak di beberapa cara: (a) memutasi DOM di luar React, React tidak tahu; (b) di Firefox, mengubah `type` saat fokus dapat menutup date picker seketika; (c) `onChange` menyimpan string mentah ke state `date` tanpa validasi format; (d) nilai `date` tidak pernah ditampilkan kembali ke input (tidak ada `value`), jadi setelah blur, tanggal yang dipilih **tidak terlihat oleh user** — input kembali kosong dengan placeholder "Kapan?". Filter tanggal desktop secara efektif rusak.
- **`SearchFilter.tsx:106,121,138`** — `hover:bg-gray-50/50` + `group-hover:text-utero` pada segmen. Afordansi **hanya-hover**: di perangkat sentuh tidak ada hover, jadi tidak ada umpan balik bahwa segmen itu interaktif. Tidak masalah di sini karena segmen desktop-only (`hidden md:flex`), tapi tablet sentuh 768px+ masuk ke mode ini.

**Temuan A11y:**

- **`SearchFilter.tsx:59-99`** — Bottom sheet filter mobile: `<div className="fixed inset-0 z-[9999] bg-black/60 ...">`. **Tidak ada `role="dialog"`, tidak ada `aria-modal="true"`, tidak ada focus trap, tidak ada handler Escape, tidak ada pengembalian fokus** ke tombol pemicu saat ditutup. Klik pada backdrop juga tidak menutup modal (tidak ada `onClick` di overlay) — satu-satunya jalan keluar adalah tombol X 36px atau tombol "Terapkan Filter".
- **`SearchFilter.tsx:68`** dan **`SearchFilter.tsx:82`** — `<label className="...">Tipe Media</label>` tanpa `htmlFor`, dan `<select>`/`<input>` di baris 69/83 tanpa `id`. Label tidak terasosiasi. Screen reader tidak mengumumkan nama field. Mengetuk label juga tidak memfokuskan input.
- **`SearchFilter.tsx:108,123,140`** — Tiga `<label>` desktop, semuanya tanpa `htmlFor`; input di `:109,124,141` tanpa `id`. Pola yang sama.
- **`SearchFilter.tsx:45,72,87,115,127,141`** — Enam pemakaian `outline-none` / `focus:outline-none` tanpa pengganti `focus-visible`. Navigasi keyboard di seluruh search bar tidak menampilkan fokus.
- **`SearchFilter.tsx:147-152`** — Tombol search desktop: `w-12 h-12` = 48x48px (LULUS touch target), tapi isinya hanya `<Search size={20} />` — **ikon tanpa label teks dan tanpa `aria-label`**. Screen reader: "button".
- **`SearchFilter.tsx:60`** — `z-[9999]` sama persis dengan `Navbar.tsx:40` dan `ChatWidget.tsx:111/117`. Empat elemen berebut z-index tertinggi yang sama; urutan akhir ditentukan urutan DOM, bukan niat desain. Rapuh.

**Temuan State:**

- **`SearchFilter.tsx:20-28`** — `handleSearch()` memanggil `router.push()` tanpa state loading. Karena `page.tsx` adalah Server Component dengan `cache: 'no-store'`, navigasi memicu fetch server penuh. Selama itu **tidak ada indikator apa pun** — tombol tidak disabled, tidak ada spinner. User menekan berulang kali, memicu navigasi bertumpuk.
- **`SearchFilter.tsx:12-13`** — State diinisialisasi dari `searchParams` hanya saat mount. Jika user menekan tombol Back browser, URL berubah tapi state input **tidak tersinkron** — input menampilkan query lama sementara hasil menampilkan query baru.

---

### 2.7 `src/components/Navbar.tsx` — Navigasi Global

**Fungsi:** Navbar fixed di seluruh halaman publik. Logo kiri, link tengah (desktop), area user + CTA kanan (desktop), hamburger (mobile). Punya dropdown profil desktop dan panel slide-down mobile.

**Layout:** `<nav>` fixed setinggi `h-16` dengan `z-[9999]`, latar `bg-white/95` + `backdrop-blur-md`.

**Temuan Kritis — Link Rusak:**

- **`Navbar.tsx:55`** — `<Link href="/list">`. Direktori `src/app/list` **TIDAK ADA**. Link ini menghasilkan **404 dari setiap halaman aplikasi**.
- **`Navbar.tsx:56`** — `<Link href="/about">`. Direktori `src/app/about` **TIDAK ADA**. 404.
- **`Navbar.tsx:155`, `Navbar.tsx:156`** — Duplikat kedua link rusak yang sama di menu mobile. Total **4 link 404 di navigasi utama**. Karena tidak ada `not-found.tsx` di mana pun (lihat S-01), user mendarat di halaman 404 default Next.js yang tidak bermerek dan tanpa jalan kembali.

**Temuan Fungsional:**

- **`Navbar.tsx:99-101`** — `<button className="bg-utero text-white px-5 py-2.5 rounded-full ...">Sewakan Tempat</button>` — CTA utama navbar **tanpa `onClick`, tanpa `<Link>`, tanpa `type`**. Diklik tidak melakukan apa pun. CTA mati.
- **`Navbar.tsx:160-162`** — Duplikat mobile: `<button className="w-full bg-utero text-white py-3.5 rounded-xl ...">`. Juga tanpa handler. CTA mati kedua.
- **`Navbar.tsx:75-93`** — Dropdown profil tidak punya handler klik-di-luar. Sekali terbuka, hanya bisa ditutup dengan menekan tombol pemicunya lagi.
- **`Navbar.tsx:118-166`** — Menu mobile tidak menutup saat link diklik; `setIsOpen(false)` tidak pernah dipanggil di handler `<Link>`. Setelah navigasi, panel tetap terbuka menutupi halaman tujuan.

**Temuan Responsive:**

- **`Navbar.tsx:119`** — `className="md:hidden bg-white border-t ... absolute w-full left-0 z-50"`. Panel mobile **tanpa `max-h` + `overflow-y-auto`**. Di 320x568 dengan nama user yang wrap, isi panel (kartu user + 3 link + CTA) melebihi ruang tersisa; kelebihannya tidak bisa di-scroll sehingga CTA di baris 160 tidak terjangkau.
- **`Navbar.tsx:53`** — `space-x-8` antar link desktop. Di tepat 768px: logo ~110px + link ~260px + user pill ~120px + CTA ~150px + padding 32px ≈ **672px**. Muat tapi sangat ketat; nama user 100px penuh + label role membuatnya berisiko wrap di 768–800px.
- **`Navbar.tsx:70`** — `className='capitalize max-w-[100px] truncate'` — penanganan teks panjang yang benar. Pola positif.

**Temuan Touch / A11y:**

- **`Navbar.tsx:106-111`** — Hamburger `p-2` + ikon 24px = **40px** (< 44px), dan **tanpa `aria-label`, `aria-expanded`, `aria-controls`**. Screen reader tidak tahu ini kontrol menu maupun statusnya. Juga `focus:outline-none` di `:108` tanpa pengganti.
- **`Navbar.tsx:65-72`** — Tombol dropdown profil `px-3 py-2` ≈ **36px** (< 44px), tanpa `aria-haspopup` / `aria-expanded`.
- **`Navbar.tsx:76`** — Dropdown adalah `<div>` biasa, bukan `role="menu"`. Tidak ada navigasi panah, tidak ada Escape untuk menutup, tidak ada pengembalian fokus.
- **`Navbar.tsx:78`** — `className="text-[10px] text-gray-400 font-bold uppercase"` — teks 10px warna `#9ca3af` di atas `bg-gray-50`, rasio **≈2.5:1**. Gagal WCAG AA (butuh 4.5:1).
- **`Navbar.tsx:154-156`** — Link mobile diawali emoji (`🏠`, `📍`, `🏢`) tanpa `aria-hidden`. Screen reader membacakan nama emoji sebelum teks link.
- **`Navbar.tsx:89-91`** — Tombol Logout tanpa `type="button"` (tidak dalam `<form>`, jadi tidak ada bug submit, tapi inkonsisten).
- **`Navbar.tsx:61-62`** — `status === 'loading'` merender `<div className="w-20 h-8 bg-gray-100 rounded animate-pulse">`. **Satu-satunya skeleton loading di seluruh cakupan publik.** Pola positif — tapi hanya menutupi area user desktop; di mobile tidak ada padanannya sehingga terjadi flash dari kondisi "belum login" ke "sudah login".

---

### 2.8 `src/app/billboard/[slug]/page.tsx` + `BillboardDetailClient.tsx` — Halaman Detail Billboard

**Fungsi:** Halaman produk. Server Component mengambil satu billboard by slug dari backend NestJS, lalu menyerahkan seluruh rendering ke satu client component: hero image, galeri, peta + street view, tabel spesifikasi, daftar include/exclude, kalender ketersediaan, dan kartu harga sticky dengan CTA checkout.

**Layout:** Hero banner `50vh`/`60vh` dengan overlay gradient dan judul di bawah. Di bawahnya grid 3 kolom: kiri (span 2) konten, kanan (span 1) kartu harga sticky.

**Temuan Kritis:**

- **`BillboardDetailClient.tsx:37-40`** — Empat `JSON.parse()` berturut-turut **tanpa try/catch** atas `rawData.gallery`, `rawData.specs`, `rawData.includes`, `rawData.excludes`. Jika salah satu kolom DB bernilai `null`, string kosong, atau JSON rusak, `JSON.parse` melempar dan **seluruh halaman produk crash**. Karena tidak ada `error.tsx` di segmen ini, user mendapat error boundary paling atas — layar error mentah. Field-field ini diisi dari form admin; satu entri terlewat = halaman produk tidak bisa dibuka sama sekali.
- **`page.tsx:14`** — `fetch(\`http://localhost:4001/api/billboards/${slug}\`)` — URL **hardcode localhost**, tidak memakai `process.env.NEXT_PUBLIC_API_URL` (berbeda dari `src/app/page.tsx:9` yang memakainya). Halaman detail gagal total di produksi.
- **`page.tsx:58-65`** — Kondisi "tidak ditemukan" merender JSX inline alih-alih memanggil `notFound()`. Status HTTP tetap **200 OK** untuk halaman yang semantiknya 404 (soft 404, diindeks crawler). Juga menyatukan dua kondisi berbeda — slug tidak ada vs backend mati (`page.tsx:22-25` menangkap exception dan mengembalikan `null`) — menjadi pesan sama "Billboard Tidak Ditemukan". Saat backend down, user diberi tahu produknya tidak ada.

**Temuan Responsive:**

- **`BillboardDetailClient.tsx:48`** — `className="relative mt-16 w-full h-[50vh] lg:h-[60vh] bg-gray-900 group overflow-hidden"`. Di iPhone SE (568px) `50vh` = 284px. Blok judul absolut `bottom-0` (`:56-66`) berisi badge + `h1 text-3xl` + alamat tanpa batas tinggi; **di 320px judul panjang wrap 3-4 baris dan menabrak badge di atasnya**. Di landscape mobile (tinggi ~375px) hero jadi 187px dan tombol "Kembali" (`:51-55`, `top-6 left-6`) bertabrakan dengan blok judul. Juga `vh` bukan `dvh`.
- **`BillboardDetailClient.tsx:80`** — `className="grid grid-cols-2 md:grid-cols-3 gap-4"`. Di **320px** tiap sel ≈ **112px** lebar; dengan `aspect-video` tingginya hanya 63px — thumbnail terlalu kecil untuk menilai apa pun. Butuh `grid-cols-1 sm:grid-cols-2 md:grid-cols-3`.
- **`BillboardDetailClient.tsx:97-110`** — Tabel spesifikasi dibungkus `<div className="overflow-hidden border ...">` — **`overflow-hidden`, bukan `overflow-x-auto`**. Sel `py-4 px-6` dengan kolom label `w-1/3`: di 320px kolom label = 107px dikurangi 48px padding = **59px untuk teks**. Label seperti "Ukuran Media (P x L)" memaksa tabel melebar, dan kelebihannya **terpotong tanpa bisa di-scroll**. Kehilangan data yang kasatmata.
- **`BillboardDetailClient.tsx:156`** — `className="sticky top-24 bg-white p-8 rounded-3xl shadow-2xl"`. Grid induk `:72` adalah `grid-cols-1 lg:grid-cols-3`, jadi di bawah 1024px kartu harga **jatuh ke paling bawah halaman**, setelah kalender. CTA checkout utama tersembunyi di ujung scroll panjang di mobile. Butuh sticky bottom bar mobile.
- **`BillboardDetailClient.tsx:63`** — `className="text-3xl md:text-5xl font-extrabold leading-tight ..."` tanpa `line-clamp`. Judul 60 karakter di 320px = 4 baris = ~120px, mendominasi hero 284px.
- **`BillboardDetailClient.tsx:114`** — `grid grid-cols-1 md:grid-cols-2 gap-8` — benar. Pola positif.

**Temuan A11y:**

- **`BillboardDetailClient.tsx:82`** — `<img key={idx} src={url} className="... cursor-pointer ..." />` — **tanpa `alt`**, dan `cursor-pointer` menjanjikan interaksi padahal **tidak ada `onClick`** (tidak ada lightbox). Afordansi palsu.
- **`BillboardDetailClient.tsx:49`** — `<img src={rawData.mainImage} alt={rawData.title} />` — punya `alt` (positif), tapi `<img>` mentah. Ini elemen LCP halaman: tanpa `next/image`, tanpa `priority`, tanpa `sizes`, tanpa optimasi format.
- **Hierarki heading:** `h1` di `:63` → `h3` di `:79,90,96` → `h4` di `:116,132`. **Lompat h1→h3, tidak ada h2.** Melanggar WCAG 1.3.1.
- **`BillboardDetailClient.tsx:79,90,96`** — Heading diawali emoji (`📸`, `📍`, `🛠️`) tanpa `aria-hidden`.
- **`BillboardDetailClient.tsx:176-187`** — `<Link>` membungkus `<button disabled>` — **HTML tidak valid** (elemen interaktif bersarang), dua stop fokus untuk satu aksi. Penanganan disabled-nya rangkap tiga dan rapuh: `pointer-events-none` (`:178`), `onClick` preventDefault (`:179`), `disabled` (`:183`). **Bug nyata: `pointer-events-none` tidak menghalangi aktivasi keyboard, dan `<a>` tidak punya `aria-disabled` — user keyboard dapat men-tab ke link dan menekan Enter untuk lanjut ke checkout tanpa memilih tanggal.**
- **`BillboardDetailClient.tsx:188-190`** — `<button>Hubungi Sales (WA)</button>` **tanpa `onClick`**. CTA mati ketiga di aplikasi.
- **`BillboardDetailClient.tsx:124-128`** — `<TrafficReportModal />` (yang merender `<div>`) ditempatkan **langsung di dalam `<ul>`**. `<div>` bukan child valid untuk `<ul>`. HTML tidak valid, pohon aksesibilitas list rusak.
- **`BillboardDetailClient.tsx:64,106,123,139,158,161`** — `text-gray-400` / `text-gray-300`, rasio **2.84:1** pada putih. Gagal WCAG AA.
- **`BillboardDetailClient.tsx:106,123,139`** — Empty state eksplisit ada ("Data spesifikasi belum diinput" dsb). **Area empty-state terbaik di seluruh aplikasi.** Pola positif.

**Temuan State / Perf:**

- **`BillboardDetailClient.tsx:2`** — `'use client'` pada komponen yang merender **seluruh halaman**. Hero, galeri, tabel spesifikasi, daftar include/exclude semuanya statis. Hanya kalender (`:146`), `LocationVisualizer` (`:91`), dan `TrafficReportModal` (`:126`) yang interaktif. Seluruh markup dikirim dua kali (HTML + payload RSC) lalu di-hydrate tanpa perlu.
- **`page.tsx:29-38`** — `getSystemSettings()` adalah **fungsi dummy hardcode** yang selalu mengembalikan `googleMapsApiKey: null`. Akibatnya Street View di `LocationVisualizer.tsx:88-96` **tidak pernah bisa tampil** — tab yang diiklankan permanen jatuh ke fallback.
- **`BillboardDetailClient.tsx:27-34`** — `handleDateSelect` memanggil `router.push()` tiap kali tanggal dipilih. Halaman ini `no-store`, jadi **tiap klik tanggal memicu round-trip server penuh** tanpa state loading. Klik beruntun = navigasi bertumpuk.
- **Tidak ada `loading.tsx` maupun `error.tsx` di `src/app/billboard/[slug]/`.**

---

### 2.9 `src/components/LocationVisualizer.tsx` — Peta Lokasi & Street View

**Fungsi:** Kotak dua tab di halaman detail: peta Leaflet dengan marker lokasi, dan Street View Google via iframe.

**Temuan:**

- **`LocationVisualizer.tsx:49`** — `className="relative w-full h-[400px] bg-gray-100 rounded-xl ..."` — **tinggi mati 400px di semua breakpoint**. Di 320px rasionya jadi hampir kotak (0.8:1), boros ruang vertikal untuk peta yang detailnya tidak terbaca di lebar efektif 288px. Butuh `h-[250px] md:h-[400px]` atau `aspect-video`.
- **`LocationVisualizer.tsx:52`** — Tab switcher absolut `top-4 right-4 z-[500]` dengan dua tombol berteks, lebar gabungan ≈170px. Di **320px** switcher memakan **~59% lebar peta** dan menutupi area yang berguna.
- **`LocationVisualizer.tsx:53-58, 59-64`** — Tombol tab `px-3 py-1.5 text-xs` = tinggi **~30px** (< 44px). Tidak ada `role="tab"` / `role="tablist"` / `aria-selected`.
- **`LocationVisualizer.tsx:61`** — Tab STREET aktif memakai `bg-blue-600`, sedangkan tab MAP aktif memakai `bg-utero`. **Dua warna active-state berbeda dalam satu kontrol yang sama.**
- **`LocationVisualizer.tsx:11-26`** — Empat `dynamic()` terpisah (`MapContainer`, `TileLayer`, `Marker`, `Popup`) dengan `ssr: false` dan **tanpa opsi `loading`** pada satu pun. Selama chunk dimuat, kotak 400px tampil **abu-abu kosong tanpa indikator apa pun** — bandingkan `MapWrapper.tsx:8` yang benar memberi fallback "Memuat Peta...". Memecah satu library jadi 4 dynamic import juga menghasilkan 4 chunk dan 4 titik waterfall; seharusnya satu wrapper yang di-`dynamic`.
- **`LocationVisualizer.tsx:33-46`** — `useEffect` memanggil `require("leaflet")` lalu memutasi `L.Icon.Default.prototype` (`delete ... _getIconUrl`) dengan URL ikon dari CDN unpkg. `require()` di modul ESM rapuh dan bergantung interop bundler; mutasi prototype global memberi efek samping lintas-aplikasi. Ketergantungan CDN eksternal juga berarti marker hilang jika unpkg tidak terjangkau.
- **`LocationVisualizer.tsx:88-96`** — Iframe Street View hanya dirender jika `apiKey` truthy, padahal `getSystemSettings()` di `billboard/[slug]/page.tsx:29-38` **selalu** mengembalikan `null`. Cabang ini **kode mati permanen**.
- **`LocationVisualizer.tsx:89`** — `<iframe>` **tanpa atribut `title`**. Screen reader mengumumkan "frame" tanpa konteks (WCAG 4.1.2). Juga memakai `frameBorder="0"` yang usang.
- **`LocationVisualizer.tsx:100`** — `<img src="https://images.unsplash.com/photo-1449824913935-..." className="w-full h-full object-cover" />` — **tanpa `alt`**. Gambar dekoratif eksternal 800px diunduh di setiap kunjungan halaman detail hanya untuk latar yang di-grayscale.
- **`LocationVisualizer.tsx:105`** — `text-gray-300` pada latar gelap/terang campuran; kontras di bawah ambang.
- **`LocationVisualizer.tsx:109-115`** — `<a target="_blank">` **tanpa `rel="noopener noreferrer"`**. Pola sama terulang di `TrafficReportModal.tsx:30`, `BookingCard.tsx:256`, `dashboard/order/[id]/page.tsx:144`.
- **`LocationVisualizer.tsx:73`** — `scrollWheelZoom={false}` — benar untuk peta yang tertanam dalam halaman scroll. Pola positif (bandingkan `HeroMap.tsx:27` yang `true`, tepat karena fullscreen).
- **Tidak ada state error** untuk iframe maupun tile peta. Jika tile server gagal, user melihat kotak abu-abu tanpa penjelasan.

---

### 2.10 `src/components/AvailabilityCalendar.tsx` — Kalender Ketersediaan

**Fungsi:** Pemilih tanggal berbasis react-calendar. Dua mode: bulan tunggal, dan tampilan tahun berisi 12 kalender. Tanggal lampau dan tanggal terpesan di-disable.

**Temuan Perf:**

- **`AvailabilityCalendar.tsx:65-85, 126-128`** — Mode tahun merender **12 instance `<Calendar>` sekaligus**, masing-masing 35-42 tombol tanggal — **~450 elemen interaktif serentak**. `tileDisabled` (`:20-30`) dipanggil untuk tiap tile dan melakukan `.some()` atas seluruh `bookedDates`; dengan 50 booking itu **±22.500 iterasi per render**. Di perangkat mobile kelas menengah, beralih ke mode tahun membekukan UI 1-3 detik.
- **`AvailabilityCalendar.tsx:17,73,116`** — `useState(new Date())` dan `minDate={new Date()}` dievaluasi saat render, menghasilkan nilai berbeda antara server dan client — **sumber hydration mismatch klasik**. Ini disembunyikan oleh `reactStrictMode: false` di `next.config.ts:7` (komentarnya menyebut "SOLUSI PETA CRASH"). Mematikan Strict Mode menutupi gejala, bukan memperbaiki penyebab.

**Temuan Responsive / Touch / A11y:**

- **`AvailabilityCalendar.tsx:126`** — `className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"` — punya varian responsive (positif), tapi di `grid-cols-1` pada 320px, 12 kalender bertumpuk menghasilkan halaman ~4.000px tanpa alat navigasi.
- **`AvailabilityCalendar.tsx:94,98`** — Tombol prev/next `p-1` + ikon 20px = **28px** (< 44px), dan **tanpa `aria-label`**. Screen reader hanya mendengar "button", "button".
- **`AvailabilityCalendar.tsx:101,102`** — Toggle `px-3 py-1` = tinggi **~26px** (< 44px). Labelnya `year` / `month` — **bahasa Inggris huruf kecil di antarmuka Indonesia** (lihat Bagian 6).
- **`AvailabilityCalendar.tsx:95`** — `<h5 className="font-bold w-32 text-center">` — lebar mati 128px untuk "September 2026". Muat pas, tapi pada zoom teks 200% (WCAG 1.4.4) label terpotong.
- **`AvailabilityCalendar.tsx:90`** — Header `flex justify-between items-center` tanpa `flex-wrap`.
- **`AvailabilityCalendar.tsx:107-110`** — Blok "Legenda" adalah **div kosong berisi hanya komentar** `{/* ... (legenda yang sudah ada) ... */}`. Akibatnya **tidak ada penjelasan arti tanggal abu-abu**. Padahal `tileDisabled` (`:23` vs `:25-29`) menggabungkan dua kondisi yang sangat berbeda — "sudah lewat" dan "sudah dipesan" — menjadi tampilan identik. User tidak bisa membedakan billboard yang penuh dari tanggal yang kedaluwarsa.
- **`AvailabilityCalendar.tsx:5`** — `import 'react-calendar/dist/Calendar.css'` dipakai apa adanya, sementara `globals.css` tidak meng-override apa pun (lihat 2.2). Kalender karena itu memakai gaya bawaan library yang tidak menyatu dengan bahasa desain aplikasi.
- **`AvailabilityCalendar.tsx:54-59`** — `tileClassName` mengembalikan `'bg-utero text-white rounded-md'`, berebut dengan `.react-calendar__tile--active` bawaan yang spesifisitasnya lebih tinggi. Highlight tanggal terpilih sering **tidak muncul**.
- **`AvailabilityCalendar.tsx:131`** — Instruksi terpenting komponen ("Klik tanggal untuk memilih mulai tayang") dirender `text-[10px] text-gray-400` — **ukuran terkecil dan kontras terendah (2.84:1) di halaman**. Gagal WCAG AA.
- **Tidak ada `aria-label` pada wrapper, tidak ada live region.** Setelah tanggal dipilih, satu-satunya umpan balik adalah perubahan warna tile — tidak diumumkan ke screen reader.

---

### 2.11 `src/components/TrafficReportModal.tsx` — Modal Laporan Trafik

**Fungsi:** Tombol yang membuka modal fullscreen berisi iframe ke laporan analitik trafik pihak ketiga (via `/api/proxy`).

**Temuan:**

- **`TrafficReportModal.tsx:48-54`** — "Loading screen" ditempatkan pada `-z-10`, yaitu **di belakang iframe**. Karena itu **tidak pernah terlihat**. Efektifnya **komponen ini tidak punya state loading sama sekali**; dan jika proxy gagal, user menatap iframe putih kosong permanen **tanpa pesan error apa pun**.
- **`TrafficReportModal.tsx:52`** — `new URL(url).hostname` dipanggil tanpa try/catch. Jika `rawData.smartsucoUrl` malformed atau kosong, konstruktor melempar dan **komponen crash** — di dalam halaman yang tidak punya `error.tsx`.
- **`TrafficReportModal.tsx:21-58`** — Modal **tanpa `role="dialog"`, tanpa `aria-modal="true"`, tanpa focus trap, tanpa handler Escape, tanpa klik-backdrop untuk menutup, tanpa pengembalian fokus** saat ditutup. User keyboard dapat men-tab keluar ke konten di belakang modal yang seharusnya inert.
- **`TrafficReportModal.tsx:23`** — `className="bg-white w-full max-w-5xl h-[85vh] rounded-2xl ..."`. `h-[85vh]` (bukan `dvh`) dan di 320px sebuah iframe situs analitik desktop setinggi 85vh **tidak dapat dipakai** — tidak ada pesan "buka di desktop", tidak ada penanganan mobile.
- **`TrafficReportModal.tsx:33`** — Tombol close `p-2` + `<X size={20}/>` ≈ **36px** (< 44px), **tanpa `aria-label`**.
- **`TrafficReportModal.tsx:14-19`** — Tombol pemicu `text-xs px-3 py-3` berwarna biru — **off-brand** terhadap palet `utero` merah.
- **`TrafficReportModal.tsx:22`** — `animate-in fade-in zoom-in duration-300` — kelas dari `tailwindcss-animate` yang **tidak terpasang** (lihat C-01). Animasi mati.
- **`TrafficReportModal.tsx:30`** — `<a target="_blank">` **tanpa `rel="noopener noreferrer"`**.
- **`TrafficReportModal.tsx:41-46`** — Iframe punya `title="Traffic Report Proxy"` (positif) dan `sandbox="allow-scripts allow-same-origin allow-forms"`. Catatan keamanan: kombinasi `allow-scripts` + `allow-same-origin` pada konten pihak ketiga secara efektif **menghapus proteksi sandbox** — konten di dalam iframe dapat mengakses origin aplikasi dan menghapus atribut sandbox-nya sendiri. Karena URL berasal dari input admin, ini jalur yang patut dievaluasi ulang.
- **`TrafficReportModal.tsx:49`** — `text-gray-400`, kontras 2.84:1.

---

### 2.12 `src/app/checkout/page.tsx` + `src/components/CheckoutForm.tsx` — Checkout

**Fungsi:** Halaman pemesanan. Server Component membaca `id`, `date`, `duration` dari query string, mengambil billboard **langsung lewat Prisma**, lalu merender form 4 langkah: pilih durasi, data penyewa, materi desain, metode bayar — dengan ringkasan harga sticky di kanan.

**Layout:** Dua kolom (`lg:grid-cols-3`), kiri span 2 berisi 4 kartu bernomor, kanan span 1 berisi kartu ringkasan + kartu hitam nominal bayar.

**Temuan Kritis — Form Rusak:**

- **`CheckoutForm.tsx:141-154`** — **Tiga field "Data Penyewa" (Nama Lengkap, WhatsApp, Email) adalah field mati.** Tidak punya `id`, `name`, `value`, maupun `onChange`; nilainya tidak pernah dibaca. Payload di `:59-67` sama sekali tidak menyertakannya. User mengetik nama perusahaan dan email untuk invoice, menekan Bayar, dan **data itu dibuang diam-diam**. Sama untuk field NPWP di `:166` — checkbox "Saya butuh Faktur Pajak" (`:157`) mengubah state, tapi nomor NPWP yang diketik tidak pernah dikirim.
- **`CheckoutForm.tsx:51`** — `document.getElementById('startDateInput') as HTMLInputElement` — pembacaan DOM langsung di dalam komponen React, karena input tanggal di `:126-131` **uncontrolled** (`defaultValue`, tanpa `value`/`onChange`). Anti-pattern; rapuh terhadap perubahan struktur dan tidak bisa divalidasi reaktif.
- **`checkout/page.tsx:44`** — `duration={parseInt(duration)}`. Jika query `?duration=abc`, hasilnya `NaN`; `CheckoutForm.tsx:25` `useState(initialDuration || 1)` kebetulan menyelamatkannya (karena `NaN` falsy), tapi ini kebetulan, bukan validasi.
- **`checkout/page.tsx:22-25, 33-35`** — Dua `redirect('/')` **tanpa penjelasan apa pun**. User yang tiba dengan link kedaluwarsa atau billboard terhapus dilempar ke beranda tanpa pesan. Seharusnya `notFound()` atau halaman error dengan konteks.

**Temuan Form UX:**

- **`CheckoutForm.tsx:47, 53, 80, 83, 88`** — **Lima `alert()`** di satu komponen, termasuk jalur sukses (`:80` `alert("✅ ORDER DITERIMA! ...")`) dan jalur gagal (`:83` `alert("❌ Gagal: " + result.message)`). Alert memblokir thread, tidak bisa di-style, tidak bisa diakses screen reader sebagai umpan balik kontekstual, dan di iOS tampil sebagai dialog sistem bertuliskan nama domain. **Tidak layak produksi.**
- **`CheckoutForm.tsx:53`** — Validasi tanggal kosong hanya lewat `alert()`, bukan pesan inline di dekat field. User harus menutup dialog lalu mencari sendiri field mana yang bermasalah.
- **`CheckoutForm.tsx:44-92`** — `handlePayment` adalah satu-satunya jalur submit, dan tidak ada `<form>` sama sekali di komponen ini. Akibatnya: **tidak ada submit via Enter**, tidak ada validasi HTML native, tidak ada `required`.
- **`CheckoutForm.tsx:148`** — `<input type="number" placeholder="08..." />` untuk WhatsApp. **Salah tipe**: `type="number"` menghapus angka nol di depan, menampilkan panah spinner, dan menolak format `+62`/spasi. Gunakan `type="tel"` + `inputMode="numeric"`.
- **`CheckoutForm.tsx:166`** — `<input type="number" placeholder="00.000..." />` untuk **NPWP**, yang formatnya mengandung titik dan strip. `type="number"` membuat placeholder-nya sendiri tidak dapat diketik.
- **`CheckoutForm.tsx:267`** — Tombol bayar punya `disabled={isLoading}` dan label berubah jadi "Sedang Memproses..." — **proteksi double-submit yang benar**. Pola positif; satu-satunya di aplikasi selain `AccountSettingsForm`.
- **`CheckoutForm.tsx:99`** — Tombol "Batal / Kembali" tanpa `type="button"`.
- **`CheckoutForm.tsx:4,6`** — `useEffect` dan `useSearchParams` diimpor tapi **tidak pernah dipakai**. Kode mati.

**Temuan A11y:**

- **`CheckoutForm.tsx:110-122`** — Pemilih durasi dibuat dari **`<div onClick={() => setDuration(bulan)}>`**. Bukan `<button>`, bukan radio group: **tidak fokusable keyboard, tidak bisa diaktifkan dengan Enter/Space, tanpa `role`, tanpa `aria-pressed`/`aria-checked`**. User keyboard dan screen reader **tidak dapat memilih durasi sama sekali** — memblokir seluruh alur pembelian.
- **`CheckoutForm.tsx:179, 184`** — Pemilih materi desain memakai pola `<div onClick>` yang sama. Sama-sama tidak dapat dioperasikan dengan keyboard.
- **`CheckoutForm.tsx:205-216`** — Metode bayar memakai `<label>` membungkus `<input type="radio">` — pola yang **benar** (positif), tapi kedua radio **tidak punya atribut `name`**, sehingga secara native bukan satu grup. Grouping hanya bekerja karena state React. Tanpa `name`, navigasi panah antar radio tidak berfungsi, dan tidak ada `<fieldset>`/`<legend>`.
- **`CheckoutForm.tsx:125, 143, 147, 152, 165`** — Lima `<label>` **tanpa `htmlFor`**, input pasangannya tanpa `id`. Klik label tidak memfokuskan input; screen reader tidak mengumumkan nama field.
- **`CheckoutForm.tsx:157-160`** — `<input id="fakturCheck">` + `<label htmlFor="fakturCheck">` — **satu dari hanya dua pasangan label yang benar di seluruh cakupan publik** (yang lain di `AccountSettingsForm.tsx:13`). Pola positif.
- **`CheckoutForm.tsx:227`** — `<img src={billboard.mainImage} className="w-16 h-16 rounded object-cover" />` — **tanpa `alt`**.
- **`CheckoutForm.tsx:130,144,148,153,166`** — `outline-none` tanpa pengganti `focus-visible`.
- **`CheckoutForm.tsx:180,182,185,187,263`** — `text-gray-400` (2.84:1), termasuk pada teks penjelas opsi desain yang memuat informasi format file.
- **Hierarki heading:** `checkout/page.tsx:42` `h1`, lalu `CheckoutForm.tsx:105,137,174,200` langsung `h3`. **Lompat h1→h3.**

**Temuan Responsive:**

- **`CheckoutForm.tsx:110`** — `className="grid grid-cols-2 md:grid-cols-4 gap-3"`. Di **320px** tiap kartu durasi ≈ 130px berisi ikon 24px + teks `text-lg` "12 Bulan" + badge. Muat, tapi `p-3` membuat teks hampir menyentuh tepi. Masih dapat diterima.
- **`CheckoutForm.tsx:223`** — `sticky top-24`. Di bawah `lg` grid runtuh dan kartu ringkasan + tombol bayar **jatuh ke bawah keempat kartu form** — user mobile harus scroll melewati seluruh form untuk melihat total dan tombol bayar, tanpa ringkasan harga yang terlihat saat mengubah durasi. Masalah konversi serius.
- **`CheckoutForm.tsx:141,178`** — `grid grid-cols-1 md:grid-cols-2` — benar. Pola positif.
- **`CheckoutForm.tsx:262-266`** — Kartu hitam nominal bayar memakai `text-3xl font-bold`. Di 320px, angka seperti `Rp 33.300.000,00000000001` (lihat di bawah) membanjiri kolom dan wrap tak rapi.

**Temuan i18n / Format Angka:**

- **`CheckoutForm.tsx:42`** — `grandTotal * 0.60` menghasilkan **float presisi ganda**. Dirender mentah di `:265` sebagai `Rp {mustPayNow.toLocaleString('id-ID')}` — tanpa pembulatan, nominal DP dapat tampil dengan ekor desimal panjang. Nilai yang sama juga dikirim ke backend sebagai `dpAmount` (`:64`), jadi **bug ini masuk ke database dan invoice**, bukan sekadar kosmetik.
- **`CheckoutForm.tsx:39`** — `ppn = subTotalSewa * 0.11` juga tanpa pembulatan; dirender di `:245`.
- **`CheckoutForm.tsx:241,245,249,256,265`** — Lima kali `Rp {x.toLocaleString('id-ID')}` ditulis manual, tanpa `minimumFractionDigits`, tanpa formatter bersama. Lihat Bagian 6.

---

### 2.13 `src/app/login/page.tsx` — Halaman Login

**Fungsi:** Form login email/password via NextAuth credentials, plus tombol Google. Mendeteksi akun admin dan memaksa mereka ke `/admin/login`.

**Layout:** Kartu terpusat `sm:max-w-md` di atas `bg-gray-50`, dibungkus wrapper `md:h-screen`.

**Temuan:**

- **`login/page.tsx:63`** — `className="flex flex-col items-center justify-center px-6 py-24 mx-auto md:h-screen lg:py-0"`. **`md:h-screen` = `100vh`**, bukan `100dvh`. Di browser mobile dengan chrome dinamis, `100vh` melebihi viewport terlihat sehingga bagian bawah kartu terpotong di balik toolbar. Berlaku dari 768px ke atas, termasuk tablet portrait.
- **`login/page.tsx:98, 102`** — Kedua `<label>` **tanpa `htmlFor`**; input di `:99, 103` **tanpa `id`**. Klik label tidak memfokuskan input.
- **`login/page.tsx:99, 103`** — Kedua input **tanpa `required`** dan tanpa `autoComplete`. Password manager tidak mengenali form ini, dan submit kosong menempuh round-trip jaringan sebelum gagal.
- **`login/page.tsx:17-50`** — Form dibaca lewat `FormData`, bukan controlled state. Sah, tapi berarti tidak ada validasi per-field maupun umpan balik saat mengetik.
- **`login/page.tsx:32-34`** — `setError("Email atau Password salah!")` dirender **inline** di `:74-77`. **Ini pola error terbaik di seluruh aplikasi** (tidak memakai `alert()`). Pola positif.
- **`login/page.tsx:76`** — Kotak error memakai `animate-pulse` yang berdenyut terus-menerus. Gerakan tak berhenti pada pesan error mengganggu dan melanggar semangat WCAG 2.3.3; tidak menghormati `prefers-reduced-motion`.
- **`login/page.tsx:40-46`** — Deteksi admin: `signOut` lalu `setError("⛔ DETECTED: Anda adalah Admin! ...")` diikuti `setTimeout(() => router.push('/admin/login'), 2000)`. Redirect berbasis timer 2 detik **tanpa cara membatalkan** dan tanpa `aria-live`, sehingga pengguna screen reader kemungkinan besar tidak sempat mendengar pesannya sebelum halaman berpindah.
- **`login/page.tsx:106`** — Tombol submit `disabled={loading}` dengan `disabled:bg-gray-400` — proteksi double-submit benar. Pola positif. Namun teks tombol saat loading tidak diumumkan (tanpa `aria-live`/`aria-busy`).
- **`login/page.tsx:82-88`** — Tombol Google **tanpa `type="button"`** (berada di luar `<form>` sehingga tidak ada bug submit, tapi rapuh jika markup dipindah). SVG inline di `:86` **tanpa `aria-hidden="true"`**.
- **`login/page.tsx:117`** — Link ke login admin: `className="text-[10px] text-gray-400 hover:text-gray-600 font-mono"`. Teks **10px** dengan kontras **2.84:1** — gagal WCAG AA ganda (ukuran dan kontras). Target sentuhnya juga jauh di bawah 44px.
- **`login/page.tsx:10`** — `import { Chrome } from 'lucide-react'` **tidak pernah dipakai**. Kode mati.
- **`login/page.tsx:60`** — `className="bg-gray-50 min-h-screen"` — **tanpa `font-sans`**, berbeda dari `checkout/page.tsx:38` dan `DashboardLayout.tsx:7`. Karena `layout.tsx` juga tidak menetapkan font di `<body>` (lihat 2.1), halaman ini merender dengan font serif default browser sementara halaman lain sans-serif. **Inkonsistensi tipografi yang terlihat jelas antar halaman.**
- **`login/page.tsx:99,103`** — `outline-none` tanpa pengganti.
- **`login/page.tsx:72,92`** — `text-gray-400` pada teks pendukung.
- **Tidak ada `loading.tsx`/`error.tsx`** di segmen ini.

---

### 2.14 `src/app/register/page.tsx` — Halaman Registrasi

**Fungsi:** Form pendaftaran empat field (Nama, Email, WhatsApp, Password) yang POST ke backend NestJS, lalu mengarahkan ke `/login`.

**Temuan:**

- **`register/page.tsx:35`** — `alert("Pendaftaran Berhasil! Silakan Login.")`. Momen konversi paling penting di aplikasi disampaikan lewat **dialog sistem browser**. Tidak layak produksi.
- **`register/page.tsx:37-40`** — Jalur error memakai state inline (konsisten dengan login) — positif. Jadi komponen yang sama memakai **dua mekanisme umpan balik berbeda**: `alert()` untuk sukses, inline untuk gagal.
- **`register/page.tsx:72`** — `<input type="number" ... />` untuk **No. WhatsApp**. Menghapus nol di depan: user mengetik `08123456789`, terkirim `8123456789`. **Bug data, bukan sekadar UX.**
- **`register/page.tsx:63-76`** — Empat `<label>` **tanpa `htmlFor`**, empat input **tanpa `id`**. Semua punya `required` (lebih baik dari login), tapi tidak ada `autoComplete` sehingga password manager tidak dapat mengisi otomatis.
- **`register/page.tsx:48`** — `md:h-screen` — masalah `100vh` yang sama dengan login.
- **`register/page.tsx:45`** — `bg-gray-50 min-h-screen` **tanpa `font-sans`** — masalah font serif yang sama dengan login.
- **`register/page.tsx:27`** — `process.env.NEXT_PUBLIC_API_URL` dipakai **tanpa fallback**, berbeda dari `src/app/page.tsx:9` yang memberi default `http://localhost:4001`. Jika env tidak di-set, URL menjadi `undefined/api/...` dan pendaftaran gagal dengan pesan generik.
- **Inkonsistensi visual dengan login (halaman kembar):**
  - `register:49` `rounded-lg shadow border` vs `login:64` `rounded-xl shadow-lg border border-gray-100` — **radius dan bayangan kartu berbeda.**
  - `register:79` tombol `font-medium rounded-lg text-sm px-5 py-2.5` vs `login:106` `font-bold ... px-5 py-3 rounded-lg shadow-red-100` — **bobot font dan padding berbeda** untuk tombol utama yang seharusnya identik. Tinggi `py-2.5` ≈ 38px, di bawah 44px.
  - `register:82` `<p className="text-sm font-light text-gray-500">` tidak `text-center`, sedangkan padanannya di login `text-center`. **Perataan teks berbeda.**
- **`register/page.tsx:79`** — `disabled={loading}` + label "Sedang Mendaftar..." ada (positif), tapi **tanpa kelas `disabled:`** apa pun (bandingkan `login:106` yang punya `disabled:bg-gray-400`). Saat submit, tombol tetap tampak merah penuh dan aktif — tidak ada isyarat visual bahwa ia nonaktif.
- **Tidak ada validasi kekuatan password**, tidak ada field konfirmasi password, tidak ada toggle lihat-password.

---

### 2.15 `src/app/invoice/[id]/page.tsx` — Invoice

**Fungsi:** Invoice siap cetak untuk satu booking. Server Component dengan pengecekan sesi + kepemilikan, lalu merender dokumen bergaya A4 dengan header, blok pihak, tabel item, blok total, dan catatan.

**Temuan Responsive — Terparah di Aplikasi:**

- **`invoice/[id]/page.tsx:36`** — `className="max-w-[21cm] mx-auto bg-white shadow-lg p-12 rounded-xl ..."`. **`21cm` ≈ 794px lebar A4 mati**, ditambah `p-12` (padding 48px per sisi). Di **375px**: `max-w` tidak membuat elemen melebar (karena `max-w`), jadi lebar mengikuti induk — tetapi padding 96px total menyisakan **279px untuk seluruh isi invoice**, termasuk tabel berkolom banyak. Di **320px** tersisa **224px**. Kombinasi `p-12` + tabel + grid 2 kolom di bawah ini menjadikan invoice **praktis tidak terbaca di ponsel**. Butuh `p-4 md:p-12`.
- **`invoice/[id]/page.tsx:52`** — `className="grid grid-cols-2 gap-10 mb-10"` — **tanpa varian responsive**. Blok "Ditagihkan Kepada" dan "Detail Pembayaran" tetap dua kolom di 320px: tiap kolom ≈ 87px setelah padding dan gap 40px. Nama perusahaan dan email **wrap per-karakter**. Harus `grid-cols-1 md:grid-cols-2`.
- **`invoice/[id]/page.tsx:72-95`** — `<table className="w-full mb-10 border-collapse">` **tanpa wrapper scroll horizontal sama sekali**. Tabel ini punya kolom deskripsi + durasi + harga. Pada lebar isi 224-279px, tabel meluber ke luar kartu dan **memicu scroll horizontal seluruh halaman**, atau terpotong. Tidak ada `overflow-x-auto` di seluruh basis kode.
- **`invoice/[id]/page.tsx:99`** — `<div className="w-1/2">` untuk blok total. **50% dari lebar isi** = ~112px di 320px, untuk menampung label "Total Tagihan" beserta nominal `Rp 33.300.000`. Wrap parah. Harus `w-full md:w-1/2`.
- **`invoice/[id]/page.tsx:39`** — Header `flex justify-between items-center` **tanpa `flex-wrap`**. Logo/judul kiri dan nomor invoice kanan saling menekan di 320px.
- **`invoice/[id]/page.tsx:122-124`** — Petunjuk `print:hidden` bertuliskan "*Tekan Ctrl + P untuk mencetak". **Instruksi khusus desktop** yang ditampilkan juga ke pengguna ponsel, di mana Ctrl+P tidak ada. Dan **tidak ada tombol Cetak/Unduh PDF** — satu-satunya cara mencetak adalah pintasan keyboard yang tidak tersedia di perangkat utama audiens.

**Temuan State:**

- **`invoice/[id]/page.tsx:19`** — `if (!session) return <div className="text-center p-10 font-bold text-red-500">Access Denied: Harap Login</div>`. **Div telanjang: tanpa Navbar, tanpa layout, tanpa link ke halaman login.** User yang mengklik link invoice dari email menghadapi layar putih bertuliskan "Access Denied" tanpa jalan keluar. Seharusnya `redirect('/login?callbackUrl=...')`.
- **`invoice/[id]/page.tsx:27`** — `if(!order) return <div className="text-center p-10 font-bold">Invoice Tidak Ditemukan</div>`. Sama: tanpa layout, dan mengembalikan **HTTP 200** alih-alih 404. Seharusnya `notFound()`.
- **`invoice/[id]/page.tsx:30-32`** — Pemeriksaan kepemilikan `order.userId !== session.user.id && session.user.role !== 'ADMIN'` — **tidak menyertakan `SUPER_ADMIN`**, padahal role itu dikenali di `CheckoutForm.tsx:46` dan `Navbar.tsx:22-36`. Super admin ditolak mengakses invoice. Inkonsistensi model peran.

**Temuan A11y / Konsistensi:**

- **`invoice/[id]/page.tsx:5`** — `import Image from 'next/image'` **tidak pernah dipakai** (nol pemakaian `<Image` di seluruh proyek publik). Menandakan niat optimasi yang ditinggalkan.
- **`invoice/[id]/page.tsx:67`** — `toLocaleDateString()` **tanpa argumen locale**. Satu-satunya tanggal di aplikasi yang formatnya mengikuti locale browser user — pengguna berlokal `en-US` melihat `9/21/2026` di invoice sementara seluruh aplikasi lain menampilkan `21 September 2026`. Pada dokumen legal/keuangan, ambiguitas hari/bulan adalah cacat serius.
- **`invoice/[id]/page.tsx:61-66`** — Peta warna badge status ditulis ulang di sini dengan **aturan berbeda** dari `BookingCard.tsx:181-187`. Status yang sama dapat tampil berwarna berbeda di dashboard dan di invoice.
- **`invoice/[id]/page.tsx:119`** — Footer `text-[10px] text-gray-400`.
- **`invoice/[id]/page.tsx:54,60,67`** — `text-gray-400` pada label data invoice — kontras 2.84:1 pada dokumen yang akan **dicetak**, di mana abu-abu muda sering hilang sama sekali.
- **`invoice/[id]/page.tsx:91,102,108,113`** — Empat `Rp {x.toLocaleString('id-ID')}` manual.
- **Tidak ada `loading.tsx`/`error.tsx`/`not-found.tsx`** di segmen ini.

---

### 2.16 `src/app/dashboard/` — Dashboard User

**File:** `page.tsx` (7 baris, re-export), `DashboardWrapper.tsx` (server), `DashboardClientPage.tsx` (client), `DashboardLayout.tsx`.

**Fungsi:** Halaman "Pesanan Saya". Server component mengambil booking user via Prisma, menghitung total belanja, lalu client component merender kartu profil sticky + tab pesanan (Aktif/Riwayat) berisi `BookingCard`.

**Temuan:**

- **`DashboardClientPage.tsx:56`** — `<h1 className="text-xl font-bold text-gray-800 truncate">{user.name}</h1>`. **`h1` halaman ini adalah nama user**, dan itu terletak di kartu profil samping. Halaman **tidak punya judul sebenarnya** — `OrderTabs` (`:84-131`) merender daftar pesanan **tanpa heading apa pun**. Pengguna screen reader yang melompat antar heading mendengar nama dirinya sendiri sebagai judul halaman, lalu tidak menemukan penanda untuk area konten utama. Melanggar WCAG 1.3.1 dan 2.4.6.
- **`DashboardClientPage.tsx:96-116`** — Tab Aktif/Riwayat dibuat dari `<button>` biasa: **tanpa `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`**, dan panel di bawahnya tanpa `role="tabpanel"`. Screen reader tidak mengetahui ini kontrol tab maupun mana yang aktif — satu-satunya indikator adalah warna border. Juga **tanpa `type="button"`**.
- **`DashboardClientPage.tsx:101`** — `px-3 md:px-4 py-3` ≈ 44px di mobile — **tepat memenuhi ambang batas**. Dapat diterima.
- **`DashboardClientPage.tsx:119-122`** — Empty state adalah **satu baris abu-abu**: `<p className="text-gray-400">Tidak ada data untuk ditampilkan di sini.</p>`. Tanpa ilustrasi, tanpa penjelasan, dan **tanpa CTA untuk menjelajah billboard**. Ini layar pertama yang dilihat setiap user baru setelah registrasi — kesempatan konversi terbesar aplikasi, dan isinya kalimat abu-abu berkontras 2.84:1. **Kelemahan UX paling mahal di dashboard.**
- **`DashboardClientPage.tsx:23`** — `className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8"` — progresi responsive yang benar. Pola positif.
- **`DashboardClientPage.tsx:50`** — Kartu profil `sticky top-24`. Di bawah `md`, kartu runtuh ke atas dan **mendorong daftar pesanan turun ~280px**; user mobile membuka dashboard dan melihat profilnya sendiri, bukan pesanannya. Urutan DOM sebaiknya dibalik dengan `order-*` di mobile.
- **`DashboardClientPage.tsx:72`** — `Rp {(totalSpent / 1000000).toLocaleString('id-ID', {maximumFractionDigits:1})} Jt` — **format mata uang ketiga** di aplikasi (lihat Bagian 6). Pembagian ini juga menyembunyikan nilai kecil: total Rp 400.000 tampil sebagai "Rp 0,4 Jt".
- **`DashboardClientPage.tsx:109`** — Badge jumlah `text-[10px]`.
- **`DashboardClientPage.tsx:5`** — `import Navbar` **tidak dipakai** (sudah dirender oleh `DashboardLayout`). Kode mati.
- **`DashboardLayout.tsx:1`** — `'use client'` pada komponen yang hanya merender `<Navbar />` + `<main>`, **tanpa state, tanpa handler, tanpa hook**. Direktif yang tidak perlu; memaksa boundary client lebih awal dari seharusnya.
- **`DashboardWrapper.tsx:29-33`** — `prisma.booking.findMany` dengan `include: { billboard: true }` — mengambil **seluruh kolom billboard** untuk tiap booking padahal `BookingCard` hanya memakai `title`, `mainImage`, `address`. Kolom `gallery`/`specs`/`includes`/`excludes` (JSON string panjang) ikut terkirim melewati boundary server-client. Gunakan `select`.
- **`DashboardWrapper.tsx:35-40`** — `totalSpent` direduksi hanya atas status `['ACTIVE','REFUNDED']`. Memasukkan **REFUNDED** ke dalam "Total Belanja" secara logis keliru — dana yang dikembalikan bukan belanja. Label di `DashboardClientPage.tsx:71` tetap berbunyi "Total Belanja".
- **Tidak ada `loading.tsx`** di `src/app/dashboard/`, padahal ini segmen dengan query Prisma terberat. Layar kosong selama fetch.
- **Tidak ada state error**: jika query Prisma gagal, seluruh dashboard runtuh ke error boundary root.

---

### 2.17 `src/app/dashboard/order/[id]/page.tsx` — Detail Pesanan

**Fungsi:** Halaman pelacakan satu pesanan: timeline 6 langkah dengan progress bar, foto bukti pemasangan, ringkasan billboard, dan tombol aksi.

**Temuan Kritis:**

- **`dashboard/order/[id]/page.tsx:23`** — `if (!order || !session) return <div className="p-10 text-center font-bold text-gray-500">Data order tidak ditemukan</div>`. **Tidak ada pemeriksaan bahwa pesanan ini milik user yang sedang login.** Setiap user terautentikasi dapat membuka `/dashboard/order/<id>` milik orang lain dan melihat nilai transaksi, alamat, serta bukti pemasangannya. Bandingkan `invoice/[id]/page.tsx:30-32` yang **memang** memeriksa `order.userId !== session.user.id` — inkonsistensi ini membuktikan pemeriksaannya memang diharapkan ada dan terlewat di sini. (Di luar cakupan UI murni, tapi material; diteruskan ke audit keamanan.)
- Div balasan di `:23` juga **tanpa Navbar dan tanpa layout**, serta mengembalikan **HTTP 200**.

**Temuan Responsive:**

- **`dashboard/order/[id]/page.tsx:101-127`** — Timeline horizontal. Tiap langkah `<div className="flex flex-col items-center w-24 -ml-4 md:ml-0">` (`:112`) — **6 langkah × 96px = 576px lebar minimum**, di dalam `flex justify-between` (`:110`) **tanpa wrapper `overflow-x-auto`**. Di **320px** (isi efektif ~288px) dan **375px** (~343px), keenam langkah diremas ke separuh lebar yang dibutuhkan: label `text-[10px]` (`:118`) dan `text-[9px]` (`:122`) **saling menimpa dan tumpang tindih**. Ini komponen utama halaman dan rusak di seluruh rentang ponsel. Butuh `overflow-x-auto` atau timeline vertikal di mobile.
- **`dashboard/order/[id]/page.tsx:86`** — `flex justify-between items-start` **tanpa `flex-wrap`**. Judul pesanan dan badge status bertabrakan di 320px.
- **`dashboard/order/[id]/page.tsx:161`** — `className="grid grid-cols-2 gap-4 ... md:w-1/2"` — **`grid-cols-2` tanpa varian responsive**. Pasangan label/nilai tetap dua kolom di 320px.
- **`dashboard/order/[id]/page.tsx:153`** — `flex flex-col md:flex-row gap-6` — benar. Pola positif.
- **`dashboard/order/[id]/page.tsx:106`** — `shadow-[0_0_10px_rgba(34,197,94,0.4)]` — nilai bayangan arbitrer sekali-pakai, di luar skala `shadow-*` mana pun.

**Temuan Touch / A11y:**

- **`dashboard/order/[id]/page.tsx:113`** — Lingkaran langkah `w-9 h-9` = **36px** (< 44px). Non-interaktif, jadi bukan pelanggaran target sentuh, tapi menampung ikon + angka pada ukuran itu membuatnya tak terbaca.
- **`dashboard/order/[id]/page.tsx:118, 122`** — `text-[10px] md:text-xs` dan `text-[9px]`. **Teks 9px** adalah ukuran terkecil di seluruh aplikasi, dipakai untuk stempel waktu langkah timeline.
- **`dashboard/order/[id]/page.tsx:114, 118, 163, 167`** — `text-gray-300` / `text-gray-400` untuk langkah yang belum tercapai. `#d1d5db` pada putih = rasio **1.47:1** — hampir tak terlihat, jauh di bawah 4.5:1.
- **`dashboard/order/[id]/page.tsx:139`** — `<img src={order.installationProof} className="... cursor-pointer hover:opacity-80" />` — **tanpa `alt`**, dan `cursor-pointer` + `hover:opacity-80` menjanjikan klik-untuk-perbesar yang **tidak ada `onClick`-nya**. Afordansi palsu kedua di aplikasi. Bukti pemasangan adalah artefak terpenting halaman ini dan hanya dapat dilihat pada ukuran thumbnail.
- **`dashboard/order/[id]/page.tsx:154`** — `<img ... alt={order.billboard.title} />` — punya `alt`. Positif.
- **`dashboard/order/[id]/page.tsx:144`** — Link unduh `text-[10px]`, dan `target="_blank"` **tanpa `rel="noopener noreferrer"`**.
- **`dashboard/order/[id]/page.tsx:173-178`** — Dua tombol aksi `px-5 py-2.5 text-xs` ≈ **34px** (< 44px).
- **`dashboard/order/[id]/page.tsx:137`** — `animate-in fade-in slide-in-from-bottom-2` — kelas plugin yang tidak terpasang. Mati.
- **`dashboard/order/[id]/page.tsx:26-32`** — `formatTime`/`formatDateOnly` memakai `Intl.DateTimeFormat('id-ID', ...)` — **pendekatan yang paling benar di aplikasi**, tapi didefinisikan lokal di file ini saja, tidak dibagikan. Pola positif yang tidak diangkat menjadi util bersama.
- **Tidak ada `loading.tsx`/`error.tsx`** di segmen ini.

---

### 2.18 `src/app/dashboard/settings/` — Pengaturan Akun

**File:** `page.tsx` (server), `AccountSettingsForm.tsx` (client).

**Fungsi:** Dua form terpisah: ubah profil (nama, WhatsApp) dan ubah password.

**Temuan Positif (penting — ini acuan untuk perbaikan di tempat lain):**

- **`AccountSettingsForm.tsx:11-24`** — Komponen `InputField` menghasilkan `<label htmlFor={id}>` + `<input id={id} name={id} value onChange />`. **Ini satu-satunya pola label/input yang sepenuhnya benar di seluruh aplikasi**, dan input yang sepenuhnya controlled. Seluruh form lain (`CheckoutForm`, `login`, `register`, `ChatWidget`, modal `BookingCard`) harus dimigrasikan ke pola ini.
- **`AccountSettingsForm.tsx:111, 126`** — Kedua tombol punya `type="submit"` eksplisit, `disabled={loading}`, `disabled:bg-gray-400`, dan spinner. Proteksi double-submit terbaik di aplikasi.

**Temuan:**

- **`AccountSettingsForm.tsx:62, 65, 74, 89, 92`** — **Lima `alert()`**, mencakup sukses profil (`:62`), error profil (`:65`), mismatch password (`:74`), sukses password (`:89`), error password (`:92`). **Seluruh umpan balik komponen ini disalurkan lewat dialog browser** — padahal komponennya sendiri sudah memiliki infrastruktur state yang rapi untuk pesan inline.
- **`AccountSettingsForm.tsx:73-76`** — Validasi "password tidak cocok" **hanya lewat `alert()`**, bukan pesan inline di bawah field konfirmasi, dan tidak menandai field yang salah. Tidak ada `aria-invalid`, tidak ada `aria-describedby`.
- **`AccountSettingsForm.tsx:20`** — `focus:ring-indigo-500 focus:border-indigo-500` — **warna fokus indigo**, sementara seluruh aplikasi memakai `utero` (#ce181e). Ini satu-satunya tempat indigo muncul di cakupan publik; jelas sisa boilerplate Tailwind. Juga `focus:outline-none` pada baris yang sama.
- **`AccountSettingsForm.tsx:111`** — `bg-red-600 hover:bg-red-700` alih-alih `bg-utero hover:bg-utero-hover`. **`red-600` (#dc2626) bukan warna merek (#ce181e)** — berbeda kasatmata jika bersebelahan. Token merek yang sudah didefinisikan di `tailwind.config.ts:15` tidak dipakai.
- **`AccountSettingsForm.tsx:126`** — `bg-gray-800 hover:bg-black` untuk tombol submit kedua. **Gaya tombol primer ketiga dalam satu file** (utero/red-600/gray-800), tanpa hierarki yang bermakna — keduanya sama-sama aksi primer dari form masing-masing.
- **`AccountSettingsForm.tsx:112, 127`** — `<Loader2 className="animate-spin" />` menggantikan teks tombol saat loading, **tanpa `aria-live`, `aria-busy`, maupun teks `sr-only`**. Pengguna screen reader kehilangan nama tombol saat menyimpan dan tidak mendapat pemberitahuan apa pun tentang hasilnya (karena hasil dikirim lewat `alert`, yang juga tidak masuk live region).
- **`AccountSettingsForm.tsx:104-105, 122-124`** — Input tanpa `autoComplete`. Field password khususnya butuh `autoComplete="current-password"` / `"new-password"` agar password manager berfungsi benar.
- **`AccountSettingsForm.tsx:101, 119`** — `className="bg-white p-6 rounded-xl shadow-sm border"` — **`border` tanpa warna**, mengandalkan `border-gray-200` default Tailwind, sementara kartu lain di aplikasi menulis `border border-gray-100` secara eksplisit. Ketebalan/warna garis berbeda antar kartu.
- **`settings/page.tsx:42`** — `<h1 className="text-3xl font-bold text-gray-800">Pengaturan Akun</h1>` lalu `AccountSettingsForm.tsx:102,120` `<h2>` — **hierarki heading yang benar**. Satu-satunya halaman dengan struktur heading valid. Pola positif.
- **Tidak ada `loading.tsx`/`error.tsx`** di segmen `settings`.

---

### 2.19 `src/components/BookingCard.tsx` — Kartu Pesanan (414 baris)

**Fungsi:** Komponen terbesar dan terpadat di cakupan publik. Merender satu pesanan di dashboard: thumbnail, status, hitung mundur pembayaran, harga, dan **semua** aksi pasca-pemesanan — bayar, batal, unggah desain, ajukan refund, input rekening, lihat bukti. Berisi empat modal.

**Temuan Kritis — Form UX:**

- **12 `alert()`** pada `:59, 62, 65, 73, 87, 90, 96, 127, 145, 167` (+2 lagi). Semua umpan balik komponen — sukses maupun gagal — lewat dialog browser.
- **`BookingCard.tsx:102`** — `if(!confirm("Yakin mau membatalkan pesanan?")) return;`. **Aksi tak dapat dibatalkan dikonfirmasi lewat `confirm()` bawaan browser.** Dialog ini tidak menampilkan nama billboard, nominal, maupun konsekuensi; tidak dapat di-style; dan di beberapa browser dapat diblokir sehingga mengembalikan `false` diam-diam. Untuk pembatalan pesanan bernilai puluhan juta rupiah, ini tidak layak produksi.
- **`BookingCard.tsx:116`** — `confirm(\`[SIMULASI XENDIT]\\n\\nBayar tagihan sebesar Rp ${order.totalPrice.toLocaleString('id-ID')}?\`)`. **Seluruh alur pembayaran adalah `confirm()` browser bertuliskan "[SIMULASI XENDIT]".** Teks ini terlihat oleh end user di produksi.
- **`BookingCard.tsx:101-112`** — `handleCancelPending` melakukan `fetch` **tanpa pemeriksaan `res.ok` dan tanpa blok catch**. Jika server menolak, user tetap melihat alur sukses.
- **`BookingCard.tsx:135-171`** — Handler refund juga **tidak memeriksa `res.ok`** sebelum menampilkan `alert` sukses. **User diberi tahu refundnya diajukan padahal mungkin gagal.**
- Tidak satu pun tombol aksi (`:228, 229, 235, 242`) punya state `disabled` selama request berlangsung. **Tidak ada proteksi double-submit di mana pun di komponen ini** — klik ganda pada "Bayar" atau "Ajukan Refund" mengirim dua request.

**Temuan Modal — Empat modal, semuanya rusak secara a11y:**

- **`BookingCard.tsx:328-367`** (DESIGN_FORM), **`:370-381`** (REASON_FORM), **`:384-398`** (BANK_FORM), **`:401-411`** (PROOF_IMAGE). Keempatnya `fixed inset-0 z-[9999]` dan **semuanya tanpa `role="dialog"`, tanpa `aria-modal="true"`, tanpa focus trap, tanpa handler Escape, tanpa klik-backdrop untuk menutup, tanpa pengembalian fokus, tanpa `aria-labelledby`**. Latar belakang tidak dijadikan inert, sehingga pengguna keyboard dapat men-tab ke seluruh dashboard di belakang modal.
- **`BookingCard.tsx:333, 373, 387, 406`** — Tombol close ikon/`✕` **tanpa `aria-label`**.
- **`BookingCard.tsx:338, 339, 359`** — Tombol tab dan tombol submit link **tanpa `type="button"`**, berada di dekat/di dalam konteks form — risiko submit tak disengaja.
- **`BookingCard.tsx:348`** — `<input type="file" className="absolute inset-0 opacity-0 cursor-pointer" />` — **input file tak terlihat tanpa `<label>` terkait dan tanpa `aria-label`**. Pengguna screen reader menemukan kontrol unggah tanpa nama; pengguna keyboard mendapat fokus pada elemen yang tidak terlihat sama sekali (karena `opacity-0` dan tanpa gaya `focus-visible`).
- **`BookingCard.tsx:358`** — Input URL desain **tanpa label**.
- **`BookingCard.tsx:390`** — `<div className="grid grid-cols-2 gap-4">` untuk Nama Bank + Nomor Rekening, **tanpa varian responsive**. Di 320px di dalam modal ber-padding, tiap kolom ≈ 110px — nomor rekening 10-16 digit tidak muat.
- **`BookingCard.tsx:392`** — `<input name="bankAccount" type="number" />` untuk **nomor rekening**. `type="number"` **menghapus nol di depan** (rekening `0123456789` terkirim sebagai `123456789`) dan menampilkan spinner. **Bug data pada jalur pengembalian dana.**

**Temuan Responsive:**

- **`BookingCard.tsx:202`** — `className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6"` — **melompat 1 → 4 kolom tanpa langkah `sm:` atau `lg:`**. Tepat di **768px**, empat kolom berbagi ~700px dikurangi gap: **~160px per kolom**, memuat thumbnail 96px, judul, alamat, harga, dan tumpukan tombol. Sangat sempit dari 768px hingga ~1000px — rentang tablet yang umum.
- **`BookingCard.tsx:219`** — `className="border-l border-r border-gray-100 px-6"` — **garis pemisah vertikal tetap dirender saat grid runtuh menjadi satu kolom di mobile**, menghasilkan garis vertikal nyasar di tengah tumpukan konten. Butuh `md:border-l md:border-r`.
- **`BookingCard.tsx:210`** — `{order.billboard?.address?.slice(0,30)}...` — **pemotongan teks manual di JavaScript**, bukan CSS `truncate`. Akibatnya: (a) titik tiga **selalu** ditambahkan meski alamat hanya 12 karakter, (b) batas 30 karakter tidak menyesuaikan lebar kontainer, (c) di layar lebar teks terpotong padahal ruang tersedia.
- **`BookingCard.tsx:403, 408`** — `max-w-2xl max-h-[90vh]` / `max-h-[70vh]` — `vh` bukan `dvh`.

**Temuan Perf:**

- **`BookingCard.tsx:27-41`** — `setInterval` 1000ms yang menulis state setiap detik untuk hitung mundur. **Setiap kartu me-render ulang seluruh pohonnya sekali per detik**, termasuk empat definisi modal. Dengan 10 pesanan aktif di dashboard, itu 10 re-render per detik terus-menerus — baterai terkuras dan scroll tersendat di ponsel. Dependensi `[order]` juga berarti interval dibuat ulang setiap kali objek `order` berubah identitas.
- **`BookingCard.tsx:5`** — `CreditCard, Clock, Trash2, CornerUpLeft, Banknote, FileText` diimpor dan **keenamnya tidak dipakai**. Kode mati.

**Temuan A11y / Konsistensi:**

- **`BookingCard.tsx:206`** — `<img src={order.billboard?.mainImage || '/placeholder.jpg'} className="w-24 h-24 ..." />` — **tanpa `alt`**, dan fallback **`/placeholder.jpg` TIDAK ADA di `public/`** (isi `public/` hanya `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `uploads/`). Saat billboard tidak punya gambar, user melihat ikon gambar rusak.
- **`BookingCard.tsx:197`** — Link `<ExternalLink size={12}/>` ≈ **22px**, punya `title=` tapi **tanpa `aria-label`**. `title` tidak dapat diakses pengguna sentuh maupun keyboard.
- **`BookingCard.tsx:228, 229`** — Tombol Bayar/Batal `text-xs py-2` ≈ **30px** (< 44px). **`BookingCard.tsx:235`** tombol refund `text-[10px] py-2` ≈ **26px**. Aksi keuangan paling konsekuensial di aplikasi memiliki target sentuh terkecil.
- **`BookingCard.tsx:242`** — `animate-bounce` permanen pada tombol "Input Nomor Rekening". Gerakan tanpa henti, tanpa `prefers-reduced-motion`.
- **`BookingCard.tsx:192`** — `hover:border-blue-200` — **biru pada aplikasi bermerek merah**. Sama dengan `LocationVisualizer.tsx:61` dan `TrafficReportModal.tsx:14`.
- **`BookingCard.tsx:256`** — `<a target='_blank'>` **tanpa `rel="noopener noreferrer"`**.
- **`BookingCard.tsx:181-187`** — Peta warna status 7-cabang hardcode, **berbeda dari peta di `invoice/[id]/page.tsx:61-66`**.
- **`BookingCard.tsx:221, 248, 249, 254, 307, 333, 349, 351, 373, 387`** — `text-gray-400`/`text-[10px]`/`text-[9px]` bertebaran; informasi status pesanan (`:248-249`) dirender 10px berkontras 2.84:1.
- **`BookingCard.tsx:329, 371, 385, 402`** — Empat pemakaian kelas `animate-in` dari plugin yang tidak terpasang. Modal muncul tiba-tiba tanpa transisi.

---

### 2.20 `src/components/ChatWidget.tsx` — Widget Live Chat

**Fungsi:** Bubble chat mengambang di kanan bawah setiap halaman publik. Membuka panel berisi form registrasi tamu (nama/WA/email) lalu antarmuka pesan real-time via socket.io.

**Temuan Kritis — Responsive:**

- **`ChatWidget.tsx:117`** — `className="fixed bottom-6 right-6 z-[9999] w-[350px] ... h-[500px] ..."`. **Lebar mati 350px + `right-6` (24px) = 374px** — di viewport **320px** panel **meluber 54px keluar layar** dan sisi kirinya terpotong; di **375px** hanya menyisakan 1px margin. Tinggi `500px + bottom-6` = **524px**, sementara iPhone SE hanya 568px tinggi: panel menutupi **92% layar** tanpa pernah dirancang sebagai fullscreen. Tidak ada satu pun varian responsive di komponen ini. Butuh `w-[calc(100vw-2rem)] sm:w-[350px]` dan `h-[70dvh] sm:h-[500px]`.
- **`ChatWidget.tsx:111`** — Launcher `fixed bottom-6 right-6 z-[9999]` **bertumpuk tepat di atas area CTA halaman detail billboard** di mobile (di mana kartu harga jatuh ke bawah, lihat 2.8). Tombol "Lanjutkan ke Pembayaran" dan bubble chat memperebutkan sudut kanan bawah yang sama. Tidak ada offset mobile.

**Temuan Touch / A11y:**

- **`ChatWidget.tsx:112`** — `<span className="font-bold pr-2 hidden group-hover:inline">Live Chat</span>` — **label tombol hanya muncul saat hover**. Di perangkat sentuh hover tidak ada, sehingga launcher permanen berupa ikon tanpa teks. Ditambah **tidak ada `aria-label`**, maka satu-satunya nama yang dapat diakses adalah teks yang disembunyikan `display:none` — yang **tidak dibacakan screen reader**. Tombol ini efektifnya tanpa nama.
- **`ChatWidget.tsx:123`** — Tombol close `p-1` + ikon 20px ≈ **28px** (< 44px), **tanpa `aria-label`**.
- **`ChatWidget.tsx:159`** — Tombol kirim `p-2.5` + `<Send size={16}/>` ≈ **36px** (< 44px), ikon saja, **tanpa `aria-label`**.
- **`ChatWidget.tsx:130-132`** — Tiga input registrasi (nama, WhatsApp, email) hanya ber-`placeholder`, **tanpa `<label>`, tanpa `id`, tanpa `aria-label`**. Placeholder hilang begitu user mengetik sehingga konteks field lenyap; screen reader mengumumkan "edit text" tanpa nama.
- **`ChatWidget.tsx:158`** — Input pesan juga **tanpa label**.
- **`ChatWidget.tsx:133`** — Tombol submit form registrasi **tanpa `type`** (default `submit`, kebetulan benar di sini, tapi tidak eksplisit).
- **`ChatWidget.tsx:138`** — `flex-1 overflow-y-auto` — **area scroll bersarang** di dalam halaman yang juga bisa di-scroll. Di mobile, gestur scroll di atas panel terperangkap di daftar pesan; ketika sudah di ujung, scroll chaining berpindah ke halaman di belakang secara tak terduga. Tidak ada `overscroll-behavior: contain`.
- **Panel chat tidak punya `role="dialog"` maupun manajemen fokus.** Saat dibuka, fokus tidak berpindah ke panel; saat ditutup, fokus tidak dikembalikan ke launcher.

**Temuan State:**

- **`ChatWidget.tsx:154`** — `{loading && ... "Mengetik..."}`. Variabel `loading` **hanya di-set oleh `handleRegister`**, tidak pernah oleh `handleSend`. Indikator "Mengetik" karena itu **muncul saat registrasi dan tidak pernah muncul saat menunggu balasan** — persis kebalikan dari maksudnya. Menyesatkan.
- **`ChatWidget.tsx:19-44`** — Tidak ada penanganan `connect_error` maupun indikator status koneksi. Jika backend socket mati, user mengetik ke ruang kosong tanpa umpan balik apa pun.
- **`ChatWidget.tsx:20`** — `io("http://localhost:4001")` **hardcode**. **`ChatWidget.tsx:57`** — `fetch('http://localhost:4001/api/chat/start')` **hardcode**. Widget ini dirender di setiap halaman publik (`src/app/page.tsx:59`), jadi **di produksi setiap pengunjung memicu koneksi gagal ke localhost**.
- **`ChatWidget.tsx:88-106`** — `renderMessageText` mem-parse link markdown dengan regex lalu menyuntikkannya sebagai `<a>`. Konten berasal dari server/agen; parsing manual tanpa sanitasi adalah permukaan risiko yang perlu ditinjau audit keamanan.
- **`ChatWidget.tsx:111, 117`** — `animate-in slide-in-from-bottom-4` / `slide-in-from-bottom-10 fade-in` — plugin tidak terpasang, animasi mati.

---

### 2.21 `src/components/ImageUpload.tsx` — Unggah Gambar

**Catatan cakupan:** Komponen ini **tidak direferensikan oleh satu pun halaman publik** yang diaudit; ia dipakai di sisi admin. Diperiksa karena masuk daftar cakupan; temuannya dicatat singkat.

- **`ImageUpload.tsx:21, 53`** — Pola guard `mounted`: `if (!mounted) return null;`. **Komponen merender kosong pada paint pertama**, lalu muncul setelah hidrasi — menyebabkan **layout shift (CLS)** dan area kosong tanpa skeleton.
- **`ImageUpload.tsx:34, 47, 49`** — Tiga `alert()`, termasuk validasi ukuran file `alert("File max 5MB")` — pesan Inggris di UI Indonesia, dan validasi yang seharusnya inline.
- **`ImageUpload.tsx:127`** — Tombol hapus `opacity-0 group-hover:opacity-100`. **Hanya muncul saat hover**, sehingga di perangkat sentuh tombol hapus **tidak terlihat dan praktis tak terjangkau**.
- **`ImageUpload.tsx:128`** — `aria-label="Remove image"` — **satu-satunya `aria-label` di seluruh cakupan publik** (total 1 atribut `aria-*` di semua file yang diaudit). Pola positif, tapi labelnya berbahasa Inggris.
- **`ImageUpload.tsx:82`** — `<input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" />` **tanpa label** — pola yang sama dengan `BookingCard.tsx:348`.
- **`ImageUpload.tsx:60-75`** — Tombol pemilih mode memakai `type="button"` — **benar**. Pola positif.
- **`ImageUpload.tsx:132`** — `<img src={value} alt="Preview" />` — punya `alt`. Positif.

---

## 3. Tabel Temuan Konsolidasi

Severity: **C** = Critical (memblokir/merusak alur inti atau data), **H** = High, **M** = Medium, **L** = Low.
Kategori: **Responsive**, **A11y**, **State**, **Perf**, **Consistency**, **Form**.

### 3.1 Critical

| ID | Sev | Kategori | Judul | File:line | Fix |
|---|---|---|---|---|---|
| S-01 | C | State | Nol `loading.tsx` / `error.tsx` / `not-found.tsx` di seluruh aplikasi | (tidak ada file di `src/app/**`) | Tambah `loading.tsx` + `error.tsx` per segmen rute; `not-found.tsx` di root |
| F-01 | C | Form | Field Nama/WhatsApp/Email checkout adalah field mati — data user dibuang diam-diam | `CheckoutForm.tsx:141-154` | Jadikan controlled state, masukkan ke payload `:59-67` |
| F-02 | C | Form | Field NPWP tidak pernah dikirim meski checkbox faktur aktif | `CheckoutForm.tsx:163-168` | Tambah state + sertakan di payload |
| A-01 | C | A11y | Pemilih durasi adalah `<div onClick>` — user keyboard/screen reader tidak dapat memilih durasi sama sekali | `CheckoutForm.tsx:110-122` | Ganti ke `<button type="button" aria-pressed>` atau radio group |
| A-02 | C | A11y | Pemilih materi desain `<div onClick>` — sama, tak dapat dioperasikan keyboard | `CheckoutForm.tsx:179, 184` | Sama seperti A-01 |
| S-02 | C | State | 4× `JSON.parse()` tanpa try/catch — satu kolom DB rusak = halaman produk crash total | `BillboardDetailClient.tsx:37-40` | Bungkus helper `safeParse(json, fallback)` |
| S-03 | C | State | `fetch` detail billboard hardcode `http://localhost:4001` — halaman detail mati di produksi | `billboard/[slug]/page.tsx:14` | Pakai `process.env.NEXT_PUBLIC_API_URL` |
| S-04 | C | State | ChatWidget hardcode `localhost:4001` (socket + REST) di komponen yang dirender di SEMUA halaman publik | `ChatWidget.tsx:20, 57` | Pakai env var |
| F-03 | C | Form | Seluruh alur bayar adalah `confirm()` browser bertuliskan "[SIMULASI XENDIT]" — terlihat end user | `BookingCard.tsx:116` | Modal konfirmasi pembayaran sesungguhnya |
| F-04 | C | Form | Pembatalan pesanan (tak dapat dibatalkan) dikonfirmasi lewat `confirm()` bawaan | `BookingCard.tsx:102` | Modal konfirmasi dengan konteks pesanan |
| F-05 | C | Form | Handler refund & cancel tidak memeriksa `res.ok` — alert sukses tampil meski request gagal | `BookingCard.tsx:101-112, 135-171` | Cek `res.ok`, tampilkan error inline |
| R-01 | C | Responsive | Search bar desktop `w-[800px]` terpotong `overflow-hidden` induk — tombol cari tak dapat diklik di 768-831px | `SearchFilter.tsx:103` + `page.tsx:48,54,55` | `w-full max-w-[800px]` |
| R-02 | C | Responsive | Panel chat `w-[350px]` meluber 54px keluar layar di 320px; `h-[500px]` menutupi 92% layar SE | `ChatWidget.tsx:117` | `w-[calc(100vw-2rem)] sm:w-[350px]`, `h-[70dvh] sm:h-[500px]` |
| R-03 | C | Responsive | Timeline 6 langkah butuh 576px minimum tanpa scroll wrapper — label tumpang tindih di 320/375px | `dashboard/order/[id]/page.tsx:101-127` | `overflow-x-auto` atau timeline vertikal di mobile |
| R-04 | C | Responsive | Invoice `max-w-[21cm]` + `p-12` menyisakan 224px isi di 320px; tabel tanpa scroll wrapper | `invoice/[id]/page.tsx:36, 72-95` | `p-4 md:p-12` + bungkus tabel `overflow-x-auto` |
| N-01 | C | State | Detail pesanan tidak memeriksa kepemilikan — user mana pun dapat membuka pesanan orang lain | `dashboard/order/[id]/page.tsx:23` | Tambah `order.userId !== session.user.id` seperti `invoice/[id]/page.tsx:30` |
| C-01 | C | Consistency | `tailwindcss-animate` TIDAK terpasang — 10 lokasi memakai `animate-in`/`fade-in`/`zoom-in`/`slide-in-*` yang mati | `BookingCard.tsx:329,371,385,402`; `ChatWidget.tsx:111,117`; `SearchFilter.tsx:60,61`; `TrafficReportModal.tsx:22`; `dashboard/order/[id]/page.tsx:137` | `npm i tailwindcss-animate` + daftarkan di `tailwind.config.ts:21` |
| L-01 | C | Consistency | 4 link 404 di navigasi utama (`/list`, `/about` × desktop+mobile) | `Navbar.tsx:55,56,155,156` | Buat rutenya atau hapus linknya |

### 3.2 High

| ID | Sev | Kategori | Judul | File:line | Fix |
|---|---|---|---|---|---|
| F-06 | H | Form | 17 `alert()` di kode publik | `BookingCard.tsx` ×12, `AccountSettingsForm.tsx:62,65,74,89,92`, `CheckoutForm.tsx:47,53,80,83,88`, `register/page.tsx:35`, `ImageUpload.tsx:34,47,49` | Sistem toast + pesan error inline |
| F-07 | H | Form | `type="number"` untuk nomor telepon/NPWP/rekening — nol di depan terhapus (bug data) | `register/page.tsx:72`, `CheckoutForm.tsx:148,166`, `BookingCard.tsx:392` | `type="tel"` + `inputMode="numeric"` |
| F-08 | H | Form | Pembacaan DOM langsung menggantikan state React untuk tanggal mulai | `CheckoutForm.tsx:51, 126-131` | Input controlled dengan `useState` |
| F-09 | H | Form | Tidak ada proteksi double-submit di seluruh aksi `BookingCard` | `BookingCard.tsx:228,229,235,242` | `disabled` selama request |
| A-03 | H | A11y | 4 modal tanpa `role="dialog"`/`aria-modal`/focus trap/Escape/backdrop-close | `BookingCard.tsx:328,370,384,401` | Pakai `@headlessui/react` `<Dialog>` (sudah terpasang) |
| A-04 | H | A11y | Modal trafik tanpa `role="dialog"`/focus trap/Escape | `TrafficReportModal.tsx:21-58` | Sama seperti A-03 |
| A-05 | H | A11y | `<button disabled>` bersarang di dalam `<Link>` — HTML invalid; keyboard dapat menembus guard tanggal | `BillboardDetailClient.tsx:176-187` | Render `<button>` saja; navigasi via `router.push` |
| A-06 | H | A11y | Launcher chat hanya berlabel saat hover + tanpa `aria-label` — tombol tanpa nama di perangkat sentuh | `ChatWidget.tsx:111-112` | `aria-label="Buka live chat"` + label `sr-only` |
| A-07 | H | A11y | Tombol hapus gambar hanya tampil saat hover — tak terjangkau di sentuh | `ImageUpload.tsx:127` | Selalu tampil di `md:` ke bawah |
| A-08 | H | A11y | Hanya **1** atribut `aria-*` dan **0** `role=` di seluruh cakupan publik | `ImageUpload.tsx:128` (satu-satunya) | Audit per-komponen; mulai dari modal dan tab |
| A-09 | H | A11y | Hanya **2** pasangan `htmlFor`/`id` yang benar dari ~20 field form | `AccountSettingsForm.tsx:13`, `CheckoutForm.tsx:158` | Adopsi pola `InputField` ke semua form |
| A-10 | H | A11y | 13 tombol ikon tanpa `aria-label` | `SearchFilter.tsx:147`; `Navbar.tsx:106`; `ChatWidget.tsx:123,159`; `AvailabilityCalendar.tsx:94,98`; `TrafficReportModal.tsx:33`; `BookingCard.tsx:197,333,373,387,406`; `SearchFilter.tsx:64` | Tambah `aria-label` deskriptif |
| A-11 | H | A11y | 0 gaya `focus-visible`; `outline-none` dipakai 15+ kali | `globals.css` (kosong); `SearchFilter.tsx:45,72,87,115,127,141`; `login:99,103`; `CheckoutForm.tsx:130,144,148,153,166`; `AccountSettingsForm.tsx:20`; `Navbar.tsx:108` | Ring `focus-visible` global di `globals.css` |
| A-12 | H | A11y | `<img>` tanpa `alt` — 6 lokasi | `HeroMap.tsx:48`, `BillboardDetailClient.tsx:82`, `CheckoutForm.tsx:227`, `BookingCard.tsx:206`, `LocationVisualizer.tsx:100`, `dashboard/order/[id]/page.tsx:139` | Tambah `alt` bermakna atau `alt=""` untuk dekoratif |
| A-13 | H | A11y | Tab tanpa semantik tab (`role`/`aria-selected`) — 3 lokasi | `DashboardClientPage.tsx:96-116`, `LocationVisualizer.tsx:53-64`, `BookingCard.tsx:338-339` | Pola tablist ARIA atau `@headlessui/react` `<Tab>` |
| A-14 | H | A11y | Hierarki heading rusak (h1→h3) di 3 halaman | `BillboardDetailClient.tsx:63→79`, `checkout/page.tsx:42→CheckoutForm.tsx:105`, `DashboardClientPage.tsx:56` | Sisipkan h2; jadikan h1 judul halaman sebenarnya |
| A-15 | H | A11y | `h1` dashboard adalah nama user; area pesanan tanpa heading | `DashboardClientPage.tsx:56, 84-131` | `<h1>Pesanan Saya</h1>`, nama user jadi `<p>` |
| A-16 | H | A11y | Kontras gagal WCAG AA — `text-gray-400` (2.84:1) / `text-gray-300` (1.47:1) di 14 file | `dashboard/order/[id]/page.tsx:114,118`; `AvailabilityCalendar.tsx:131`; `login/page.tsx:117`; +11 file lain | Minimum `text-gray-600` (#4b5563, 7.5:1) |
| A-17 | H | A11y | Input file tak terlihat tanpa label/`aria-label` | `BookingCard.tsx:348`, `ImageUpload.tsx:82` | `<label>` terkait + gaya `focus-visible` |
| A-18 | H | A11y | Tidak ada skip link; `<body>` tanpa landmark/`<main>` di beberapa halaman | `layout.tsx:1-16` | Tambah skip link + `<main id="main">` |
| R-05 | H | Responsive | Tabel spesifikasi dibungkus `overflow-hidden` — isi terpotong permanen di mobile | `BillboardDetailClient.tsx:97-110` | `overflow-x-auto` |
| R-06 | H | Responsive | `grid-cols-2` tanpa varian responsive — 3 lokasi | `invoice/[id]/page.tsx:52`, `dashboard/order/[id]/page.tsx:161`, `BookingCard.tsx:390` | `grid-cols-1 md:grid-cols-2` |
| R-07 | H | Responsive | `grid-cols-1 md:grid-cols-4` melompat tanpa langkah — 4 kolom dalam ~160px di 768px | `BookingCard.tsx:202` | Tambah `sm:grid-cols-2 lg:grid-cols-4` |
| R-08 | H | Responsive | `w-1/2` blok total invoice = 112px di 320px | `invoice/[id]/page.tsx:99` | `w-full md:w-1/2` |
| R-09 | H | Responsive | 5 pemakaian `100vh` tanpa `dvh` — konten terpotong di balik chrome browser mobile | `page.tsx:48`, `HeroMap.tsx:23`, `MapWrapper.tsx:8`, `login/page.tsx:63`, `register/page.tsx:48` | `h-dvh` / `min-h-dvh` |
| R-10 | H | Responsive | Kartu CTA sticky jatuh ke dasar halaman di bawah `lg` — CTA utama tersembunyi di mobile | `BillboardDetailClient.tsx:156`, `CheckoutForm.tsx:223` | Sticky bottom bar untuk mobile |
| R-11 | H | Responsive | Galeri `grid-cols-2` menghasilkan thumbnail 112×63px di 320px | `BillboardDetailClient.tsx:80` | `grid-cols-1 sm:grid-cols-2 md:grid-cols-3` |
| R-12 | H | Responsive | Peta tinggi mati 400px di semua breakpoint | `LocationVisualizer.tsx:49` | `h-[250px] md:h-[400px]` |
| R-13 | H | Responsive | Menu mobile tanpa `max-h`/`overflow-y-auto` — CTA tak terjangkau saat isi meluber | `Navbar.tsx:119` | `max-h-[calc(100dvh-4rem)] overflow-y-auto` |
| T-01 | H | Touch | 20+ target sentuh < 44×44px, termasuk seluruh aksi keuangan | `BookingCard.tsx:228,229,235` (26-30px); `AvailabilityCalendar.tsx:94,98,101,102` (26-28px); `ChatWidget.tsx:123,159` (28/36px); `LocationVisualizer.tsx:53-64` (30px); `Navbar.tsx:106` (40px); `dashboard/order/[id]/page.tsx:173-178` (34px) | Minimum `min-h-[44px] min-w-[44px]` |
| P-01 | H | Perf | 10 `<img>` mentah; **0** pemakaian `next/image` meski `remotePatterns` sudah dikonfigurasi | `HeroMap.tsx:48`; `BillboardDetailClient.tsx:49,82`; `CheckoutForm.tsx:227`; `BookingCard.tsx:206,408`; `LocationVisualizer.tsx:100`; `dashboard/order/[id]/page.tsx:139,154`; `ImageUpload.tsx:132` | Migrasi ke `next/image` + `sizes`; `priority` untuk hero |
| P-02 | H | Perf | `setInterval` 1000ms me-render ulang tiap kartu pesanan per detik | `BookingCard.tsx:27-41` | Hitung mundur via `useRef`+`requestAnimationFrame`, atau render hanya saat relevan |
| P-03 | H | Perf | Mode tahun merender 12 kalender (~450 tombol) + ~22.500 iterasi `tileDisabled` | `AvailabilityCalendar.tsx:65-85, 20-30` | Pra-hitung `Set` tanggal terpesan; render kalender secara lazy |
| P-04 | H | Perf | Seluruh halaman detail adalah client component | `BillboardDetailClient.tsx:2` | Pecah jadi server component + 3 pulau client |
| S-05 | H | State | Loading screen modal trafik berada di `-z-10` (di belakang iframe) — tidak pernah terlihat; tidak ada state error | `TrafficReportModal.tsx:48-54` | Naikkan z-index; tambah `onError` iframe |
| S-06 | H | State | Indikator "Mengetik..." dikendalikan variabel yang salah — muncul saat registrasi, bukan saat menunggu balasan | `ChatWidget.tsx:154` | State `sending` terpisah di `handleSend` |
| S-07 | H | State | Empty state dashboard hanya satu baris abu-abu tanpa CTA | `DashboardClientPage.tsx:119-122` | Ilustrasi + teks + tombol "Jelajahi Billboard" |
| S-08 | H | State | Soft 404: halaman "tidak ditemukan" mengembalikan HTTP 200 — 3 lokasi | `billboard/[slug]/page.tsx:58-65`, `invoice/[id]/page.tsx:27`, `dashboard/order/[id]/page.tsx:23` | `notFound()` + `not-found.tsx` |
| S-09 | H | State | "Access Denied" berupa div telanjang tanpa layout maupun link login | `invoice/[id]/page.tsx:19` | `redirect('/login?callbackUrl=...')` |
| S-10 | H | State | Kegagalan backend disamarkan sebagai "tidak ditemukan"; error di-swallow jadi `[]` | `page.tsx:7-20`, `billboard/[slug]/page.tsx:18-25` | Bedakan 404 dari 5xx; tampilkan state error |
| S-11 | H | State | `googleMapsApiKey` selalu `null` dari fungsi dummy — Street View kode mati permanen | `billboard/[slug]/page.tsx:29-38` → `LocationVisualizer.tsx:88-96` | Ambil dari settings sungguhan atau hapus tabnya |
| C-02 | H | Consistency | 3 CTA mati (tanpa `onClick`/`href`) | `Navbar.tsx:99, 160`, `BillboardDetailClient.tsx:188` | Hubungkan atau hapus |
| C-03 | H | Consistency | `/placeholder.jpg` tidak ada di `public/` — gambar rusak saat fallback | `BookingCard.tsx:206` | Tambahkan asetnya |
| C-04 | H | Consistency | 4 format mata uang berbeda; tidak ada `Intl.NumberFormat` currency | lihat Bagian 6.1 | Util `formatIDR()` bersama |
| C-05 | H | Consistency | 5 format tanggal berbeda, termasuk `toLocaleDateString()` tanpa locale di invoice | `invoice/[id]/page.tsx:67` + lihat Bagian 6.2 | Util `formatDate()` bersama (`date-fns` sudah terpasang) |
| C-06 | H | Consistency | Nominal DP float tanpa pembulatan masuk ke UI **dan** database | `CheckoutForm.tsx:42, 64, 265` | `Math.round()` sebelum tampil dan kirim |

### 3.3 Medium

| ID | Sev | Kategori | Judul | File:line | Fix |
|---|---|---|---|---|---|
| C-07 | M | Consistency | 14 gaya tombol primer berbeda untuk aksi setara | lihat Bagian 4.3 | Komponen `<Button variant>` |
| C-08 | M | Consistency | `tailwind.config.ts` hanya mendefinisikan 1 token (`utero`); sisanya utility ad-hoc | `tailwind.config.ts:13-19, 21` | Perluas theme: spacing, radius, shadow, fontSize |
| C-09 | M | Consistency | `content` glob menunjuk `./src/pages/**` yang tidak ada | `tailwind.config.ts:6` | Hapus baris |
| C-10 | M | Consistency | Warna biru off-brand pada app bermerek merah — 3 lokasi | `BookingCard.tsx:192`, `LocationVisualizer.tsx:61`, `TrafficReportModal.tsx:14` | Pakai token `utero` |
| C-11 | M | Consistency | Indigo sisa boilerplate pada ring fokus | `AccountSettingsForm.tsx:20` | `focus:ring-utero` |
| C-12 | M | Consistency | `bg-red-600` dipakai alih-alih token `bg-utero` | `AccountSettingsForm.tsx:111`, `BookingCard.tsx:228` | Pakai `bg-utero` |
| C-13 | M | Consistency | Peta warna status duplikat dengan aturan berbeda | `BookingCard.tsx:181-187` vs `invoice/[id]/page.tsx:61-66` | Util `statusStyle()` bersama |
| C-14 | M | Consistency | Login vs Register (halaman kembar) beda radius, bayangan, padding tombol, bobot font, perataan | `login:64,106` vs `register:49,79,82` | Samakan; ekstrak `<AuthCard>` |
| C-15 | M | Consistency | `font-sans` diterapkan tidak konsisten; `<body>` tanpa className — beberapa halaman merender serif | `layout.tsx:11`; `login:60`, `register:45` (tanpa) vs `checkout:38`, `DashboardLayout:7` (dengan) | Set font di `<body>` sekali |
| P-05 | M | Perf | Tidak ada `next/font`; font default browser, tidak ada preload | `layout.tsx` | `next/font/google` |
| P-06 | M | Perf | Tidak ada `metadata`/`generateMetadata` di satu pun halaman — tak ada title/OG/deskripsi | seluruh `src/app/**` | Tambah `metadata` per halaman |
| P-07 | M | Perf | `import Image from 'next/image'` tak terpakai | `invoice/[id]/page.tsx:5` | Hapus atau gunakan |
| P-08 | M | Perf | `dynamic()` 4× terpisah tanpa `loading` — area peta kosong tanpa indikator | `LocationVisualizer.tsx:11-26` | Satu wrapper `dynamic` dengan fallback |
| P-09 | M | Perf | Ikon marker Leaflet diambil dari CDN unpkg (2 lokasi) | `HeroMap.tsx:9-15`, `LocationVisualizer.tsx:33-46` | Host aset lokal |
| P-10 | M | Perf | `include: { billboard: true }` mengirim kolom JSON besar yang tidak dipakai lintas boundary | `DashboardWrapper.tsx:29-33` | Ganti dengan `select` |
| P-11 | M | Perf | `reactStrictMode: false` menyembunyikan hydration mismatch daripada memperbaikinya | `next.config.ts:7` | Aktifkan kembali; perbaiki `new Date()` di render |
| P-12 | M | Perf | `ignoreBuildErrors` + `ignoreDuringBuilds` mematikan TS dan ESLint di build | `next.config.ts:16,19` | Aktifkan kembali |
| P-13 | M | Perf | Guard `mounted` merender `null` pada paint pertama (CLS) | `ImageUpload.tsx:21,53` | Skeleton dengan dimensi tetap |
| S-12 | M | State | Tidak ada state loading saat submit pencarian; navigasi bertumpuk | `SearchFilter.tsx:20-28` | `useTransition` + `isPending` |
| S-13 | M | State | Input pencarian tidak sinkron dengan URL saat navigasi Back | `SearchFilter.tsx:12-13` | Sinkronkan lewat `useEffect` pada `searchParams` |
| S-14 | M | State | Tiap klik tanggal memicu round-trip server penuh tanpa indikator | `BillboardDetailClient.tsx:27-34` | State lokal; push URL setelah konfirmasi |
| S-15 | M | State | `redirect('/')` tanpa penjelasan saat parameter checkout hilang/invalid | `checkout/page.tsx:22-25, 33-35` | Halaman error dengan konteks |
| S-16 | M | State | Tidak ada penanganan `connect_error` socket maupun indikator status koneksi | `ChatWidget.tsx:19-44` | Tampilkan badge status koneksi |
| S-17 | M | State | Tidak ada state error untuk iframe/tile peta | `LocationVisualizer.tsx:88-96` | Fallback `onError` |
| S-18 | M | State | `new URL(url)` tanpa try/catch — URL malformed meng-crash komponen | `TrafficReportModal.tsx:52` | Bungkus try/catch |
| S-19 | M | State | Hanya **1** skeleton loading di seluruh cakupan publik | `Navbar.tsx:61-62` (satu-satunya) | Skeleton untuk daftar billboard, kartu pesanan, peta |
| S-20 | M | State | `totalSpent` memasukkan status `REFUNDED` ke "Total Belanja" | `DashboardWrapper.tsx:35-40` | Kecualikan refund atau ganti label |
| A-19 | M | A11y | Radio metode bayar tanpa atribut `name`, tanpa `fieldset`/`legend` | `CheckoutForm.tsx:206, 211` | Tambah `name="paymentType"` + `<fieldset>` |
| A-20 | M | A11y | Dropdown/menu tanpa klik-luar, tanpa Escape, tanpa manajemen fokus | `Navbar.tsx:75-93, 118-166` | `@headlessui/react` `<Menu>` |
| A-21 | M | A11y | Menu mobile tidak menutup setelah navigasi | `Navbar.tsx:118-166` | `setIsOpen(false)` pada klik link |
| A-22 | M | A11y | `cursor-pointer` tanpa `onClick` — afordansi palsu, 2 lokasi | `BillboardDetailClient.tsx:82`, `dashboard/order/[id]/page.tsx:139` | Implementasikan lightbox atau hapus `cursor-pointer` |
| A-23 | M | A11y | `<iframe>` tanpa `title` | `LocationVisualizer.tsx:89` | Tambah `title` |
| A-24 | M | A11y | `target="_blank"` tanpa `rel="noopener noreferrer"` — 4 lokasi | `LocationVisualizer.tsx:110`, `TrafficReportModal.tsx:30`, `BookingCard.tsx:256`, `dashboard/order/[id]/page.tsx:144` | Tambah `rel` |
| A-25 | M | A11y | Spinner submit tanpa `aria-live`/`aria-busy`/teks `sr-only` | `AccountSettingsForm.tsx:112,127`; `login/page.tsx:106` | Live region status |
| A-26 | M | A11y | `<div>` (TrafficReportModal) dirender langsung di dalam `<ul>` — HTML invalid | `BillboardDetailClient.tsx:124-128` | Pindahkan keluar list |
| A-27 | M | A11y | Emoji dekoratif tanpa `aria-hidden` mengotori pengumuman screen reader | `Navbar.tsx:154-156`, `BillboardDetailClient.tsx:79,90,96` | `aria-hidden="true"` |
| A-28 | M | A11y | Legenda kalender berupa div kosong — tanggal disabled tak terjelaskan (lewat vs terpesan) | `AvailabilityCalendar.tsx:107-110, 20-30` | Implementasikan legenda; bedakan kedua kondisi |
| A-29 | M | A11y | Pemilihan tanggal tidak diumumkan; tanpa live region | `AvailabilityCalendar.tsx:54-59` | `aria-live="polite"` pada ringkasan tanggal |
| A-30 | M | A11y | `animate-pulse` terus-menerus pada kotak error; `animate-bounce` permanen pada tombol | `login/page.tsx:76`, `BookingCard.tsx:242` | Hapus atau hormati `prefers-reduced-motion` |
| A-31 | M | A11y | Input tanpa `autoComplete` — password manager tidak berfungsi | `login:99,103`; `register:63-76`; `AccountSettingsForm.tsx:122-124` | Tambah `autoComplete` yang sesuai |
| A-32 | M | A11y | Input login tanpa `required` | `login/page.tsx:99, 103` | Tambah `required` |
| A-33 | M | A11y | Area scroll bersarang tanpa `overscroll-behavior` | `ChatWidget.tsx:138` | `overscroll-contain` |
| R-14 | M | Responsive | Switcher tab menutupi ~59% lebar peta di 320px | `LocationVisualizer.tsx:52` | Pindahkan ke bawah peta di mobile |
| R-15 | M | Responsive | Header/baris flex tanpa `flex-wrap` — 3 lokasi | `invoice/[id]/page.tsx:39`, `dashboard/order/[id]/page.tsx:86`, `AvailabilityCalendar.tsx:90` | Tambah `flex-wrap` |
| R-16 | M | Responsive | Garis pemisah vertikal tetap tampil pada layout satu kolom mobile | `BookingCard.tsx:219` | `md:border-l md:border-r` |
| R-17 | M | Responsive | Pemotongan teks manual di JS alih-alih CSS `truncate` | `BookingCard.tsx:210` | `truncate` / `line-clamp-2` |
| R-18 | M | Responsive | Label bulan lebar mati `w-32` — terpotong saat zoom teks 200% | `AvailabilityCalendar.tsx:95` | `min-w-32` |
| R-19 | M | Responsive | Judul hero tanpa `line-clamp` — 4 baris menutupi hero 284px di 320px | `BillboardDetailClient.tsx:63` | `line-clamp-2` |
| R-20 | M | Responsive | Chat widget menutupi area CTA di kanan bawah pada mobile | `ChatWidget.tsx:111` vs `BillboardDetailClient.tsx:176-190` | Offset launcher di mobile |
| R-21 | M | Responsive | Kartu profil mendorong daftar pesanan ~280px ke bawah di mobile | `DashboardClientPage.tsx:50` | Urutkan ulang dengan `order-*` |
| R-22 | M | Responsive | Petunjuk cetak khusus desktop ("Tekan Ctrl + P") ditampilkan ke pengguna ponsel; tak ada tombol cetak | `invoice/[id]/page.tsx:122-124` | Tombol `window.print()` |
| F-10 | M | Form | Validasi mismatch password hanya lewat `alert`, tanpa `aria-invalid` | `AccountSettingsForm.tsx:73-76` | Error inline + `aria-describedby` |
| F-11 | M | Form | Tidak ada validasi kekuatan password, konfirmasi, maupun toggle lihat-password saat registrasi | `register/page.tsx:76` | Tambahkan |
| F-12 | M | Form | Tombol register tanpa gaya `disabled:` — tampak aktif saat submit | `register/page.tsx:79` | `disabled:bg-gray-400` |
| F-13 | M | Form | Checkout tanpa elemen `<form>` — tidak ada submit via Enter, tanpa validasi native | `CheckoutForm.tsx:94-274` | Bungkus dalam `<form onSubmit>` |
| F-14 | M | Form | Hack `onFocus`/`onBlur` mengubah `type` input tanggal tanpa binding `value` | `SearchFilter.tsx:141` | Input controlled `type="date"` |
| F-15 | M | Form | Tombol tanpa `type="button"` di dalam/dekat form — 20+ lokasi | `BookingCard.tsx:338,339,359,...`; `ChatWidget.tsx:111,123,159`; `CheckoutForm.tsx:99`; `login/page.tsx:82` | Tambah `type="button"` eksplisit |
| N-02 | M | State | `SUPER_ADMIN` tidak disertakan pada cek akses invoice, padahal dikenali di tempat lain | `invoice/[id]/page.tsx:30-32` vs `CheckoutForm.tsx:46` | Konstanta `adminRoles` bersama |
| N-03 | M | Perf | Sandbox iframe `allow-scripts` + `allow-same-origin` pada konten pihak ketiga meniadakan proteksi sandbox | `TrafficReportModal.tsx:41-46` | Hapus `allow-same-origin` atau isolasi origin |

### 3.4 Low

| ID | Sev | Kategori | Judul | File:line | Fix |
|---|---|---|---|---|---|
| C-16 | L | Consistency | Import tak terpakai — 10+ simbol | `BookingCard.tsx:5` (6 ikon), `CheckoutForm.tsx:4,6`, `login/page.tsx:10`, `DashboardClientPage.tsx:5`, `invoice/[id]/page.tsx:5` | Hapus |
| C-17 | L | Consistency | `'use client'` tidak perlu pada komponen tanpa interaktivitas | `DashboardLayout.tsx:1` | Hapus direktif |
| C-18 | L | Consistency | Nilai z-index arbitrer saling berebut (`9999` ×4, `500`, `50`, `10`) | `Navbar.tsx:40`, `ChatWidget.tsx:111,117`, `SearchFilter.tsx:60`, `TrafficReportModal.tsx:22`, `BookingCard.tsx:328`, `LocationVisualizer.tsx:52` | Skala z-index bernama di theme |
| C-19 | L | Consistency | Bayangan arbitrer sekali-pakai di luar skala | `dashboard/order/[id]/page.tsx:106` | Pakai token `shadow-*` |
| C-20 | L | Consistency | `border` tanpa warna eksplisit, beda dari kartu lain | `AccountSettingsForm.tsx:101,119` | `border border-gray-100` |
| C-21 | L | Consistency | Pembulatan harga "Jt" menyembunyikan presisi (`Rp 0,4 Jt`) | `HeroMap.tsx:67`, `BillboardDetailClient.tsx:41`, `DashboardClientPage.tsx:72` | Ambang tampilan + format konsisten |
| C-22 | L | Consistency | Teks Inggris di UI Indonesia (`year`/`month`, `Remove image`, `File max 5MB`, `Access Denied`) | `AvailabilityCalendar.tsx:101,102`; `ImageUpload.tsx:128,34`; `invoice/[id]/page.tsx:19` | Terjemahkan |
| C-23 | L | Consistency | Teks debug bocor ke produksi ("[SIMULASI XENDIT]", "⛔ DETECTED:") | `BookingCard.tsx:116`, `login/page.tsx:43` | Copy yang layak produksi |
| C-24 | L | Consistency | `text-[10px]` ×42 dan `text-[9px]` ×5 di luar skala tipografi | seluruh cakupan | Minimum `text-xs` (12px) |
| C-25 | L | Consistency | `clsx` + `tailwind-merge` terpasang tapi tidak dipakai; `date-fns` terpasang tapi tidak diimpor di kode publik | `package.json` | Pakai untuk util `cn()` dan format tanggal |
| C-26 | L | Consistency | `remotePatterns` dikonfigurasi tanpa host Cloudinary meski `next-cloudinary` terpasang | `next.config.ts:9-13` | Selaraskan dengan sumber gambar nyata |
| C-27 | L | Consistency | Nol dukungan dark mode (0 pemakaian `dark:`) | seluruh cakupan | Keputusan sadar: dukung penuh atau nyatakan tidak didukung |
| C-28 | L | Consistency | `globals.css` hanya 12 baris; tidak ada reset, `scroll-behavior`, maupun override react-calendar | `globals.css:1-12` | Tambah dasar-dasar global |
| C-29 | L | Consistency | `frameBorder` atribut HTML4 usang | `LocationVisualizer.tsx:89` | Gunakan CSS |
| C-30 | L | Consistency | Parsing link markdown manual dengan regex pada konten chat | `ChatWidget.tsx:88-106` | Renderer markdown yang tersanitasi |

---

## 4. Kesenjangan Design System

### 4.1 Apa yang sebenarnya didefinisikan

`tailwind.config.ts` sepanjang **23 baris**. Seluruh design system aplikasi ini adalah:

```ts
theme: { extend: { colors: {
  utero: { DEFAULT: '#ce181e', hover: '#a61318' }   // baris 14-17
}}},
plugins: [],                                        // baris 21 — kosong
```

**Satu token warna. Nol token spacing, radius, shadow, fontSize, breakpoint, maupun z-index.** Tidak ada plugin (termasuk `tailwindcss-animate` yang kelasnya dipakai 10 kali — lihat C-01). `globals.css` menambahkan **5 baris** override Leaflet dan tidak lebih. Konsekuensinya: **setiap keputusan visual di aplikasi ini adalah utility ad-hoc**, dan tidak ada satu pun tempat untuk mengubahnya secara terpusat.

Baris 6 juga memindai `./src/pages/**` yang tidak pernah ada di proyek App Router ini (C-09).

### 4.2 Inventori nyata (hasil hitung di seluruh cakupan publik)

**Border radius — 6 varian tanpa aturan:**

| Kelas | Jumlah |
|---|---|
| `rounded-lg` | 62 |
| `rounded-full` | 47 |
| `rounded-xl` | 42 |
| `rounded-2xl` | 22 |
| `rounded-md` | 20 |
| `rounded-3xl` | 7 |

Kartu memakai `rounded-xl` (`AccountSettingsForm.tsx:101`), `rounded-2xl` (`CheckoutForm.tsx:104`), dan `rounded-3xl` (`BillboardDetailClient.tsx:156`) untuk peran yang sama. Tombol memakai `rounded` (`BookingCard.tsx:228`), `rounded-lg` (`login:106`), `rounded-xl` (`CheckoutForm.tsx:267`), dan `rounded-full` (`Navbar.tsx:99`).

**Shadow — 7 varian:**

| Kelas | Jumlah |
|---|---|
| `shadow-sm` | 43 |
| `shadow-lg` | 25 |
| `shadow-2xl` | 12 |
| `shadow-md` | 9 |
| `shadow-xl` | 3 |
| `shadow-none` | 2 |
| `shadow-inner` | 1 |

Ditambah satu bayangan arbitrer: `shadow-[0_0_10px_rgba(34,197,94,0.4)]` (`dashboard/order/[id]/page.tsx:106`).

**Keluarga warna yang dipakai — 9:**

| Keluarga | Jumlah |
|---|---|
| `gray` | 352 |
| `red` | 60 |
| `blue` | 51 |
| `green` | 43 |
| `yellow` | 14 |
| `orange` | 13 |
| `indigo` | 3 |
| `purple` | 2 |
| `slate` | 1 |

**`blue` muncul 51 kali** di aplikasi yang warna mereknya merah — termasuk pada state aktif (`LocationVisualizer.tsx:61`), hover kartu (`BookingCard.tsx:192`), dan tombol pemicu (`TrafficReportModal.tsx:14`). `indigo` (3×) adalah sisa boilerplate Tailwind (`AccountSettingsForm.tsx:20`). `slate` muncul sekali, bercampur dengan 352 `gray` — dua skala abu-abu yang berbeda nadanya.

Yang lebih penting: **`red-600` (#dc2626) dipakai bergantian dengan token merek `utero` (#ce181e)** (`AccountSettingsForm.tsx:111`, `BookingCard.tsx:228`, `login:106` `hover:bg-red-700`). Keduanya berbeda cukup jelas untuk terlihat bila bersebelahan, dan itu berarti token merek yang sudah dibuat tidak dipercaya.

**Tipografi:** Tidak ada `next/font`. `<body>` di `layout.tsx:11` **tanpa className**, jadi font dasar adalah default browser (serif di sebagian besar mesin). `font-sans` ditempelkan per-halaman secara tidak konsisten — ada di `checkout/page.tsx:38` dan `DashboardLayout.tsx:7`, **tidak ada** di `login/page.tsx:60` dan `register/page.tsx:45`. Akibatnya **halaman login dan registrasi merender dengan keluarga font berbeda dari halaman checkout dan dashboard** (C-15).

Skala ukuran teks keluar jalur di ujung bawah: **`text-[10px]` dipakai 42 kali** dan **`text-[9px]` 5 kali** — keduanya di bawah `text-xs` (12px) yang merupakan batas bawah skala Tailwind, dipakai untuk informasi nyata (status pesanan, stempel waktu, instruksi kalender), bukan sekadar ornamen.

**Dark mode:** **0 pemakaian `dark:`**. Tidak ada dukungan, dan juga tidak ada `darkMode` di config — jadi ini bukan "setengah jadi", melainkan tidak ada sama sekali. Yang perlu diputuskan sadar: nyatakan tidak didukung, atau rencanakan.

### 4.3 14 gaya tombol primer untuk aksi setara

| File:line | Kelas |
|---|---|
| `BillboardDetailClient.tsx:182` | `bg-gradient-to-r from-utero to-red-600 ... py-4 rounded-xl` |
| `CheckoutForm.tsx:267` | `bg-utero hover:bg-white hover:text-utero ring-2 ring-utero py-3 rounded-xl` |
| `login/page.tsx:106` | `bg-utero hover:bg-red-700 px-5 py-3 rounded-lg font-bold shadow-red-100` |
| `register/page.tsx:79` | `bg-utero hover:bg-red-700 px-5 py-2.5 rounded-lg font-medium` |
| `AccountSettingsForm.tsx:111` | `bg-red-600 hover:bg-red-700 py-2 px-4 rounded-md w-40` |
| `AccountSettingsForm.tsx:126` | `bg-gray-800 hover:bg-black py-2 px-4 rounded-md w-40` |
| `BookingCard.tsx:228` | `bg-red-600 text-xs py-2 rounded` |
| `BookingCard.tsx:242` | `bg-utero text-xs py-2 rounded animate-bounce` |
| `BookingCard.tsx:377` | `bg-utero py-3 rounded-lg` |
| `ChatWidget.tsx:133` | `bg-utero py-3 rounded-lg` |
| `HeroMap.tsx:70` | `bg-utero text-xs px-4 py-2 rounded-lg` |
| `Navbar.tsx:99` | `bg-utero px-5 py-2.5 rounded-full` |
| `Navbar.tsx:160` | `bg-utero py-3.5 rounded-xl` |
| `SearchFilter.tsx:93` | `bg-utero py-4 rounded-xl` |

Empat belas kombinasi warna/padding/radius/bobot untuk satu peran yang sama: "aksi primer". Padding vertikal berkisar dari `py-2` (8px) hingga `py-4` (16px); radius dari `rounded` hingga `rounded-full`; bobot dari `font-medium` hingga `font-bold`; warna dari `bg-utero`, `bg-red-600`, `bg-gray-800`, hingga gradien. **Tidak ada satu pun komponen tombol bersama di basis kode.**

### 4.4 Pola positif yang layak dijadikan standar

Beberapa hal sudah benar dan sebaiknya diangkat menjadi acuan, bukan ditulis ulang:

- `AccountSettingsForm.tsx:11-24` — komponen `InputField` (label+id+controlled) — **acuan untuk seluruh form**.
- `MapWrapper.tsx:5-9` — `dynamic` dengan `ssr:false` **dan** fallback `loading` — acuan untuk semua dynamic import.
- `Navbar.tsx:61-62` — skeleton `animate-pulse` — satu-satunya skeleton di aplikasi.
- `login/page.tsx:32-34, 74-77` — error inline berbasis state — acuan pengganti `alert()`.
- `dashboard/order/[id]/page.tsx:26-32` — `Intl.DateTimeFormat('id-ID')` — acuan formatter tanggal.
- `BillboardDetailClient.tsx:106,123,139` — empty state eksplisit per blok.
- `LocationVisualizer.tsx:73` — `scrollWheelZoom={false}` untuk peta tertanam.
- `Navbar.tsx:70` — `max-w-[100px] truncate` untuk teks dinamis.

---

## 5. Peta Jalan Perbaikan Berprioritas

### Fase 0 — Perbaikan pemblokir (1-2 hari)

Perubahan kecil, dampak besar, risiko rendah. Kerjakan lebih dulu.

1. `npm i tailwindcss-animate` dan daftarkan di `tailwind.config.ts:21` — menghidupkan 10 lokasi animasi mati (C-01).
2. Ganti `http://localhost:4001` hardcode dengan env var di `billboard/[slug]/page.tsx:14`, `ChatWidget.tsx:20`, `ChatWidget.tsx:57` (S-03, S-04).
3. Hubungkan atau hapus 4 link 404 di `Navbar.tsx:55,56,155,156` (L-01).
4. Hubungkan atau hapus 3 CTA mati di `Navbar.tsx:99,160` dan `BillboardDetailClient.tsx:188` (C-02).
5. Tambahkan `public/placeholder.jpg` (C-03).
6. Bungkus `JSON.parse` di `BillboardDetailClient.tsx:37-40` dengan helper aman (S-02).
7. Tambahkan cek kepemilikan pesanan di `dashboard/order/[id]/page.tsx:23` (N-01). **Perubahan keamanan — verifikasi dengan pengujian dua akun berbeda sebelum rilis.**
8. `Math.round()` pada `mustPayNow` dan `ppn` di `CheckoutForm.tsx:39,42` sebelum ditampilkan dan dikirim (C-06).
9. Perbaiki `mustPayNow`/`dpAmount` yang sudah telanjur tersimpan di database, jika ada.

### Fase 1 — Alur pembelian dapat dipakai (3-5 hari)

Tanpa fase ini, alur pemesanan tidak dapat diselesaikan oleh sebagian pengguna.

1. **Perbaiki form checkout (F-01, F-02, F-08):** jadikan Nama/WhatsApp/Email/NPWP controlled dan sertakan di payload; ganti `document.getElementById` dengan state; bungkus dalam `<form>`.
2. **Ganti `<div onClick>` menjadi tombol/radio** di `CheckoutForm.tsx:110-122, 179, 184` (A-01, A-02) — ini memblokir pengguna keyboard menyelesaikan pembelian.
3. **Perbaiki `type="number"`** pada telepon/NPWP/rekening di 4 lokasi (F-07) — bug data, bukan kosmetik.
4. **Hapus `alert()`/`confirm()` dari alur uang:** `BookingCard.tsx:102,116` dan `CheckoutForm.tsx:47,53,80,83,88` (F-03, F-04, F-06). Perkenalkan sistem toast + modal konfirmasi berbasis `@headlessui/react` (sudah terpasang).
5. **Tambahkan pemeriksaan `res.ok`** pada seluruh handler `BookingCard` (F-05) dan proteksi double-submit (F-09).
6. **Perbaiki `<button>` di dalam `<Link>`** di `BillboardDetailClient.tsx:176-187` (A-05) — termasuk celah keyboard yang melewati guard tanggal.

### Fase 2 — Mobile dapat dipakai (3-4 hari)

1. Panel chat responsif (R-02) dan offset launcher terhadap CTA (R-20).
2. Timeline pesanan: `overflow-x-auto` atau varian vertikal (R-03).
3. Invoice: `p-4 md:p-12`, `grid-cols-1 md:grid-cols-2`, bungkus tabel, `w-full md:w-1/2`, tombol cetak (R-04, R-06, R-08, R-22).
4. `w-[800px]` → `w-full max-w-[800px]` pada search bar (R-01).
5. Tabel spesifikasi: `overflow-hidden` → `overflow-x-auto` (R-05).
6. `BookingCard` grid: sisipkan langkah `sm:`/`lg:`; batasi garis pemisah ke `md:` (R-07, R-16).
7. Ganti seluruh `100vh` → `100dvh` (R-09, 5 lokasi).
8. Sticky bottom bar CTA untuk mobile di halaman detail dan checkout (R-10).
9. Menu mobile: `max-h` + `overflow-y-auto`, dan tutup saat navigasi (R-13, A-21).
10. Tinggi peta responsif (R-12); galeri `grid-cols-1 sm:grid-cols-2` (R-11).
11. Naikkan seluruh target sentuh ke minimum 44×44px (T-01).

### Fase 3 — Aksesibilitas (4-5 hari)

1. Ganti keempat modal `BookingCard` dan `TrafficReportModal` dengan `@headlessui/react` `<Dialog>` — sekaligus menyelesaikan `role`, `aria-modal`, focus trap, Escape, dan pengembalian fokus (A-03, A-04).
2. Terapkan pola `InputField` dari `AccountSettingsForm.tsx:11-24` ke seluruh form (A-09).
3. Tambahkan `aria-label` ke 13 tombol ikon (A-10).
4. Ring `focus-visible` global di `globals.css`; hapus `outline-none` telanjang (A-11).
5. Tambahkan `alt` ke 6 gambar (A-12); perbaiki afordansi `cursor-pointer` palsu (A-22).
6. Perbaiki hierarki heading di 3 halaman dan `h1` dashboard (A-13, A-14, A-15).
7. Naikkan seluruh `text-gray-400`/`text-gray-300` informatif ke minimum `text-gray-600` (A-16).
8. Semantik tab ARIA di 3 lokasi (A-13); `name` + `fieldset` pada radio bayar (A-19).
9. Skip link + `<main>` di `layout.tsx` (A-18).
10. `rel="noopener noreferrer"` di 4 link (A-24); `title` pada iframe (A-23).

### Fase 4 — State & performa (3-4 hari)

1. Tambahkan `loading.tsx` + `error.tsx` per segmen rute, dan `not-found.tsx` root (S-01). Ganti ketiga soft-404 dengan `notFound()` (S-08).
2. Skeleton untuk daftar billboard, kartu pesanan, dan peta (S-19).
3. Empty state dashboard dengan CTA (S-07).
4. Perbaiki hitung mundur `BookingCard` (P-02) dan mode tahun kalender (P-03).
5. Pecah `BillboardDetailClient` menjadi server component + pulau client (P-04).
6. Migrasi 10 `<img>` ke `next/image` dengan `sizes`, dan `priority` untuk hero (P-01).
7. Perbaiki loading screen modal trafik (S-05) dan indikator "Mengetik" chat (S-06).
8. `select` alih-alih `include` pada query dashboard (P-10).
9. Aktifkan kembali `reactStrictMode`, `typescript.ignoreBuildErrors`, `eslint.ignoreDuringBuilds` setelah `new Date()` saat render diperbaiki (P-11, P-12).

### Fase 5 — Konsistensi & fondasi (3-4 hari)

1. Buat komponen `<Button variant size>` dan migrasikan 14 gaya tombol (C-07).
2. Util bersama: `formatIDR()`, `formatDate()`, `statusStyle()`, `cn()` (C-04, C-05, C-13; `clsx`+`tailwind-merge`+`date-fns` sudah terpasang — C-25).
3. Perluas `tailwind.config.ts`: radius, shadow, fontSize, z-index; hapus glob `src/pages` (C-08, C-09, C-18).
4. `next/font` di `<body>`, hapus `font-sans` per-halaman (P-05, C-15).
5. Hapus warna off-brand: biru (3 lokasi), indigo (1), `red-600` → `utero` (C-10, C-11, C-12).
6. Samakan halaman login dan registrasi; ekstrak `<AuthCard>` (C-14).
7. Tambahkan `metadata` per halaman (P-06).
8. Bersihkan import mati dan `'use client'` yang tak perlu (C-16, C-17).
9. Naikkan `text-[10px]`/`text-[9px]` ke minimum `text-xs` (C-24).
10. Terjemahkan sisa teks Inggris; hapus teks debug produksi (C-22, C-23).

**Estimasi total: ± 3 minggu** untuk satu pengembang frontend, dengan Fase 0-1 (sekitar 1 minggu) sebagai syarat minimum sebelum aplikasi layak menerima pengguna sungguhan.

---

## 6. i18n, Mata Uang, dan Format Tanggal

### 6.1 Mata uang — 4 format tidak kompatibel, nol formatter bersama

| Pola | Lokasi | Contoh keluaran |
|---|---|---|
| `Rp {x.toLocaleString('id-ID')}` | `invoice:91,102,108,113`; `CheckoutForm:241,245,249,256,265`; `BookingCard:116,222`; `dashboard/order/[id]:164` | `Rp 33.300.000` |
| `Rp {(price/1000000).toFixed(0)} Jt` | `HeroMap:67`; `BillboardDetailClient:41` | `Rp 33 Jt` |
| `Rp {(totalSpent/1000000).toLocaleString('id-ID',{maximumFractionDigits:1})} Jt` | `DashboardClientPage:72` | `Rp 0,4 Jt` |
| `Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR'})` | **tidak dipakai sama sekali** | — |

Seluruh nominal dirakit lewat **penggabungan string manual dengan prefiks `"Rp "`**, bukan API mata uang. Konsekuensinya:

- Tidak ada penanganan desimal — nilai float dari `grandTotal * 0.60` (`CheckoutForm.tsx:42`) tampil apa adanya, dengan ekor desimal panjang, dan **nilai yang sama dikirim ke backend sebagai `dpAmount`** (`:64`).
- `toFixed(0)` di `HeroMap:67` membulatkan Rp 33.900.000 menjadi "Rp 33 Jt" — **menurunkan harga yang terlihat calon pembeli sebesar 900 ribu**.
- Pembagian "Jt" menyembunyikan nilai kecil: Rp 400.000 menjadi "Rp 0,4 Jt" (`DashboardClientPage:72`).
- Tidak ada satu pun tempat untuk mengubah aturan tampilan harga.

### 6.2 Tanggal — 5 format tidak kompatibel

| Pola | Lokasi | Contoh keluaran |
|---|---|---|
| `Intl.DateTimeFormat('id-ID', {...})` | `dashboard/order/[id]:28,31` | `21 September 2026` |
| `toLocaleDateString('id-ID', {dateStyle:'long'})` | `BillboardDetailClient:172` | `21 September 2026` |
| `toLocaleDateString('id-ID', {month:'long', ...})` | `AvailabilityCalendar:62,70` | `September 2026` |
| `toLocaleDateString('en-CA')` | `BillboardDetailClient:28` | `2026-09-21` (untuk input `type="date"`) |
| **`toLocaleDateString()` tanpa locale** | **`invoice:67`** | bergantung locale browser user |

Kasus `invoice:67` adalah yang paling serius: tanggal pada **dokumen keuangan** mengikuti pengaturan mesin pembaca, sehingga pengguna berlokal `en-US` melihat `9/21/2026` sementara seluruh aplikasi menampilkan `21 September 2026`. Ambiguitas hari/bulan pada invoice adalah cacat nyata, bukan kosmetik.

`date-fns@^4.1.0` **terpasang tetapi tidak pernah diimpor** di kode publik.

### 6.3 Campuran bahasa Indonesia/Inggris

UI berbahasa Indonesia, tetapi teks berbahasa Inggris bocor di beberapa tempat yang dilihat pengguna:

- `AvailabilityCalendar.tsx:101,102` — toggle `year` / `month` (huruf kecil, tanpa kapitalisasi) di tengah kalender Indonesia.
- `invoice/[id]/page.tsx:19` — `"Access Denied: Harap Login"` — kalimat separuh Inggris separuh Indonesia.
- `ImageUpload.tsx:34` — `"File max 5MB"`; `ImageUpload.tsx:128` — `aria-label="Remove image"`.
- `BookingCard.tsx:116` — `"[SIMULASI XENDIT]"` — penanda debug internal yang tampil ke pengguna akhir.
- `login/page.tsx:43` — `"⛔ DETECTED: Anda adalah Admin!"` — bahasa debug bercampur bahasa produk.
- Nilai status pesanan (`ACTIVE`, `PENDING`, `REFUNDED`, dst.) dirender mentah dari enum database di `BookingCard.tsx:181-187` dan `invoice/[id]/page.tsx:61-66`, tanpa peta terjemahan.

Tidak ada pustaka maupun berkas i18n; seluruh copy ditulis inline. `layout.tsx:10` sudah benar menetapkan `lang="id"` — satu-satunya sinyal i18n yang benar di aplikasi.

---

## 7. Catatan Cakupan

Audit ini meliputi seluruh berkas dalam cakupan yang diminta, dibaca lengkap: `layout.tsx`, `globals.css`, `tailwind.config.ts`, `page.tsx`, `billboard/[slug]/page.tsx` + `BillboardDetailClient.tsx`, `checkout/page.tsx`, `login/page.tsx`, `register/page.tsx`, `invoice/[id]/page.tsx`, `dashboard/` (4 berkas), `dashboard/order/[id]/page.tsx`, `dashboard/settings/` (2 berkas), serta 12 komponen bersama.

Tiga temuan berada di perbatasan cakupan dan diteruskan ke audit lain: **N-01** (kepemilikan pesanan), **N-02** (peran `SUPER_ADMIN`), dan **N-03** (sandbox iframe) bersifat keamanan, bukan UI. Keduanya dicantumkan di sini karena ditemukan saat menelusuri state dan penanganan error.

`ImageUpload.tsx` masuk daftar cakupan tetapi **tidak direferensikan oleh satu pun halaman publik**; temuannya dicatat singkat di 2.21.

Nilai `.env` tidak pernah dibaca maupun dicantumkan; hanya nama kunci `NEXT_PUBLIC_*` yang dirujuk.
