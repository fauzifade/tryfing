const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// GET /api/izin — admin: semua, staff: hanya miliknya
router.get('/', authMiddleware, async (req, res) => {
    const { status } = req.query;
    try {
        let where = [];
        const params = [];
        if (req.user.role_id !== 1) {
            where.push('iz.emp_id = ?');
            params.push(req.user.emp_id);
        }
        if (status) {
            where.push('iz.status = ?');
            params.push(status);
        }
        const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const [rows] = await pool.query(`
            SELECT iz.id, e.name as nama, e.unit, iz.emp_id,
                   iz.jenis, iz.dari, iz.sampai, iz.keterangan, iz.status, iz.created_at
            FROM izin iz
            JOIN employee e ON iz.emp_id = e.id
            ${whereClause}
            ORDER BY iz.created_at DESC LIMIT 100
        `, params);
        res.json(rows);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /api/izin — staff bisa ajukan untuk diri sendiri, admin bisa untuk siapa saja
router.post('/', authMiddleware, async (req, res) => {
    let { emp_id, jenis, dari, sampai, keterangan } = req.body;
    // Staff: paksa emp_id jadi miliknya sendiri
    if (req.user.role_id !== 1) emp_id = req.user.emp_id;
    if (!emp_id || !jenis || !dari || !sampai) {
        return res.status(400).json({ status: 'error', message: 'Field emp_id, jenis, dari, sampai wajib diisi.' });
    }
    try {
        await pool.query(
            `INSERT INTO izin (emp_id, jenis, dari, sampai, keterangan, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
            [emp_id, jenis, dari, sampai, keterangan || '']
        );
        res.json({ status: 'success', message: 'Izin berhasil diajukan.' });
    } catch(err) { res.status(500).json({ status: 'error', message: err.message }); }
});

// PATCH /api/izin/:id — hanya admin
router.patch('/:id', authMiddleware, adminOnly, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!['disetujui','ditolak'].includes(status)) {
        return res.status(400).json({ status: 'error', message: 'Status harus disetujui atau ditolak.' });
    }
    try {
        await pool.query(`UPDATE izin SET status = ? WHERE id = ?`, [status, id]);
        res.json({ status: 'success', message: `Izin berhasil ${status}.` });
    } catch(err) { res.status(500).json({ status: 'error', message: err.message }); }
});

module.exports = router;
