# RuangKos

Aplikasi web untuk owner dan penghuni kos dengan penyimpanan akun serta data di server.

## Menjalankan secara lokal

1. Pastikan Node.js tersedia.
2. Dari folder proyek, jalankan `npm install`, lalu `npm start`.
3. Buka `http://localhost:4173` di browser.

Saat pertama dibuka, buat akun owner. Tanpa `DATABASE_URL`, data akun dan kos disimpan di `data/ruangkos-store.json` pada komputer/server yang menjalankan aplikasi. Folder tersebut tidak disajikan ke browser dan diabaikan Git.

Untuk memakai aplikasi dari perangkat lain dalam jaringan lokal yang dipercaya, gunakan alamat jaringan komputer server, misalnya `http://192.168.1.10:4173`, dan pastikan firewall mengizinkan port `4173`. Server mendengarkan semua antarmuka jaringan secara default. Untuk akses internet, pasang HTTPS melalui reverse proxy dan atur `COOKIE_SECURE=1`; jangan mengekspos server HTTP tanpa HTTPS. Cadangkan folder `data/` secara berkala.

## Membuka online dengan GitHub Pages

GitHub Pages hanya meng-host tampilan statis; API Node.js dan database tetap harus berjalan terpisah. Konfigurasi repository ini menggunakan GitHub Pages untuk tampilan, Render Free untuk API, dan Neon Free untuk penyimpanan PostgreSQL. Kedua layanan gratis dapat memiliki batas pemakaian dan waktu henti; Render dapat menidurkan server yang tidak aktif, sehingga penghuni mungkin perlu menunggu server aktif kembali sebelum login. Data tetap disimpan di Neon, bukan di filesystem sementara Render.

1. Buat database PostgreSQL gratis di Neon, lalu salin connection string pooled dari dashboard Neon. Simpan string koneksi secara privat.
2. Di Render, pilih **New > Blueprint**, hubungkan repository `gansboyy8/projek-kos`, dan gunakan `render.yaml`. Saat diminta, isi `DATABASE_URL` dengan connection string Neon. Tunggu layanan `ruangkos-backend` selesai deploy, lalu salin URL HTTPS-nya, misalnya `https://ruangkos-backend.onrender.com`.
3. Jika ingin mempertahankan data lokal, migrasikan sebelum membuat akun owner online. Di PowerShell, jalankan perintah berikut dari folder proyek dan masukkan connection string Neon saat diminta. Perintah migrasi mengganti isi database tujuan dengan data lokal, termasuk akun owner dan hash password:

   ```powershell
   $secret = Read-Host "DATABASE_URL Neon" -AsSecureString
   $credential = New-Object System.Net.NetworkCredential("", $secret)
   $env:DATABASE_URL = $credential.Password
   node scripts/migrate-local-data.js --replace
   Remove-Item Env:DATABASE_URL
   Remove-Variable secret,credential
   ```

   Lewati migrasi untuk memulai dengan data online yang kosong.
4. Di repository GitHub, buka **Settings > Secrets and variables > Actions > Variables**, lalu buat repository variable bernama `RUANGKOS_API_URL` dengan URL backend Render tadi (tanpa garis miring di akhir).
5. Buka **Settings > Pages**, pilih **GitHub Actions** sebagai build and deployment source.
6. Jalankan workflow **Deploy RuangKos to GitHub Pages** dari tab **Actions**, atau push perubahan baru. Buka `https://gansboyy8.github.io/projek-kos/`.

Jangan masukkan `DATABASE_URL` ke GitHub Pages, file frontend, atau repository variable yang dipakai untuk build tampilan. URL backend bukan rahasia; password database harus tetap hanya berada di konfigurasi environment Render. Sesi login disimpan sementara di backend, jadi pengguna perlu login lagi jika layanan Render tidur atau restart.

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
