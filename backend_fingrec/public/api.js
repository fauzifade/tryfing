// ============================================================
// api.js — shared helper untuk semua halaman
// ============================================================

const JWT_KEY = 'absensi_token';
const USER_KEY = 'absensi_user';

function getToken() { return localStorage.getItem(JWT_KEY); }
function getUser()  { 
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } 
    catch { return null; }
}
function isAdmin()  { const u = getUser(); return u && u.role_id === 1; }
function isStaff()  { const u = getUser(); return u && u.role_id === 2; }

function saveSession(token, user) {
    localStorage.setItem(JWT_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function clearSession() {
    localStorage.removeItem(JWT_KEY);
    localStorage.removeItem(USER_KEY);
}

// Guard: redirect ke login jika belum auth
function requireAuth() {
    if (!getToken()) { window.location.href = '/login.html'; return false; }
    return true;
}

// Guard: redirect jika bukan admin
function requireAdmin() {
    if (!requireAuth()) return false;
    if (!isAdmin()) { window.location.href = '/profil.html'; return false; }
    return true;
}

// ---- Fetch helpers ----
async function apiFetch(method, url, body) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    const token = getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (res.status === 401) { clearSession(); window.location.href = '/login.html'; return null; }
    if (res.status === 403) { showToast('Akses ditolak. Fitur ini hanya untuk Admin.', true); return null; }
    return res.json();
}

async function apiGet(url)          { return apiFetch('GET', url); }
async function apiPost(url, body)   { return apiFetch('POST', url, body); }
async function apiPatch(url, body)  { return apiFetch('PATCH', url, body); }
async function apiDelete(url)       { return apiFetch('DELETE', url); }

// ---- UI helpers ----
function showNotif(id, msg, isError=false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'block';
    el.textContent = msg;
    el.className = `notif ${isError ? 'error' : 'success'}`;
    setTimeout(() => { el.style.display = 'none'; }, 5000);
}

let _toastTimer;
function showToast(msg, isError=false) {
    let t = document.getElementById('_toast');
    if (!t) {
        t = document.createElement('div');
        t.id = '_toast';
        t.style.cssText = `position:fixed;bottom:24px;right:24px;padding:10px 18px;border-radius:6px;
            font-family:'IBM Plex Mono',monospace;font-size:12px;z-index:9999;
            transition:opacity 0.3s;letter-spacing:0.04em;`;
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = isError ? 'rgba(231,76,60,0.9)' : 'rgba(46,204,113,0.9)';
    t.style.color = '#fff';
    t.style.opacity = '1';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 3500);
}

function formatDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}
function formatDateOnly(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('id-ID', { dateStyle: 'medium' });
}

// ---- Render nav (berbeda untuk admin vs staff) ----
// ---- Render nav (berbeda untuk admin vs staff) ----
function renderNav(activeId) {
    const user = getUser();
    if (!user) { window.location.href = '/login.html'; return; }

    const adminLinks = `
        <a href="/dashboard.html" id="nav-dashboard">Dashboard</a>
        <a href="/history.html" id="nav-history">Riwayat</a>
        <a href="/laporan.html" id="nav-laporan">Laporan</a>
        <a href="/izin.html" id="nav-izin">Perizinan</a>
        <span class="nav-sep" style="height: 1px; background: var(--border); margin: 8px 0;"></span>
        <a href="/register.html" id="nav-register">Register Jari</a>
        <a href="/restore.html" id="nav-restore">Restore</a>
        <a href="/delete.html" id="nav-delete">Delete Alat</a>
    `;
    const staffLinks = `
        <a href="/profil.html" id="nav-profil">Profil Saya</a>
        <a href="/laporan-saya.html" id="nav-laporan-saya">Kehadiran Saya</a>
        <a href="/izin.html" id="nav-izin">Izin Saya</a>
    `;

    const navLinks = user.role_id === 1 ? adminLinks : staffLinks;
    const roleBadge = user.role_id === 1
        ? `<span style="font-size:10px;background:rgba(79,142,247,0.15);color:#4f8ef7;border:1px solid rgba(79,142,247,0.3);padding:2px 7px;border-radius:3px;letter-spacing:0.06em">ADMIN</span>`
        : `<span style="font-size:10px;background:rgba(46,204,113,0.12);color:#2ecc71;border:1px solid rgba(46,204,113,0.25);padding:2px 7px;border-radius:3px;letter-spacing:0.06em">STAFF</span>`;

    const html = `
    <div class="topbar">
        <a class="logo" href="${user.role_id===1 ? '/dashboard.html' : '/profil.html'}">AbsensiIoT</a>
        <nav style="flex: 1;">
            ${navLinks}
        </nav>
        
        <div style="margin-top: auto; display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--border); padding-top: 16px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                ${roleBadge}
                <span style="font-size:13px; color:var(--text-main); font-weight:500;">${user.name}</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <a href="/profil.html" style="text-decoration:none; color:var(--text-muted); font-size:12px; padding:8px; background:var(--surface); border:1px solid var(--border); border-radius:6px; text-align:center; transition:0.2s;">Lihat Profil</a>
                <button onclick="doLogout()" style="font-size:12px; padding:8px; background:rgba(231,76,60,0.12); color:#e74c3c; border:1px solid rgba(231,76,60,0.25); border-radius:6px; cursor:pointer; font-weight:500; transition:0.2s;">Logout</button>
            </div>
        </div>
    </div>`;
    
    document.body.insertAdjacentHTML('afterbegin', html);
    const el = document.getElementById(activeId);
    if (el) el.classList.add('active');
}

function doLogout() {
    clearSession();
    window.location.href = '/login.html';
}
