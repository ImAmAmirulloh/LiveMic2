# Live Mic - Audio Conference App

Aplikasi audio conference real-time menggunakan WebRTC dan Socket.IO.

## Fitur

- **Mode Pembicara**: Stream audio dari mikrofon ke multiple pendengar
- **Mode Pendengar**: Dengarkan streaming audio dengan menginput kode room
- **Daftar Pendengar**: Pembicara bisa melihat siapa saja yang bergabung
- **Input Nama**: Setiap pendengar wajib memasukkan nama mereka
- **Responsive Design**: Bisa digunakan di desktop dan mobile

## Struktur Project

```
live-mic/
├── index.html      # Halaman utama
├── style.css       # Styling CSS
├── app.js          # Logic frontend + WebRTC
├── server.js       # Signaling server (Node.js)
├── package.json    # Dependencies server
└── README.md       # Dokumentasi
```

## Cara Menjalankan

### 1. Jalankan Server (Signaling Server)

```bash
# Install dependencies
npm install

# Jalankan server
npm start
```

Server akan berjalan di `http://localhost:3000`

### 2. Jalankan Frontend

Buka `index.html` di browser, atau gunakan static file server:

```bash
# Menggunakan npx
npx serve .

# Atau menggunakan Python
python -m http.server 8080
```

## Deployment

### Deploy Server ke Glitch (Gratis)

1. Buat akun di [glitch.com](https://glitch.com)
2. Klik "New Project" > "Import from GitHub"
3. Paste repo URL atau upload file secara manual
4. Server akan otomatis berjalan

### Deploy Server ke Render (Gratis)

1. Buat akun di [render.com](https://render.com)
2. Klik "New" > "Web Service"
3. Connect repo GitHub
4. Set:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Klik "Create Web Service"

### Deploy Frontend (GitHub Pages)

1. Push code ke GitHub repo
2. Buka Settings > Pages
3. Select branch `main` dan folder `/`
4. Frontend akan tersedia di `https://yourusername.github.io/repo-name`

### Update SERVER_URL di app.js

Setelah server di-deploy, update `SERVER_URL` di `app.js`:

```javascript
const CONFIG = {
    SERVER_URL: 'https://your-server-url.onrender.com', // Ganti dengan URL server
    // ...
};
```

## Cara Pakai

### Sebagai Pembicara

1. Pilih mode "Pembicara"
2. Kode room akan otomatis dibuat
3. Bagikan kode room ke pendengar
4. Klik "Tap to Go Live" untuk mulai streaming
5. Lihat daftar pendengar yang bergabung
6. Klik "Tap to End" untuk berhenti streaming

### Sebagai Pendengar

1. Pilih mode "Pendengar"
2. Masukkan nama Anda
3. Masukkan kode room dari pembicara
4. Klik "Gabung"
5. Tunggu hingga pembicara live
6. Audio akan otomatis played

## Teknologi

- **WebRTC**: Real-time audio streaming peer-to-peer
- **Socket.IO**: WebSocket untuk signaling
- **Node.js**: Server runtime
- **Express**: HTTP server

## Catatan Penting

1. **HTTPS Required**: Browser memerlukan HTTPS untuk akses mikrofon (kecuali localhost)
2. **STUN/TURN**: Untuk koneksi di jaringan berbeda, mungkin memerlukan TURN server
3. **Firewall**: Pastikan port server tidak diblokir

## Troubleshooting

### Audio tidak keluar
- Pastikan mikrofon diizinkan
- Cek konsol browser untuk error
- Pastikan server dan frontend bisa terhubung

### Tidak bisa connect ke server
- Pastikan server sedang berjalan
- Cek apakah URL server benar di `app.js`
- Pastikan tidak ada firewall yang memblokir

### Koneksi lambat
- Gunakan TURN server untuk koneksi yang lebih stabil
- Cek kualitas jaringan

## License

MIT License
