import { Pool, type PoolClient, type QueryResultRow } from "pg";

export type Database = Pick<Pool, "query" | "connect" | "end">;

export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });
}

export async function withTransaction<T>(
  pool: Database,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function oneOrNone<T extends QueryResultRow>(
  pool: Pick<Pool, "query"> | PoolClient,
  text: string,
  values: unknown[] = []
): Promise<T | null> {
  const result = await pool.query<T>(text, values);
  return result.rows[0] ?? null;
}

