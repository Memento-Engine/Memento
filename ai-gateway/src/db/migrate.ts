import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadConfig } from "../config.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run database migrations on startup.
 * Uses drizzle-orm migrator to apply pending migrations.
 */
export async function runMigrations(): Promise<void> {
  const config = loadConfig();
  
  console.log("Running database migrations...");
  
  // Create a separate connection for migrations
  const migrationClient = postgres(config.db.url, { max: 1 });
  const migrationDb = drizzle(migrationClient);
  
  try {
    // Resolve migrations folder path relative to this file
    const migrationsFolder = path.resolve(__dirname, "../../drizzle/migrations");
    
    await migrate(migrationDb, {
      migrationsFolder,
    });
    
    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    // Close the migration connection
    await migrationClient.end();
  }
}

// Allow running migrations directly from command line
if (process.argv[1]?.includes("migrate")) {
  runMigrations()
    .then(() => {
      console.log("Migration script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration script failed:", error);
      process.exit(1);
    });
}
