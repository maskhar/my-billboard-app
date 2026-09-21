// src/app/admin/(dashboard)/users/[userId]/page.tsx
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import UserProfileForm from './UserProfileForm';

interface PageProps {
  params: {
    userId: string;
  };
}


export default async function UserProfilePage({ params }: PageProps) {
  // In recent Next.js versions, params can be a promise. We must await it.
  const resolvedParams = await params;
  const { userId } = resolvedParams;

  console.log('Successfully extracted userId:', userId);

  if (!userId || typeof userId !== 'string') {
    // This check is still useful in case the awaited params don't contain a valid userId.
    throw new Error(`Invalid or missing userId after awaiting params: ${userId}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    notFound();
  }

  // Create a serializable user object to pass to the client component.
  // This prevents passing non-serializable types like `DateTime`.
  const plainUser = {
    id: user.id,
    name: user.name ?? null,
    email: user.email, // email is not optional in schema
    image: user.image ?? null,
    role: user.role,
    whatsapp: user.whatsapp ?? null,
    companyName: user.companyName ?? null,
    ktp: user.ktp ?? null,
    npwp: user.npwp ?? null,
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
      <UserProfileForm user={plainUser as any} />
    </div>
  );
}
