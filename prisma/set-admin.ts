// prisma/set-admin.ts
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emailTarget = "admin@gmail.com"; // GANTI DENGAN EMAIL YANG KAMU PAKAI LOGIN

  const user = await prisma.user.update({
    where: { email: emailTarget },
    data: { role: 'ADMIN' },
  });

  console.log(`✅ Sukses! User ${user.name} (${user.email}) sekarang adalah ADMIN.`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());