const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// GET /api/laporan?bulan=YYYY-MM
// Admin: semua karyawan | Staff: hanya dirinya sendiri
router.get('/', authMiddleware, async (req, res) => {
    const { bulan } = req.query;
    if (!bulan || !/^\d{4}-\d{2}$/.test(bulan)) {
        return res.status(400).json({ error: 'Parameter bulan wajib diisi format YYYY-MM.' });
    }
    const dari   = `${bulan}-01`;
    // hari terakhir bulan
    const [y, m] = bulan.split('-').map(Number);
    const sampai = new Date(y, m, 0).toISOString().slice(0,10);

    try {
        let empFilter = '';
        const params = [dari, sampai, sampai, dari];
        if (req.user.role_id !== 1) {
            empFilter = 'AND e.id = ?';
            params.push(req.user.emp_id);
        }

        const [rows] = await pool.query(`
            SELECT
                e.id as emp_id,
                e.name as nama,
                e.unit,
                e.role,
                e.uuid,
                SUM(CASE WHEN LOWER(s.name) = 'hadir'      THEN 1 ELSE 0 END) as hadir,
                SUM(CASE WHEN LOWER(s.name) = 'terlambat'  THEN 1 ELSE 0 END) as terlambat,
                SUM(CASE WHEN LOWER(s.name) = 'terlambat'
                    THEN GREATEST(0, TIMESTAMPDIFF(MINUTE, s.until_time, TIME(ah.created_at)))
                    ELSE 0 END) as total_menit_telat,
                COUNT(DISTINCT CASE WHEN iz.status = 'disetujui'
                    AND iz.dari <= ? AND iz.sampai >= ?
                    THEN iz.id END) as izin
            FROM employee e
            LEFT JOIN absensi_history ah
                ON ah.employee_id = e.id
                AND DATE(ah.created_at) BETWEEN ? AND ?
            LEFT JOIN status s ON ah.status_id = s.id
            LEFT JOIN izin iz ON iz.emp_id = e.id
            WHERE 1=1 ${empFilter}
            GROUP BY e.id, e.name, e.unit, e.role, e.uuid
            ORDER BY e.name ASC
        `, [sampai, dari, dari, sampai, ...(req.user.role_id !== 1 ? [req.user.emp_id] : [])]);

        // Hitung hari kerja bulan ini (exclude Minggu)
        let hariKerja = 0;
        for (let d = new Date(dari); d <= new Date(sampai); d.setDate(d.getDate()+1)) {
            if (d.getDay() !== 0) hariKerja++;
        }

        const result = rows.map(r => ({
            ...r,
            hadir:       parseInt(r.hadir)       || 0,
            terlambat:   parseInt(r.terlambat)   || 0,
            izin:        parseInt(r.izin)         || 0,
            total_menit_telat: parseInt(r.total_menit_telat) || 0,
            alpha: Math.max(0, hariKerja
                - (parseInt(r.hadir)||0)
                - (parseInt(r.terlambat)||0)
                - (parseInt(r.izin)||0)),
            hari_kerja: hariKerja
        }));

        res.json(result);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;