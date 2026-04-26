# 🖐 Tryfing — Sistem Absensi Fingerprint IoT

Sistem absensi sidik jari berbasis **ESP32 + Sensor AS608 + MQTT + Node.js + MySQL**.

---

## 📋 Daftar Isi
- [Kebutuhan](#-kebutuhan)
- [Struktur Folder](#-struktur-folder)
- [Instalasi Backend](#-instalasi-backend)
- [Setup Mosquitto MQTT](#-setup-mosquitto-mqtt)
- [Setup ESP32](#-setup-esp32)
- [Halaman Web](#-halaman-web)
- [REST API](#-rest-api)
- [MQTT Topics](#-mqtt-topics)
- [Alur Sistem](#-alur-sistem)
- [Troubleshooting](#-troubleshooting)

---

## 🧰 Kebutuhan

| Software | Versi | Link |
|----------|-------|------|
| Node.js | 18+ | https://nodejs.org |
| MySQL | 8+ | https://dev.mysql.com/downloads |
| Mosquitto | 2+ | https://mosquitto.org/download |
| Arduino IDE | 2+ | https://www.arduino.cc/en/software |

---

## 🗂️ Struktur Folder

```
backend_fingrec/
├── config/
│   ├── db.js           → koneksi pool MySQL
│   └── jwt.js          → JWT secret key
├── middleware/
│   └── auth.js         → authMiddleware & adminOnly
├── mqtt/
│   └── handler.js      → logic semua pesan MQTT masuk/keluar
├── public/             → frontend (HTML, CSS, JS)
│   ├── login.html
│   ├── dashboard.html
│   ├── register.html   → daftar jari baru
│   ├── restore.html    → restore data ke sensor
│   ├── format.html     → hapus semua data sensor
│   ├── history.html    → riwayat absensi
│   ├── laporan.html    → laporan (admin)
│   ├── laporan-saya.html → kehadiran (staff)
│   ├── izin.html       → perizinan
│   ├── profil.html     → profil & ganti password
│   ├── control.html    → kontrol ESP32
│   ├── style.css
│   └── api.js          → fetch helper + auth guard
├── routes/
│   ├── auth.js         → login, me, ganti password
│   ├── users.js        → CRUD karyawan
│   ├── command.js      → kirim perintah ke ESP32
│   ├── laporan.js      → rekap absensi
│   └── izin.js         → perizinan
├── migration.sql       → schema database
└── server.js           → entry point
```

---

## 🚀 Instalasi Backend

### 1. Clone repository
```bash
git clone https://github.com/fauzifade/tryfing.git
cd tryfing/backend_fingrec
```

### 2. Install dependencies
```bash
npm install
```

Dependencies yang terinstall: `express` `mysql2` `mqtt` `jsonwebtoken` `bcrypt` `socket.io`

### 3. Setup database MySQL
```bash
mysql -u root -p
```
```sql
CREATE DATABASE tryfing;
CREATE USER 'xfzy'@'localhost' IDENTIFIED BY '634117';
GRANT ALL PRIVILEGES ON tryfing.* TO 'xfzy'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> ⚠️ Pastikan tabel `employee`, `fingerprint`, `session`, `status`, dan `absensi_history` sudah ada sebelum import migration.

```bash
mysql -u xfzy -p634117 tryfing < migration.sql
```

Migration membuat:
- Tabel `izin` — data perizinan karyawan
- Tabel `user` — akun login sistem
- Akun admin default

### 4. Sesuaikan konfigurasi

**`config/db.js`**
```js
const pool = mysql.createPool({
  host    : 'localhost',
  user    : 'xfzy',       // ← sesuaikan
  password: '634117',     // ← sesuaikan
  database: 'tryfing'
});
```

**`config/jwt.js`** — ganti untuk production:
```js
const JWT_SECRET = process.env.JWT_SECRET || 'ganti_dengan_secret_kamu';
```

### 5. Jalankan server
```bash
node server.js
```

Output yang benar:
```
🚀 Server berjalan di http://localhost:3000
✅ Server Backend Terhubung ke MQTT Broker!
```

Buka browser: **http://localhost:3000**

---

## 📡 Setup Mosquitto MQTT

### Install
```bash
# Ubuntu/Debian
sudo apt install mosquitto mosquitto-clients

# macOS
brew install mosquitto
```

### Buat akun
```bash
sudo mosquitto_passwd -c /etc/mosquitto/passwd esp32client
# masukkan password: tryfinggas
```

### Konfigurasi
```bash
sudo nano /etc/mosquitto/conf.d/absensi.conf
```
```
listener 1883
allow_anonymous false
password_file /etc/mosquitto/passwd
```

### Jalankan
```bash
sudo systemctl start mosquitto
sudo systemctl enable mosquitto
```

### Test
```bash
# Monitor semua traffic MQTT (buka di terminal terpisah)
mosquitto_sub -h 127.0.0.1 -u esp32client -P tryfinggas -t 'absensi/#' -v
```

---

## 🔌 Setup ESP32

### Hardware

| Komponen | Jumlah |
|----------|--------|
| ESP32 (board apapun) | 1 |
| Sensor Sidik Jari AS608 | 1 |
| LCD 16x2 I2C (alamat 0x27) | 1 |
| Buzzer aktif | 1 |

### Wiring
```
AS608  →  ESP32
  VCC  →  3.3V
  GND  →  GND
  TX   →  GPIO 16 (RX2)
  RX   →  GPIO 17 (TX2)

LCD I2C  →  ESP32
  VCC    →  5V
  GND    →  GND
  SDA    →  GPIO 21
  SCL    →  GPIO 22

Buzzer  →  ESP32
  (+)   →  GPIO 4
  (-)   →  GND
```

### Library Arduino (install via Library Manager)
- `Adafruit Fingerprint Sensor Library`
- `PubSubClient` by Nick O'Leary
- `ArduinoJson` by Benoit Blanchon
- `WiFiManager` by tzapu
- `LiquidCrystal I2C` by Frank de Brabander

### Upload & Konfigurasi Pertama Kali
1. Buka file `.ino` di Arduino IDE
2. Board: **ESP32 Dev Module**
3. Upload

ESP32 akan buka hotspot:
- **SSID:** `ESP_FingerRec`
- **Password:** `Bismillah`

Konek ke hotspot → buka `192.168.4.1` → isi form:

| Field | Nilai |
|-------|-------|
| WiFi SSID | nama WiFi kamu |
| WiFi Password | password WiFi kamu |
| Sensor ID | `01` |
| MQTT Server IP | IP laptop/server (`ip addr \| grep 192.168`) |
| MQTT Port | `1883` |
| MQTT Username | `esp32client` |
| MQTT Password | `tryfinggas` |

Klik **Save** → ESP32 restart → konek otomatis.

> ⚠️ Config tersimpan di flash ESP32, tidak hilang saat restart. Untuk reset ulang, uncomment `wm.resetSettings()` di kode lalu upload ulang.

---

## 🌐 Halaman Web

| URL | Akses | Keterangan |
|-----|-------|------------|
| `/login.html` | Semua | Login |
| `/dashboard.html` | Admin | Statistik & monitoring |
| `/register.html` | Admin | Daftarkan jari karyawan |
| `/restore.html` | Admin | Restore data ke sensor |
| `/format.html` | Admin | Hapus semua data sensor |
| `/history.html` | Admin | Riwayat absensi |
| `/laporan.html` | Admin | Laporan kehadiran |
| `/control.html` | Admin | Kontrol perangkat ESP32 |
| `/izin.html` | Semua | Pengajuan & persetujuan izin |
| `/profil.html` | Semua | Profil & ganti password |
| `/laporan-saya.html` | Staff | Kehadiran pribadi |

---

## 🔑 REST API

Semua endpoint kecuali `/api/auth/login` butuh header:
```
Authorization: Bearer <token>
```

### Auth
| Method | Endpoint | Body | Keterangan |
|--------|----------|------|------------|
| POST | `/api/auth/login` | `{username, password}` | Login, dapat token JWT (8 jam) |
| GET | `/api/auth/me` | — | Info user yang sedang login |
| POST | `/api/auth/change-password` | `{old_password, new_password}` | Ganti password |

### Command ESP32 — Admin only
| Method | Endpoint | Body |
|--------|----------|------|
| POST | `/api/command` | `{sensorId, action, ...}` |

| Action | Field Tambahan | Keterangan |
|--------|---------------|------------|
| `enroll` | `niy` (UUID karyawan) | Daftar jari baru |
| `get_slots` | — | Cek slot memori sensor |
| `restore_all` | — | Suntik semua data DB ke sensor |
| `delete_all` | — | Hapus semua jari di sensor |
| `delete` | `template_id` | Hapus satu jari |

---

## 📡 MQTT Topics

### ESP32 → Server

#### `absensi/{id}/login`
Dikirim saat jari cocok di sensor lokal.
```json
{"template_id": 5}
```

#### `absensi/{id}/register`
Dikirim setelah proses rekam jari selesai (2x tempel).
```json
{"template_id": 1, "template": "FF0A1B2C....(1024 karakter hex)"}
```

#### `absensi/{id}/status`
Dikirim setelah setiap command selesai dieksekusi, baik sukses maupun gagal.

**Format:**
```json
{
  "status": "success",
  "command": "delete_all",
  "message": "berhasil menghapus semua data"
}
```

**Semua kemungkinan payload:**

| Command | Status | Message |
|---------|--------|---------|
| `register` | `success` | `sidik jari berhasil didaftarkan` |
| `register` | `fail` | `memori sensor penuh` |
| `register` | `fail` | `timeout, jari tidak terdeteksi` |
| `register` | `fail` | `timeout, jari kedua tidak terdeteksi` |
| `register` | `fail` | `jari tidak cocok, gagal membuat model` |
| `register` | `fail` | `gagal menyimpan ke sensor` |
| `register` | `fail` | `gagal membaca template dari sensor` |
| `register` | `fail` | `gagal upload template ke server` |
| `delete` | `success` | `berhasil menghapus ID {x}` |
| `delete` | `fail` | `template_id tidak valid` |
| `delete` | `fail` | `gagal menghapus ID {x}` |
| `delete_all` | `success` | `berhasil menghapus semua data` |
| `delete_all` | `fail` | `gagal menghapus semua data` |
| `get_slots` | `success` | `berhasil membaca slot memori` |
| `get_slots` | `fail` | `gagal mengirim data slots` |
| `get_sensor_id` | `success` | `berhasil membaca sensor ID` |
| `upload_done` | `success` | `semua template berhasil direstore` |
| `restore` (per template gagal) | `fail` | `gagal mengirim template ID {x}` |

#### `absensi/{id}/slots`
Dikirim sebagai balasan perintah `get_slots`.
```json
{"sensor_id": "01", "slots": [1, 3, 5, 7, 12]}
```

#### `absensi/{id}/sensorinfo`
Dikirim otomatis setiap ESP32 konek ke broker.
```json
{"sensor_id": "01"}
```

---

### Server → ESP32

#### `absensi/{id}/display`
Kontrol penuh tampilan LCD + buzzer. Server yang pegang kendali.
```json
{"line1": "Selamat Datang", "line2": "Ahmad Rizky", "buzzer": "sukses"}
{"line1": "Mode: LOGIN",    "line2": "Tempelkan Jari", "buzzer": ""}
{"line1": "Akses Ditolak",  "line2": "Jari Tdk Dikenal", "buzzer": "gagal"}
```
Nilai `buzzer` valid: `sukses` `gagal` `notif` `""` (diam)

#### `absensi/{id}/command`
Kirim perintah ke ESP32.
```json
{"command": "register"}
{"command": "delete",     "template_id": 5}
{"command": "delete_all"}
{"command": "get_slots"}
{"command": "get_sensor_id"}
{"command": "upload_done"}
```

#### `absensi/{id}/restore`
Inject satu template dari DB ke sensor. Dikirim satu per satu dengan jeda 1.5 detik.
```json
{"template_id": 5, "template": "FF0A1B2C....(1024 karakter hex)"}
```
Setelah semua selesai, server kirim `upload_done` via `/command`.

---

## 🔄 Alur Sistem

### Absensi
```
1. User tempel jari ke sensor
2. ESP32 cocokkan dengan data lokal sensor
3. ESP32  →  absensi/01/login {"template_id":5}
4. Server cari di MySQL → cek sesi & status jam hari ini
5. Server INSERT ke absensi_history
6. Server  →  absensi/01/display {"line1":"Ahmad","line2":"Hadir","buzzer":"sukses"}
7. Server reset LCD ke "Mode: LOGIN" otomatis setelah 3 detik
```

### Daftar Jari Baru
```
1. Admin isi UUID karyawan di /register.html → klik Daftar
2. Frontend  →  POST /api/command {action:"enroll", niy:"2026001", sensorId:"01"}
3. Server simpan sesi registrasi di memori
4. Server  →  absensi/01/command {"command":"register"}
5. ESP32 tampilkan "Mode Daftar, Tempelkan Jari"
6. User tempel jari 2x di sensor
7. ESP32 simpan ke memori sensor lokal
8. ESP32  →  absensi/01/register {"template_id":1,"template":"FF0A..."}
9. Server INSERT ke tabel fingerprint
10. Server  →  absensi/01/display {"line1":"Sukses Daftar!","buzzer":"sukses"}
```

### Restore Data ke Sensor Baru
```
1. Admin buka /restore.html → klik Restore
2. Server ambil semua template dari MySQL
3. Server  →  absensi/01/restore {template_id, template}  (per jari, jeda 1.5 detik)
4. Setelah semua  →  absensi/01/command {"command":"upload_done"}
5. ESP32  →  absensi/01/status {"status":"sukses","message":"all data restored"}
6. Server  →  absensi/01/display {"line1":"Restore Selesai","buzzer":"sukses"}
```

---

## 👤 Akun Default

| Username | Password | Role |
|----------|----------|------|
| `administrator` | `admin123` | Admin |

> Ganti password setelah login pertama via `/profil.html`.

---

## 🐛 Troubleshooting

### ESP32 LCD stuck "MQTT Connecting"
```bash
# 1. Cek IP laptop
ip addr | grep 192.168

# 2. Cek Mosquitto jalan
sudo systemctl status mosquitto

# 3. Monitor traffic
mosquitto_sub -h 127.0.0.1 -u esp32client -P tryfinggas -t 'absensi/#' -v
```
Pastikan IP di portal WiFiManager ESP32 = IP laptop dari perintah `ip addr`.

### Tombol control.html tidak merespons
Cek di browser DevTools → Console:
```js
localStorage.getItem('absensi_token') // harus ada isinya, bukan null
```
Kalau `null` → login dulu di `/login.html` baru buka halaman lain.

### Error "Token tidak ditemukan" saat curl
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"administrator","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -X POST http://localhost:3000/api/command \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"sensorId":"01","action":"get_slots"}'
```

### Absensi ditolak "Jadwal Blm Ada"
Admin perlu membuat sesi hari ini di tabel `session` via dashboard.

### Server tidak bisa start
```bash
# Port 3000 sudah dipakai?
lsof -i :3000

# MySQL konek?
mysql -u xfzy -p634117 tryfing -e "SHOW TABLES;"

# Mosquitto jalan?
sudo systemctl status mosquitto
```

---

## 📝 Catatan

- Config ESP32 (IP broker, credentials) tersimpan di flash NVS — tidak hilang saat restart
- Template sidik jari disimpan di 2 tempat: memori sensor fisik + kolom `template` di MySQL sebagai backup
- Jika sensor rusak/diganti → gunakan fitur **Restore** untuk inject ulang dari MySQL ke sensor baru
- Server mengontrol penuh tampilan LCD via topic `/display` — ESP32 tidak punya logika bisnis
- Anti double-scan: cooldown 1 detik + lock loop selama jari masih menempel