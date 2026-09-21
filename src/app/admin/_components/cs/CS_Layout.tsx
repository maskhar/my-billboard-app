import CS_Sidebar from "./CS_Sidebar";

export default function CS_Layout({ children, session }: { children: React.ReactNode, session: any }) {
    return (
        <div className="flex h-screen bg-white font-sans">
            <CS_Sidebar user={session.user} />
            <main className="flex-1 overflow-y-auto">
                {children}
            </main>
        </div>
    );
}
