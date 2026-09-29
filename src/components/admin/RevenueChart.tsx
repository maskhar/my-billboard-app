// src/components/admin/RevenueChart.tsx
'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { rupiah, rupiahSingkat } from '@/lib/money';
import type { ChartData } from '@/app/admin/(dashboard)/actions';

// `data: any[]` dulu tertulis di sini. `dataKey="total"` dan `dataKey="name"`
// di bawah adalah teks, jadi tidak ada satu pun yang menghubungkannya dengan
// bentuk yang sebenarnya dikirim: kolom yang diganti nama di `susunLaporan`
// menghasilkan grafik BERSUMBU KOSONG — batang hilang, sumbu X tanpa label —
// dan tidak ada galat apa pun, di `tsc` maupun di konsol. Tipe ini tidak
// memaksa `dataKey` cocok, tapi ia membuat pemanggilan dari komponen yang salah
// bentuk gagal dibangun.
//
// KARTU DAN JUDULNYA DIBUANG DARI SINI
// ------------------------------------
// Berkas ini dulu membungkus dirinya sendiri dengan `bg-white … rounded-2xl
// border` DAN menulis `<h3>Tren Pendapatan</h3>`, sementara pemanggilnya
// (`RevenueSection`) sudah membungkusnya dengan kartu yang sama dan menulis
// `<h3>Tren Uang Masuk</h3>`. Hasil di layar: kartu di dalam kartu, dua judul
// bertumpuk, dan kedua judul itu menyebut hal yang BERBEDA — "pendapatan" dan
// "uang masuk" bukan sinonim di pembukuan, dan admin yang membacanya tidak punya
// cara tahu mana yang menggambarkan batang di bawahnya.
//
// Sekarang komponen ini hanya grafiknya. Yang punya judul adalah yang punya
// konteksnya: `RevenueSection` tahu rentang mana yang sedang ditampilkan,
// komponen ini tidak.
export default function RevenueChart({ data }: { data: ChartData[] }) {
  return (
    <div className="h-[350px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
          <XAxis
            dataKey="name"
            stroke="#9CA3AF"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            // Label dilewati bila tidak cukup ruang, bukan dipaksa muat.
            // Rentang harian bisa berisi 62 batang, dan 62 label `01/10` yang
            // dipaksa tampil saling menimpa menjadi garis kabur — sumbu yang
            // tidak terbaca lebih buruk daripada sumbu yang berlabel sebagian.
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            stroke="#9CA3AF"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `Rp ${rupiahSingkat(value)}`}
          />
          {/*
            recharts memanggil formatter dengan `undefined` pada titik
            data yang kosong, sedangkan tipenya dulu ditulis `number`
            saja — `value.toLocaleString()` di sana memanggil metode pada
            nilai yang tidak ada. Selain itu `toLocaleString()` tanpa
            argumen memakai format Inggris: "15,000,000", dengan titik
            dan koma terbalik dari kebiasaan di sini.

            Label tooltipnya dulu `'Omzet'` — kata ketiga untuk hal yang
            sama, setelah dua judul yang sudah saling bertentangan.
            Sekarang ia menyebut apa yang benar-benar dihitung, dan
            nilai negatif (refund melebihi penerimaan pada periode itu)
            tetap terbaca sebagai uang, bukan sebagai omzet negatif yang
            tidak punya arti.
          */}
          <Tooltip
            cursor={{ fill: '#F3F4F6' }}
            contentStyle={{
              borderRadius: '8px',
              border: 'none',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
            formatter={(value) => [rupiah(value as number | undefined), 'Uang masuk bersih']}
          />
          <Bar dataKey="total" fill="#CE181E" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
