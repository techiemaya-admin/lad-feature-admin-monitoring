/**
 * Tenant DTO - field mapping for API responses.
 */

exports.toTenantDto = function(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || 'Unknown Tenant',
    slug: row.slug || '',
    status: (row.status || 'active').toLowerCase(),
    plan_tier: (row.plan_tier || row.plan || 'starter').toLowerCase(),
    email: row.email || '',
    phone: row.phone || null,
    website: row.website || null,
  };
}

exports.toTenantListDto = function(rows) {
  return (rows || []).map(toTenantDto);
}
