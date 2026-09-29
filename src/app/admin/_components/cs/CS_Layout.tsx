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
            {/* `overflow-y-auto` DIPERTAHANKAN: `<main>` ini menampung seluruh
                halaman CS, bukan hanya kotak masuk chat, dan yang panjang
                memang perlu digulung.

                `min-w-0 min-h-0` yang ditambahkan. `flex-1` saja tidak menahan
                apa pun — tinggi dan lebar minimum bawaan item flex adalah
                `auto`, yaitu setinggi/selebar isinya — sehingga isi yang
                panjang melebarkan `<main>` melewati layar alih-alih
                menggulung di dalamnya, dan rel ikon di sebelahnya ikut
                terdorong. Dengan keduanya, `h-full` di kotak masuk chat
                mengukur ruang yang benar-benar tersedia, dan halaman lain
                tetap bisa digulung seperti sebelumnya. */}
            <main id="isi-cs" tabIndex={-1} className="flex-1 min-w-0 min-h-0 overflow-y-auto">
                {children}
            </main>
        </div>
    );
}
