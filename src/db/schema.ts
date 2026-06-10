import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase;

export const initializeSchema = async () => {
  db = await SQLite.openDatabaseAsync("socialDB.db");


await db.runAsync(`
    CREATE TABLE IF NOT EXISTS user (
    phoneNumber TEXT PRIMARY KEY,
    firstname TEXT,
    lastname TEXT,
    avatar TEXT,
    Jwt TEXT
)`)


await db.runAsync(`
    CREATE TABLE IF NOT EXISTS post (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT,
    content TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
)`)
}