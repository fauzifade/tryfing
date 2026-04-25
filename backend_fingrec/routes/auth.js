const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { JWT_SECRET } = require('../config/jwt');
const { authMiddleware } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ status: 'error', message: 'Username dan password wajib diisi.' });
    }
    try {
        const [rows] = await pool.query(
            `SELECT u.id, u.name, u.password_hash, u.role_id, u.emp_id,
                    e.name as emp_name, e.unit, e.role as emp_role, e.uuid
             FROM user u
             LEFT JOIN employee e ON u.emp_id = e.id
             WHERE u.name = ? LIMIT 1`,
            [username]
        );
        if (!rows.length) {
            return res.status(401).json({ status: 'error', message: 'Username atau password salah.' });
        }
        const user = rows[0];
        const valid = await bcrypt.compare(password, user.password_hash || '');
        if (!valid) {
            return res.status(401).json({ status: 'error', message: 'Username atau password salah.' });
        }
        const payload = {
            user_id:  user.id,
            emp_id:   user.emp_id,
            name:     user.name,
            role_id:  user.role_id,
            emp_name: user.emp_name,
            unit:     user.unit,
            emp_role: user.emp_role,
            uuid:     user.uuid
        };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
        res.json({ status: 'success', token, user: payload });
    } catch(err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
    res.json({ status: 'success', user: req.user });
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, async (req, res) => {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password || new_password.length < 6) {
        return res.status(400).json({ status: 'error', message: 'Password baru minimal 6 karakter.' });
    }
    try {
        const [rows] = await pool.query(
            `SELECT password_hash FROM user WHERE id = ?`, [req.user.user_id]
        );
        if (!rows.length) {
            return res.status(404).json({ status: 'error', message: 'User tidak ditemukan.' });
        }
        const valid = await bcrypt.compare(old_password, rows[0].password_hash || '');
        if (!valid) {
            return res.status(401).json({ status: 'error', message: 'Password lama salah.' });
        }
        const hash = await bcrypt.hash(new_password, 10);
        await pool.query(`UPDATE user SET password_hash = ? WHERE id = ?`, [hash, req.user.user_id]);
        res.json({ status: 'success', message: 'Password berhasil diubah.' });
    } catch(err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;
