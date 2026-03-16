/**
 * LAD constants - tenant_id is canonical. No organization_id in new code.
 */
const CAPABILITIES = {
    MONITOR_VIEW_ALL: 'monitor.view_all_tenants',
};

const TENANT_COLUMNS = ['tenant_id', 'tenantId'];

module.exports = { CAPABILITIES, TENANT_COLUMNS };
