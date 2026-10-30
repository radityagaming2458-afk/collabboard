# CollabBoard - Papan Tulis Kolaboratif Online Real-Time

Aplikasi web papan tulis interaktif (whiteboard) yang mendukung penyesuaian background (pola grid, warna, tema, hingga unggah gambar custom) serta fitur undangan kolaborasi online secara real-time dengan pengaturan peran (**Editor** atau **Lihat Saja / Viewer**).

---

## 🎨 Fitur Utama

1. **Responsif: Mode Desktop & Mode Mobile (HP / Tablet):**
   - **Bar Properti Geser / Slide (*Sliding Bottom Dock*):** Bar pilihan warna, ketebalan, dan isian dapat meluncur (*slide*) turun dan tertutup saat tidak digunakan (atau otomatis meluncur tertutup saat Anda mulai menggambar di kanvas) sehingga papan tulis menjadi bersih tanpa terhalang. Cukup klik tab `[ 🎨 Alat Warna & Kuas ▴ ]` untuk membukanya kembali kapan saja.
   - **Tombol Pengalih Mode (Desktop / Mobile Switcher):** Di header atas terdapat tombol untuk beralih instan antara **Mode Desktop** (lengkap dengan panel luas) dan **Mode Mobile** (dioptimalkan untuk layar smartphone & tablet).
   - **Pilihan Kiri Dapat Di-scroll (*Scrollable Left Toolbar*):** Toolbar alat di sisi kiri dapat digulir (*scroll*) ke atas dan ke bawah dengan lancar menggunakan roda mouse atau usapan layar sentuh (*touch swipe*), dilengkapi scrollbar ramping sehingga semua alat dapat diakses dengan mudah di layar ukuran apa pun tanpa terpotong.
   - **Tombol Sembunyikan/Buka Toolbar (*Collapse Toggle*):** Tombol mini di sebelah toolbar untuk menyembunyikan atau menampilkan kembali toolbar agar kanvas gambar semakin lega di layar HP.
   - **Dukungan Gestur Layar Sentuh (*Touch Gestures*):** 1 jari untuk menggambar bebas, 2 jari untuk menggeser papan (*pan*) dan memperbesar/memperkecil (*pinch-to-zoom*).

2. **Papan Tulis Lengkap (Drawing & Annotation Tools):**
   - **Sisipkan Dokumen PDF (*Insert PDF*):** Masukkan file PDF langsung ke atas papan tulis menggunakan tombol PDF pada toolbar atau dengan **Drag & Drop** file PDF ke kanvas. Mendukung PDF multi-halaman (bisa memilih satu halaman tertentu atau menyisipkan seluruh halaman dokumen secara berjajar) dengan resolusi tajam untuk dianotasi, ditandatangani, atau dicoret bersama.
   - **Pilih & Pindah Objek (*Select Tool*):** Klik objek apa pun di kanvas (gambar, PDF, bentuk, teks, catatan, goresan pena) untuk memilihnya. Objek terpilih memiliki garis pembatas, dapat digeser (*drag*), diubah ukuran (*resize* sudut kanan bawah), diduplikat, atau dihapus langsung dengan tombol keyboard `Delete` / `Backspace`.
   - **Sisipkan Gambar (*Insert Image*):** Masukkan gambar ke atas papan tulis melalui tombol ikon gambar atau cukup tekan **`Ctrl+V` (Paste)** langsung dari clipboard saat menyalin screenshot/gambar.
   - **Catatan Tempel Interaktif (*Sticky Notes*):** Catatan tempel kolaboratif dengan tombol hapus langsung `[ × ]` di pojok kanan atas, header yang bisa digeser, dan teks yang tersinkronisasi secara real-time.
   - **Pena Bebas (Pen):** Gambar halus dengan kurva kuadratik otomatis (*smooth curve interpolation*).
   - **Stabilo (Highlighter):** Coretan transparan untuk menandai area penting.
   - **Bentuk (Shapes):** Garis lurus, Panah (*Arrow*), Kotak/Persegi (*Rectangle*), dan Lingkaran/Elips.
   - **Pilihan Isi Warna (*Fill*):** Bentuk dapat dibuat bergaris tepi saja atau dengan arsiran warna.
   - **Teks:** Tambahkan teks di mana saja pada kanvas.
   - **Penghapus (Eraser):** Menghapus coretan dengan presisi.
   - **Palette Warna & Ketebalan:** Pilihan warna cepat + pemilih warna custom (Hex color picker) serta slider ukuran kuas (2px, 4px, 8px, 16px).
   - **Undo / Redo:** Mendukung tombol antarmuka serta shortcut keyboard (`Ctrl+Z` / `Ctrl+Y`).
   - **Infinite Canvas / Zoom & Pan:** Geser kanvas menggunakan tombol spasi/mouse tengah (*Hand tool*) dan zoom (*scroll mouse* / tombol perbesar).
   - **Export Gambar:** Unduh hasil papan tulis dalam format PNG beresolusi tinggi dengan satu klik.

2. **Kustomisasi Background Papan Tulis:**
   - **Pilihan Tema Warna:**
     - *Dark Slate* (default modern)
     - *Whiteboard* (papan tulis putih bersih)
     - *Chalkboard* (papan tulis hijau klasik sekolah)
     - *Midnight* (hitam pekat)
     - *Warm Cream* (kertas hangat)
     - *Blueprint* (biru teknis)
   - **Pilihan Pola / Grid:**
     - Polos (*Solid*)
     - Kotak-kotak (*Square Grid*)
     - Titik-titik (*Dot Grid*)
     - Garis buku tulis (*Ruled / Lined Paper*)
   - **Unggah Gambar Custom:**
     - Anda dapat mengunggah gambar diagram, peta konsep, PDF screenshot, atau template catatan untuk digambar bersama di atasnya.
     - Setiap perubahan background oleh editor otomatis tersinkronisasi ke seluruh layar kolaborator secara langsung.

3. **Sistem Undangan, Profil Pengguna & Manajemen Izin Real-Time:**
   - **Profil & Nama Pengguna (*User Display Name*):** Pengguna dapat mengatur nama panggilan dan warna avatar sendiri (melalui tombol profil di header atau jendela sambutan saat pertama kali masuk), sehingga setiap kursor, obrolan, dan catatan dapat langsung dikenali oleh rekan kolaborator.
   - **Manajemen Izin Pengguna Dinamis (*Live Permission Manager*):** Host / Editor dapat membuka daftar peserta aktif dan mengubah hak akses peserta secara langsung dalam sesi berjalan:
     - Mengubah **Viewer (Lihat Saja)** menjadi **Editor (Bisa Mengedit)** seketika tanpa perlu membagikan link baru.
     - Mengubah **Editor** menjadi **Viewer (Lihat Saja)** untuk mencabut izin gambar.
     - Pengguna yang izinnya diubah akan langsung menerima notifikasi dan antarmukanya seketika menyesuaikan (alat gambar otomatis aktif atau terkunci).
   - **Room Berbasis URL:** Setiap sesi memiliki kode ruang unik (contoh: `http://localhost:8000/?room=ruang-diskusi`).
   - **Dua Tingkat Hak Akses Awal (Role-Based Access):**
     - **Tautan Editor (Bisa Mengedit):** Peserta langsung masuk dengan izin menggambar & ubah latar.
     - **Tautan Lihat Saja (Viewer / Read-Only):** Peserta masuk dengan mode tonton saja.
   - **Kursor Real-Time:** Menampilkan pergerakan kursor mouse peserta lain secara langsung lengkap dengan nama dan warna avatar masing-masing kolaborator.
   - **Obrolan Ruang (In-Room Chat):** Panel obrolan terintegrasi untuk berdiskusi langsung saat menggambar.

---

## 🚀 Cara Menjalankan

### 1. Prasyarat
Pastikan Python 3.9+ telah terpasang di komputer Anda.

### 2. Instalasi Dependensi
Buka terminal / PowerShell di direktori proyek ini, lalu jalankan:
```bash
pip install -r requirements.txt
```

### 3. Menjalankan Server
Jalankan server CollabBoard:
```bash
python server.py
```
Server akan aktif di `http://localhost:8000`.

---

## 🔐 Fitur Enkripsi Tautan (Encrypted Links)
Tautan undangan tidak lagi menampilkan peran secara telanjang (seperti `?role=editor` atau `?role=viewer`). Sebagai gantinya, sistem menggunakan **Enkripsi Kriptografis Simetris (AES-128-CBC + HMAC-SHA256 via Fernet)**:
- **Format Tautan:** `http://localhost:8000/join?token=gAAAAABq5G0wu1H_b...`
- **Anti-Tampering:** Token membungkus ID Ruangan, Peran (*Role*), Timestamp, dan Salt acak. Jika seseorang yang menerima tautan *Viewer* mencoba mengedit isi token atau URL untuk menjadi *Editor*, verifikasi kriptografis akan otomatis gagal dan akses pengeditan ditolak.
- **Kunci Rahasia Persisten:** Kunci enkripsi tersimpan secara aman di file `.secret_key` pada server.

---

## 👥 Cara Mengundang Orang Lain

### A. Kolaborasi di Jaringan WiFi / LAN yang Sama:
1. Buka [http://localhost:8000](http://localhost:8000) di browser Anda.
2. Klik tombol **Undang** di pojok kanan atas.
3. Salin tautan terenkripsi yang diinginkan:
   - **Tautan Editor (Terenkripsi):** Peserta dapat menggambar dan mengedit.
   - **Tautan Viewer (Terenkripsi):** Peserta hanya dapat melihat secara live.
4. Jika dibagikan ke perangkat lain di WiFi yang sama, ubah `localhost` menjadi IP komputer host Anda (misalnya `http://192.168.1.3:8000/join?token=...`).

### B. Kolaborasi Melalui Internet (Jarak Jauh):
Gunakan tunnel port forwarding seperti **ngrok**:
```bash
ngrok http 8000
```
Salin URL publik (misal `https://xxxx.ngrok-free.app/join?token=...`) dan bagikan kepada rekan Anda.
