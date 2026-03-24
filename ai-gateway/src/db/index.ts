import "dotenv/config";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import postgres from "postgres";
import { neon } from "@neondatabase/serverless";
import { loadConfig } from "@/config.ts";

const config = loadConfig();

export const db = process.env.NODE_ENV === "production"
  ? drizzleNeon(neon(config.db.url))
  : (() => {
      console.log("Dev URL", config.db.url);
      return drizzlePostgres(postgres(config.db.url));
    })();
