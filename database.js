const Database = require('better-sqlite3');

const db = new Database('database.sqlite');

db.prepare(`
CREATE TABLE IF NOT EXISTS jailed_users (
    user_id TEXT PRIMARY KEY,
    roles TEXT
)
`).run();

module.exports = db;