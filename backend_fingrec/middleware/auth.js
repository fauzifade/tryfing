const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');

function authMiddleware(req, res, next) {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ status: 'error', message: 'Token tidak ditemukan. Silakan login.' });
    }
    const token = header.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch(e) {
        return res.status(401).json({ status: 'error', message: 'Token tidak valid atau sudah expired.' });
    }
}

function adminOnly(req, res, next) {
    if (req.user.role_id !== 1) {
        return res.status(403).json({ status: 'error', message: 'Akses ditolak. Fitur ini hanya untuk Admin.' });
    }
    next();
}

module.exports = { authMiddleware, adminOnly };
