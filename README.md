# RuangKos

Aplikasi web untuk owner dan penghuni kos dengan penyimpanan akun serta data di server.

## Menjalankan aplikasi

1. Pastikan Node.js tersedia.
2. Dari folder proyek, jalankan `npm start`.
3. Buka `http://localhost:4173` di browser.

Tidak perlu memasang paket tambahan. Saat pertama dibuka, buat akun owner. Data akun dan kos disimpan di `data/ruangkos-store.json` pada komputer/server yang menjalankan aplikasi. Folder tersebut tidak disajikan ke browser dan diabaikan Git.

Untuk memakai aplikasi dari perangkat lain dalam jaringan lokal yang dipercaya, gunakan alamat jaringan komputer server, misalnya `http://192.168.1.10:4173`, dan pastikan firewall mengizinkan port `4173`. Server mendengarkan semua antarmuka jaringan secara default. Untuk akses internet, pasang HTTPS melalui reverse proxy dan atur `COOKIE_SECURE=1`; jangan mengekspos server HTTP tanpa HTTPS. Cadangkan folder `data/` secara berkala.

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
