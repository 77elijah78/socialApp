import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;

export const getDB = async () => {
  if (!db) {
    db = await SQLite.openDatabaseAsync("socialDB.db");
  }
  return db;
};


class insertQueries {
  static async insertUser(user: any) {
    const db = await getDB();
    const query = `INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)`;
    await db.runAsync(query, [user.id, user.name, user.email, user.password]);
  }

  static async insertPost(post: any) {
    const db = await getDB();
    const query = `INSERT INTO posts (id, user_id, caption, image_url) VALUES (?, ?, ?, ?)`;
    await db.runAsync(query, [post.id, post.user_id, post.caption, post.image_url]);
  }
}