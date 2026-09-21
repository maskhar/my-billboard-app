'use client';

import { useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Tipe properti baru, termasuk callback onDateSelect
type AvailabilityCalendarProps = {
  bookedDates: { start: string, end: string }[];
  onDateSelect: (date: Date) => void; // Callback untuk mengirim tanggal terpilih ke parent
  initialDate: Date | null;
};

export default function AvailabilityCalendar({ bookedDates, onDateSelect, initialDate }: AvailabilityCalendarProps) {
    const [view, setView] = useState<'month' | 'year'>('month');
    const [activeDate, setActiveDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(initialDate);
    
    const tileDisabled = ({ date }: { date: Date }) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (date < today) return true; // Nonaktifkan tanggal yang sudah lewat

        return bookedDates.some(range => {
            const start = new Date(range.start); start.setHours(0, 0, 0, 0);
            const end = new Date(range.end); end.setHours(23, 59, 59, 999);
            return date >= start && date <= end;
        });
    };

    const handleDateClick = (value: Date) => {
        setSelectedDate(value);
        onDateSelect(value); // Panggil callback
    };
    
    const handlePrev = () => {
        if (view === 'month') {
            setActiveDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
        } else {
            setActiveDate(prev => new Date(prev.getFullYear() - 1, 0, 1));
        }
    };

    const handleNext = () => {
        if (view === 'month') {
            setActiveDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
        } else {
            setActiveDate(prev => new Date(prev.getFullYear() + 1, 0, 1));
        }
    };
    
    // Fungsi untuk menyorot tanggal yang dipilih
    const tileClassName = ({ date }: { date: Date }) => {
        if (selectedDate && date.toDateString() === selectedDate.toDateString()) {
            return 'bg-utero text-white rounded-md';
        }
        return null;
    };
    
    const formatMonthYear = (date: Date) => {
        return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    };

    const renderMonthCalendars = () => {
        return Array.from({ length: 12 }).map((_, i) => {
            const monthDate = new Date(activeDate.getFullYear(), i, 1);
            return (
                <div key={i} className="p-2">
                    <h5 className="text-center font-bold text-sm mb-2">{monthDate.toLocaleDateString('id-ID', { month: 'long' })}</h5>
                    <Calendar
                        activeStartDate={monthDate}
                        minDate={new Date()}
                        tileDisabled={tileDisabled}
                        onClickDay={handleDateClick}
                        tileClassName={tileClassName}
                        locale="id-ID"
                        className="w-full border-none font-sans"
                        showNavigation={false}
                        next2Label={null} prev2Label={null}
                    />
                </div>
            );
        });
    };

    return (
        <div className="w-full bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            {/* Header Kalender */}
            <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-gray-800">Availability</h4>
                <div className="flex items-center gap-4">
                    <div className="flex items-center">
                        <button onClick={handlePrev} className="p-1 rounded-md hover:bg-gray-100"><ChevronLeft size={20}/></button>
                        <h5 className="font-bold w-32 text-center">
                            {view === 'month' ? formatMonthYear(activeDate) : activeDate.getFullYear()}
                        </h5>
                        <button onClick={handleNext} className="p-1 rounded-md hover:bg-gray-100"><ChevronRight size={20}/></button>
                    </div>
                    <div className="flex items-center bg-gray-100 p-0.5 rounded-md text-xs font-bold">
                        <button onClick={() => setView('year')} className={`px-3 py-1 rounded ${view === 'year' ? 'bg-white text-utero shadow' : 'text-gray-500'}`}>year</button>
                        <button onClick={() => setView('month')} className={`px-3 py-1 rounded ${view === 'month' ? 'bg-white text-utero shadow' : 'text-gray-500'}`}>month</button>
                    </div>
                </div>
            </div>

            {/* Legenda */}
            <div className="flex gap-4 mb-4 text-xs">
                {/* ... (legenda yang sudah ada) ... */}
            </div>

            {/* Konten Kalender */}
            {view === 'month' ? (
                <Calendar
                    activeStartDate={activeDate}
                    minDate={new Date()}
                    tileDisabled={tileDisabled}
                    onClickDay={handleDateClick}
                    tileClassName={tileClassName}
                    locale="id-ID"
                    className="w-full border-none font-sans"
                    showNavigation={false}
                    next2Label={null} prev2Label={null}
                />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {renderMonthCalendars()}
                </div>
            )}
            
            <p className="text-[10px] text-gray-400 mt-3 text-center">
                *Klik tanggal untuk memilih mulai tayang.
            </p>
        </div>
    );
}