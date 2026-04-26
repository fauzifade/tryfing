const express = require('express');
const path = require('path');
const mqtt = require('mqtt');

const { setupMqttHandlers } = require('./mqtt/handler');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const { router: commandRouter, setMqttClient } = require('./routes/command');
const laporanRouter = require('./routes/laporan');
const izinRouter = require('./routes/izin');

const app = express();
const PORT = 3000;

const mqttClient = mqtt.connect('mqtt://127.0.0.1', {
    username: 'esp32client',
    password: 'tryfinggas',
    clientId: 'NodeJS-Backend-' + Math.random().toString(16).slice(2, 8) 
});

// 2. TAMBAHKAN LOG DEBUG INI SEBELUM setupMqttHandlers
mqttClient.on('connect', () => {
    console.log("🟢 [DEBUG] Backend BERHASIL connect ke MQTT Broker!");
    // Paksa subscribe ke semua topik absensi untuk testing
    mqttClient.subscribe('absensi/#'); 
});

setupMqttHandlers(mqttClient);
setMqttClient(mqttClient);
// ====================== EXPRESS ======================
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/login.html'));

// API Routes
app.use('/api/auth',    authRouter);
app.use('/api/users',   usersRouter);
app.use('/api/command', commandRouter);
app.use('/api/laporan', laporanRouter);
app.use('/api/izin',    izinRouter);

// ====================== START ======================
app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});
