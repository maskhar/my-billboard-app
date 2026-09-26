// src/app/api/admin/billboards/create/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { keDecimal, lebihBesar } from "@/lib/money";
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
    // Data dari Form (sizeH, sizeW, lighting) kita bungkus jadi satu paket 'specs'
    //
    // TANPA `JSON.stringify`: kolomnya bertipe jsonb, jadi array ini masuk apa
    // adanya. Membungkusnya dengan `JSON.stringify` TIDAK akan ditolak compiler
    // — tipe `InputJsonValue` milik Prisma memuat `string` — dan yang tersimpan
    // jadi sebuah teks JSON di dalam jsonb (ganda-encode). Database menerimanya,
    // tidak ada error, tapi pembacanya melihat teks alih-alih array.
    const packedSpecs = [
        { label: "Ukuran", value: `${body.sizeH || 0}m x ${body.sizeW || 0}m` },
        { label: "Luas Area", value: `${(Number(body.sizeH) * Number(body.sizeW)).toFixed(1)} m²` },
        { label: "Layout / Orientasi", value: body.orientation || "-" },
        { label: "Tampilan", value: body.sides ? `${body.sides} Sisi` : "-" },
        { label: "Jenis Penerangan", value: body.lighting || "-" },
        { label: "Material", value: body.material || "-" },
    ];

    // 3. [LOGIC BARU] MEMISAHKAN INCLUDE & EXCLUDE
    // Dari checklist form, kita pisahkan mana yang True (Include) dan False (Exclude)
    // Pastikan body.adminOptions berbentuk Array, jika tidak fallback ke []
    const options = Array.isArray(body.adminOptions) ? body.adminOptions : [];
    
    const includesList = options
        .filter((opt: any) => opt.included === true)
        .map((opt: any) => opt.name);
        
    const excludesList = options
        .filter((opt: any) => opt.included === false)
        .map((opt: any) => opt.name);

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

    // 5. SIMPAN KE DATABASE
    const newBillboard = await prisma.billboard.create({
        data: {
            title: body.title,
            slug: body.slug || `billboard-${Date.now()}`, // Fallback slug jika kosong
            sku: body.sku || "NO-SKU",
            address: body.address || "Alamat belum diisi",
            type: body.type || "Baliho",
            
            // Koordinat memang Float; harga tidak (lihat 4b di atas).
            price: harga,
            lat: Number(body.lat) || -7.9,
            lng: Number(body.lng) || 112.6,

            status,
            publishStatus,
            mainImage: body.mainImage || "",
            
            // Keempat kolom di bawah bertipe jsonb — array masuk apa adanya,
            // tanpa `JSON.stringify` (lihat catatan di bagian 2).
            specs: packedSpecs,
            includes: includesList,
            excludes: excludesList,
            gallery: galeri,
            
            smartsucoUrl: body.smartsucoUrl, // Link Trafik
            
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