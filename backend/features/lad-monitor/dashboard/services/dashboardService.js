/**
 * Dashboard service - business logic only. No SQL.
 */
const { createBaseRepository } = require('../../../../shared/database/baseRepository.js');
const { getCount, getDateColumn } = require('../repositories/dashboardRepository.js');
const logger = require('../../../../core/utils/logger');

exports.getStats = async function (schema, startDate, endDate) {
  const today = new Date().toISOString().split('T')[0];
  const { listTables, safeQuery } = createBaseRepository(schema);
  const tables = await listTables();

  const tenantCount = (await safeQuery(`SELECT COUNT(*)::int as c FROM "${schema}".tenants`))[0]?.c ?? 0;
  const userCount = (await safeQuery(`SELECT COUNT(*)::int as c FROM "${schema}".users WHERE primary_tenant_id IS NOT NULL`))[0]?.c ?? 0;

  const useRange = startDate && endDate;

  // 1. Calls
  let callsRange = 0;
  let callsTotal = 0;
  const primaryCallTbl = tables.find(t => t === 'voice_call_logs' || t === 'calls') || 'voice_call_logs';

  if (tables.includes(primaryCallTbl)) {
    try {
      const col = await getDateColumn(schema, primaryCallTbl);
      if (useRange && col) {
        const r = await safeQuery(`SELECT COUNT(*)::int as c FROM "${schema}"."${primaryCallTbl}" WHERE ${col} >= $1 AND ${col} <= $2`, [startDate, endDate]);
        callsRange = r?.[0]?.c ?? 0;
      } else if (col) {
        const r = await safeQuery(`SELECT COUNT(*)::int as c FROM "${schema}"."${primaryCallTbl}" WHERE ${col}::date = CURRENT_DATE`);
        callsRange = r?.[0]?.c ?? 0;
      }
      const tr = await safeQuery(`SELECT COUNT(*)::int as c FROM "${schema}"."${primaryCallTbl}"`);
      callsTotal = tr?.[0]?.c ?? 0;
    } catch (e) {
      logger.error(`Error counting calls:`, e.message);
    }
  }

  // 2. Campaigns
  let totalCampaigns = 0;
  let activeCampaigns = 0;
  let campaignsRange = 0;
  const primaryCampTbl = tables.find(t => t === 'campaigns') || 'campaigns';

  if (tables.includes(primaryCampTbl)) {
    try {
      const col = await getDateColumn(schema, primaryCampTbl);
      const r = await safeQuery(`SELECT COUNT(*)::int as c FROM "${schema}"."${primaryCampTbl}"`);
      totalCampaigns = r?.[0]?.c ?? 0;

      if (useRange && col) {
        const rr = await safeQuery(`SELECT COUNT(*)::int as c FROM "${schema}"."${primaryCampTbl}" WHERE ${col} >= $1 AND ${col} <= $2`, [startDate, endDate]);
        campaignsRange = rr?.[0]?.c ?? 0;
      } else {
        campaignsRange = totalCampaigns;
      }

      const ar = await safeQuery(
        `SELECT COUNT(*)::int as c FROM "${schema}"."${primaryCampTbl}" WHERE LOWER(CAST(status AS text)) IN ('active', 'running', 'active_running', 'started')`
      );
      activeCampaigns = ar?.[0]?.c ?? 0;
    } catch (e) { }
  }

  // 3. Voice Agents
  let voiceAgents = 0;
  if (tables.includes('voice_agents')) {
    try {
      const r = await safeQuery(`SELECT COUNT(*)::int as c FROM "${schema}"."voice_agents"`);
      voiceAgents = r?.[0]?.c ?? 0;
    } catch (e) { }
  }

  // 4. Pipeline Leads
  let leadsRange = 0;
  let leadsTotal = 0;
  const primaryLeadTbl = tables.find(t => t === 'leads' || t === 'pipeline_leads') || 'leads';

  if (tables.includes(primaryLeadTbl)) {
    try {
      const col = await getDateColumn(schema, primaryLeadTbl);
      if (useRange && col) {
        const rr = await safeQuery(`SELECT COUNT(*)::int as c FROM "${schema}"."${primaryLeadTbl}" WHERE ${col} >= $1 AND ${col} <= $2`, [startDate, endDate]);
        leadsRange = rr?.[0]?.c ?? 0;
      } else if (col) {
        const rr = await safeQuery(`SELECT COUNT(*)::int as c FROM "${schema}"."${primaryLeadTbl}" WHERE ${col}::date = CURRENT_DATE`);
        leadsRange = rr?.[0]?.c ?? 0;
      }
      const tr = await safeQuery(`SELECT COUNT(*)::int as c FROM "${schema}"."${primaryLeadTbl}"`);
      leadsTotal = tr?.[0]?.c ?? 0;
    } catch (e) { }
  }

  // 5. Conversations
  let convRange = 0;
  let convTotal = 0;
  const primaryConvTbl = tables.find(t => t === 'conversations' || t === 'ai_conversations') || 'conversations';

  if (tables.includes(primaryConvTbl)) {
    try {
      const col = await getDateColumn(schema, primaryConvTbl);
      if (useRange && col) {
        const rr = await safeQuery(`SELECT COUNT(*)::int as c FROM "${schema}"."${primaryConvTbl}" WHERE ${col} >= $1 AND ${col} <= $2`, [startDate, endDate]);
        convRange = rr?.[0]?.c ?? 0;
      } else if (col) {
        const rr = await safeQuery(`SELECT COUNT(*)::int as c FROM "${schema}"."${primaryConvTbl}" WHERE ${col}::date = CURRENT_DATE`);
        convRange = rr?.[0]?.c ?? 0;
      }
      const tr = await safeQuery(`SELECT COUNT(*)::int as c FROM "${schema}"."${primaryConvTbl}"`);
      convTotal = tr?.[0]?.c ?? 0;
    } catch (e) { }
  }

  // 6. Distributions for Pie Charts
  const tenantsByPlan = await safeQuery(`
    SELECT COALESCE(plan_tier, 'starter') as name, COUNT(*)::int as value 
    FROM "${schema}".tenants 
    GROUP BY 1
  `);

  const voiceCallStatus = await safeQuery(`
    SELECT COALESCE(status, 'unknown') as name, COUNT(*)::int as value 
    FROM "${schema}"."${primaryCallTbl}"
    GROUP BY 1
  `);

  const campaignDistribution = await safeQuery(`
    SELECT COALESCE(status, 'draft') as name, COUNT(*)::int as value 
    FROM "${schema}"."${primaryCampTbl}"
    GROUP BY 1
  `);

  // 7. Service Metrics (for the top banner)
  const avgCallDuration = (await safeQuery(`SELECT AVG(duration_seconds)::float as avg FROM "${schema}"."${primaryCallTbl}" WHERE duration_seconds > 0`))[0]?.avg || 0;

  const campaignQueue = (await safeQuery(`
    SELECT COUNT(*)::int as c FROM "${schema}"."${primaryCampTbl}" 
    WHERE LOWER(status) IN ('paused', 'draft', 'in_queue', 'pending')
  `))[0]?.c || 0;

  const leadEnrichment = (await safeQuery(`
    SELECT (COUNT(*) FILTER (WHERE email IS NOT NULL OR phone IS NOT NULL))::float / NULLIF(COUNT(*), 0) * 100 as rate 
    FROM "${schema}".leads
  `))[0]?.rate || 0;

  const callSuccessRate = (await safeQuery(`
    SELECT (COUNT(*) FILTER (WHERE status = 'ended'))::float / NULLIF(COUNT(*), 0) * 100 as rate 
    FROM "${schema}"."${primaryCallTbl}"
  `))[0]?.rate || 0;

  return {
    totalTenants: tenantCount,
    totalUsers: userCount,
    callsToday: callsRange || 0,
    totalCalls: callsTotal,
    campaignsToday: campaignsRange || 0,
    totalCampaigns,
    activeCampaigns,
    voiceAgents,
    pipelineLeads: leadsRange || 0,
    totalLeads: leadsTotal,
    conversations: convRange || 0,
    totalConversations: convTotal,
    tenantsByPlan,
    voiceCallStatus,
    campaignDistribution,
    serviceMetrics: {
      callSuccessRate: `${callSuccessRate.toFixed(1)}%`,
      campaignQueue: `${campaignQueue} pending`,
      avgCallDuration: `${Math.floor(avgCallDuration / 60)}m ${Math.floor(avgCallDuration % 60)}s`,
      leadEnrichment: `${leadEnrichment.toFixed(1)}%`
    }
  };
}



