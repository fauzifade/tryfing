const mqtt = require('mqtt');
const mysql = require('mysql2'); // Nanti kita manfaatin fitur promise() dari sini
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
const PORT = 3000;

// ==========================================
// 1. KONFIGURASI DATABASE MYSQL
// ==========================================
const db = mysql.createConnection({
    host: 'localhost',
    user: 'xfzy',
    password: '634117',
    database: 'tryfing'
});

db.connect((err) => {
    if (err) console.error('❌ Error koneksi MySQL:', err);
    else console.log('✅ Terhubung ke database MySQL [tryfing]');
});

// ==========================================
// 2. KONFIGURASI MQTT BROKER
// ==========================================
const mqttClient = mqtt.connect('mqtt://localhost:1883', {
    username: 'esp32user',
    password: 'passwordku123'
});

mqttClient.on('connect', () => {
    console.log('✅ Terhubung ke MQTT Broker Mosquitto');
    mqttClient.subscribe('fingerprint/+/register');
    mqttClient.subscribe('fingerprint/+/login');
});

// ==========================================
// 3. STATE MEMORI NODE.JS (BUFFER REGISTER)
// ==========================================
let pendingNIY = null; 

// ==========================================
// 4. MENANGANI PESAN MASUK (REGISTER & LOGIN)
// ==========================================
mqttClient.on('message', (topic, message) => {
    const rawMessage = message.toString();
    console.log(`\n📥 Pesan masuk di topik [${topic}]: ${rawMessage}`);

    let data = {};
    const sensor_id = topic.split('/')[1];

    // --- LOGIKA BARU: BISA BACA JSON MAUPUN TEKS BIASA ---
    if (rawMessage.startsWith('{')) {
        // Kalau formatnya JSON
        data = JSON.parse(rawMessage);
    } 
    else if (rawMessage.includes('LOGIN_SUKSES')) {
        // Kalau formatnya teks "LOGIN_SUKSES|ID:2|CONF:106"
        // Kita pecah teksnya pakai pemisah "|"
        const parts = rawMessage.split('|'); 
        const idPart = parts[1].split(':'); // Ambil "ID:2" lalu pecah jadi ["ID", "2"]
        
        data = {
            sensor: sensor_id,
            id: parseInt(idPart[1]) // Ambil angka 2-nya
        };
        console.log(`🔍 Berhasil membedah teks manual: Sensor ${sensor_id}, ID ${data.id}`);
    } 
    else {
        // Kalau beneran cuma pesan status biasa
        console.log(`⚠️ Pesan Status dari Alat: ${rawMessage}`);
        mqttClient.publish(`fingerprint/${sensor_id}/status`, rawMessage);
        return; 
    }

    // --- LANJUT KE PROSES DATABASE (Sama kayak sebelumnya) ---
    try {
        if (topic.includes('/register')) {
            const template = data.template;
            
            console.log(`\n🔍 Menerima Template Jari dari ESP32...`);
            console.log(`📌 Mengecek antrian NIY... (Isi pendingNIY sekarang: ${pendingNIY})`);

            if (pendingNIY !== null) {
                console.log(`✅ Cocok! Menyimpan jari ini untuk NIY: ${pendingNIY}`);
                
                const sql = 'INSERT INTO staff_fing (niy, fitur) VALUES (?, ?)';
                db.query(sql, [pendingNIY, template], (err) => {
                    if (err) {
                        console.error('❌ DATABASE ERROR: Gagal simpan fitur jari:', err.message);
                    } else {
                        console.log(`💾 SUKSES BESAR! Jari milik NIY ${pendingNIY} sudah masuk ke tabel staff_fing MySQL.`);
                        pendingNIY = null; // Kosongin antrian buat orang berikutnya
                    }
                });
            } else {
                console.log('⚠️ DITOLAK: Jari masuk, tapi tidak ada NIY yang antri. Pastikan Anda klik tombol "Scan Jari" di Web terlebih dahulu, dan JANGAN me-restart Node.js saat alat sedang proses scan!');
            }
        }
        
        else if (topic.includes('/login')) {
            const finger_id = data.id;

            const sqlCariOrang = 'SELECT niy FROM staff_fing_distribution WHERE sensor_id = ? AND fing_id = ?';
            db.query(sqlCariOrang, [sensor_id, finger_id], (err, results) => {
                if (err) return console.error(err);
                
                if (results.length === 0) {
                    console.log(`❌ Ditolak: Finger ID ${finger_id} tidak terdaftar di alat ini!`);
                    mqttClient.publish(`fingerprint/${sensor_id}/status`, '❌ Ditolak: Akses Tidak Ada');
                    return;
                }

                const niy = results[0].niy;
                const jamSekarang = new Date().getHours();
                let jenisAbsen = '';

                // Logika Jam (6-9, 9-15, 15-21)
                if (jamSekarang >= 6 && jamSekarang < 9) jenisAbsen = 'Login';
                else if (jamSekarang >= 9 && jamSekarang < 15) jenisAbsen = 'Login Late';
                else if (jamSekarang >= 15 && jamSekarang < 22) jenisAbsen = 'Logout';
                else {
                    mqttClient.publish(`fingerprint/${sensor_id}/status`, '⚠️ Luar Jam Absen');
                    return;
                }

                const sqlAbsen = 'INSERT INTO absensi (niy, jenis, sensor_id) VALUES (?, ?, ?)';
                db.query(sqlAbsen, [niy, jenisAbsen, sensor_id], (err2) => {
                    if (err2) return console.error(err2);
                    
                    db.query('SELECT nama FROM staff WHERE niy = ?', [niy], (err3, staffRes) => {
                        const nama = staffRes[0].nama;
                        const pesanNotif = `✅ ${nama} - ${jenisAbsen} Berhasil!`;
                        console.log(`⏱️ ${pesanNotif}`);
                        mqttClient.publish(`fingerprint/${sensor_id}/status`, pesanNotif);
                    });
                });
            });
        }
    } catch (error) {
        console.error('❌ Error processing data:', error.message);
    }
});

// ==========================================
// 5. API UNTUK WEB DASHBOARD (MASTER DATA)
// ==========================================

app.get('/api/staff', (req, res) => {
    const sql = `
        SELECT s.niy, s.nama, s.biro, 
        CASE WHEN sf.fitur IS NOT NULL THEN 'Sudah' ELSE 'Belum' END as status_jari
        FROM staff s
        LEFT JOIN staff_fing sf ON s.niy = sf.niy
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post('/api/staff', (req, res) => {
    const { niy, nama, biro } = req.body;
    const sql = 'INSERT INTO staff (niy, nama, biro) VALUES (?, ?, ?)';
    db.query(sql, [niy, nama, biro], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Data Pegawai Berhasil Ditambahkan!' });
    });
});

app.post('/api/trigger-register', (req, res) => {
    const { niy, sensor_admin } = req.body; 
    pendingNIY = niy; 
    
    // Pakai ID 127 sebagai buffer/tong sampah sementara di alat
    const commandTopic = `fingerprint/${sensor_admin}/command`;
    mqttClient.publish(commandTopic, 'register 127', () => {
        res.json({ message: 'Mode scan aktif! Silakan tempel jari ke sensor.' });
    });
});

// ==========================================
// 6. API BARU: DISTRIBUSI (ACCESS CONTROL)
// ==========================================

// Endpoint: Tarik daftar pegawai yang UDAH PUNYA sidik jari untuk didistribusikan
app.get('/api/staff-ready', (req, res) => {
    const sql = `
        SELECT s.niy, s.nama, s.biro 
        FROM staff s
        JOIN staff_fing sf ON s.niy = sf.niy
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// ==========================================
// 7. API BARU: LOG ABSENSI
// ==========================================
app.get('/api/absensi', (req, res) => {
    // Kita tarik data absen dan gabungin sama nama/biro pegawai
    const sql = `
        SELECT a.id, a.waktu, a.niy, s.nama, s.biro, a.jenis, a.sensor_id 
        FROM absensi a
        JOIN staff s ON a.niy = s.niy
        ORDER BY a.waktu DESC
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error('❌ Error pas narik data absensi:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// ==========================================
// 8. API BARU: AUTENTIKASI LOGIN WEB
// ==========================================
app.post('/api/login', (req, res) => {
    const { niy } = req.body;

    if (!niy) {
        return res.status(400).json({ error: "NIY tidak boleh kosong!" });
    }

    // Cari NIY ini di database dan cek rolenya
    const sql = 'SELECT niy, nama, role FROM staff WHERE niy = ?';
    db.query(sql, [niy], (err, results) => {
        if (err) return res.status(500).json({ error: "Terjadi kesalahan database" });

        if (results.length === 0) {
            return res.status(401).json({ error: "Login Gagal: NIY tidak ditemukan!" });
        }

        const user = results[0];
        
        // Simulasikan pembuatan "Sesi/Token" dengan ngirim balik data user
        res.json({
            message: "Login Berhasil",
            user: {
                niy: user.niy,
                nama: user.nama,
                role: user.role
            }
        });
    });
});

// ==========================================
// 9. API BARU: LAPORAN ABSENSI (DENGAN FILTER)
// ==========================================
app.get('/api/laporan', (req, res) => {
    const { tgl_mulai, tgl_akhir, biro } = req.query;

    // Filter wajib: Rentang Tanggal
    if (!tgl_mulai || !tgl_akhir) {
        return res.status(400).json({ error: "Tanggal mulai dan akhir harus diisi!" });
    }

    let sql = `
        SELECT DATE(a.waktu) as tanggal, TIME(a.waktu) as jam, a.niy, s.nama, s.biro, a.jenis, a.sensor_id 
        FROM absensi a
        JOIN staff s ON a.niy = s.niy
        WHERE DATE(a.waktu) BETWEEN ? AND ?
    `;
    let params = [tgl_mulai, tgl_akhir];

    // Filter opsional: Biro (Kalau admin mau narik data per unit aja)
    if (biro && biro.trim() !== '') {
        sql += ` AND s.biro LIKE ?`;
        params.push(`%${biro}%`);
    }

    // Urutkan dari tanggal terlama ke terbaru, lalu berdasarkan nama
    sql += ` ORDER BY DATE(a.waktu) ASC, s.nama ASC, TIME(a.waktu) ASC`;

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('❌ Error API Laporan:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Endpoint: Eksekusi Distribusi (Bisa massal/bulk)
app.post('/api/distribusi', async (req, res) => {
    const { sensor_id, niy_list } = req.body; // niy_list bentuknya array: ["123", "456"]

    if (!sensor_id || !niy_list || niy_list.length === 0) {
        return res.status(400).json({ error: "Sensor ID dan Data Pegawai harus diisi!" });
    }

    try {
        const dbPromise = db.promise(); // Pakai mode Async biar aman pas ngelooping database
        let successCount = 0;

        // Kita looping setiap NIY yang mau dikasih akses
        for (let niy of niy_list) {
            
            // 1. Cek: Apakah orang ini udah punya akses di pintu ini?
            const [cekAkses] = await dbPromise.query('SELECT id FROM staff_fing_distribution WHERE niy = ? AND sensor_id = ?', [niy, sensor_id]);
            if (cekAkses.length > 0) continue; // Udah punya, skip ke orang berikutnya!

            // 2. Tarik template hex-nya dari Bank Data
            const [cekJari] = await dbPromise.query('SELECT fitur FROM staff_fing WHERE niy = ?', [niy]);
            if (cekJari.length === 0) continue; // Mustahil terjadi sih, tapi jaga-jaga
            const template_hex = cekJari[0].fitur;

            // 3. CARI ID KOSONG DI SENSOR INI (Maksimal 126)
            const [usedIdsRaw] = await dbPromise.query('SELECT fing_id FROM staff_fing_distribution WHERE sensor_id = ?', [sensor_id]);
            const usedIds = usedIdsRaw.map(row => row.fing_id);
            
            let new_fing_id = 1; // Mulai nyari dari angka 1
            while (usedIds.includes(new_fing_id) && new_fing_id < 127) {
                new_fing_id++; // Kalau angka dipake, naik ke angka berikutnya
            }

            if (new_fing_id >= 127) {
                console.log(`⚠️ Peringatan: Sensor ${sensor_id} penuh kapasitasnya!`);
                break; // Berhenti ngelooping kalau alatnya udah full
            }

            // 4. Catat di database distribusi kalau dia dikasih akses di alat ini
            await dbPromise.query('INSERT INTO staff_fing_distribution (niy, sensor_id, fing_id) VALUES (?, ?, ?)', [niy, sensor_id, new_fing_id]);

            // 5. Tembak payload ke MQTT buat nyuntik/upload ke ESP32 secara remote
            const payloadMQTT = { id: new_fing_id, template: template_hex };
            mqttClient.publish(`fingerprint/${sensor_id}/upload`, JSON.stringify(payloadMQTT));
            
            successCount++;
        }

        res.json({ message: `Berhasil mendistribusikan ${successCount} sidik jari ke Sensor ${sensor_id}!` });

    } catch (error) {
        console.error('❌ Error Distribusi:', error);
        res.status(500).json({ error: "Terjadi kesalahan sistem saat distribusi." });
    }
});

// Jalankan Server API
app.listen(PORT, () => {
    console.log(`🚀 API Server (V3 - Final) berjalan di http://localhost:${PORT}`);
});