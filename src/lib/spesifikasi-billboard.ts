// src/lib/spesifikasi-billboard.ts
//
// Penyusun kolom jsonb `Billboard.specs`, dengan bentuk tiap nilainya dipastikan.
//
// KENAPA FILE INI ADA
// -------------------
// Ini cacat yang SAMA yang sudah ditutup untuk `includes`/`excludes` di
// `src/lib/opsi-billboard.ts` — `specs` hanya belum ikut. Kalimat di kepala
// berkas itu berlaku kata per kata di sini juga, jadi tidak diulang; yang
// berbeda cuma jalur masuknya.
//
// `create/route.ts` dan `update/route.ts` dulu menyusun enam barisnya begini:
//
//     { label: "Ukuran",            value: `${body.sizeH || 0}m x ${body.sizeW || 0}m` },
//     { label: "Luas Area",         value: `${(...).toFixed(1)} m²` },
//     { label: "Layout / Orientasi", value: body.orientation || "-" },
//     { label: "Tampilan",          value: body.sides ? `${body.sides} Sisi` : "-" },
//     { label: "Jenis Penerangan",  value: body.lighting || "-" },
//     { label: "Material",          value: body.material || "-" },
//
// Tiga dari enam dibungkus template literal, jadi apa pun yang datang keluar
// sebagai teks. TIGA SISANYA — `orientation`, `lighting`, `material` — diambil
// APA ADANYA dari `req.json()`, dan `body` tidak bertipe apa pun.
//
// `{"orientation":{"a":1}}` karena itu tersimpan sebagai
// `{ label: "Layout / Orientasi", value: { a: 1 } }`. jsonb menerimanya (tidak
// ada galat, tidak ada log), `arrayDariJson` di pembacanya menjamin ARRAY tapi
// tidak menjamin bentuk tiap elemennya, dan
// `src/app/billboard/[slug]/BillboardDetailClient.tsx` merendernya sebagai
// `{spec.value}` — React melempar "Objects are not valid as a React child",
// tidak ada komponen yang menangkapnya, dan SELURUH halaman billboard publik
// mati untuk setiap pengunjung sampai barisnya diperbaiki lewat database.
//
// Form admin sudah menjaganya di sisi BACA (`billboards/form/page.tsx`:
// "Nilainya juga harus teks"), jadi jalur tulis inilah satu-satunya lubang yang
// tersisa. Menjaga bacaan saja tidak cukup: baris yang sudah tersimpan tetap
// mematikan halaman publik, dan yang menyimpannya adalah kedua route ini.
//
// KENAPA SATU FUNGSI, BUKAN TAMBALAN DI DUA ROUTE
// ----------------------------------------------
// Alasan yang sama seperti `pisahkanOpsi`: keenam baris ini dulu ditulis dua
// kali dengan komentar "SAMA SEPERTI CREATE" di salah satunya — pengakuan
// bahwa keduanya rumus kembar yang harus dijaga sepakat dengan tangan. Rumus
// kembar akan menyimpang. Satu billboard tidak boleh berubah spesifikasinya
// hanya karena disimpan lewat jalur yang berbeda.
//
// KENAPA HANYA SATU IMPOR TIPE
// ----------------------------
// Tidak ada nilai yang diimpor: fungsinya hanya membaca `unknown` dan
// mengembalikan teks. Satu-satunya impor adalah `type`, yang hilang saat
// dikompilasi, dan berkas sumbernya sendiri nol impor. Jadi berkas ini bisa
// dipakai dari Client Component tanpa menarik runtime Prisma ke bundel browser,
// sama seperti `src/lib/tarif.ts` dan `src/lib/tanggal.ts`.

// Bentuk satu barisnya sudah punya nama di `src/lib/tipe-billboard.ts`.
// Diimpor, bukan ditulis ulang: dua tipe kembar dengan nama berbeda untuk
// bentuk yang sama adalah cara paling mudah membuat keduanya menyimpang.
import type { BarisSpesifikasi } from './tipe-billboard';

export type { BarisSpesifikasi };

/**
 * Batas panjang satu nilai spesifikasi.
 *
 * Ia tampil di tabel halaman publik dan di panel transaksi admin, bukan tempat
 * menampung teks sepanjang megabyte. Angkanya sama dengan `PANJANG_NAMA_MAKS`
 * di `src/lib/opsi-billboard.ts` dengan alasan yang sama.
 */
export const PANJANG_NILAI_SPEC_MAKS = 200;

/** Yang dipakai bila nilainya tidak ada atau tidak layak disimpan. */
export const NILAI_SPEC_KOSONG = '-';

/**
 * Bidang-bidang `body` yang dipakai menyusun `specs`.
 *
 * Semuanya `unknown`: nilai mentah dari `req.json()` boleh diteruskan tanpa
 * cast, dan itu justru tujuannya.
 */
export type BodiSpec = {
  sizeH?: unknown;
  sizeW?: unknown;
  orientation?: unknown;
  sides?: unknown;
  lighting?: unknown;
  material?: unknown;
};

/**
 * Nilai spesifikasi yang layak disimpan, atau `NILAI_SPEC_KOSONG`.
 *
 * Yang ditolak: nilai bukan teks (objek, array, angka, `null`), teks yang hanya
 * berisi spasi, dan teks yang melewati batas panjang.
 *
 * Angka SENGAJA ditolak, bukan diubah menjadi teks. Form admin mengirim
 * ketiga bidang ini sebagai `<select>`/`<input>` teks, jadi angka di sana
 * bukan admin yang salah ketik — ia permintaan yang disusun tangan. Menerimanya
 * dengan `String(nilai)` berarti membuka pintu untuk nilai berikutnya yang
 * tidak punya bentuk teks yang masuk akal.
 */
function nilaiSpec(nilai: unknown): string {
  if (typeof nilai !== 'string') return NILAI_SPEC_KOSONG;

  const rapi = nilai.trim();
  if (rapi === '') return NILAI_SPEC_KOSONG;
  if (rapi.length > PANJANG_NILAI_SPEC_MAKS) return NILAI_SPEC_KOSONG;

  return rapi;
}

/**
 * Angka ukuran sebagai teks, atau `'0'`.
 *
 * `body.sizeH` datang dari `<input type="number">`, jadi ia TEKS di sisi form —
 * lihat catatan `FormBillboard` di `src/lib/tipe-billboard.ts`. Yang diperiksa
 * di sini hanya bahwa ia bisa dibaca sebagai bilangan berhingga: `NaN` dan
 * `Infinity` bertipe number dan keduanya menghasilkan teks yang tidak berarti
 * apa-apa di tabel spesifikasi.
 */
function ukuran(nilai: unknown): number {
  if (typeof nilai === 'number') return Number.isFinite(nilai) ? nilai : 0;
  if (typeof nilai !== 'string') return 0;

  const angka = Number(nilai.trim());
  return Number.isFinite(angka) ? angka : 0;
}

/**
 * Susun keenam baris `specs` dari body permintaan.
 *
 * Selalu mengembalikan enam baris dengan `label` dan `value` bertipe teks —
 * tidak pernah melempar, dan tidak pernah mengembalikan nilai yang bisa
 * mematikan halaman yang merendernya.
 *
 * Nilai yang ditolak dicatat ke log server, tidak dibuang diam-diam: admin yang
 * spesifikasinya tiba-tiba kosong perlu bisa ditelusuri sebabnya.
 *
 * @param body    Hasil `req.json()`, apa adanya.
 * @param context Label untuk log, mis. `"billboards/create"`.
 */
export function susunSpecs(body: BodiSpec | null | undefined, context?: string): BarisSpesifikasi[] {
  const isi = body ?? {};

  const tinggi = ukuran(isi.sizeH);
  const lebar = ukuran(isi.sizeW);

  const orientasi = nilaiSpec(isi.orientation);
  const penerangan = nilaiSpec(isi.lighting);
  const material = nilaiSpec(isi.material);
  const sisi = nilaiSpec(isi.sides);

  // Dihitung dari nilai yang SUDAH dipastikan, bukan dari `isi` langsung.
  // `Number(body.sizeH) * Number(body.sizeW)` pada `{"sizeH":{}}` menghasilkan
  // `NaN`, dan `NaN.toFixed(1)` adalah teks `"NaN"` — tersimpan tanpa keluhan,
  // lalu tampil di tabel halaman publik sebagai "NaN m²".
  const luas = (tinggi * lebar).toFixed(1);

  const ditolak = [
    ['orientation', isi.orientation, orientasi] as const,
    ['lighting', isi.lighting, penerangan] as const,
    ['material', isi.material, material] as const,
    ['sides', isi.sides, sisi] as const,
  ].filter(
    ([, mentah, hasil]) =>
      hasil === NILAI_SPEC_KOSONG && mentah !== undefined && mentah !== null && mentah !== ''
  );

  if (ditolak.length > 0) {
    // Hanya NAMA bidangnya, bukan nilainya: yang ditolak justru nilai yang
    // bentuknya tidak dikenal, dan menuliskan objek sembarang ke log adalah
    // cara paling mudah memasukkan isi permintaan orang lain ke berkas log.
    console.error(
      `[spesifikasi-billboard] ${ditolak.length} nilai spesifikasi ditolak` +
        `${context ? ` pada ${context}` : ''} (${ditolak.map(([nama]) => nama).join(', ')}): ` +
        `nilainya bukan teks yang terpakai. Nilai seperti itu akan mematikan ` +
        `halaman billboard publik bila tersimpan.`
    );
  }

  return [
    { label: 'Ukuran', value: `${tinggi}m x ${lebar}m` },
    { label: 'Luas Area', value: `${luas} m²` },
    { label: 'Layout / Orientasi', value: orientasi },
    { label: 'Tampilan', value: sisi === NILAI_SPEC_KOSONG ? NILAI_SPEC_KOSONG : `${sisi} Sisi` },
    { label: 'Jenis Penerangan', value: penerangan },
    { label: 'Material', value: material },
  ];
}

/**
 * Baris `specs` yang aman dirender, dari kolom jsonb apa adanya.
 *
 * Penjaga di sisi BACA, dan ia tetap dibutuhkan walaupun `susunSpecs` sudah
 * menjaga sisi tulis: baris yang tersimpan SEBELUM penjaga itu ada masih
 * memuat nilai lamanya, dan barisnya tidak akan berubah sendiri. Tanpa ini,
 * satu baris warisan tetap mematikan halaman publik maupun panel transaksi
 * admin.
 *
 * @param baris Hasil `arrayDariJson` — dijamin array, TIDAK dijamin isinya.
 */
export function specsAman(baris: unknown[]): BarisSpesifikasi[] {
  const aman: BarisSpesifikasi[] = [];

  for (const b of baris) {
    if (b === null || typeof b !== 'object') continue;

    const { label, value } = b as { label?: unknown; value?: unknown };
    if (typeof label !== 'string' || typeof value !== 'string') continue;

    aman.push({ label, value });
  }

  return aman;
}
