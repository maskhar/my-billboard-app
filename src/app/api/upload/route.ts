import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

// Ekstensi yang diizinkan HARUS cocok dengan MIME yang dikirim. Jangan percaya
// salah satu saja: `file.type` berasal dari client, dan nama file juga bisa
// dipalsukan. Dengan mencocokkan keduanya, file `.html`/`.svg` yang dikirim
// sebagai `image/png` tidak bisa lolos lalu disajikan sebagai HTML di origin
// yang sama (stored XSS). Daftar ekstensi ini sama dengan ALLOWED_EXT di
// backend/src/uploads/uploads.controller.ts.
const ALLOWED_EXT_BY_MIME: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ message: "Login dulu" }, { status: 401 });

  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(session.user.role);

  try {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      const orderId = formData.get("orderId") as string | null; // Opsional

      if (!file) return NextResponse.json({ message: "Data tidak lengkap" }, { status: 400 });
      
      // Limit 10MB
      if (file.size > 10 * 1024 * 1024) return NextResponse.json({ message: "File terlalu besar (Max 10MB)" }, { status: 400 });

      // Validasi ekstensi + MIME: keduanya harus diizinkan DAN saling cocok.
      const ext = path.extname(file.name).toLowerCase();
      const allowedExts = ALLOWED_EXT_BY_MIME[file.type];
      if (!allowedExts || !allowedExts.includes(ext)) {
          return NextResponse.json(
              { message: "Format harus Gambar (JPG/JPEG/PNG/WEBP) atau PDF" },
              { status: 400 }
          );
      }

      // Buat Buffer
      const buffer = Buffer.from(await file.arrayBuffer());
      
      let filename: string;
      if (orderId) {
        // Ada orderId (mis. upload desain pesanan): cek pemilik order.
        const safeOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, "");
        if (!safeOrderId) return NextResponse.json({ message: "Data tidak lengkap" }, { status: 400 });

        const order = await prisma.booking.findUnique({
          where: { id: safeOrderId },
          select: { userId: true },
        });
        if (!order) return NextResponse.json({ message: "Order tidak ditemukan" }, { status: 404 });
        if (order.userId !== session.user.id && !isAdmin) {
          return NextResponse.json({ message: "Order ini bukan milik Anda" }, { status: 403 });
        }

        // Tambah bagian acak supaya file lama tidak tertimpa dan nama tidak mudah ditebak.
        filename = `DESIGN-${safeOrderId}-${crypto.randomBytes(4).toString('hex')}${ext}`;
      } else {
        // Tanpa orderId (mis. foto cover/galeri billboard, bukti tayang):
        // hanya admin yang boleh upload generik; nama unik supaya tiap upload
        // menghasilkan file terpisah.
        if (!isAdmin) {
          return NextResponse.json({ message: "Akses ditolak" }, { status: 403 });
        }
        const unique = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        filename = `UPLOAD-${unique}${ext}`;
      }
      
      // Simpan di public/uploads/designs
      const uploadDir = path.join(process.cwd(), "public/uploads/designs");
      await mkdir(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, filename);

      await writeFile(filePath, buffer);

      return NextResponse.json({ url: `/uploads/designs/${filename}` });

  } catch (error) {
      console.error('[upload] Gagal upload:', error);
      return NextResponse.json({ message: "Gagal Upload" }, { status: 500 });
  }
}