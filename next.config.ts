// next.config.ts
import type { NextConfig } from "next";

const produksi = process.env.NODE_ENV === 'production';

// Asal server chat, diturunkan dari NEXT_PUBLIC_CHAT_URL.
//
// `connect-src` adalah satu-satunya direktif di bawah yang nilainya BUKAN
// literal: alamat chat berbeda per lingkungan. Aturannya sama dengan
// `src/lib/alamat-chat.ts` — variabel ini dibaca saat BUILD, bukan saat
// permintaan masuk. Header dari berkas ini ikut dikompilasi ke routes-manifest,
// jadi lupa mengisinya di lingkungan build berarti CSP produksi tidak memuat
// asal chat sama sekali dan seluruh percakapan diblokir peramban.
//
// Yang dikembalikan adalah pasangan http(s) + ws(s): socket.io membuka
// keduanya — polling XHR dulu, lalu naik ke WebSocket — dan CSP memperlakukan
// `wss:` sebagai skema terpisah dari `https:`.
function asalChat(): string[] {
  const mentah = (process.env.NEXT_PUBLIC_CHAT_URL || '').trim().replace(/\/+$/, '');
  if (!mentah) {
    if (produksi) {
      // Dicatat, bukan didiamkan. Tanpa baris ini kegagalannya baru terlihat
      // sebagai "chat tidak jalan di produksi" berhari-hari kemudian, dengan
      // konsol peramban pengguna sebagai satu-satunya petunjuk. `alamatChat()`
      // di `src/lib/alamat-chat.ts` memberi peringatan yang setara saat
      // berjalan; ini padanannya saat build.
      console.error(
        '[csp] NEXT_PUBLIC_CHAT_URL kosong saat build produksi. ' +
          'connect-src tidak akan memuat asal chat, dan peramban memblokir seluruh percakapan.'
      );
    }
    // Di luar produksi, `alamatChat()` jatuh ke localhost:3001. CSP harus
    // mengizinkan asal yang sama, kalau tidak chat mati justru saat dikembangkan.
    return produksi ? [] : ['http://localhost:3001', 'ws://localhost:3001'];
  }
  try {
    const url = new URL(mentah);
    const ws = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return [url.origin, `${ws}//${url.host}`];
  } catch {
    // Nilai tak terbaca tidak boleh menjatuhkan build — `next build` yang gagal
    // karena satu variabel salah ketik menahan seluruh rilis. Tapi ia juga
    // tidak boleh hilang tanpa jejak.
    console.error(
      `[csp] NEXT_PUBLIC_CHAT_URL bukan URL yang sah: ${JSON.stringify(mentah)}. ` +
        'Asal chat tidak masuk connect-src.'
    );
    return [];
  }
}

// Kebijakan Keamanan Konten.
//
// Sebelum ini proyek tidak mengirim SATU pun header keamanan: tidak ada CSP,
// tidak ada HSTS, tidak ada nosniff, tidak ada Referrer-Policy, tidak ada
// proteksi framing. Halaman yang memegang sesi admin dan alur pembayaran
// berjalan dengan bawaan peramban apa adanya.
//
// Setiap nilai di bawah berasal dari pemetaan asal yang sungguh dipakai, bukan
// daftar contoh:
//
// - `script-src` memuat `'unsafe-inline'` karena App Router menyisipkan skrip
//   bootstrap sebaris (`self.__next_f.push(...)`) di SETIAP halaman. Nonce satu-
//   satunya jalan keluarnya, dan nonce harus dipasang dari middleware — yang di
//   repo ini adalah `withAuth` dengan matcher terbatas; memperluasnya ke seluruh
//   rute akan memaksa login di halaman publik. Itu fase sendiri. Sampai saat itu
//   `object-src 'none'`, `base-uri 'self'`, dan `form-action` di bawah yang
//   menanggung beban: ketiganya menutup vektor yang `'unsafe-inline'` tidak.
//   `'unsafe-eval'` hanya di luar produksi, untuk HMR — tidak satu pun `eval`
//   atau `new Function` ada di kode aplikasi maupun di SDK Xendit.
//
// - `style-src 'unsafe-inline'` WAJIB, bukan kelonggaran: ada 12 titik
//   `style={{…}}` React di 5 berkas (`global-error.tsx`, `UserClientPage.tsx`,
//   `CS_Dashboard.tsx`, `dashboard/order/[id]/page.tsx` dengan lebar dinamis,
//   `LocationVisualizer.tsx`), ditambah atribut style yang ditulis Leaflet saat
//   berjalan dan satu `<style>` yang disuntik SDK Xendit. Nonce tidak berlaku
//   untuk style atribut — tidak ada tempat memasangnya.
//
// - `img-src data:` WAJIB: bukti transfer ditampilkan sebagai base64
//   (`BookingCard.tsx`, `OrderActions.tsx`). `blob:` untuk SVG yang dibuat SDK
//   Xendit. `https:` terbuka karena `board.mainImage` dan `user.image` adalah
//   URL bebas dari basis data — daftar putih ketat akan tampak sebagai "gambar
//   rusak" bagi admin yang menempelkan tautan dari mana pun.
//
// - `frame-src https:` terbuka karena dua sumber yang MEMANG tidak bisa
//   didaftar: iframe 3DS Xendit beralamat di penerbit kartu pembeli (bank mana
//   pun di dunia), dan `TrafficReportModal.tsx` merender iframe dari URL yang
//   disimpan admin di basis data. Yang tetap tertutup: `data:` dan `javascript:`.
//
// - `api.xendit.co` dan `generativelanguage.googleapis.com` SENGAJA TIDAK ADA.
//   Keduanya dipanggil dari server — kunci rahasianya ada di sana. Menaruhnya di
//   kebijakan peramban akan menyiratkan ada jalur dari halaman ke API itu, dan
//   jalur seperti itu tidak boleh ada.
function kebijakanKonten(): string {
  const chat = asalChat();

  const arahan: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      ...(produksi ? [] : ["'unsafe-eval'"]),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      'https://checkout-ui-gateway.xendit.co',
      'https://log.xendit.co',
      ...chat,
    ],
    'frame-src': ["'self'", 'https:'],
    'worker-src': ["'self'", 'blob:'],
    'media-src': ["'self'", 'data:', 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'", 'https://*.xendit.co'],
    'frame-ancestors': ["'none'"],
  };

  const baris = Object.entries(arahan).map(([nama, nilai]) => `${nama} ${nilai.join(' ')}`);

  // Hanya di produksi. `upgrade-insecure-requests` di localhost mengubah setiap
  // permintaan http:// menjadi https:// — termasuk ke server chat di :3001 yang
  // tidak punya TLS, sehingga chat mati saat dikembangkan.
  if (produksi) baris.push('upgrade-insecure-requests');

  return baris.join('; ');
}

const nextConfig: NextConfig = {
  // Header keamanan untuk SELURUH rute.
  //
  // Ditulis di sini, bukan di `vercel.json`: berkas ini berlaku juga saat
  // `next start` di server sendiri dan saat pengembangan, sementara header
  // `vercel.json` hanya hidup di Vercel. Satu tempat, satu kebijakan.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: kebijakanKonten() },

          // Dikirim walau CSP sudah punya `frame-ancestors 'none'`: peramban
          // lama tidak mengenal `frame-ancestors`, dan yang perlu dilindungi
          // adalah sesi admin — klik yang dicuri di sana memindahkan uang.
          { key: 'X-Frame-Options', value: 'DENY' },

          // Tanpa ini, berkas yang diunggah pembeli sebagai "bukti transfer"
          // bisa ditebak-tipenya oleh peramban dan dieksekusi sebagai HTML.
          { key: 'X-Content-Type-Options', value: 'nosniff' },

          // Tautan keluar tidak boleh membawa jalur halaman. `/invoice/<id>`
          // dan `/dashboard/order/<id>` memuat pengenal pesanan di URL-nya.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

          // Tidak ada fitur ini yang dipakai. Yang tidak dipakai dimatikan,
          // supaya skrip pihak ketiga di dalam iframe pembayaran tidak bisa
          // memintanya atas nama halaman kita.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },

          // HSTS hanya di produksi: di localhost ia memaksa https pada asal yang
          // tidak punya sertifikat, dan peramban MENGINGATNYA — `localhost:4000`
          // bisa jadi tidak bisa dibuka lagi sampai cache HSTS dibersihkan
          // manual. `preload` sengaja TIDAK disertakan: masuk daftar preload
          // tidak bisa dibatalkan dengan cepat.
          ...(produksi
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains',
                },
              ]
            : []),
        ],
      },
    ];
  },

  // 1. SOLUSI PETA CRASH: Matikan Strict Mode
  reactStrictMode: false, 

  // 2. SOLUSI GAMBAR: Izinkan akses ke Unsplash & Google
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
      },
      {
        protocol: 'https',
        hostname: 'assets.website-files.com',
      }
    ],
  },
  
  // `typescript.ignoreBuildErrors: true` DIBUANG.
  //
  // Selama flag itu menyala, `next build` berhasil walaupun kodenya tidak
  // ter-typecheck. Yang tersembunyi di baliknya bukan "warning kecil": satu
  // galat nyata di `prisma/seed.ts` — `status: "Available"` bertipe `string`,
  // bukan `BillboardStatus` — hidup di sana tanpa terlihat, bersama enam galat
  // deklarasi ganda di `prisma/seed.ts`/`prisma/set-admin.ts` yang membuat
  // `npx tsc --noEmit` selalu merah. Gerbang yang selalu merah adalah gerbang
  // yang berhenti dibaca orang, dan build yang lolos apa pun isinya adalah
  // build yang tidak menjaga apa-apa.
  //
  // Ketujuhnya sudah dibereskan, `tsc` bersih, jadi gerbangnya dinyalakan.
  // Bila nanti ada galat tipe baru, build gagal — itu memang gunanya.
  //
  // Blok `eslint: { ignoreDuringBuilds: true }` juga dibuang, tapi karena
  // alasan berbeda: Next 16 tidak lagi menjalankan ESLint saat build dan tidak
  // lagi mengenal kunci itu. Ia bukan sekadar tidak berguna — ia GALAT TIPE
  // (TS2353) di berkas konfigurasi ini sendiri. Linting sekarang dijalankan
  // lewat `npm run lint`.
};

export default nextConfig;