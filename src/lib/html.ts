// src/lib/html.ts
//
// Satu fungsi untuk menaruh teks apa pun ke dalam HTML dengan aman.
//
// Email di aplikasi ini disusun sebagai string HTML. Setiap nilai yang berasal
// dari pengguna — nama akun, alasan refund, nama bank, keterangan biaya — dulu
// disisipkan apa adanya ke dalam string itu. Nama akun `<img src=x onerror=…>`
// atau alasan refund berisi tag akan dirender oleh klien email admin sebagai
// markup, bukan teks. Klien email memang memblokir sebagian besar skrip, tetapi
// tautan palsu, gambar pelacak, dan markup yang menyamar sebagai isi resmi
// tetap lolos — di surat yang admin percayai sebagai kiriman sistem sendiri.
//
// Modul ini sengaja tanpa dependensi dan tanpa efek samping supaya bisa
// diimpor dari mana pun (termasuk test) tanpa menyeret transporter SMTP.

/** Lima karakter yang punya arti di HTML, dipetakan ke entitasnya. */
const ENTITAS: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Ubah nilai apa pun menjadi teks yang aman ditaruh di dalam HTML, baik di
 * antara tag maupun di dalam atribut berkutip.
 *
 * `null`/`undefined` menjadi string kosong, bukan teks "null" — pemanggil yang
 * ingin nilai pengganti menuliskannya sendiri (`amankanHtml(nama ?? 'pembeli')`).
 * Nilai bukan-string diubah lewat `String()` lebih dulu, jadi angka dan Decimal
 * tetap tercetak, tetapi objek biasa akan menjadi "[object Object]" — itu
 * tanda pemanggilnya salah, bukan sesuatu yang perlu ditutupi di sini.
 */
export function amankanHtml(nilai: unknown): string {
  if (nilai === null || nilai === undefined) return '';
  return String(nilai).replace(/[&<>"']/g, (karakter) => ENTITAS[karakter]);
}
