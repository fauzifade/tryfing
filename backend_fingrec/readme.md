# 🖐 Sistem Absensi Fingerprint IoT

Sistem absensi berbasis sidik jari menggunakan ESP32 + Sensor AS608 + MQTT + Node.js + MySQL.

---

## 📦 Kebutuhan Software

| Software | Link Download |
|----------|--------------|
| Node.js v18+ | https://nodejs.org |
| MySQL 8+ | https://dev.mysql.com/downloads |
| Mosquitto MQTT Broker | https://mosquitto.org/download |
| Arduino IDE | https://www.arduino.cc/en/software |

---

## 🗂️ Struktur Folder

```
backend_fingrec/
├── config/
│   ├── db.js          → koneksi MySQL
│   └── jwt.js         → secret key JWT
├── middleware/
│   └── auth.js        → middleware cek token
├── mqtt/
│   └── handler.js     → logic semua pesan MQTT
├── public/            → file HTML, CSS, JS frontend
├── routes/
│   ├── auth.js        → login, logout, ganti password
│   ├── users.js       → CRUD karyawan
│   ├── command.js     → kirim perintah ke ESP32
│   ├── laporan.js     → rekap absensi
│   └── izin.js        → perizinan
└── server.js          → entry point
```

---

## ⚙️ Cara Install & Jalankan

### 1. Clone / Copy project
```bash
cd ~/
git clone <https://github.com/fauzifade/tryfing.git> backend_fingrec
cd backend_fingrec
```

### 2. Install dependencies Node.js
```bash
npm install
```

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
Lalu import schema:
```bash
mysql -u xfzy -p634117 tryfing < migration.sql
```

### 4. Setup MQTT Broker (Mosquitto)

Buat file password:
```bash
sudo mosquitto_passwd -c /etc/mosquitto/passwd esp32client
# masukkan password: tryfinggas
```

Buat file config `/etc/mosquitto/conf.d/absensi.conf`:
```
listener 1883
allow_anonymous false
password_file /etc/mosquitto/passwd
```

Jalankan Mosquitto:
```bash
sudo systemctl start mosquitto
sudo systemctl enable mosquitto
```

Cek apakah jalan:
```bash
sudo systemctl status mosquitto
```

### 5. Jalankan server Node.js
```bash
node server.js
```

Output yang benar:
```
🚀 Server berjalan di http://localhost:3000
✅ Server Backend yaping nigga
✅ Server Backend Terhubung ke MQTT Broker!
```

Buka browser: **http://localhost:3000**

---

## 🔌 Setup ESP32

### Hardware yang dibutuhkan
| Komponen | Jumlah |
|----------|--------|
| ESP32 | 1 |
| Sensor Sidik Jari AS608 | 1 |
| LCD 16x2 I2C (alamat 0x27) | 1 |
| Buzzer aktif | 1 |

### Wiring
```
AS608 → ESP32
  VCC → 3.3V
  GND → GND
  TX  → GPIO 16 (RX2)
  RX  → GPIO 17 (TX2)

LCD I2C → ESP32
  VCC → 5V
  GND → GND
  SDA → GPIO 21
  SCL → GPIO 22

Buzzer → ESP32
  (+) → GPIO 4
  (-) → GND
```

### Library Arduino yang dibutuhkan
Install via Library Manager Arduino IDE:
- `Adafruit Fingerprint Sensor Library`
- `PubSubClient` by Nick O'Leary
- `ArduinoJson` by Benoit Blanchon
- `WiFiManager` by tzapu
- `LiquidCrystal I2C` by Frank de Brabander

### Upload kode ke ESP32
1. Buka file `.ino` di Arduino IDE
2. Pilih board: `ESP32 Dev Module`
3. Upload

### Konfigurasi ESP32 (pertama kali)
Setelah upload pertama, ESP32 akan buka hotspot:
- **SSID:** `ESP_FingerRec`
- **Password:** `Bismillah`

Konek HP/laptop ke hotspot itu, buka browser ke `192.168.4.1`, isi form:

| Field | Nilai |
|-------|-------|
| WiFi SSID | nama WiFi kamu |
| WiFi Password | password WiFi kamu |
| Sensor ID | `01` |
| MQTT Server IP | IP laptop/server (cek dengan `ip addr`) |
| MQTT Port | `1883` |
| MQTT Username | `esp32client` |
| MQTT Password | `tryfinggas` |

Klik Save → ESP32 restart → konek otomatis.

---

## 🌐 REST API

Semua endpoint (kecuali login) butuh header:
```
Authorization: Bearer <token>
```

### Auth
| Method | URL | Body | Keterangan |
|--------|-----|------|------------|
| POST | `/api/auth/login` | `{username, password}` | Login, dapat token |
| GET | `/api/auth/me` | - | Info user login |
| POST | `/api/auth/change-password` | `{old_password, new_password}` | Ganti password |

### Command (Admin only)
| Method | URL | Body | Keterangan |
|--------|-----|------|------------|
| POST | `/api/command` | `{sensorId, action, niy?}` | Kirim perintah ke ESP32 |

Nilai `action` yang tersedia:

| Action | Butuh field tambahan | Keterangan |
|--------|---------------------|------------|
| `enroll` | `niy` (UUID karyawan) | Daftarkan jari baru |
| `get_slots` | - | Cek memori sensor |
| `restore_all` | - | Suntik semua data dari DB ke sensor |
| `delete_all` | - | Hapus semua jari di sensor |
| `delete` | `template_id` | Hapus satu jari |

---

## 📡 MQTT Topics

### ESP32 → Server

| Topic | Format Payload | Keterangan |
|-------|---------------|------------|
| `absensi/01/login` | `{"template_id":5}` | Jari terdeteksi |
| `absensi/01/register` | `{"template_id":5,"template":"FF0A...1024hex"}` | Data jari baru |
| `absensi/01/status` | `{"status":"sukses","message":"deleted_all"}` | Laporan hasil |
| `absensi/01/slots` | `{"sensor_id":"01","slots":[1,3,5]}` | Daftar slot terisi |
| `absensi/01/sensorinfo` | `{"sensor_id":"01"}` | Sensor online |

### Server → ESP32

| Topic | Format Payload | Keterangan |
|-------|---------------|------------|
| `absensi/01/display` | `{"line1":"Teks","line2":"Teks","buzzer":"sukses"}` | Tampilan LCD |
| `absensi/01/command` | `{"command":"register"}` | Perintah ke ESP32 |
| `absensi/01/restore` | `{"template_id":5,"template":"FF0A..."}` | Inject template |

Nilai `buzzer` valid: `sukses` `gagal` `notif` `""` (diam)

---

## 🔄 Alur Sistem

### Login / Absensi
```
1. User tempel jari ke sensor
2. ESP32 kirim → absensi/01/login {"template_id":5}
3. Server cari di MySQL, cek sesi & status hari ini
4. Server kirim → absensi/01/display {"line1":"Ahmad","line2":"Hadir","buzzer":"sukses"}
5. Server otomatis reset LCD ke "Mode: LOGIN" setelah 3 detik
```

### Daftar Jari Baru
```
1. Admin buka /register.html, isi UUID karyawan, klik Daftar
2. Frontend POST /api/command {action:"enroll", niy:"2026001"}
3. Server kirim → absensi/01/command {"command":"register"}
4. ESP32 tampilkan "Mode Daftar, Tempelkan Jari"
5. User tempel jari 2x
6. ESP32 kirim → absensi/01/register {"template_id":1,"template":"FF0A..."}
7. Server simpan ke MySQL
8. ESP32 tampilkan "Sukses Daftar!"
```

### Restore Data ke Sensor Baru
```
1. Admin buka /restore.html, klik Restore
2. Server ambil semua template dari MySQL
3. Server kirim satu per satu → absensi/01/restore {template_id, template}
   (jeda 1.5 detik per template)
4. Setelah semua → absensi/01/command {"command":"upload_done"}
5. ESP32 tampilkan "Upload Selesai!"
```

---

## 🐛 Troubleshooting

### ESP32 tidak konek MQTT
```bash
# Cek IP laptop kamu
ip addr | grep 192.168

# Cek apakah mosquitto jalan
sudo systemctl status mosquitto

# Monitor traffic MQTT
mosquitto_sub -h 127.0.0.1 -u esp32client -P tryfinggas -t 'absensi/#' -v
```
Pastikan IP di konfigurasi ESP32 sama dengan IP laptop.

### Login gagal di browser
```bash
# Test manual
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"administrator","password":"admin123"}'
```

### Tombol di control.html tidak merespons
Pastikan sudah login dulu di `/login.html`. Token disimpan di localStorage browser.
Cek di DevTools → Console:
```js
localStorage.getItem('absensi_token') // harus ada isinya, bukan null
```

### Server error saat start
```bash
# Cek apakah port 3000 sudah dipakai
lsof -i :3000

# Cek koneksi MySQL
mysql -u xfzy -p634117 tryfing -e "SHOW TABLES;"
```

---

## 👤 Akun Default

| Username | Password | Role |
|----------|----------|------|
| administrator | admin123 | Admin |

Ganti password setelah login pertama via `/profil.html`.