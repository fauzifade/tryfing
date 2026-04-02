const mqtt = require('mqtt');
const mysql = require('mysql2');

// Ambil ID dari argumen terminal (misal ngetik: node uploadKeSensor.js 1)
const targetId = process.argv[2];

if (!targetId) {
    console.log("❌ Masukkan ID jari yang mau diupload! (contoh: node uploadKeSensor.js 1)");
    process.exit(1);
}

const db = mysql.createConnection({
    host: 'localhost', user: 'xfzy', password: '634117', database: 'tryfing'
});

const mqttClient = mqtt.connect('mqtt://localhost:1883', {
    username: 'esp32user', password: 'passwordku123'
});

mqttClient.on('connect', () => {
    console.log(`📡 Mencari data Jari ID ${targetId} di MySQL...`);
    
    // Ambil template HEX dari database
    db.query('SELECT templet FROM user WHERE finger_id = ? LIMIT 1', [targetId], (err, results) => {
        if (err) throw err;
        
        if (results.length > 0) {
            const hexTemplate = results[0].templet;
            
            // Susun payload JSON untuk dikirim ke ESP32
            const payload = JSON.stringify({
                id: parseInt(targetId),
                template: hexTemplate
            });

            console.log(`📤 Mengirim template HEX ke MQTT (Topik: fingerprint/01/upload) ...`);
            
            // Publish ke ESP32
            mqttClient.publish('fingerprint/01/upload', payload, () => {
                console.log("✅ Perintah upload berhasil dikirim!");
                process.exit(0); // Matikan script kalau udah kekirim
            });
            
        } else {
            console.log(`❌ Data dengan ID ${targetId} tidak ditemukan di database!`);
            process.exit(1);
        }
    });
});