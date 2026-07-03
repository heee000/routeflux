import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { createPool, withTransaction } from "../db/pool.js";

interface ModelCalibrationRow {
  model_id: string;
  sample_count: string;
  average_score: string;
  difficulty_capacity: string | null;
  metadata: Record<string, unknown>;
  domains: Record<string, number>;
}

interface DomainCalibrationRow {
  model_id: string;
  primary_domain: string;
  sample_count: string;
  average_score: string;
}

export async function calibrate(minimumSamples = 5): Promise<{ updatedModels: number; runId: string }> {
  const config = loadConfig();
  const db = createPool(config.DATABASE_URL);
  const run = await db.query<{ id: string }>(
    "INSERT INTO calibration_runs (status, minimum_samples) VALUES ('running', $1) RETURNING id",
    [minimumSamples]
  );
  const runId = run.rows[0]!.id;
  try {
    const [modelRows, domainRows] = await Promise.all([
      db.query<ModelCalibrationRow>(
        `SELECT r.selected_model_id AS model_id,
                count(*) AS sample_count,
                avg(f.score) AS average_score,
                percentile_cont(0.8) WITHIN GROUP (ORDER BY r.difficulty)
                  FILTER (WHERE f.score >= 0.7) AS difficulty_capacity,
                m.metadata, m.domains
         FROM routing_feedback f
         JOIN request_logs r ON r.id = f.request_id
         JOIN models m ON m.id = r.selected_model_id
         WHERE r.selected_model_id IS NOT NULL
         GROUP BY r.selected_model_id, m.metadata, m.domains
         HAVING count(*) >= $1`,
        [minimumSamples]
      ),
      db.query<DomainCalibrationRow>(
        `SELECT r.selected_model_id AS model_id, r.primary_domain,
                count(*) AS sample_count, avg(f.score) AS average_score
         FROM routing_feedback f
         JOIN request_logs r ON r.id = f.request_id
         WHERE r.selected_model_id IS NOT NULL AND r.primary_domain IS NOT NULL
         GROUP BY r.selected_model_id, r.primary_domain
         HAVING count(*) >= $1`,
        [Math.max(3, Math.ceil(minimumSamples / 2))]
      )
    ]);

    const domainByModel = new Map<string, Record<string, number>>();
    for (const row of domainRows.rows) {
      const values = domainByModel.get(row.model_id) ?? {};
      values[row.primary_domain] = Number(row.average_score);
      domainByModel.set(row.model_id, values);
    }

    await withTransaction(db, async (client) => {
      for (const row of modelRows.rows) {
        const samples = Number(row.sample_count);
        const observed = Number(row.average_score);
        const prior = typeof row.metadata.qualityScore === "number" ? row.metadata.qualityScore : 0.55;
        const qualityScore = (observed * samples + prior * 10) / (samples + 10);
        const difficultyCapacity = row.difficulty_capacity === null
          ? (typeof row.metadata.difficultyCapacity === "number" ? row.metadata.difficultyCapacity : qualityScore)
          : Number(row.difficulty_capacity);
        const metadata = {
          ...row.metadata,
          qualityScore,
          difficultyCapacity,
          calibrationSamples: samples,
          calibratedAt: new Date().toISOString()
        };
        const domains = { ...row.domains, ...(domainByModel.get(row.model_id) ?? {}) };
        await client.query(
          "UPDATE models SET metadata = $1, domains = $2, updated_at = now() WHERE id = $3",
          [JSON.stringify(metadata), JSON.stringify(domains), row.model_id]
        );
      }
      await client.query(
        `UPDATE calibration_runs SET status = 'succeeded', updated_models = $1,
           details = $2, completed_at = now() WHERE id = $3`,
        [
          modelRows.rows.length,
          JSON.stringify({ feedback_rows: modelRows.rows.reduce((sum, row) => sum + Number(row.sample_count), 0) }),
          runId
        ]
      );
    });
    return { updatedModels: modelRows.rows.length, runId };
  } catch (error) {
    await db.query(
      `UPDATE calibration_runs SET status = 'failed', details = $1, completed_at = now() WHERE id = $2`,
      [JSON.stringify({ error: error instanceof Error ? error.message : "Calibration failed" }), runId]
    );
    throw error;
  } finally {
    await db.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const minimumSamples = Number(process.argv[2] ?? 5);
  calibrate(Number.isFinite(minimumSamples) && minimumSamples > 0 ? Math.floor(minimumSamples) : 5)
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
