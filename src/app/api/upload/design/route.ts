// src/app/api/upload/design/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { writeFile, mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";

// Allowlist tipe file. Ekstensi diturunkan DARI tabel ini, bukan dari nama file
// yang dikirim client.
//
// Sebelumnya ekstensi diambil dengan `file.name.split('.').pop() || "png"` —
// nilai yang sepenuhnya dikendalikan penyerang. Karena berkas ditulis ke
// `public/`, file bernama `x.html` akan disajikan sebagai HTML oleh server
// statis dan script di dalamnya berjalan di origin aplikasi (stored XSS).
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

// Batas unggahan per pengguna — alasan lengkapnya di `api/upload/route.ts`,
// yang menulis ke direktori yang sama. Kuncinya dibedakan supaya kedua route
// tidak saling menghabiskan kuota.
const BATAS_UNGGAH = 20;
const JENDELA_UNGGAH_MS = 10 * 60 * 1000;

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
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ message: "Login required" }, { status: 401 });
    }

    // Diperiksa SEBELUM `req.formData()`: membaca body berarti menerima 10 MB ke
    // memori proses, jadi menolak setelahnya tidak menghemat apa pun.
    const batas = rateLimit({
      key: `unggah-desain:${session.user.id}`,
      limit: BATAS_UNGGAH,
      windowMs: JENDELA_UNGGAH_MS,
    });

    if (!batas.success) {
      return NextResponse.json(
        { message: `Terlalu banyak unggahan. Coba lagi dalam ${batas.retryAfterSeconds} detik.` },
        { status: 429, headers: rateLimitHeaders(BATAS_UNGGAH, batas) }
      );
    }

    // Ambil Data dengan aman
    const formData = await req.formData().catch(() => null);
    if(!formData) {
        return NextResponse.json({ message: "Form data corrupt/kosong" }, { status: 400 });
    }

    const file = formData.get("file") as File;
    const orderId = formData.get("orderId");

    if (!file || typeof orderId !== 'string' || orderId === "") {
        return NextResponse.json({ message: "File atau Order ID tidak ditemukan" }, { status: 400 });
    }

    // Verifikasi kepemilikan order sebelum menerima berkas apa pun.
    // Tanpa ini, pengguna mana pun yang sudah login bisa mengunggah desain
    // ke order milik orang lain.
    const booking = await prisma.booking.findUnique({
        where: { id: orderId },
        select: { userId: true },
    });
    if (!booking) {
        return NextResponse.json({ message: "Order tidak ditemukan" }, { status: 404 });
    }

    const isStaf = ['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(session.user.role);
    if (!isStaf && booking.userId !== session.user.id) {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    // Validasi Ukuran (10 MB)
    if (file.size > MAX_BYTES) {
        return NextResponse.json({ message: "File terlalu besar (Max 10MB)" }, { status: 400 });
    }
    if (file.size === 0) {
        return NextResponse.json({ message: "File kosong" }, { status: 400 });
    }

    // Validasi tipe dari allowlist MIME; ekstensi diambil dari allowlist.
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
        return NextResponse.json({ message: "Format harus Gambar (JPG/PNG/WEBP) atau PDF." }, { status: 400 });
    }

    // --- PROSES SIMPAN KE DISK ---

    const buffer = Buffer.from(await file.arrayBuffer());

    // Pemeriksaan ulang ukuran setelah berkas benar-benar dibaca; `file.size`
    // berasal dari client dan bisa berbeda dari isi sebenarnya.
    if (buffer.length > MAX_BYTES) {
        return NextResponse.json({ message: "File terlalu besar (Max 10MB)" }, { status: 400 });
    }

    if (!cocokkanTandaTangan(buffer, file.type)) {
        return NextResponse.json({ message: "Isi file tidak cocok dengan formatnya" }, { status: 400 });
    }

    // Tentukan Lokasi Folder (Gunakan Absolute Path agar tidak salah)
    const uploadDir = path.join(process.cwd(), "public/uploads/designs");

    // 1. Buat folder jika belum ada (Recursive = Aman)
    try {
        await mkdir(uploadDir, { recursive: true });
    } catch (err) {
        console.error("Gagal buat folder:", err);
    }

    // 2. Nama file ACAK.
    //
    // Sebelumnya nama berkas adalah `DESIGN-{orderId}-{timestamp}.{ext}` —
    // dapat ditebak dari id order, sehingga desain milik order lain bisa
    // ditimpa. Nama acak menghapus kemungkinan penimpaan yang disengaja
    // sekaligus tabrakan nama.
    const filename = `${randomUUID()}.${ext}`;
    const filePath = path.join(uploadDir, filename);

    // 3. Tulis File
    //
    // Jalur absolut tidak lagi dicatat: `${filePath}` memuat struktur direktori
    // server apa adanya, dan log produksi bukan tempatnya.
    await writeFile(filePath, buffer);

    // Kembalikan URL publik
    const publicUrl = `/uploads/designs/${filename}`;
    return NextResponse.json(
      { url: publicUrl, message: "Sukses Upload!" },
      { headers: rateLimitHeaders(BATAS_UNGGAH, batas) }
    );

  } catch (error) {
      // Objek galat tidak dicatat mentah: galat filesystem membawa jalur
      // absolut, galat Prisma membawa query beserta nilai kolomnya.
      const kategori = error instanceof Error ? error.name.slice(0, 80) : 'galat-tidak-dikenal';
      console.error(`[upload-design] gagal memproses unggahan: ${kategori}`);
      // Pesan error internal tidak dibocorkan ke client.
      return NextResponse.json({ message: "Gagal memproses upload." }, { status: 500 });
  }
}
