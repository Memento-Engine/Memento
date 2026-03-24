import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { neon } from "@neondatabase/serverless";
import { loadConfig } from "@/config.ts";

let client;

const config = loadConfig();
if (process.env.NODE_ENV === "production") {
  client = neon(config.db.url);
} else {
  console.log("Dev URl", config.db.url);
  client = postgres(config.db.url);
}

export const db = drizzle(client);
