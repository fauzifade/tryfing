const mqtt = require('mqtt');
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const app = express();
const port = 3000;

// ====================== KONFIGURASI DATABASE BARU ======================
const dbConfig = {
    host: 'localhost',
    user: 'xfzy',           // Ganti jika beda
    password: '634117', // Ganti dengan password MySQL Anda
    database: 'tryfing'     // Pastikan nama databasenya sesuai
};

const pool = mysql.createPool(dbConfig);

// ====================== KONFIGURASI MQTT ======================
const MQTT_BROKER = 'mqtt://127.0.0.1'; 
const MQTT_USER   = 'esp32user';
const MQTT_PASS   = 'passwordku123';

// Variabel ini sekarang akan menyimpan 'employee.id' (Primary Key), bukan UUID/NIY lagi
let sesiRegistrasiAktif_EmpId = null; 
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const mqttClient = mqtt.connect(MQTT_BROKER, {
    username: MQTT_USER,
    password: MQTT_PASS,
    clientId: 'NodeJS-Backend'
});

mqttClient.on('connect', () => {
    console.log('✅ Server Backend Terhubung ke MQTT Broker!');
    mqttClient.subscribe('absensi/+/login');
    mqttClient.subscribe('absensi/+/register');
    mqttClient.subscribe('absensi/+/status');
});

// ====================== MENERIMA PESAN DARI ESP32 ======================
mqttClient.on('message', async (topic, message) => {
    const payload = message.toString();
    const topicParts = topic.split('/');
    const sensorId = topicParts[1];
    const action = topicParts[2];

    try {
        if (!payload.startsWith('{')) return; 
        const data = JSON.parse(payload);

        // ---------------------------------------------------------
        // 1. ABSENSI (LOGIN) -> Sesuaikan dengan Tabel absensi_history
        // ---------------------------------------------------------
        if (action === 'login') {
            const idJari = data.template_id; // Ini adalah 'server_id' di tabel fingerprint
            const topicBalasan = `absensi/${sensorId}/display`;

            // Cari nama pegawai berdasarkan server_id (ID di ESP32)
            const [rows] = await pool.query(
                `SELECT e.id as emp_id, e.name 
                 FROM fingerprint f 
                 JOIN employee e ON f.employee_id = e.id 
                 WHERE f.server_id = ?`, 
                 [idJari]
            );

            if (rows.length > 0) {
                const pegawai = rows[0];
                console.log(`✅ Akses Diterima: ${pegawai.name} (ID Pegawai: ${pegawai.emp_id})`);
                
                // CATATAN PENTING: Karena ERD Anda butuh session_id dan status_id, 
                // untuk sementara kita isi NULL atau angka default (misal 1) jika diizinkan DB.
                // Jika DB menolak NULL, pastikan Anda membuat 1 data dummy di tabel 'session' dan 'status'
                try {
                    await pool.query(
                        `INSERT INTO absensi_history (employee_id, session_id, status_id, created_at) 
                         VALUES (?, 1, 1, NOW())`,
                        [pegawai.emp_id] 
                    );
                } catch (dbErr) {
                    console.log("⚠️ Peringatan DB Absensi (Pastikan session_id/status_id valid):", dbErr.message);
                }
                
                mqttClient.publish(topicBalasan, JSON.stringify({ status: "sukses", name: pegawai.name }));
            } else {
                console.log(`❌ Akses Ditolak: ID Jari ${idJari} tidak terdaftar di Database!`);
                mqttClient.publish(topicBalasan, JSON.stringify({ status: "failed", name: "Tdk Dikenal" }));
            }
        }
        
        // ---------------------------------------------------------
        // 2. REGISTRASI -> Update Tabel fingerprint
        // ---------------------------------------------------------
        else if (action === 'register') {
            const idJariDariESP = data.template_id; // Ini jadi server_id
            const templateHex = data.template;

            if (sesiRegistrasiAktif_EmpId) {
                console.log(`\n💾 Disimpan di Server ID: ${idJariDariESP} untuk Employee ID: ${sesiRegistrasiAktif_EmpId}`);
                
                // Cek apakah pegawai ini sudah punya data sidik jari
                const [existing] = await pool.query(`SELECT * FROM fingerprint WHERE employee_id = ?`, [sesiRegistrasiAktif_EmpId]);
                
                if (existing.length > 0) {
                    // Update
                    await pool.query(
                        `UPDATE fingerprint SET template = ?, server_id = ? WHERE employee_id = ?`,
                        [templateHex, idJariDariESP, sesiRegistrasiAktif_EmpId]
                    );
                } else {
                    // Insert Baru
                    await pool.query(
                        `INSERT INTO fingerprint (employee_id, server_id, template) VALUES (?, ?, ?)`,
                        [sesiRegistrasiAktif_EmpId, idJariDariESP, templateHex]
                    );
                }

                console.log(`✅ Sukses! Data diamankan di database MySQL.`);
                sesiRegistrasiAktif_EmpId = null; // Reset
            }
        }
        
        // ---------------------------------------------------------
        // 3. STATUS RESTORE
        // ---------------------------------------------------------
        else if (action === 'status') {
            if (data.status === "sukses" && data.message === "all data restored") {
                console.log(`\n🎉 LAPORAN ESP32: Sukses, All Data Restored!`);
            }
        }
    } catch (e) {
        console.log("Error:", e.message);
    }
});

// ====================== API PANEL ADMIN ======================
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API: Ambil Data untuk Tabel Web
app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT e.uuid as niy, e.name as nama, f.server_id as id, f.template 
             FROM employee e 
             LEFT JOIN fingerprint f ON e.id = f.employee_id`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Terima Perintah dari Web
app.post('/api/command', async (req, res) => {
    const { sensorId, action, niy } = req.body; // 'niy' di input web sekarang mencari kolom 'uuid'
    const topicCommand = `absensi/${sensorId}/command`;

    // A. REGISTER
    if (action === 'enroll') {
        // Cari id (Primary Key) pegawai berdasarkan UUID yang diketik Admin
        const [cekPegawai] = await pool.query(`SELECT id, name FROM employee WHERE uuid = ?`, [niy]);
        
        if (cekPegawai.length === 0) {
            return res.status(400).json({ status: "error", message: `Gagal! UUID ${niy} tidak ada di tabel employee.` });
        }

        sesiRegistrasiAktif_EmpId = cekPegawai[0].id; // Kita simpan PK-nya, bukan UUID-nya
        console.log(`⚙️ Admin trigger Registrasi untuk ${cekPegawai[0].name}`);
        mqttClient.publish(topicCommand, "register"); 
        res.json({ status: "success", message: `Perintah dikirim! Silakan tap jari ${cekPegawai[0].name} di alat.` });
    }
    
    // B. RESTORE ALL
    else if (action === 'restore_all') {
        console.log(`⚙️ Memulai proses Restore...`);
        res.json({ status: "success", message: `Memulai Restore, silakan cek layar ESP32!` });
        
        try {
            // Ambil semua data fingerprint yang valid
            const [rows] = await pool.query(`SELECT server_id, template FROM fingerprint WHERE template IS NOT NULL AND template != ''`);
            
            for (const row of rows) {
                const payloadRestore = JSON.stringify({
                    template_id: parseInt(row.server_id),
                    template: row.template
                });
                mqttClient.publish(`absensi/${sensorId}/upload`, payloadRestore);
                await sleep(1500); 
            }
            mqttClient.publish(topicCommand, "restore_done");
        } catch (err) {
            console.error("Gagal Restore:", err);
        }
    }
    
    // C. DELETE ALL
    else if (action === 'delete_all') {
        mqttClient.publish(topicCommand, "delete_all");
        res.json({ status: "success", message: "Perintah Format Semua dikirim!" });
    }
    else {
        res.status(400).json({ status: "error", message: "Perintah tidak dikenali!" });
    }
});

app.listen(port, () => {
    console.log(`🚀 Server Backend Node.js (MySQL Baru Connected) berjalan di http://localhost:${port}`);
});