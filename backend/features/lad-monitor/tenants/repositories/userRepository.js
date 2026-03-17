/**
 * User repository - SQL only. Tenant-scoped where applicable.
 */
const { pool } = require('../../../../shared/database/connection');

exports.findAll = async function (schema, tenantId = null) {
    const sql = tenantId
        ? `SELECT id, email, first_name, last_name, avatar_url, primary_tenant_id as tenant_id, metadata FROM "${schema}".users WHERE primary_tenant_id = $1 ORDER BY first_name ASC`
        : `SELECT id, email, first_name, last_name, avatar_url, primary_tenant_id as tenant_id, metadata FROM "${schema}".users ORDER BY first_name ASC`;
    const params = tenantId ? [tenantId] : [];
    const r = await pool.query(sql, params);
    return r.rows;
}

exports.create = async function (schema, tenantId, data) {
    const { firstName, lastName, email, role, capabilities } = data;
    const metadata = {
        role: role || 'viewer',
        capabilities: capabilities || [],
        created_at: new Date().toISOString()
    };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query(
            `INSERT INTO "${schema}".users (first_name, last_name, email, primary_tenant_id, metadata, is_active) 
       VALUES ($1, $2, $3, $4, $5, true) 
       RETURNING id, email, first_name, last_name, primary_tenant_id as tenant_id, metadata`,
            [firstName, lastName, email, tenantId, JSON.stringify(metadata)]
        );
        const userId = userRes.rows[0].id;
        await client.query(
            `INSERT INTO "${schema}".memberships (user_id, tenant_id, role) 
       VALUES ($1, $2, $3)`,
            [userId, tenantId, role || 'viewer']
        );
        await client.query('COMMIT');
        return userRes.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

exports.update = async function (schema, userId, data) {
    const { firstName, lastName, email, role, capabilities } = data;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const oldRes = await client.query(`SELECT metadata FROM "${schema}".users WHERE id = $1`, [userId]);
        const oldMetadata = oldRes.rows[0]?.metadata || {};
        const newMetadata = {
            ...oldMetadata,
            role: role || oldMetadata.role || 'viewer',
            capabilities: capabilities || oldMetadata.capabilities || [],
            updated_at: new Date().toISOString()
        };
        const userRes = await client.query(
            `UPDATE "${schema}".users SET first_name = $1, last_name = $2, email = $3, metadata = $4 WHERE id = $5 
       RETURNING id, email, first_name, last_name, primary_tenant_id as tenant_id, metadata`,
            [firstName, lastName, email, JSON.stringify(newMetadata), userId]
        );
        if (role) {
            await client.query(`UPDATE "${schema}".memberships SET role = $1 WHERE user_id = $2`, [role, userId]);
        }
        await client.query('COMMIT');
        return userRes.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

exports.findAllWithoutTenantId = async function (schema) {
    const r = await pool.query(
        `SELECT id, email, first_name, last_name, avatar_url, primary_tenant_id as tenant_id, metadata FROM "${schema}".users ORDER BY first_name ASC`
    );
    return r.rows;
}

exports.getTenantEmails = async function (schema) {
    const r = await pool.query(`SELECT id, email FROM "${schema}".tenants`);
    return r.rows;
}
