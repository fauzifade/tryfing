const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// GET /api/users — admin: semua, staff: hanya dirinya
router.get('/', authMiddleware, async (req, res) => {
    try {
        let query = `
            SELECT e.id as emp_id, e.uuid as niy, e.name as nama,
                   e.unit, e.role, f.server_id as id, f.template
            FROM employee e
            LEFT JOIN fingerprint f ON e.id = f.employee_id`;
        const params = [];
        if (req.user.role_id !== 1) {
            query += ' WHERE e.id = ?';
            params.push(req.user.emp_id);
        }
        query += ' ORDER BY e.name ASC';
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /api/users/history — admin: semua, staff: hanya dirinya
router.get('/history', authMiddleware, async (req, res) => {
    try {
        let query = `
            SELECT e.name as nama, e.uuid as niy, e.unit, e.role,
                   s.name as status_nama, ses.date as tanggal_sesi, ah.created_at
            FROM absensi_history ah
            JOIN employee e ON ah.employee_id = e.id
            LEFT JOIN status s ON ah.status_id = s.id
            LEFT JOIN session ses ON ah.session_id = ses.id`;
        const params = [];
        if (req.user.role_id !== 1) {
            query += ' WHERE ah.employee_id = ?';
            params.push(req.user.emp_id);
        }
        query += ' ORDER BY ah.created_at DESC LIMIT 100';
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
