const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'xfzy',
    password: '634117',
    database: 'tryfing'
});

module.exports = pool;
