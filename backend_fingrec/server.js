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

// ====================== MQTT ======================
const mqttClient = mqtt.connect('mqtt://127.0.0.1', {
    username: 'esp32user',
    password: 'passwordku123',
    clientId: 'NodeJS-Backend'
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
