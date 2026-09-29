// src/app/admin/layout.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

// [PEMBARUAN] Impor komponen-komponen layout
import CS_Layout from "../_components/cs/CS_Layout"; // Layout Baru untuk CS
import AdminShell, { type MenuAdmin } from "../_components/AdminShell";
import { ShieldAlert } from 'lucide-react';
import { Role } from "@/lib/enum-guard";

// Bentuk yang BENAR-BENAR dibaca kedua layout di bawah, bukan `any`.
//
// `session: any` di sini bukan kelonggaran tipe — ia mematikan satu-satunya
// pemeriksaan yang berlaku atas `session.user.role`. `src/types/next-auth.d.ts`
// sengaja mengetik `role` sebagai enum `Role` dari Prisma supaya salah tulis
// seperti `'ADMINN'` gagal di `tsc`; `any` di parameter ini mengembalikan
// kelonggaran itu tepat di layar yang memutuskan siapa boleh masuk. Dan
// `session.user.nama` (bukan `name`) dulu lolos juga, lalu tampil sebagai
// avatar tanpa huruf.
//
// Ditulis sebagai himpunan bagian, bukan `Session` dari next-auth: hanya empat
// kolom ini yang dibaca, dan `Session` membawa `expires` beserta seluruh isi
// `user` yang tidak relevan di sini. Objek `Session` sungguhan tetap diterima
// karena TypeScript mencocokkan bentuk.
type SesiLayout = {
  user: {
    role: Role;
    name?: string | null;
    email?: string | null;
  };
};

// `MenuAdmin` sekarang datang dari `AdminShell`, dan ikonnya berupa KUNCI TEKS
// (`'transaksi'`, `'users'`, …), bukan komponen lucide-react.
//
// Berkas ini adalah Server Component. Komponen ikon adalah fungsi, dan fungsi
// tidak bisa diserialisasi melewati batas server→client: mengirimnya sebagai
// prop ke shell yang `'use client'` membuat render gagal saat dijalankan, bukan
// saat `tsc`. Pemetaan kunci→komponen karena itu tinggal di dalam `AdminShell`,
// dan yang menyeberang hanya teks biasa.

// [OPSIONAL] Komponen untuk menjaga konsistensi
const AccessDenied = ({ session }: { session: SesiLayout }) => (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-50 font-sans p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl text-center border border-gray-100 max-w-md">
            <ShieldAlert className="w-20 h-20 text-red-500 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-gray-800">Akses Ditolak</h2>
            <div className="bg-red-50 text-red-600 text-sm font-semibold p-3 rounded-lg mt-4 border border-red-200">
                Role Akun: {session.user.role} (Tidak diizinkan)
            </div>
            <p className="text-gray-500 mt-4 text-sm leading-relaxed">
                Mohon maaf, akun Anda <b>{session.user.email}</b> tidak memiliki izin untuk mengakses Panel Admin ini.
            </p>
            <div className="flex flex-col gap-3 mt-8">
                <Link href="/dashboard" className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition shadow-lg">
                    Ke Dashboard User
                </Link>
                <Link href="/" className="w-full py-3 text-gray-500 font-bold hover:text-utero transition">
                    Kembali ke Home
                </Link>
            </div>
        </div>
    </div>
);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/admin/login');
  }

    const userRole = session.user.role;

  // Daftar ini dulu hanya ADMIN dan SUPER_ADMIN, padahal middleware.ts
  // meloloskan CS dan OPERATOR ke /admin. Akibatnya keduanya berhenti di
  // halaman "Akses Ditolak" — dan cabang `userRole === 'CS'` beberapa baris
  // di bawah tidak pernah tercapai sama sekali, membuat seluruh layout CS
  // menjadi kode mati. Daftar di sini kini sama dengan ADMIN_ROLES di
  // middleware.ts; keduanya harus tetap seiring.
  const allowedRoles: Role[] = [Role.ADMIN, Role.SUPER_ADMIN, Role.CS, Role.OPERATOR];

  if (!userRole || !allowedRoles.includes(userRole)) {
      return <AccessDenied session={session} />;
  }

  // === LOGIKA PERCABANGAN LAYOUT ===
  if (userRole === 'CS') {
      return <CS_Layout session={session}>{children}</CS_Layout>;
  }

  // --- Untuk Role Selain CS ---
  let menus: MenuAdmin[] = [
      { name: "Overview", ikon: "overview", link: "/admin" },
      { name: "Transaksi", ikon: "transaksi", link: "/admin/orders" },
      { name: "Inventory Billboard", ikon: "inventory", link: "/admin/billboards" },
      // Kalender ikut ditampilkan ke OPERATOR: halamannya digerbangi
      // `PERAN_PEMBACA_PESANAN`, yang memuat OPERATOR, dan menjadwalkan
      // pemasangan adalah pekerjaannya. Ia tidak disaring di bawah bersama
      // `/admin/billboards` karena kalender tidak menyunting inventori.
      { name: "Kalender Ketersediaan", ikon: "kalender", link: "/admin/calendar" },
      { name: "Pengajuan Titik", ikon: "pengajuan", link: "/admin/pengajuan" },
      { name: "Manage Users", ikon: "users", link: "/admin/users" },
      { name: "Live Chat CS", ikon: "chat", link: "/admin/live-chat" },
  ];

  // OPERATOR menangani chat dan pesanan, bukan inventaris atau daftar akun.
  // Menu yang tidak boleh ia buka tidak ditampilkan; pembatasan sebenarnya
  // tetap ada di masing-masing route API, bukan di daftar menu ini.
  //
  // `/admin/pengajuan` ikut disembunyikan dari OPERATOR karena penulisnya,
  // `/api/admin/pengajuan-titik`, hanya menerima ADMIN dan SUPER_ADMIN:
  // menolak penawaran lahan adalah keputusan komersial. Menu yang membuka
  // halaman yang tombolnya selalu gagal lebih buruk daripada menu yang tidak
  // ada.
  if (userRole === 'OPERATOR') {
      menus = menus.filter(m => m.link !== '/admin/billboards' && m.link !== '/admin/users' && m.link !== '/admin/pengajuan');
  }

  if (userRole === 'SUPER_ADMIN') {
      menus.push({ name: "Pengaturan Website", ikon: "pengaturan", link: "/admin/settings" });
  }

  // Hanya nama dan peran yang diserahkan ke shell, bukan seluruh objek sesi.
  // Sesi NextAuth memuat id, email, dan apa pun yang ditambahkan callback di
  // kemudian hari; shell adalah Client Component, jadi setiap kolom yang
  // diserahkan ikut tertanam di HTML yang terkirim ke browser.
  return (
    <AdminShell menus={menus} nama={session.user.name ?? null} peran={userRole}>
      {children}
    </AdminShell>
  );
}

