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
            {/* Lewati ke isi. Rel ikon CS selalu tampak di segala lebar layar
                (tidak `hidden md:flex` seperti sidebar admin), jadi tautannya
                berguna di ponsel maupun desktop. Gayanya di `globals.css`. */}
            <a href="#isi-cs" className="lewati-ke-isi">
                Lewati ke isi halaman
            </a>
            <CS_Sidebar user={session.user} />
            {/* `tabIndex={-1}` wajib pada sasaran tautan lewati: tanpa itu fokus
                papan tombol tertinggal di tautannya. */}
            <main id="isi-cs" tabIndex={-1} className="flex-1 overflow-y-auto">
                {children}
            </main>
        </div>
    );
}
