# RuangKos

Aplikasi web untuk owner dan penghuni kos dengan penyimpanan akun serta data di server.

## Menjalankan secara lokal

1. Pastikan Node.js tersedia.
2. Dari folder proyek, jalankan `npm install`, lalu `npm start`.
3. Buka `http://localhost:4173` di browser.

Saat pertama dibuka, buat akun owner. Tanpa `DATABASE_URL`, data akun dan kos disimpan di `data/ruangkos-store.json` pada komputer/server yang menjalankan aplikasi. Folder tersebut tidak disajikan ke browser dan diabaikan Git.

Untuk memakai aplikasi dari perangkat lain dalam jaringan lokal yang dipercaya, gunakan alamat jaringan komputer server, misalnya `http://192.168.1.10:4173`, dan pastikan firewall mengizinkan port `4173`. Server mendengarkan semua antarmuka jaringan secara default. Untuk akses internet, pasang HTTPS melalui reverse proxy dan atur `COOKIE_SECURE=1`; jangan mengekspos server HTTP tanpa HTTPS. Cadangkan folder `data/` secara berkala.

## Membuka online dengan GitHub Pages

Konfigurasi gratis ini memakai GitHub Pages untuk tampilan, Netlify Functions untuk API, dan Neon Free untuk PostgreSQL. API berjalan sebagai fungsi serverless; data kos dan sesi login disimpan di Neon agar tetap ada saat fungsi serverless dimulai ulang. Paket gratis memiliki batas pemakaian bulanan.

1. Buat database PostgreSQL gratis di Neon. Di project Neon, klik **Connect**, pilih branch `production`, database, role, dan connection pooling. Simpan connection string secara privat.
2. Masuk/daftar di Netlify menggunakan GitHub, lalu pilih **Add new project > Import an existing project** dan hubungkan repository `gansboyy8/projek-kos`. Netlify akan memakai `netlify.toml` dan folder `netlify/functions`.
3. Di pengaturan situs Netlify, buka **Environment variables** dan tambahkan `DATABASE_URL` berisi connection string Neon serta `FRONTEND_ORIGIN` berisi `https://gansboyy8.github.io`. Jalankan deploy/redeploy setelah keduanya disimpan.
4. Setelah deploy selesai, salin domain Netlify, misalnya `https://nama-situs.netlify.app`.
5. Di GitHub, buka **Settings > Secrets and variables > Actions > Variables** dan buat variable `RUANGKOS_API_URL` berisi domain Netlify tanpa garis miring di akhir.
6. Pastikan **Settings > Pages** memilih **GitHub Actions**, lalu jalankan workflow **Deploy RuangKos to GitHub Pages** di tab **Actions**. Buka `https://gansboyy8.github.io/projek-kos/`.

Jangan masukkan `DATABASE_URL` ke GitHub Pages atau file repository. URL API bukan rahasia; password database harus tetap hanya berada di environment Netlify. Untuk memulai dengan data online kosong, buka situs GitHub Pages setelah deploy selesai dan buat akun owner.

## Fitur

- Ringkasan jumlah kamar, okupansi, pemasukan, dan tagihan yang belum lunas.
- Pengelolaan kamar dan data penghuni, termasuk pencegahan penempatan penghuni pada kamar yang sudah terisi.
- Pencatatan dan perubahan status pembayaran sewa.
- Akun penghuni dengan ID dan password yang dibuat owner, serta portal penghuni untuk melihat tagihan sewa, listrik, air, Wi-Fi, jatuh tempo, dan keterlambatan.
- ID login owner dan penghuni harus tepat 8 digit angka.
- Penghuni bisa mengirim konfirmasi pembayaran; owner memeriksa dan mengesahkan tagihan lunas.
- Portal penghuni memiliki navigasi beranda, tagihan, laporan gangguan, riwayat pembayaran, dan profil.
- Penghuni dapat mengganti foto profil dan password tanpa mengubah identitas atau data kamar.
- Laporan gangguan mencatat kategori, prioritas, uraian, serta status tindak lanjut yang dapat dilihat penghuni.
- Pencatatan pengeluaran operasional.
- Laporan pemasukan bersih dan okupansi per periode, dengan ekspor CSV.
- Tampilan responsif untuk desktop maupun ponsel.

Pembayaran belum terhubung ke payment gateway. Penghuni mengirim konfirmasi metode pembayaran dan owner mengonfirmasi penerimaan. Password disimpan sebagai hash scrypt dan sesi login memakai cookie HttpOnly. Aplikasi ini cocok untuk penggunaan lokal/LAN tepercaya; layanan publik tetap memerlukan HTTPS, backup, dan konfigurasi server yang sesuai.
