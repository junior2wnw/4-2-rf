import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Pool } from "pg";

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    );

    const files = (await readdir(migrationsDir))
      .filter((name) => name.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      const exists = await client.query<{ version: string }>(
        "SELECT version FROM schema_migrations WHERE version = $1",
        [file],
      );

      if (exists.rowCount) {
        continue;
      }

      const sql = await readFile(join(migrationsDir, file), "utf8");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(version) VALUES ($1)", [file]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const currentDir = dirname(fileURLToPath(import.meta.url));

const migrationsDirCandidates = [
  join(currentDir, "migrations"),
  join(process.cwd(), "src", "db", "migrations"),
  join(process.cwd(), "dist", "src", "db", "migrations"),
];

const migrationsDir = await resolveMigrationsDir();

async function resolveMigrationsDir(): Promise<string> {
  for (const candidate of migrationsDirCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(`No migrations directory found. Checked: ${migrationsDirCandidates.join(", ")}`);
}
