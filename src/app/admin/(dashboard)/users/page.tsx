// src/app/admin/(dashboard)/users/page.tsx
import { prisma } from '@/lib/prisma';
import UserClientPage from './UserClientPage';

export default async function ManageUsersPage() {
  
  const users = await prisma.user.findMany({
      include: { bookings: true },
      orderBy: { createdAt: 'desc' }
  });

  // Data tanggal tidak bisa langsung di-pass ke Client Component, perlu di-serialize
  const serializableUsers = users.map(user => ({
    ...user,
    createdAt: user.createdAt.toISOString(),
    // Pastikan semua field Date atau non-serializable lainnya diubah di sini
    otpExpires: user.otpExpires ? user.otpExpires.toISOString() : null,
  }));

  return <UserClientPage users={serializableUsers} />;
}