import CS_Sidebar, { type PenggunaSidebar } from "./CS_Sidebar";

// `session: any` dulu tertulis di sini, dan satu-satunya yang dilakukan berkas
// ini adalah meneruskan `session.user` ke sidebar. Dengan `any`, `session.usr`
// ikut lolos `tsc` dan sidebar menerima `undefined` — yang tidak melempar
// karena di sana pun bacanya `user?.name`, jadi CS melihat avatar bertuliskan
// "C" dan tooltip "Logged in as CS" seumur pemakaian, tanpa satu pun tanda
// bahwa namanya tidak pernah sampai.
export default function CS_Layout({
  children,
  session,
}: {
  children: React.ReactNode;
  session: { user: PenggunaSidebar };
}) {
    return (
        <div className="flex h-screen bg-white font-sans">
            <CS_Sidebar user={session.user} />
            <main className="flex-1 overflow-y-auto">
                {children}
            </main>
        </div>
    );
}
