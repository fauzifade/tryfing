const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { setRegistrasiAktif } = require('../mqtt/handler');
// Pastikan middleware lu bener importnya (sesuaikan kalau lu ga pake ini)
const { authMiddleware, adminOnly } = require('../middleware/auth'); 

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let mqttClient = null;

function setMqttClient(client) { mqttClient = client; }

// POST /api/command — admin only
router.post('/', authMiddleware, adminOnly, async (req, res) => {
    const { sensorId, action, niy, template_id } = req.body;
    const topicCommand = `absensi/${sensorId}/command`;
    const topicRestore = `absensi/${sensorId}/restore`; // [HIGHLIGHT] Diperbaiki, sebelumnya /upload

    if (!mqttClient) {
        return res.status(500).json({ status: 'error', message: 'MQTT Client belum siap.' });
    }

    // =========================================================
    // 1. ACTION: ENROLL (DAFTAR JARI BARU)
    // =========================================================
    if (action === 'enroll') {
        const [cekPegawai] = await pool.query(
            `SELECT id, name FROM employee WHERE uuid = ?`, [niy]
        );
        if (!cekPegawai.length) {
            return res.status(400).json({ status: 'error', message: `UUID ${niy} tidak ditemukan.` });
        }
        
        // Simpan sesi pendaftaran ke memori handler.js
        setRegistrasiAktif(cekPegawai[0].id);
        
        // [HIGHLIGHT] Diperbaiki jadi JSON
        mqttClient.publish(topicCommand, JSON.stringify({ command: "register" }));
        
        return res.json({ status: 'success', message: `Perintah dikirim! Tap jari ${cekPegawai[0].name} 2x di alat.` });
    }
    
    // =========================================================
    // 2. ACTION: RESTORE ALL (SUNTIK DATA DB KE SENSOR)
    // =========================================================
    else if (action === 'restore_all') {
        // Balik response ke FrontEnd duluan biar web gak muter/loading kelamaan
        res.json({ status: 'success', message: 'Memulai Restore, cek layar ESP32!' });
        
        try {
            // Ambil semua template sidik jari dari DB
            const [rows] = await pool.query(
                `SELECT server_id, template FROM fingerprint WHERE template IS NOT NULL AND template != ''`
            );
            
            for (const row of rows) {
                // [HIGHLIGHT] Publish ke topik /restore (BUKAN /upload)
                mqttClient.publish(topicRestore, JSON.stringify({
                    template_id: parseInt(row.server_id), 
                    template: row.template
                }));
                // Delay 1.5 detik per jari agar ESP32 dan Sensor AS608 gak nge-hang
                await sleep(1500); 
            }
            
            // [HIGHLIGHT] Perintah selesai, pake JSON "upload_done" sesuai ESP32
            mqttClient.publish(topicCommand, JSON.stringify({ command: "upload_done" }));
        } catch(err) { 
            console.error('Gagal Restore:', err); 
        }
    }
    
    // =========================================================
    // 3. ACTION: DELETE ALL (FORMAT MESIN)
    // =========================================================
    else if (action === 'delete_all') {
        // [HIGHLIGHT] Diperbaiki jadi JSON
        mqttClient.publish(topicCommand, JSON.stringify({ command: "delete_all" }));
        return res.json({ status: 'success', message: 'Perintah Format Semua dikirim ke mesin!' });
    }
    
    // =========================================================
    // 4. ACTION: DELETE SATUAN [FITUR BARU UNTUK FRONTEND]
    // =========================================================
    else if (action === 'delete') {
        if (!template_id) {
            return res.status(400).json({ status: 'error', message: 'template_id wajib diisi untuk hapus satuan.' });
        }
        
        mqttClient.publish(topicCommand, JSON.stringify({ 
            command: "delete", 
            template_id: parseInt(template_id) 
        }));
        return res.json({ status: 'success', message: `Perintah hapus ID Jari ${template_id} dikirim!` });
    }

    // =========================================================
    // 5. ACTION: GET SLOTS [FITUR BARU UNTUK FRONTEND]
    // =========================================================
    else if (action === 'get_slots') {
        mqttClient.publish(topicCommand, JSON.stringify({ command: "get_slots" }));
        return res.json({ status: 'success', message: 'Meminta data slot ke mesin, silakan pantau /slots.' });
    }

    // =========================================================
    // INVALID ACTION
    // =========================================================
    else {
        return res.status(400).json({ status: 'error', message: 'Perintah tidak dikenali.' });
    }
});

module.exports = { router, setMqttClient };