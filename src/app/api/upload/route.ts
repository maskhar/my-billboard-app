import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

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
        // Ada orderId (mis. upload desain pesanan): nama file lama
        // DESIGN-{OrderId}.ext, sehingga file lama tertimpa saat upload ulang.
        // Karakter selain angka/huruf dibuang supaya orderId tidak bisa
        // menyuntik path (mis. "../../").
        const safeOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, "");
        if (!safeOrderId) return NextResponse.json({ message: "Data tidak lengkap" }, { status: 400 });
        filename = `DESIGN-${safeOrderId}${ext}`;
      } else {
        // Tanpa orderId (mis. foto cover/galeri billboard, bukti tayang):
        // nama unik supaya tiap upload menghasilkan file terpisah.
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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