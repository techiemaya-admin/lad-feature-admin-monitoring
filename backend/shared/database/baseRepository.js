/**
 * Base repository - SQL only. Schema from request context.
 */
const { pool } = require('./connection.js');

exports.createBaseRepository = function (schema) {
  // Schema must come from request context — never hardcoded
  const s = schema || process.env.LAD_SCHEMA || process.env.DEFAULT_SCHEMA;
  if (!s) throw new Error('[baseRepository] schema is required — check LAD_SCHEMA env var');

  async function safeQuery(sql, params = []) {
    try {
      const r = await pool.query(sql, params);
      return r.rows;
    } catch (err) {
      console.error('[safeQuery] Error:', err.message, '\nSQL preview:', sql.trim().substring(0, 120));
      return [];
    }
  }

  async function listTables() {
    const rows = await safeQuery(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
      [s]
    );
    return rows.map((r) => r.table_name);
  }

  return { safeQuery, listTables, schema: s, pool };
}
