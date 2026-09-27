// src/lib/opsi-billboard.ts
//
// Pemisah daftar fasilitas billboard, dengan bentuknya dipastikan.
//
// KENAPA INI BUKAN SOAL KERAPIAN TIPE
// -----------------------------------
// `create/route.ts` dan `update/route.ts` dulu menulis ini:
//
//     const options = Array.isArray(body.adminOptions) ? body.adminOptions : [];
//     const includesList = options.filter((o: any) => o.included === true)
//                                 .map((o: any) => o.name);
//
// `body` berasal dari `req.json()` dan tidak bertipe apa pun. `o.name` karena itu
// bisa bernilai apa saja — objek, angka, `null`, `undefined` — dan `any`
// membuat compiler diam sepanjang jalan. Nilai itu masuk ke kolom jsonb
// `Billboard.includes` apa adanya (jsonb menerima objek dan angka; tidak ada
// galat, tidak ada log), lalu dibaca kembali oleh halaman produk PUBLIK dan
// dirender sebagai `<span>{item}</span>` di
// `BillboardDetailClient.tsx`.
//
// React menolak objek sebagai anak elemen dengan melempar "Objects are not
// valid as a React child". Di halaman itu tidak ada komponen yang menangkapnya,
// jadi yang rusak bukan satu baris fasilitas — SELURUH halaman billboard mati
// untuk setiap pengunjung, sampai barisnya diperbaiki lewat database.
//
// Bentuk yang benar sudah ada tepat beberapa baris di bawahnya di kedua route
// itu: `body.gallery` disaring `typeof u === 'string'` dengan komentar yang
// menjelaskan risiko yang sama persis. `includes`/`excludes` hanya belum ikut.
// Modul ini menutup selisih itu di satu tempat, supaya kedua route tidak bisa
// lagi menyimpang satu dari yang lain.
//
// `=== true` / `=== false`, BUKAN truthy: opsi yang datang tanpa field
// `included` tidak masuk daftar mana pun. Perilaku ini disengaja dan sudah
// disamakan di kedua route — kalau `included` dibaca sebagai truthy, satu
// billboard bisa berubah daftar fasilitasnya hanya karena disimpan lewat jalur
// yang berbeda.

/** Batas panjang satu nama fasilitas. Ia tampil di halaman publik, bukan tempat
 *  menampung teks sepanjang megabyte. */
const PANJANG_NAMA_MAKS = 200;

/** Satu baris opsi fasilitas seperti yang dikirim form admin. */
export type OpsiBillboard = {
  name: string;
  included: boolean;
};

/**
 * Nama fasilitas yang layak disimpan, atau `null`.
 *
 * Yang ditolak: nilai bukan teks (objek, angka, `null`), teks yang hanya berisi
 * spasi, dan teks yang melewati batas panjang. Yang diterima dipangkas
 * spasinya.
 */
function namaOpsi(nilai: unknown): string | null {
  if (typeof nilai !== 'string') return null;

  const rapi = nilai.trim();
  if (rapi === '') return null;
  if (rapi.length > PANJANG_NAMA_MAKS) return null;

  return rapi;
}

/**
 * Pisahkan `body.adminOptions` menjadi dua daftar nama yang siap masuk jsonb.
 *
 * Menerima `unknown` — nilai mentah dari `req.json()` boleh diteruskan langsung
 * tanpa cast. Nilai yang bukan array menghasilkan dua daftar kosong, bukan
 * lemparan: bentuk permintaan yang salah dijawab pemanggilnya, dan billboard
 * tanpa daftar fasilitas adalah keadaan yang sah.
 *
 * Nama yang ditolak dicatat ke log server, tidak dibuang diam-diam: admin yang
 * fasilitasnya hilang dari halaman perlu bisa ditelusuri sebabnya.
 *
 * @param nilai   `body.adminOptions`, apa adanya.
 * @param context Label untuk log, mis. `"billboards/create"`.
 */
export function pisahkanOpsi(
  nilai: unknown,
  context?: string
): { includes: string[]; excludes: string[] } {
  if (!Array.isArray(nilai)) {
    return { includes: [], excludes: [] };
  }

  const includes: string[] = [];
  const excludes: string[] = [];
  let ditolak = 0;

  for (const baris of nilai) {
    // Elemen non-objek tidak punya field `included` maupun `name`; membacanya
    // lewat `?.` menghasilkan `undefined` dan baris itu terlewat sendiri, tapi
    // dihitung supaya tidak hilang tanpa jejak.
    if (baris === null || typeof baris !== 'object') {
      ditolak += 1;
      continue;
    }

    const isi = baris as { name?: unknown; included?: unknown };
    const nama = namaOpsi(isi.name);

    if (nama === null) {
      ditolak += 1;
      continue;
    }

    if (isi.included === true) includes.push(nama);
    else if (isi.included === false) excludes.push(nama);
    // `included` yang bukan boolean: baris diabaikan, sesuai catatan di kepala
    // berkas. Tidak dihitung sebagai ditolak — ia opsi sah yang tidak dipilih.
  }

  if (ditolak > 0) {
    console.error(
      `[opsi-billboard] ${ditolak} opsi fasilitas ditolak${context ? ` pada ${context}` : ''}: ` +
        `namanya bukan teks yang terpakai. Nilai seperti itu akan mematikan ` +
        `halaman billboard publik bila tersimpan.`
    );
  }

  return { includes, excludes };
}
