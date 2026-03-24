import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadConfig } from "@/config.ts";

const config = loadConfig();
console.log("Database URL:", config.db.url.replace(/:[^:@]+@/, ':****@')); // Log without password

const client = postgres(config.db.url);
export const db = drizzle(client);
