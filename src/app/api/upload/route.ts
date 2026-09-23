// src/app/api/upload/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";

// Allowlist tipe file. Ekstensi diturunkan DARI tabel ini, bukan dari nama file
// yang dikirim client.
//
// Sebelumnya ekstensi diambil dengan `file.name.split('.').pop()` — nilai yang
// sepenuhnya dikendalikan penyerang. Karena berkas ditulis ke `public/`, file
// bernama `x.html` akan disajikan sebagai HTML oleh server statis dan
// script di dalamnya berjalan di origin aplikasi (stored XSS).
//
// `text/html` dan `image/svg+xml` sengaja TIDAK ada di sini: keduanya bisa
// memuat <script>. SVG sering dikira "sekadar gambar", padahal ia dokumen XML
// yang dieksekusi browser saat dibuka langsung.
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

// Magic number tiap format. MIME dari client (`file.type`) mudah dipalsukan,
// jadi isi berkas ikut diperiksa agar tipe yang diklaim benar-benar cocok.
function cocokkanTandaTangan(buffer: Buffer, mime: string): boolean {
  if (buffer.length < 12) return false;

  switch (mime) {
    case 'image/jpeg':
    case 'image/jpg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/png':
      return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/webp':
      return buffer.subarray(0, 4).toString('ascii') === 'RIFF'
        && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'application/pdf':
      return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    default:
      return false;
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ message: "Login dulu" }, { status: 401 });

  try {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      // orderId bersifat opsional: sejak nama file dibuat acak, nilai ini tidak
      // lagi dipakai untuk menyusun nama berkas. Bila dikirim, kepemilikannya
      // tetap diverifikasi di bawah.
      const orderId = formData.get("orderId");

      if (!file) return NextResponse.json({ message: "Data tidak lengkap" }, { status: 400 });

      // Limit 10MB
      if (file.size > MAX_BYTES) return NextResponse.json({ message: "File terlalu besar (Max 10MB)" }, { status: 400 });
      if (file.size === 0) return NextResponse.json({ message: "File kosong" }, { status: 400 });

      // Validasi tipe dari allowlist MIME.
      const ext = ALLOWED_TYPES[file.type];
      if (!ext) return NextResponse.json({ message: "Format harus Gambar (JPG/PNG/WEBP) atau PDF" }, { status: 400 });

      // Buat Buffer
      const buffer = Buffer.from(await file.arrayBuffer());

      // Pemeriksaan ulang ukuran setelah berkas benar-benar dibaca; `file.size`
      // berasal dari client dan bisa berbeda dari isi sebenarnya.
      if (buffer.length > MAX_BYTES) {
          return NextResponse.json({ message: "File terlalu besar (Max 10MB)" }, { status: 400 });
      }

      if (!cocokkanTandaTangan(buffer, file.type)) {
          return NextResponse.json({ message: "Isi file tidak cocok dengan formatnya" }, { status: 400 });
      }

      // Bila orderId disertakan, pastikan order itu memang milik pemanggil
      // (atau pemanggil adalah staf).
      if (typeof orderId === 'string' && orderId !== "") {
          const booking = await prisma.booking.findUnique({
              where: { id: orderId },
              select: { userId: true },
          });
          if (!booking) return NextResponse.json({ message: "Order tidak ditemukan" }, { status: 404 });

          const isStaf = ['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(session.user.role);
          if (!isStaf && booking.userId !== session.user.id) {
              return NextResponse.json({ message: "Forbidden" }, { status: 403 });
          }
      }

      // Nama file ACAK.
      //
      // Sebelumnya nama berkas adalah `DESIGN-{orderId}.{ext}` — bisa ditebak
      // sepenuhnya dari id order, sehingga siapa pun yang tahu id order lain
      // bisa menimpa berkas desain milik order itu. Nama acak menghapus
      // kemungkinan tabrakan sekaligus penimpaan yang disengaja.
      const filename = `${randomUUID()}.${ext}`;

      // Simpan di public/uploads/designs
      const uploadDir = path.join(process.cwd(), "public/uploads/designs");
      await mkdir(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, filename);

      await writeFile(filePath, buffer);

      return NextResponse.json({ url: `/uploads/designs/${filename}` });

  } catch (error) {
      return NextResponse.json({ message: "Gagal Upload" }, { status: 500 });
  }
}
