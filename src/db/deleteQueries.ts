import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;

export const getDB = async () => {
  if (!db) {
    db = await SQLite.openDatabaseAsync("socialDB.db");
  }
  return db;
};

class  DeleteQueries { 
  async deleteUser(id: number) {
    const db = await getDB();
    await db.runAsync(
      `DELETE FROM users WHERE id = ${id}`
    );
  }
  async deletePost(id: number) {
    const db = await getDB();
    await db.runAsync(
      `DELETE FROM posts WHERE id = ${id}`
    );
  }
}
