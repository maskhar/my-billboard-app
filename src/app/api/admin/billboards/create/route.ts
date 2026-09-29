// src/app/api/admin/billboards/create/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { keDecimal, lebihBesar } from "@/lib/money";
import { pisahkanOpsi } from "@/lib/opsi-billboard";
import { susunSpecs } from "@/lib/spesifikasi-billboard";
import {
  LAT_DEFAULT,
  LNG_DEFAULT,
  koordinat,
  teksBillboard,
} from "@/lib/bidang-billboard";
import {
  BillboardStatus,
  PublishStatus,
  daftarNilai,
  sahBillboardStatus,
  sahPublishStatus,
} from "@/lib/enum-guard";

export async function POST(req: Request) {
  try {
    // 1. Cek Apakah User adalah Admin
    //
    // Syaratnya dulu `role !== 'ADMIN'`, yang justru MENOLAK `SUPER_ADMIN`:
    // pemegang peran tertinggi tidak bisa menambah billboard sama sekali dan
    // hanya menerima "Akses Ditolak". Dua puluh route admin lain sudah memakai
    // bentuk daftar di bawah — kesalahan yang sama pernah diperbaiki di
    // `admin/users/delete/route.ts`.
    const session = await getServerSession(authOptions);
    if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
        return NextResponse.json({ message: "Akses Ditolak" }, { status: 401 });
    }

    const body = await req.json();

    // 2. MENYUSUN SPESIFIKASI JADI SATU PAKET
    //
    // Satu fungsi bersama dengan `update/route.ts`, dengan alasan yang sama
    // seperti `pisahkanOpsi` di bawah: keenam barisnya dulu ditulis dua kali,
    // dan salah satunya diberi komentar "SAMA SEPERTI CREATE" — pengakuan bahwa
    // keduanya rumus kembar yang harus dijaga sepakat dengan tangan.
    //
    // Tiga dari enam baris itu dulu meneruskan `body.orientation`,
    // `body.lighting`, dan `body.material` APA ADANYA. Nilai bukan teks
    // tersimpan ke jsonb tanpa keluhan, lalu dirender sebagai `{spec.value}` di
    // halaman billboard publik — dan objek sebagai anak elemen React melempar
    // tanpa ada komponen yang menangkapnya. Lihat
    // `src/lib/spesifikasi-billboard.ts`.
    //
    // TANPA `JSON.stringify`: kolomnya bertipe jsonb, jadi array ini masuk apa
    // adanya. Membungkusnya dengan `JSON.stringify` TIDAK akan ditolak compiler
    // — tipe `InputJsonValue` milik Prisma memuat `string` — dan yang tersimpan
    // jadi sebuah teks JSON di dalam jsonb (ganda-encode). Database menerimanya,
    // tidak ada error, tapi pembacanya melihat teks alih-alih array.
    const packedSpecs = susunSpecs(body, 'billboards/create');

    // 3. MEMISAHKAN INCLUDE & EXCLUDE
    //
    // Nama fasilitasnya dipastikan berupa teks di `pisahkanOpsi`, bukan diambil
    // apa adanya dari body. Alasannya sama dengan galeri di bawah — isinya masuk
    // ke jsonb tanpa ditolak database, lalu dirender di halaman produk publik —
    // dan akibatnya lebih parah: objek sebagai anak elemen React melempar, dan
    // di halaman itu tidak ada komponen yang menangkapnya, jadi seluruh halaman
    // billboard mati untuk setiap pengunjung.
    const { includes: includesList, excludes: excludesList } = pisahkanOpsi(
        body.adminOptions,
        'billboards/create'
    );

    // 4. SUSUN GALERI
    //
    // Isinya masuk ke jsonb apa adanya, dan setiap URL di dalamnya kemudian
    // dirender sebagai atribut `src` gambar di halaman produk publik. `body`
    // berasal dari `req.json()` dan tidak bertipe apa pun, jadi bentuknya
    // dipastikan di sini: hanya elemen bertipe teks yang diterima. Tanpa
    // penyaringan ini, objek atau angka yang diselipkan ke dalam array akan
    // tersimpan dan baru terasa sebagai gambar rusak di halaman pembeli.
    const galeri: string[] = Array.isArray(body.gallery)
        ? body.gallery.filter((u: unknown): u is string => typeof u === 'string' && u.trim() !== "")
        : [];

    // 4b. PERIKSA NILAI DARI FORM SEBELUM MENYENTUH DATABASE
    //
    // Harga: `Number(body.price)` mengubah "" menjadi 0 dan "12jt" menjadi
    // NaN. NaN ditolak kolom Decimal dan muncul ke admin sebagai "Gagal
    // menyimpan data" tanpa keterangan, setelah seluruh form diisi.
    const harga = keDecimal(body.price);
    if (!lebihBesar(harga, 0)) {
        return NextResponse.json(
            { message: "Harga sewa harus diisi dengan angka lebih dari 0" },
            { status: 400 }
        );
    }

    // Status: dua kolom di bawah bertipe enum. Nilai asing ditolak database
    // di lapisan paling dalam; diperiksa di sini supaya pesannya menyebut
    // nilai apa yang sah.
    const status = body.status || BillboardStatus.Available;
    if (!sahBillboardStatus(status)) {
        return NextResponse.json(
            { message: `Status tidak dikenal. Pilihan: ${daftarNilai(BillboardStatus)}` },
            { status: 400 }
        );
    }

    const publishStatus = body.publishStatus || PublishStatus.DRAFT;
    if (!sahPublishStatus(publishStatus)) {
        return NextResponse.json(
            { message: `Status publikasi tidak dikenal. Pilihan: ${daftarNilai(PublishStatus)}` },
            { status: 400 }
        );
    }

    // 4c. KOLOM TEKS DAN KOORDINAT
    //
    // `title` dulu ditulis `body.title` TANPA fallback, sementara sembilan
    // tetangganya punya. Permintaan tanpa `title` karena itu menulis `undefined`
    // ke kolom String non-null, Prisma menolaknya, dan admin melihat "Gagal
    // menyimpan data" tanpa keterangan setelah seluruh form diisi. Di sini ia
    // menjadi 400 yang menyebut bidangnya — satu-satunya bidang teks yang tidak
    // punya nilai baku yang masuk akal.
    const title = teksBillboard(body.title);
    if (title === null) {
        return NextResponse.json({ message: "Judul billboard wajib diisi." }, { status: 400 });
    }

    // Sisanya memakai nilai baku yang sudah ada sebelumnya, hanya lewat penjaga
    // tipe: `body.sku` yang berisi objek dulu lolos `||` (objek itu truthy) lalu
    // ditolak Prisma sebagai 500. `smartsucoUrl` boleh `null` — kolomnya
    // opsional, dan billboard tanpa tautan trafik itu hal biasa.
    const sku = teksBillboard(body.sku) ?? "NO-SKU";
    const address = teksBillboard(body.address) ?? "Alamat belum diisi";
    const type = teksBillboard(body.type) ?? "Baliho";
    const mainImage = teksBillboard(body.mainImage) ?? "";
    const smartsucoUrl = teksBillboard(body.smartsucoUrl);
    const slug = teksBillboard(body.slug) ?? `billboard-${Date.now()}`;

    // 5. SIMPAN KE DATABASE
    const newBillboard = await prisma.billboard.create({
        data: {
            title,
            slug,
            sku,
            address,
            type,

            // Koordinat memang Float; harga tidak (lihat 4b di atas).
            //
            // `koordinat()` menolak `NaN` dan `Infinity` — keduanya bertipe
            // number dan keduanya ditolak kolom Float. `?? DEFAULT` menjaga
            // perilaku `|| -7.9` yang sudah ada, tanpa ikut menolak nol.
            price: harga,
            lat: koordinat(body.lat) ?? LAT_DEFAULT,
            lng: koordinat(body.lng) ?? LNG_DEFAULT,

            status,
            publishStatus,
            mainImage,

            // Keempat kolom di bawah bertipe jsonb — array masuk apa adanya,
            // tanpa `JSON.stringify` (lihat catatan di bagian 2).
            specs: packedSpecs,
            includes: includesList,
            excludes: excludesList,
            gallery: galeri,

            smartsucoUrl, // Link Trafik

            // Jejak Audit
            createdById: session.user.id,
            updatedById: session.user.id
        }
    });

    return NextResponse.json({ message: "Billboard Berhasil Dibuat", id: newBillboard.id });

  } catch (error) {
      console.error("Create Error:", error);
      return NextResponse.json({ message: "Gagal menyimpan data" }, { status: 500 });
  }
}