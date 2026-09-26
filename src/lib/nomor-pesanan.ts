// src/lib/nomor-pesanan.ts
//
// Nomor pesanan yang dibaca manusia.
//
// Rumus `id.slice(-n).toUpperCase()` sebelumnya ditulis ulang di 18 tempat
// dengan DUA panjang yang berbeda: judul email memakai 6 karakter sementara
// badan surat, halaman invoice, dan halaman tracking memakai 8. Akibatnya satu
// email memuat dua nomor untuk pesanan yang sama — pembeli menyebut salah
// satunya ke CS, dan pencarian tidak menemukan apa pun.
//
// Panjangnya disatukan ke 8. Bukan 6: `id` adalah cuid, dan 8 karakter terakhir
// memberi ruang tabrakan yang jauh lebih longgar tanpa membuat nomornya sulit
// dibacakan lewat telepon. Nilainya hanya untuk dibaca manusia — pencarian di
// database tetap memakai `id` utuh, jadi tabrakan tampilan tidak pernah
// menyebabkan salah baris.

/** Berapa karakter terakhir `id` yang dipakai sebagai nomor tampilan. */
export const PANJANG_NOMOR_PESANAN = 8;

/**
 * Nomor pesanan tanpa awalan `#`.
 *
 * `id` yang kosong atau bukan teks menghasilkan `'BARU'`, bukan melempar:
 * satu-satunya pemanggil yang bisa kehabisan id adalah template email yang
 * dipakai untuk surat tanpa pesanan, dan surat gagal terkirim karena nomor
 * tampilan adalah kerugian yang jauh lebih besar daripada nomor yang kosong.
 */
export function nomorPesanan(id: string | null | undefined): string {
  if (typeof id !== 'string') return 'BARU';
  const rapi = id.trim();
  if (rapi === '') return 'BARU';
  return rapi.slice(-PANJANG_NOMOR_PESANAN).toUpperCase();
}

/** Nomor pesanan lengkap dengan awalan `#`, siap dipakai di judul dan heading. */
export function labelPesanan(id: string | null | undefined): string {
  return `#${nomorPesanan(id)}`;
}
