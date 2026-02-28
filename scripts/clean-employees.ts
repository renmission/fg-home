import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../lib/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  console.log("Connecting to database...");
  const sqlConnection = neon(connectionString);
  const db = drizzle(sqlConnection, { schema });

  console.log("Deleting all records from employees table...");

  // Also need to clear attendance for those employees due to foreign keys potentially
  // Actually, we can just execute a TRUNCATE query with CASCADE
  await db.execute(sql`TRUNCATE TABLE employee CASCADE`);

  console.log("Employees table successfully cleaned.");
}

main().catch((err) => {
  console.error("Error cleaning employees:", err);
  process.exit(1);
});
