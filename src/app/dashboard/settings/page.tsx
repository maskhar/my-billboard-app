// src/app/dashboard/settings/page.tsx
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import AccountSettingsForm from "./AccountSettingsForm";
import DashboardLayout from "../DashboardLayout"; // Impor layout
import Link from "next/link"; // Impor Link
import { ChevronLeft } from "lucide-react"; // Impor ikon

export default async function AccountSettingsPage() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        redirect('/login');
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id }
    });

    if (!user) {
        redirect('/login');
    }
    
    // Create a plain, serializable object to pass to the client component
    const plainUser = {
        id: user.id,
        name: user.name ?? '',
        whatsapp: user.whatsapp ?? '',
        email: user.email, // email is not optional
    };

    return (
        <DashboardLayout>
            <div className="max-w-4xl mx-auto">
                <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4">
                    <ChevronLeft size={16} />
                    Kembali ke Dashboard
                </Link>
                <div className="space-y-2 mb-8">
                    <h1 className="text-3xl font-bold text-gray-800">Pengaturan Akun</h1>
                    <p className="text-gray-500">Perbarui informasi personal dan ganti password Anda.</p>
                </div>
                <AccountSettingsForm user={plainUser} />
            </div>
        </DashboardLayout>
    );
}
