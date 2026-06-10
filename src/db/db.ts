import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase;

export const initDB = async () => {
  db = await SQLite.openDatabaseAsync("socialDB.db");
};
