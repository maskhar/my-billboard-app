import Navbar from '@/components/Navbar';
import SearchFilter from '@/components/SearchFilter';
import MapWrapper from '@/components/MapWrapper';
import ChatWidget from '@/components/ChatWidget';
import { Billboard } from '@prisma/client';

async function getBillboards(): Promise<Billboard[]> {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
    const res = await fetch(`${apiUrl}/api/billboards`, { cache: 'no-store' });
    if (!res.ok) {
      console.error("Gagal mengambil data billboard dari backend:", res.statusText);
      return [];
    }
    return res.json();
  } catch (error) {
    console.error("Error saat fetch billboards:", error);
    return [];
  }
}

// MENANGKAP URL SEARCH PARAM
type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Home({ searchParams: searchParamsProp }: Props) {
  const searchParams = await searchParamsProp;
  const allBillboards = await getBillboards();

  const query = (searchParams.q as string) || '';
  const type = (searchParams.type as string) || 'Semua';

  const filteredBillboards = allBillboards.filter(billboard => {
    const statusMatch = billboard.status === 'Available';
    const publishMatch = billboard.publishStatus === 'PUBLISHED';
    
    const queryMatch = !query || 
      billboard.title.toLowerCase().includes(query.toLowerCase()) || 
      billboard.address.toLowerCase().includes(query.toLowerCase());
      
    const typeMatch = type === 'Semua' || billboard.type === type;

    return statusMatch && publishMatch && queryMatch && typeMatch;
  });

  return (
    <main className="relative h-screen w-full bg-white overflow-hidden">
      <Navbar />
      <div className="relative h-full w-full">
        <div className="absolute inset-0 z-0">
           <MapWrapper data={filteredBillboards} />
        </div>
        <div className="absolute top-20 left-0 w-full z-10 px-4 pointer-events-none flex justify-center">
             <div className="pointer-events-auto w-full max-w-[800px]">
                <SearchFilter />
             </div>
        </div>
        <ChatWidget />
      </div>
    </main>
  );
}