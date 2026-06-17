import { openDatabaseSync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import * as schema from "./schema";

// Single shared connection — import `db` everywhere
const sqlite = openDatabaseSync("app.db");

export const db = drizzle(sqlite, { schema });
