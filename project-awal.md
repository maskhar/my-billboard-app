## 1. Analisa Update Tech Stack & Server

#### A. Email (SMTP)
*   **Analisa:** Kamu punya akun SMTP sendiri (dari cPanel/Hosting).
*   **Solusi:** Ini justru lebih mudah. Di coding nanti (Backend), kita pakai *library* `Nodemailer`. Kita cukup masukkan data: `Host` (misal: mail.utero.cloud), `Port` (465/587), `User`, dan `Password`.
*   **Hasil:** Website akan mengirim email menggunakan nama domain resmimu (misal: *info@utero.cloud*), bukan email gratisan, jadi terlihat sangat profesional.

#### B. Map Provider (Leaflet + Google Maps API)
*   **Analisa:** Kamu memilih kombinasi ini.
*   **Solusi:** Pilihan bijak untuk menghemat biaya tapi tetap akurat. Kita pakai `Leaflet.js` sebagai "Bingkai/Wadah Peta" (gratis & ringan), lalu "Isi Peta"-nya kita tarik dari `Google Maps API`.
*   **Hasil:** User tetap merasakan pengalaman "Google Maps" yang familiar (bisa Street View, titik lokasi akurat).

#### C. File Storage (Google Cloud Storage)
*   **Analisa:** Kamu ingin pakai Google Cloud (GCS) dan minta dipandu step-by-step.
*   **Solusi:** Sangat bisa. Karena kita akan pakai Google Maps & Gemini AI, menyatukan penyimpanan di Google Cloud Platform (GCP) adalah langkah efisien.
*   **Step Nanti:** Aku akan buatkan panduan cara bikin "Bucket" (wadah file) dan cara ambil "Key" (kunci akses) supaya websitemu bisa upload gambar ke sana. Tenang, ini aman dan *scalable*.

---

### 2. Analisa Fitur Dashboard & User

#### A. Auth (Login & Register)
*   **Fitur:** Login by Google (Gmail), Lupa Password, Register Manual.
*   **Teknis:** Kita akan gunakan module **NextAuth (Auth.js)**. Ini standar industri saat ini.
*   **Kelebihan:** User tidak perlu ingat password (cukup klik "Login with Google"). Untuk "Lupa Password", sistem akan mengirim link reset ke email user lewat SMTP kamu tadi.

#### B. Internal Analytics (Live View & Visitor Tracking)
Ini permintaan yang menarik. Kamu ingin "Spy/Intip" siapa yang masuk webmu.
*   **Tantangan:** Google Analytics saja tidak cukup karena datanya *agregat* (gabungan/rata-rata). Kamu butuh data per *session*.
*   **Solusi Teknis:** Aku akan buatkan tabel database tambahan (misal: `VisitorLog`).
*   **Cara Kerja:** Setiap kali orang buka halaman:
    1.  Sistem catat **IP Address** (bisa ketahuan negaranya).
    2.  Sistem baca **User Agent** (ketahuan pakai Chrome/Safari, iPhone/Android, Laptop/PC).
    3.  Data ini masuk ke Database Admin.
    4.  Admin Dashboard akan menampilkan grafik dan list: *"Seseorang dari Malang (IP xxx) baru saja melihat Billboard A menggunakan iPhone".*

#### C. Input Google Analytics
*   **Solusi:** Di Admin Dashboard $\rightarrow$ Menu Settings $\rightarrow$ Kolom "Tracking Code". Kamu tinggal copy-paste kode `G-XXXXXXXX` dari Google, dan sistem otomatis menanamkannya di ` <head>` website. Simpel.

---

### 3. Analisa AI Gemini ("Human-like")

Kamu tanya: *"Apakah memungkinkan logika penjawaban seperti manusia?"*
*   **Jawabannya: BISA BANGET.**
*   **Kuncinya:** Ada pada **"System Prompt / Persona Instruction"**.
*   Kalau kita tidak setting, AI jawabnya kaku: *"Ini data billboardnya."*
*   Kalau kita setting Personanya, dia akan jawab: *"Halo Kak! Wah pilihan bagus. Untuk area tersebut kebetulan kami ada unit yang strategis banget, posisinya pas di lampu merah..."*
*   **Cara "Ngajarin" AI-nya:** Nanti di kodingan, kita masukkan instruksi:
    > "Kamu adalah Sales Billboard profesional dari Risma/Utero. Namamu 'Risma-AI'. Nada bicara: Ramah, Solutif, sedikit santai tapi sopan. Jangan berikan harga pasti, tapi berikan 'Kisaran/Estimasi'. Tugasmu merekomendasikan billboard terbaik..."
*   Dengan instruksi ini, dia tidak akan seperti robot.
