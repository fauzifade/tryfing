const pool = require('../config/db');

let sesiRegistrasiAktif_EmpId = null;

// Objek untuk nyimpen timer reset layar per mesin (anti-bentrok)
const displayTimeouts = {};

function setupMqttHandlers(mqttClient) {
    mqttClient.on('connect', () => {
        console.log('✅ Server Backend Terhubung ke MQTT Broker!');
        mqttClient.subscribe('absensi/+/login');
        mqttClient.subscribe('absensi/+/register');
        mqttClient.subscribe('absensi/+/status');
        mqttClient.subscribe('absensi/+/slots'); // [BARU] Jangan lupa subscribe topik ini
    });

    mqttClient.on('message', async (topic, message) => {
        const payload = message.toString();
        const topicParts = topic.split('/');
        const sensorId = topicParts[1];
        const action = topicParts[2];

        // ==========================================================
        // FUNGSI INTI: KIRIM LAYAR & RESET OTOMATIS
        // ==========================================================
        const sendToDisplay = (line1, line2, buzzer) => {
            const topicBalasan = `absensi/${sensorId}/display`;
            
            // 1. Kirim tampilan yang diminta sekarang
            mqttClient.publish(topicBalasan, JSON.stringify({ line1, line2, buzzer }));

            // 2. Clear timer yang lama (biar layarnya nggak kedap-kedip kalau ditekan berkali-kali)
            if (displayTimeouts[sensorId]) {
                clearTimeout(displayTimeouts[sensorId]);
            }

            // 3. Set timer baru: SETELAH 3 DETIK, KEMBALI KE MODE LOGIN!
            displayTimeouts[sensorId] = setTimeout(() => {
                mqttClient.publish(topicBalasan, JSON.stringify({ 
                    line1: "Mode: LOGIN", 
                    line2: "Tempelkan Jari", 
                    buzzer: "" 
                }));
            }, 3000);
        };

        try {
            if (!payload.startsWith('{')) return;
            const data = JSON.parse(payload);

            // ==========================================================
            // 1. ABSENSI (LOGIN)
            // ==========================================================
            if (action === 'login') {
                const idJari = data.template_id;

                const [rows] = await pool.query(
                    `SELECT e.id as emp_id, e.name 
                     FROM fingerprint f 
                     JOIN employee e ON f.employee_id = e.id 
                     WHERE f.server_id = ?`,
                    [idJari]
                );

                if (rows.length > 0) {
                    const pegawai = rows[0];
                    console.log(`✅ Akses Diterima: ${pegawai.name}`);

                    try {
                        // 1. Cek Sesi Hari Ini
                        const [sessions] = await pool.query(
                            `SELECT id FROM session WHERE DATE(date) = CURDATE() LIMIT 1`
                        );
                        
                        // [PERBAIKAN]: Tolak absen kalau belum ada sesi di database
                        if (sessions.length === 0) {
                            console.log('⚠️ Absensi ditolak: Session/Jadwal hari ini belum dibuat admin.');
                            sendToDisplay("Gagal Absen", "Jadwal Blm Ada", "gagal");
                            return; // Stop eksekusi di sini
                        }
                        const sessionId = sessions[0].id;

                        // 2. Cek Status (Jam Masuk/Telat/Pulang)
                        const [statuses] = await pool.query(
                            `SELECT id, name FROM status WHERE CURTIME() >= from_time AND CURTIME() <= until_time LIMIT 1`
                        );
                        
                        // Kalau karyawan absen di luar jam yang ditentukan, kasih fallback
                        const statusId = statuses.length > 0 ? statuses[0].id : null;
                        const statusName = statuses.length > 0 ? statuses[0].name : 'Luar Jam';

                        // 3. Simpan ke Database
                        await pool.query(
                            `INSERT INTO absensi_history (employee_id, session_id, status_id, created_at) VALUES (?, ?, ?, NOW())`,
                            [pegawai.emp_id, sessionId, statusId]
                        );
                        
                        // 4. Perintahkan ESP nampilin SUKSES ABSEN
                        sendToDisplay(pegawai.name.substring(0, 16), statusName, "sukses");

                    } catch (dbErr) {
                        console.log('⚠️ Peringatan DB Absensi:', dbErr.message);
                        sendToDisplay("DB Error", "Cek Server!", "gagal");
                    }
                } else {
                    console.log(`❌ Akses Ditolak: ID Jari ${idJari} tidak terdaftar!`);
                    // Perintahkan ESP nampilin GAGAL ABSEN (Otomatis balik ke Login 3 dtk)
                    sendToDisplay("Akses Ditolak", "Jari Tdk Dikenal", "gagal");
                }
            }

            // ==========================================================
            // 2. REGISTRASI
            // ==========================================================
            else if (action === 'register') {
                const idJariDariESP = data.template_id;
                const templateHex = data.template;

                if (sesiRegistrasiAktif_EmpId) {
                    const [existing] = await pool.query(`SELECT * FROM fingerprint WHERE employee_id = ?`, [sesiRegistrasiAktif_EmpId]);

                    if (existing.length > 0) {
                        await pool.query(
                            `UPDATE fingerprint SET template = ?, server_id = ? WHERE employee_id = ?`,
                            [templateHex, idJariDariESP, sesiRegistrasiAktif_EmpId]
                        );
                    } else {
                        await pool.query(
                            `INSERT INTO fingerprint (employee_id, server_id, template) VALUES (?, ?, ?)`,
                            [sesiRegistrasiAktif_EmpId, idJariDariESP, templateHex]
                        );
                    }

                    console.log(`✅ Sukses! Data diamankan di database MySQL.`);
                    sesiRegistrasiAktif_EmpId = null;

                    // Perintahkan ESP nampilin SUKSES DAFTAR (Otomatis balik ke Login 3 dtk)
                    sendToDisplay("Sukses Daftar!", "Data Tersimpan", "sukses");
                }
            }

            // ==========================================================
            // 3. STATUS REPORTS (Restore, Delete All, Delete Satu)
            // ==========================================================
            else if (action === 'status') {
                if (data.message === 'all data restored' && data.status === 'sukses') {
                    // Restore selesai (Otomatis balik ke Login 3 dtk)
                    sendToDisplay("Restore Selesai", "Mesin Siap", "sukses");
                } 
                else if (data.message === 'deleted_all') {
                    // Hapus semua selesai (Otomatis balik ke Login 3 dtk)
                    if (data.status === 'sukses') sendToDisplay("Sukses!", "Semua Dihapus", "sukses");
                    else sendToDisplay("Gagal Format!", "Coba Lagi", "gagal");
                }
                else if (data.message === 'deleted') {
                    // Hapus satuan selesai (Otomatis balik ke Login 3 dtk)
                    if (data.status === 'sukses') sendToDisplay("Terhapus!", `ID Jari: ${data.template_id}`, "sukses");
                    else sendToDisplay("Gagal Hapus!", `ID Jari: ${data.template_id}`, "gagal");
                }
            }
            
            // ==========================================================
            // 4. PENGECEKAN SLOTS MEMORI
            // ==========================================================
            else if (action === 'slots') {
                console.log(`\n📊 Info Slot Terisi dari Mesin ${sensorId}:`, data.slots);
                // Info slots terkirim (Otomatis balik ke Login 3 dtk)
                sendToDisplay("Info Terkirim", "Cek Server Admin", "notif");
            }
            
        } catch (e) {
            console.log('Error MQTT handler:', e.message);
        }
    });
}

function setRegistrasiAktif(empId) {
    sesiRegistrasiAktif_EmpId = empId;
}

function getRegistrasiAktif() {
    return sesiRegistrasiAktif_EmpId;
}

module.exports = { setupMqttHandlers, setRegistrasiAktif, getRegistrasiAktif };