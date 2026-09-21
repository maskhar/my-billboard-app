// src/lib/dummy-data.ts

export interface Billboard {
  id: string;
  title: string;
  address: string;
  type: string;
  price: number;
  lat: number;
  lng: number;
  status: "Available" | "Booked";
  mainImage: string;
  gallery: string[];
  specs: { label: string; value: string }[];
  includes: string[];
  excludes: string[];
  smartsucoUrl?: string; 
}

export const dummyBillboards: Billboard[] = [
  {
    id: "1",
    title: "Billboard Jl. Dr. Wahidin",
    address: "Jl. Dr. Wahidin No. 2, Depan SMAN 1, Kabupaten Malang",
    type: "Videotron",
    price: 15000000,
    lat: -7.9666,
    lng: 112.6326,
    status: "Available",
    // Gambar lebih HD & Stabil
    mainImage: "https://images.unsplash.com/photo-1542662565-7e4b66bae529?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1542662565-7e4b66bae529?auto=format&fit=crop&w=300&q=80",
      "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=300&q=80",
      "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=300&q=80",
    ],
    specs: [
      { label: "Ukuran", value: "4m x 8m (Horizontal)" },
      { label: "Penerangan", value: "Lampu Sorot LED 250 Watt (2 Pcs)" },
      { label: "View", value: "Dari Arah Utara menuju Alun-Alun" },
      { label: "Trafik", value: "Padat (Jam Sekolah & Kerja)" },
    ],
    includes: [
      "Administrasi & Kontrak", 
      "Pengawasan Media", 
      "Biaya Pasang 1x", 
      "Pajak Reklame Daerah",
      "Data Trafik (Smartsuco)"
    ],
    excludes: [
      "PPN 11%",
      "Biaya Cetak Banner",
      "Asuransi Kerusakan Gempa/Bencana"
    ],
    smartsucoUrl: "https://google.com" 
  },
  {
    id: "2",
    title: "Baliho Simpang Ijen",
    address: "Jl. Ijen Besar No. 40, Malang Kota",
    type: "Baliho",
    price: 8500000,
    lat: -7.9715,
    lng: 112.6231,
    status: "Booked",
    mainImage: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1000&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=300&q=80",
    ],
    specs: [
        { label: "Ukuran", value: "5m x 10m" },
        { label: "Penerangan", value: "Tidak Ada" },
    ],
    includes: ["Pajak Reklame", "Izin Pemkot"],
    excludes: ["PPN 11%", "Cetak", "Pasang", "Smartsuco"],
  }
];