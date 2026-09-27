// prisma/set-admin.ts
//
// `import`, bukan `require`: dengan `require` saja berkas ini bukan modul bagi
// TypeScript, jadi `PrismaClient`, `prisma`, dan `main` hidup di lingkup global
// yang SAMA dengan `prisma/seed.ts` — dan keduanya mendeklarasikan ketiga nama
// itu. Hasilnya enam galat `tsc` (TS2451/TS2393) yang menyamarkan galat asli:
// gerbang `tsc` yang selalu merah adalah gerbang yang berhenti dibaca orang.
//
// Email target dibaca dari argumen atau env, bukan ditulis tetap di kode.
// Sebelumnya "admin@gmail.com" tertulis di sini dengan komentar "GANTI DENGAN
// EMAIL YANG KAMU PAKAI LOGIN" — skrip yang menaikkan hak akses dan bergantung
// pada pembacanya ingat mengedit kode dulu. Yang lupa mengedit menaikkan akun
// orang lain menjadi ADMIN, atau gagal dengan galat Prisma yang tidak
// menjelaskan apa pun.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const emailTarget = process.argv[2] || process.env.ADMIN_EMAIL_TARGET;

  if (!emailTarget) {
    console.error('❌ Email tidak diberikan.');
    console.error('   Jalankan: npx ts-node prisma/set-admin.ts email@anda.com');
    console.error('   atau setel ADMIN_EMAIL_TARGET di environment.');
    process.exit(1);
  }

  const user = await prisma.user.update({
    where: { email: emailTarget },
    data: { role: 'ADMIN' },
  });

  console.log(`✅ Sukses! User ${user.name} (${user.email}) sekarang adalah ADMIN.`);
}

main()
  // `process.exit(1)`: tanpa ini skrip yang gagal — mis. email tidak ada di
  // database — tetap keluar dengan kode 0, dan pemanggilnya (atau CI) membaca
  // kegagalan itu sebagai keberhasilan.
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => await prisma.$disconnect());