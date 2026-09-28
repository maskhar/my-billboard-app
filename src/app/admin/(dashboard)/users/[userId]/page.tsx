// src/app/admin/(dashboard)/users/[userId]/page.tsx
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import UserProfileForm from './UserProfileForm';
import { sahRolePengguna, type PenggunaUntukForm } from '@/lib/tipe-pengguna';

// KTP dan NPWP adalah identitas kependudukan dan perpajakan. Sebelumnya
// keduanya dikirim utuh ke browser SETIAP admin yang membuka halaman ini,
// dan tersimpan apa adanya di HTML halaman. Satu akun ADMIN yang bocor =
// seluruh nomor KTP pelanggan ikut bocor.
//
// Sekarang hanya SUPER_ADMIN yang melihat angka penuh; peran lain melihat
// bentuk tersamar yang tetap cukup untuk mencocokkan berkas ("apakah ini
// orang yang sama?") tanpa menyalinnya.
function samarkan(nilai: string | null): string | null {
  if (!nilai) return nilai;
  const bersih = nilai.trim();
  if (bersih.length <= 4) return '•'.repeat(bersih.length);
  return '•'.repeat(bersih.length - 4) + bersih.slice(-4);
}

interface PageProps {
  params: {
    userId: string;
  };
}


export default async function UserProfilePage({ params }: PageProps) {
  // In recent Next.js versions, params can be a promise. We must await it.
  const resolvedParams = await params;
  const { userId } = resolvedParams;

  // Baris `console.log` sisa debug dihapus: ia mencetak pengenal akun ke log
  // pada setiap kunjungan halaman profil.
  if (!userId || typeof userId !== 'string') {
    // Params yang sudah di-await belum tentu memuat userId yang sah.
    // `notFound()`, bukan `throw`: id yang tidak sah adalah URL yang salah,
    // bukan kerusakan server — dan pesan galatnya dulu ikut mencetak nilainya.
    notFound();
  }

  // Kolomnya dipilih satu per satu. Tanpa `select`, `findUnique` memulangkan
  // SELURUH baris — termasuk hash password, `xenditCustomerId`, dan setiap
  // kolom yang ditambahkan ke tabel kemudian — ke memori proses hanya untuk
  // merender sebelas isian. Daftar di bawah adalah tepat apa yang dipakai.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      whatsapp: true,
      companyName: true,
      ktp: true,
      npwp: true,
      ktpAddress: true,
      officeAddress: true,
      username: true,
      authProvider: true,
      isVerified: true,
    },
  });

  if (!user) {
    notFound();
  }

  const session = await getServerSession(authOptions);
  const bolehLihatIdentitas = session?.user?.role === 'SUPER_ADMIN';

  // Objek yang bisa diserialisasi untuk komponen client — `DateTime` tidak
  // pernah ikut.
  //
  // Bertipe `PenggunaUntukForm`, BUKAN `as any`. Sebelumnya objek ini
  // diserahkan sebagai `plainUser as any` kepada form yang menuntut
  // `User & { identitasTersamar?: boolean }`, yaitu tipe baris LENGKAP
  // termasuk `password` dan `createdAt` — kolom yang tidak pernah ada di sini.
  // Tuntutan tipenya bohong, dan `as any` yang menutupinya: form boleh membaca
  // `user.password` dan TypeScript menyetujuinya walaupun nilainya `undefined`
  // saat dijalankan. Sekarang kolom yang tidak dikirim menjadi galat kompilasi.
  const plainUser: PenggunaUntukForm = {
    id: user.id,
    name: user.name ?? null,
    email: user.email, // email is not optional in schema
    image: user.image ?? null,
    // Nilai dari database sudah pasti anggota `enum Role`; guard-nya dipasang
    // karena tipe di sisi client adalah union teks tersendiri, dan `USER`
    // adalah satu-satunya cadangan yang tidak menaikkan hak akses siapa pun.
    role: sahRolePengguna(user.role) ? user.role : 'USER',
    whatsapp: user.whatsapp ?? null,
    companyName: user.companyName ?? null,
    ktp: bolehLihatIdentitas ? (user.ktp ?? null) : samarkan(user.ktp ?? null),
    npwp: bolehLihatIdentitas ? (user.npwp ?? null) : samarkan(user.npwp ?? null),

    // Form perlu tahu apakah nilai yang ia pegang asli atau samaran. Tanpa
    // penanda ini, admin biasa akan menyimpan kembali string bertitik-titik
    // itu ke database dan menimpa nomor aslinya — kerusakan permanen yang
    // terlihat seperti penyimpanan biasa yang berhasil.
    identitasTersamar: !bolehLihatIdentitas,
    ktpAddress: user.ktpAddress ?? null,
    officeAddress: user.officeAddress ?? null,
    username: user.username ?? null,
    authProvider: user.authProvider,
    isVerified: user.isVerified,
    // We don't need OTP fields in the form, so we omit them.
    // We also don't need createdAt.
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Edit User Profile</h1>
        <p className="text-gray-500 text-sm">Update business and account details for {user.name || user.email}.</p>
      </div>
      <UserProfileForm user={plainUser} />
    </div>
  );
}
