/**
 * Tenant service - business logic only. No SQL.
 * Optimized: batch queries for heavy aggregations + parallel per-tenant queries.
 */
const tenantRepo = require('../repositories/tenantRepository.js');
// userRepository lives in tenants feature
const userRepo = require('../repositories/userRepository.js');
const { createBaseRepository } = require('../../../../shared/database/baseRepository.js');
const logger = require('../../../../core/utils/logger');

exports.createTenant = async function (schema, data) {
  logger.info(`Creating new tenant: ${data.name} in schema ${schema}`);
  return tenantRepo.create(schema, data);
}

exports.getTenants = async function (schema, startDate, endDate) {
  const t0 = Date.now();
  const { listTables } = createBaseRepository(schema);
  const [tenants, tables] = await Promise.all([
    tenantRepo.findAll(schema),
    listTables(),
  ]);

  if (tenants.length === 0) return [];

  // 1. Identify Tables
  const campaignTbl = tables.find(t => t === 'campaigns') || 'campaigns';
  const callTbl = tables.find(t => t === 'voice_call_logs' || t === 'calls') || 'voice_call_logs';
  const leadTbl = tables.find(t => t === 'leads' || t === 'pipeline_leads') || 'leads';
  const agentTbl = tables.find(t => t === 'voice_agents' || t === 'agents') || 'voice_agents';

  // 2. Fetch Batch Data
  const [
    campaignCounts,
    callCounts,
    leadCounts,
    agentCounts,
    analyticsAggMap,
    detailedCampaignsMap,
    allUsers,
    allIntegrations,
    allLeadsMap,
    allAgentsMap,
    allLeadTempsMap,
    allBillingMap
  ] = await Promise.all([
    tenantRepo.getGlobalCounts(schema, campaignTbl, startDate, endDate),
    tenantRepo.getGlobalCounts(schema, callTbl, startDate, endDate),
    tenantRepo.getGlobalCounts(schema, leadTbl, startDate, endDate),
    tenantRepo.getGlobalCounts(schema, agentTbl),
    tenantRepo.getAllTenantsAnalyticsAgg(schema),
    tenantRepo.getAllTenantsDetailedCampaigns(schema),
    tenantRepo.getAllMembershipsFlattened(schema),
    tenantRepo.getAllIntegrationsStatus(schema),
    tenantRepo.getAllTenantsLeads(schema, 100),
    tenantRepo.getAllTenantsVoiceAgents(schema),
    tenantRepo.getAllTenantsLeadTemps(schema),
    tenantRepo.getAllTenantsBillingData(schema)
  ]);

  // 3. Assemble
  const enriched = tenants.map(t => {
    const tenantUsers = allUsers.filter(u => u.tenant_id === t.id);
    const detailedCampaigns = detailedCampaignsMap.get(t.id) || [];
    const analyticsAgg = analyticsAggMap.get(t.id) || { connectionSent: 0, connectionAccepted: 0, messageSent: 0 };
    const integrations = allIntegrations.get(t.id) || { google: [], microsoft: [], whatsapp: false, slack: false, linkedin: [] };
    const leadsList = allLeadsMap.get(t.id) || [];
    const agentsList = allAgentsMap.get(t.id) || [];
    const leadTemps = allLeadTempsMap.get(t.id) || { hot: 0, warm: 0, cold: 0, notQualified: 0 };
    const billing = allBillingMap.get(t.id) || {
      creditsBalance: 0, monthlyUsage: 0, totalSpent: 0, currency: 'USD',
      totalCreditsUsed: 0, monthlyTrend: '0.0%', usageByFeature: []
    };

    const campaignStats = {
      totalCampaigns: detailedCampaigns.length,
      activeCampaigns: detailedCampaigns.filter(c => ['running', 'active'].includes(c.status)).length,
      totalLeadsGenerated: detailedCampaigns.reduce((sum, c) => sum + (c.leads || 0), 0),
      connectionRequestsSent: analyticsAgg.connectionSent,
      connectionAccepted: analyticsAgg.connectionAccepted,
      messagesSent: analyticsAgg.messageSent,
      replyRate: analyticsAgg.connectionSent > 0 ? (analyticsAgg.connectionAccepted / analyticsAgg.connectionSent) * 100 : 0,
      campaigns: detailedCampaigns,
    };

    return {
      ...t,
      plan: t.plan_tier || t.plan || 'starter',
      campaignStats,
      campaigns: campaignCounts.get(t.id) || 0,
      campaignsList: detailedCampaigns,
      calls: callCounts.get(t.id) || 0,
      pipelineLeads: leadCounts.get(t.id) || 0,
      pipelineLeadsList: leadsList,
      voiceAgentsCount: agentCounts.get(t.id) || 0,
      voiceAgents: agentsList,
      leadTemperatures: leadTemps,
      users: tenantUsers,
      activeUsers: tenantUsers.filter(u => u.status === 'active').length,
      billing: {
        ...billing,
        totalSpent: `${billing.currency === 'USD' ? '$' : billing.currency}${billing.totalSpent.toFixed(2)}`,
        plan: t.plan_tier || 'starter',
        renewsOn: 'Next Month'
      },
      integrations: [
        {
          name: 'Google Calendar',
          connected: integrations.google.length > 0,
          account: integrations.google[0]?.email || null
        },
        {
          name: 'Microsoft Calendar',
          connected: integrations.microsoft.length > 0,
          account: integrations.microsoft[0]?.email || null
        },
        {
          name: 'LinkedIn',
          connected: integrations.linkedin.length > 0,
          account: integrations.linkedin.length > 0 ? (integrations.linkedin[0].name || 'Connected Account') : null,
          accounts: integrations.linkedin
        },
        { name: 'Slack', connected: integrations.slack },
        {
          name: 'WhatsApp',
          connected: integrations.whatsapp,
          status: integrations.whatsapp ? 'Connected' : 'Disconnected'
        }
      ]
    };
  });

  console.log(`[getTenants] BATCH LOADED ${enriched.length} tenants in ${Date.now() - t0}ms`);
  return enriched;
}
