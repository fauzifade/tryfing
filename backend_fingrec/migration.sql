-- ============================================================
-- Migration v2 — sesuai skema DB tryfing yang sudah ada
-- ============================================================

-- 1. Buat tabel izin (kalau belum ada)
CREATE TABLE IF NOT EXISTS izin (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    emp_id      INT NOT NULL,
    jenis       ENUM('izin','sakit','cuti','dinas') NOT NULL DEFAULT 'izin',
    dari        DATE NOT NULL,
    sampai      DATE NOT NULL,
    keterangan  TEXT,
    status      ENUM('pending','disetujui','ditolak') NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (emp_id) REFERENCES employee(id) ON DELETE CASCADE
);

-- 2. Buat tabel user (belum ada di DB kamu)
CREATE TABLE IF NOT EXISTS user (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role_id       TINYINT NOT NULL DEFAULT 2 COMMENT '1=admin, 2=staff',
    emp_id        INT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (emp_id) REFERENCES employee(id) ON DELETE SET NULL
);

-- 3. Seed akun admin default (password: admin123)
INSERT IGNORE INTO user (name, password_hash, role_id, emp_id)
VALUES ('Administrator', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 1, NULL);