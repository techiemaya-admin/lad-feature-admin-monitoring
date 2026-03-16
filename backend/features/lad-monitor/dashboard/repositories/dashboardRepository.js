/**
 * Dashboard/stats repository - SQL only.
 */
const { createBaseRepository } = require('../../../../shared/database/baseRepository.js');

exports.getCount = async function (schema, tableName) {
  const { safeQuery } = createBaseRepository(schema);
  const r = await safeQuery(`SELECT COUNT(*)::int as c FROM "${schema}"."${tableName}"`);
  return r[0]?.c ?? 0;
}

// Cache getDateColumn results — column schemas don't change at runtime.
// Eliminates hundreds of redundant information_schema queries when loading tenant list.
const _dateColCache = new Map();

exports.getDateColumn = async function (schema, table) {
  const key = `${schema}.${table}`;
  if (_dateColCache.has(key)) return _dateColCache.get(key);

  const { safeQuery } = createBaseRepository(schema);
  const cols = await safeQuery(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND data_type IN ('timestamp with time zone', 'timestamp without time zone', 'timestamptz', 'timestamp', 'date')`,
    [schema, table]
  );
  const preferred = ['started_at', 'created_at', 'call_date', 'date', 'timestamp'];
  let result = null;
  for (const c of preferred) {
    const found = cols.find((r) => String(r.column_name || '').toLowerCase() === c);
    if (found) { result = `"${found.column_name}"`; break; }
  }
  if (!result && cols[0]) result = `"${cols[0].column_name}"`;

  _dateColCache.set(key, result);
  return result;
}
