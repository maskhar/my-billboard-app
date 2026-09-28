// src/components/FormField.tsx
//
// Satu `InputField` dan satu `SelectField` untuk seluruh form admin dan
// pengaturan akun.
//
// KENAPA DISATUKAN
// ----------------
// Keduanya dulu ditulis ulang di tiga file — `UserProfileForm.tsx`,
// `UserFormModal.tsx`, dan `AccountSettingsForm.tsx` — dengan kelas Tailwind
// yang disalin tangan. Salinannya sudah menyimpang: satu versi menambahkan
// `required` pada SETIAP input tanpa bisa dimatikan, satu versi memasang
// `name={id}` dan dua lainnya tidak. Kolom tanpa `name` tidak bisa dibaca
// `e.target.name`, jadi handler yang memakai pola itu diam-diam menulis ke
// kunci `undefined`.
//
// KENAPA BUKAN `any`
// ------------------
// Props-nya dulu `({ label, id, value, onChange, ...props }: any)`. Akibatnya:
// salah tulis nama prop tidak pernah terdeteksi, `onChange` yang menerima
// event apa pun lolos, dan `{...props}` bisa menimpa `value`/`onChange` yang
// sudah diatur di atasnya tanpa ada yang memperingatkan. Sekarang props
// tambahan diwarisi dari atribut `<input>` asli, jadi hanya atribut yang
// memang ada yang bisa dikirim.

import type { ReactNode } from 'react';

/**
 * Atribut `<input>` yang boleh diteruskan, DIKURANGI yang sudah dikelola
 * komponen ini. `value`, `onChange`, dan `id` sengaja dikeluarkan: keduanya
 * sudah menjadi prop tersendiri, dan membiarkannya lewat `{...sisa}` berarti
 * satu pemanggil bisa membatalkan kendali komponen tanpa terlihat.
 */
type AtributInput = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'id' | 'className'
>;

type InputFieldProps = AtributInput & {
  label: string;
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

const KELAS_INPUT =
  'mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md ' +
  'shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 ' +
  'focus:border-indigo-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-500';

export function InputField({ label, id, value, onChange, type = 'text', ...sisa }: InputFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      {/*
        `name={id}` dipasang di sini untuk SEMUA pemakai, bukan hanya di satu
        salinan. Handler yang membaca `e.target.name` — pola yang dipakai
        `AccountSettingsForm` — menulis ke kunci `undefined` tanpa atribut ini,
        dan isian yang diketik pengguna tidak pernah sampai ke state.
      */}
      <input
        type={type}
        id={id}
        name={id}
        value={value}
        onChange={onChange}
        className={KELAS_INPUT}
        {...sisa}
      />
    </div>
  );
}

type AtributSelect = Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  'value' | 'onChange' | 'id' | 'className' | 'children'
>;

type SelectFieldProps = AtributSelect & {
  label: string;
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
};

const KELAS_SELECT =
  'mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 ' +
  'focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md';

export function SelectField({ label, id, value, onChange, children, ...sisa }: SelectFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <select
        id={id}
        name={id}
        value={value}
        onChange={onChange}
        className={KELAS_SELECT}
        {...sisa}
      >
        {children}
      </select>
    </div>
  );
}
