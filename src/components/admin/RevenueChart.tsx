// src/components/admin/RevenueChart.tsx
'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function RevenueChart({ data }: { data: any[] }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 h-[400px]">
        <h3 className="font-bold text-gray-800 mb-6">Tren Pendapatan</h3>
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB"/>
                <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false}/>
                <YAxis stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `Rp ${value/1000000}Jt`} />
                <Tooltip 
                    cursor={{fill: '#F3F4F6'}}
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    formatter={(value:number) => [`Rp ${value.toLocaleString()}`, 'Omzet']}
                />
                <Bar dataKey="total" fill="#CE181E" radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
        </ResponsiveContainer>
    </div>
  );
}