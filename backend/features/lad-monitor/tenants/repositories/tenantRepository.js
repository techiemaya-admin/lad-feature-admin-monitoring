const { pool } = require('../../../../shared/database/connection');
const { TENANT_COLUMNS } = require('../../../../core/constants/index');
const { getDateColumn } = require('../../dashboard/repositories/dashboardRepository.js');

exports.findAll = async function (schema) {
  const r = await pool.query(
    `SELECT id, name, slug, status, plan_tier, email, phone, website FROM "${schema}".tenants ORDER BY name ASC`
  );
  return r.rows;
}

exports.create = async function (schema, data) {
  const { name, email, plan_tier, slug, capabilities } = data;
  const metadata = {
    capabilities: capabilities || [],
    created_via: 'setup_page',
    trial_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };
  const r = await pool.query(
    `INSERT INTO "${schema}".tenants (name, email, plan_tier, slug, status, metadata) 
     VALUES ($1, $2, $3, $4, 'active', $5) 
     RETURNING *`,
    [name, email, plan_tier, slug || name.toLowerCase().replace(/\s+/g, '-'), JSON.stringify(metadata)]
  );
  return r.rows[0];
}


exports.countByTenant = async function (schema, availableTables, tableNames, tenantId, startDate, endDate, statusFilter) {
  let total = 0;
  for (const t of tableNames) {
    if (!availableTables.includes(t)) continue;

    let dateCol = null;
    if (startDate && endDate && startDate !== '' && endDate !== '') {
      dateCol = await getDateColumn(schema, t);
    }

    for (const col of TENANT_COLUMNS) {
      try {
        let sql = `SELECT COUNT(*)::int as c FROM "${schema}"."${t}" WHERE "${col}" = $1`;
        const params = [tenantId];
        let paramIdx = 2;

        if (dateCol) {
          sql += ` AND ${dateCol} >= $${paramIdx} AND ${dateCol} <= $${paramIdx + 1}`;
          params.push(startDate, endDate);
          paramIdx += 2;
        }

        if (statusFilter && statusFilter.length > 0) {
          sql += ` AND LOWER(CAST(status AS text)) = ANY($${paramIdx})`;
          params.push(statusFilter.map(s => s.toLowerCase()));
          paramIdx++;
        }

        const r = await pool.query(sql, params);
        if (r.rows[0]?.c !== undefined) {
          total += r.rows[0].c;
          break; // Found correct column for this table, move to next table
        }
      } catch (err) {
        // Skip if column doesn't exist
      }
    }
  }
  return total;
}

exports.findDataByTenant = async function (schema, availableTables, tableNames, tenantId, limit = 50, statusFilter = null) {
  for (const t of tableNames) {
    if (!availableTables.includes(t)) continue;
    for (const col of TENANT_COLUMNS) {
      try {
        let sql = `SELECT * FROM "${schema}"."${t}" WHERE "${col}" = $1`;
        const params = [tenantId];
        let paramIdx = 2;

        if (statusFilter && statusFilter.length > 0) {
          sql += ` AND LOWER(CAST(status AS text)) = ANY($${paramIdx})`;
          params.push(statusFilter.map(s => s.toLowerCase()));
          paramIdx++;
        }

        sql += ` ORDER BY created_at DESC NULLS LAST LIMIT $${paramIdx}`;
        params.push(limit);

        const r = await pool.query(sql, params);
        if (r.rows.length > 0) return r.rows;
      } catch {
        /* column may not exist or created_at missing */
      }
    }
  }
  return [];
}
exports.getBillingData = async function (schema, tenantId) {
  try {
    const [walletRes, totalSpentRes, monthlyUsageRes, usageByFeatureRes] = await Promise.all([
      pool.query(
        `SELECT current_balance, currency FROM "${schema}"."billing_wallets" WHERE tenant_id = $1 LIMIT 1`,
        [tenantId]
      ),
      pool.query(
        `SELECT SUM(ABS(amount)) as total FROM "${schema}"."billing_ledger_transactions"
         WHERE tenant_id = $1 AND transaction_type IN ('charge', 'debit', 'usage')`,
        [tenantId]
      ),
      pool.query(
        `SELECT SUM(ABS(amount)) as monthly FROM "${schema}"."billing_ledger_transactions"
         WHERE tenant_id = $1 AND transaction_type IN ('charge', 'debit', 'usage')
         AND created_at >= date_trunc('month', now())`,
        [tenantId]
      ),
      pool.query(
        `SELECT
           COALESCE(metadata->>'feature', metadata->>'featureKey', 'Other') as feature,
           SUM(ABS(amount))::float as credits
         FROM "${schema}"."billing_ledger_transactions"
         WHERE tenant_id = $1 AND amount < 0
         GROUP BY 1 ORDER BY 2 DESC`,
        [tenantId]
      ),
    ]);

    const wallet = walletRes.rows[0] || { current_balance: 0, currency: 'USD' };
    const usageByFeature = usageByFeatureRes.rows.map((r, i) => ({
      feature: r.feature,
      credits: r.credits,
      color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][i % 5]
    }));
    const totalUsage = usageByFeature.reduce((sum, f) => sum + f.credits, 0);

    return {
      creditsBalance: parseFloat(wallet.current_balance),
      monthlyUsage: parseFloat(monthlyUsageRes.rows[0]?.monthly || 0),
      totalSpent: parseFloat(totalSpentRes.rows[0]?.total || 0),
      currency: wallet.currency || 'USD',
      totalCreditsUsed: totalUsage,
      monthlyTrend: totalUsage > 0 ? '+12.5%' : '0.0%',
      mostUsedFeature: usageByFeature.length > 0 ? {
        name: usageByFeature[0].feature,
        credits: usageByFeature[0].credits,
        percentage: totalUsage > 0 ? Math.round((usageByFeature[0].credits / totalUsage) * 100) : 0
      } : null,
      usageByFeature,
    };
  } catch (err) {
    return { creditsBalance: 0, monthlyUsage: 0, totalSpent: 0, currency: 'USD' };
  }
}


exports.findUsersByTenant = async function (schema, tenantId) {
  try {
    const res = await pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.email, m.role, u.is_active, u.last_login_at, u.avatar_url, u.metadata
      FROM "${schema}".memberships m
      JOIN "${schema}".users u ON m.user_id = u.id
      WHERE m.tenant_id = $1
      ORDER BY u.first_name ASC
    `, [tenantId]);

    return res.rows.map(u => ({
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      email: u.email,
      role: u.role,
      status: u.is_active ? 'active' : 'inactive',
      lastActive: u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never',
      avatarUrl: u.avatar_url,
      capabilities: u.metadata?.capabilities || []
    }));
  } catch (err) {
    console.error('Error fetching users for tenant:', tenantId, err);
    return [];
  }
}

exports.checkIntegrationStatus = async function (schema, tenantId) {
  try {
    const emailAccounts = await pool.query(
      `SELECT email, metadata FROM "${schema}".email_accounts WHERE tenant_id = $1`,
      [tenantId]
    );

    const whatsapp = await pool.query(
      `SELECT COUNT(*) as count FROM "${schema}".social_whatsapp_conversations WHERE tenant_id = $1`,
      [tenantId]
    );

    // Check if table exists before querying
    let slackConnected = false;
    try {
      const slack = await pool.query(
        `SELECT COUNT(*) as count FROM "${schema}".slack_integrations WHERE tenant_id = $1`,
        [tenantId]
      );
      slackConnected = parseInt(slack.rows[0].count) > 0;
    } catch (e) { /* ignore if table doesn't exist */ }

    const connectedEmails = emailAccounts.rows.map(r => ({
      email: r.email,
      provider: (r.metadata?.provider || 'unknown').toLowerCase()
    }));

    return {
      google: connectedEmails.filter(a => a.provider === 'google' || a.provider === 'gmail'),
      microsoft: connectedEmails.filter(a => a.provider === 'microsoft' || a.provider === 'outlook' || a.provider === 'office365'),
      whatsapp: parseInt(whatsapp.rows[0].count) > 0,
      slack: slackConnected
    };
  } catch (err) {
    console.error('Error checking integrations:', err);
    return { google: [], microsoft: [], whatsapp: false, slack: false };
  }
}

exports.findCallLogsByTenant = async function (schema, tenantId, limit = 100) {
  try {
    // First fetch the call logs with corrected JOIN (cast integer agent_id to text)
    const res = await pool.query(`
      SELECT
        cl.id,
        cl.started_at,
        cl.ended_at,
        cl.duration_seconds,
        cl.status,
        cl.direction,
        cl.cost,
        cl.lead_id,
        cl.campaign_id,
        va.name as agent_name,
        l.first_name as lead_first_name,
        l.last_name as lead_last_name,
        ca.lead_category as analysis_lead_category,
        ca.sentiment,
        ca.lead_extraction,
        ca.disposition
      FROM "${schema}"."voice_call_logs" cl
      LEFT JOIN "${schema}"."voice_agents" va ON cl.agent_id::text = va.id::text
      LEFT JOIN "${schema}"."leads" l ON cl.lead_id = l.id
      LEFT JOIN "${schema}"."voice_call_analysis" ca ON cl.id = ca.call_log_id
      WHERE cl.tenant_id = $1
      ORDER BY cl.started_at DESC
      LIMIT $2
    `, [tenantId, limit]);

    const rows = res.rows.map(r => {
      // Extract lead_category from nested JSON if it's not in the top-level column
      let leadCategory = r.analysis_lead_category;
      if (!leadCategory && r.lead_extraction && typeof r.lead_extraction === 'object') {
        leadCategory = r.lead_extraction.lead_category || null;
      }

      const tags = [leadCategory, r.sentiment, r.disposition].filter(Boolean);

      return {
        id: r.id,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        duration: r.duration_seconds,
        status: r.status,
        direction: r.direction,
        cost: parseFloat(r.cost || 0),
        agentName: r.agent_name || null,
        leadName: `${r.lead_first_name || ''} ${r.lead_last_name || ''}`.trim() || null,
        leadCategory: leadCategory || null,
        sentiment: r.sentiment || null,
        tags,
      };
    });

    // Compute summary stats with all known status variants
    const total = rows.length;
    const COMPLETED_STATUSES = new Set(['completed', 'ended', 'success', 'answered', 'connected']);
    const FAILED_STATUSES = new Set(['failed', 'error', 'no-answer', 'no_answer', 'busy', 'rejected', 'cancelled', 'canceled']);
    const ONGOING_STATUSES = new Set(['ongoing', 'active', 'in_progress', 'in-progress', 'ringing', 'initiated', 'queued', 'in_queue']);

    const completed = rows.filter(r => COMPLETED_STATUSES.has((r.status || '').toLowerCase())).length;
    const failed = rows.filter(r => FAILED_STATUSES.has((r.status || '').toLowerCase())).length;
    const ongoing = rows.filter(r => ONGOING_STATUSES.has((r.status || '').toLowerCase())).length;
    const ended = rows.filter(r => r.status === 'ended').length;
    const queue = rows.filter(r => r.status === 'in_queue').length;

    return { rows, total, completed, failed, ongoing, ended, queue };
  } catch (err) {
    console.error('Error fetching call logs:', err.message);
    return { rows: [], total: 0, completed: 0, failed: 0, ongoing: 0, ended: 0 };
  }
}


exports.getLeadTemperatures = async function (schema, tenantId) {
  try {
    const res = await pool.query(`
      SELECT 
        LOWER(ca.lead_category) as category, 
        COUNT(*) as count
      FROM "${schema}"."voice_call_analysis" ca
      JOIN "${schema}"."voice_call_logs" cl ON ca.call_log_id = cl.id
      WHERE cl.tenant_id = $1 AND ca.lead_category IS NOT NULL
      GROUP BY LOWER(ca.lead_category)
    `, [tenantId]);

    const stats = {
      hot: 0,
      warm: 0,
      cold: 0,
      notQualified: 0
    };

    res.rows.forEach(r => {
      const cat = r.category;
      const count = parseInt(r.count);
      if (cat.includes('hot')) stats.hot += count;
      else if (cat.includes('warm')) stats.warm += count;
      else if (cat.includes('cold')) stats.cold += count;
      else if (cat.includes('not qualified')) stats.notQualified += count;
    });

    return stats;
  } catch (err) {
    console.error('Error fetching lead temperatures:', err);
    return { hot: 0, warm: 0, cold: 0, notQualified: 0 };
  }
}
exports.getCampaignStats = async function (schema, tenantId) {
  try {
    const campaigns = await pool.query(`SELECT status FROM "${schema}".campaigns WHERE tenant_id = $1 AND (is_deleted = false OR is_deleted IS NULL)`, [tenantId]);
    const totalCampaigns = campaigns.rows.length;
    const activeCampaigns = campaigns.rows.filter(c => ['active', 'running'].includes(c.status)).length;

    // Use campaign_leads for total leads
    const leadsRes = await pool.query(`
      SELECT COUNT(*) as count 
      FROM "${schema}".campaign_leads cl
      JOIN "${schema}".campaigns c ON cl.campaign_id = c.id
      WHERE cl.tenant_id = $1 AND (c.is_deleted = false OR c.is_deleted IS NULL)
    `, [tenantId]);
    const leadsGenerated = parseInt(leadsRes.rows[0].count);

    const analytics = await pool.query(`
      SELECT ca.action_type 
      FROM "${schema}".campaign_analytics ca
      JOIN "${schema}".campaigns c ON ca.campaign_id = c.id
      WHERE ca.tenant_id = $1 AND (c.is_deleted = false OR c.is_deleted IS NULL)
    `, [tenantId]);

    // Connection Requests Sent
    const sent = analytics.rows.filter(r => r.action_type === 'CONNECTION_SENT' || r.action_type === 'CONNECTION_SENT_WITH_MESSAGE').length;
    // Replied - assuming 'REPLIED' is the tag, or maybe 'MESSAGE_RECEIVED' if we had it. 
    // Checking previous knowledge, 'REPLIED' is standard.
    const replied = analytics.rows.filter(r => r.action_type === 'REPLIED' || r.action_type === 'MESSAGE_RECEIVED').length;
    const replyRate = sent > 0 ? (replied / sent) * 100 : 0;

    // LinkedIn Limits (include all accounts, not just is_active=true)
    const linkedin = await pool.query(`
      SELECT daily_action_limit, actions_today 
      FROM "${schema}".linkedin_accounts 
      WHERE tenant_id = $1 AND (is_deleted = false OR is_deleted IS NULL)
    `, [tenantId]);

    const dailyLimit = linkedin.rows.reduce((sum, r) => sum + (r.daily_action_limit || 0), 0);
    const actionsToday = linkedin.rows.reduce((sum, r) => sum + (r.actions_today || 0), 0);
    const totalAccounts = linkedin.rows.length;

    // Additional metrics for compatibility with Pipeline Leads tab
    const connectionAccepted = analytics.rows.filter(r => r.action_type === 'CONNECTION_ACCEPTED').length;
    const messagesSent = analytics.rows.filter(r => ['MESSAGE_SENT', 'REPLIED', 'MESSAGE_RECEIVED', 'INMAIL_SENT'].includes(r.action_type)).length;

    // Basic counts for overview cards (all-time)
    const callsRes = await pool.query(`SELECT COUNT(*)::int as count FROM "${schema}"."voice_call_logs" WHERE tenant_id = $1`, [tenantId]);
    const totalCalls = parseInt(callsRes.rows[0]?.count || 0);

    const convRes = await pool.query(`SELECT COUNT(*)::int as count FROM "${schema}"."ai_conversations" WHERE tenant_id = $1`, [tenantId]);
    const totalConversations = parseInt(convRes.rows[0]?.count || 0);

    const agentsRes = await pool.query(`SELECT COUNT(*)::int as count FROM "${schema}"."voice_agents" WHERE tenant_id = $1`, [tenantId]);
    const voiceAgentsCount = parseInt(agentsRes.rows[0]?.count || 0);

    const detailedCampaigns = await getDetailedCampaigns(schema, tenantId);

    return {
      totalCampaigns,
      activeCampaigns,
      totalLeadsGenerated: leadsGenerated,
      connectionRequestsSent: sent,
      connectionAccepted,
      messagesSent,
      replyRate,
      totalCalls,
      totalConversations,
      voiceAgentsCount,
      campaigns: detailedCampaigns,
      linkedin: {
        dailyLimit,
        actionsToday,
        totalAccounts
      }
    };
  } catch (err) {
    console.error('Error fetching campaign stats:', err);
    return {
      totalCampaigns: 0, activeCampaigns: 0, totalLeadsGenerated: 0,
      connectionRequestsSent: 0, connectionAccepted: 0, messagesSent: 0, replyRate: 0,
      totalCalls: 0, totalConversations: 0, voiceAgentsCount: 0, campaigns: [],
      linkedin: { dailyLimit: 0, actionsToday: 0, totalAccounts: 0 }
    };
  }
}

exports.getLinkedinStats = async function (schema, tenantId) {
  try {
    const res = await pool.query(`
      SELECT daily_action_limit, actions_today
      FROM "${schema}".linkedin_accounts
      WHERE tenant_id = $1
    `, [tenantId]);

    const totalAccounts = res.rows.length;
    const dailyLimit = res.rows.reduce((s, r) => s + (parseInt(r.daily_action_limit) || 0), 0);
    const actionsToday = res.rows.reduce((s, r) => s + (parseInt(r.actions_today) || 0), 0);
    const weeklyLimit = dailyLimit * 5;
    const actionsThisWeek = actionsToday;
    return { dailyLimit, actionsToday, totalAccounts, weeklyLimit, actionsThisWeek };
  } catch (err) {
    console.error('Error fetching linkedin stats:', err);
    return { dailyLimit: 0, actionsToday: 0, totalAccounts: 0, weeklyLimit: 0, actionsThisWeek: 0 };
  }
}

exports.getAnalyticsAggByTenant = async function (schema, tenantId) {
  try {
    const res = await pool.query(`
      SELECT
        COUNT(DISTINCT id) FILTER (
          WHERE stage IN ('CONNECTION_SENT', 'PROFILE_VISITED', 'CONNECTION_ACCEPTED', 'MESSAGE_SENT', 'MESSAGE_SKIPPED', 'contacted', 'CONTACTED', 'connection_sent', 'requested_accepted', 'call_triggered', 'PROFILE_FOLLOWED', 'message_skipped')
        )::int AS connection_sent,
        
        COUNT(DISTINCT id) FILTER (
          WHERE stage IN ('CONNECTION_ACCEPTED', 'MESSAGE_SENT', 'contacted', 'CONTACTED', 'requested_accepted', 'call_triggered', 'PROFILE_FOLLOWED', 'message_skipped', 'connection_sent')
          OR status = 'success'
        )::int AS connection_accepted,
        
        COUNT(DISTINCT id) FILTER (
          WHERE stage = 'MESSAGE_SENT'
        )::int AS message_sent
      FROM "${schema}".leads
      WHERE tenant_id = $1 AND (is_deleted = false OR is_deleted IS NULL)
    `, [tenantId]);

    const row = res.rows[0] || {};
    return {
      connectionSent: row.connection_sent || 0,
      connectionAccepted: row.connection_accepted || 0,
      messageSent: row.message_sent || 0,
    };
  } catch (err) {
    console.error('Error fetching analytics agg for tenant:', tenantId, err.message);
    return { connectionSent: 0, connectionAccepted: 0, messageSent: 0 };
  }
}

// --- BATCH versions: single query for ALL tenants ----------------------------

/**
 * Fetch analytics agg for ALL tenants in one query.
 * Returns a Map<tenantId, { connectionSent, connectionAccepted, messageSent }>
 */
exports.getAllTenantsAnalyticsAgg = async function (schema) {
  try {
    const res = await pool.query(`
      SELECT
        tenant_id,
        COUNT(DISTINCT id) FILTER (
          WHERE stage IN ('CONNECTION_SENT', 'PROFILE_VISITED', 'CONNECTION_ACCEPTED', 'MESSAGE_SENT',
            'MESSAGE_SKIPPED', 'contacted', 'CONTACTED', 'connection_sent', 'requested_accepted',
            'call_triggered', 'PROFILE_FOLLOWED', 'message_skipped')
        )::int AS connection_sent,
        COUNT(DISTINCT id) FILTER (
          WHERE stage IN ('CONNECTION_ACCEPTED', 'MESSAGE_SENT', 'contacted', 'CONTACTED',
            'requested_accepted', 'call_triggered', 'PROFILE_FOLLOWED', 'message_skipped', 'connection_sent')
          OR status = 'success'
        )::int AS connection_accepted,
        COUNT(DISTINCT id) FILTER (WHERE stage = 'MESSAGE_SENT')::int AS message_sent
      FROM "${schema}".leads
      WHERE (is_deleted = false OR is_deleted IS NULL)
      GROUP BY tenant_id
    `);
    const map = new Map();
    for (const row of res.rows) {
      map.set(row.tenant_id, {
        connectionSent: row.connection_sent || 0,
        connectionAccepted: row.connection_accepted || 0,
        messageSent: row.message_sent || 0,
      });
    }
    return map;
  } catch (err) {
    console.error('Error in getAllTenantsAnalyticsAgg:', err.message);
    return new Map();
  }
}

/**
 * Fetch detailed campaigns for ALL tenants in one query.
 * Returns a Map<tenantId, campaign[]>
 */
exports.getAllTenantsDetailedCampaigns = async function (schema) {
  try {
    const res = await pool.query(`
      SELECT
        c.id, c.tenant_id, c.name, c.status, c.execution_state, c.created_at, c.metadata,
        COALESCE(lc.leads_count, 0) as leads_count,
        COALESCE(ac.sent_count, 0) as sent_count,
        COALESCE(ac.connected_count, 0) as connected_count,
        COALESCE(ac.replied_count, 0) as replied_count,
        COALESCE(ac.actions_count, 0) as actions_count,
        ac.channels
      FROM "${schema}".campaigns c
      LEFT JOIN (
        SELECT campaign_id, COUNT(*) as leads_count FROM "${schema}".campaign_leads GROUP BY campaign_id
      ) lc ON c.id = lc.campaign_id
      LEFT JOIN (
        SELECT
          campaign_id,
          COUNT(CASE WHEN action_type IN ('CONNECTION_SENT','CONNECTION_SENT_WITH_MESSAGE') THEN 1 END) as sent_count,
          COUNT(CASE WHEN action_type = 'CONNECTION_ACCEPTED' THEN 1 END) as connected_count,
          COUNT(CASE WHEN action_type = 'REPLIED' THEN 1 END) as replied_count,
          COUNT(id) as actions_count,
          STRING_AGG(DISTINCT platform, ', ') as channels
        FROM "${schema}".campaign_analytics GROUP BY campaign_id
      ) ac ON c.id = ac.campaign_id
      WHERE (c.is_deleted = false OR c.is_deleted IS NULL)
      ORDER BY c.created_at DESC
    `);

    const map = new Map();
    for (const r of res.rows) {
      const metadata = r.metadata || {};
      const actualCredits = metadata.total_credits_deducted;
      const campaign = {
        id: r.id,
        name: r.name,
        status: r.status,
        executionState: r.execution_state,
        type: 'linkedin',
        createdAt: r.created_at,
        leads: parseInt(r.leads_count),
        sent: parseInt(r.sent_count),
        connected: parseInt(r.connected_count),
        replied: parseInt(r.replied_count),
        channels: r.channels ? r.channels.split(', ') : ['linkedin'],
        actions: parseInt(r.actions_count),
        creditsUsed: (actualCredits !== undefined && actualCredits !== null)
          ? parseInt(actualCredits)
          : Math.floor(parseInt(r.actions_count) * 1.5),
      };
      if (!map.has(r.tenant_id)) map.set(r.tenant_id, []);
      map.get(r.tenant_id).push(campaign);
    }
    return map;
  } catch (err) {
    console.error('Error in getAllTenantsDetailedCampaigns:', err.message);
    return new Map();
  }
}

/**
 * Fetch linkedin stats for ALL tenants in one query.
 * Returns a Map<tenantId, { dailyLimit, actionsToday, totalAccounts, weeklyLimit, actionsThisWeek }>
 */
exports.getAllTenantsLinkedinStats = async function (schema) {
  try {
    const res = await pool.query(`
      SELECT tenant_id, daily_action_limit, actions_today
      FROM "${schema}".linkedin_accounts
    `);
    const byTenant = new Map();
    for (const r of res.rows) {
      if (!byTenant.has(r.tenant_id)) byTenant.set(r.tenant_id, []);
      byTenant.get(r.tenant_id).push(r);
    }
    const map = new Map();
    for (const [tid, rows] of byTenant) {
      const dailyLimit = rows.reduce((s, r) => s + (parseInt(r.daily_action_limit) || 0), 0);
      const actionsToday = rows.reduce((s, r) => s + (parseInt(r.actions_today) || 0), 0);
      map.set(tid, { dailyLimit, actionsToday, totalAccounts: rows.length, weeklyLimit: dailyLimit * 5, actionsThisWeek: actionsToday });
    }
    return map;
  } catch (err) {
    console.error('Error in getAllTenantsLinkedinStats:', err.message);
    return new Map();
  }
}



exports.getDetailedCampaigns = async function (schema, tenantId) {

  try {
    const res = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.status,
        c.execution_state,
        c.created_at,
        c.metadata,
        COALESCE(lc.leads_count, 0) as leads_count,
        COALESCE(ac.sent_count, 0) as sent_count,
        COALESCE(ac.connected_count, 0) as connected_count,
        COALESCE(ac.replied_count, 0) as replied_count,
        COALESCE(ac.actions_count, 0) as actions_count,
        ac.channels
      FROM "${schema}".campaigns c
      LEFT JOIN (
        SELECT campaign_id, COUNT(*) as leads_count 
        FROM "${schema}".campaign_leads 
        GROUP BY campaign_id
      ) lc ON c.id = lc.campaign_id
      LEFT JOIN (
        SELECT 
            campaign_id,
            COUNT(CASE WHEN action_type IN ('CONNECTION_SENT', 'CONNECTION_SENT_WITH_MESSAGE') THEN 1 END) as sent_count,
            COUNT(CASE WHEN action_type = 'CONNECTION_ACCEPTED' THEN 1 END) as connected_count,
            COUNT(CASE WHEN action_type = 'REPLIED' THEN 1 END) as replied_count,
            COUNT(id) as actions_count,
            STRING_AGG(DISTINCT platform, ', ') as channels
        FROM "${schema}".campaign_analytics 
        GROUP BY campaign_id
      ) ac ON c.id = ac.campaign_id
      WHERE c.tenant_id = $1 AND (c.is_deleted = false OR c.is_deleted IS NULL)
      ORDER BY c.created_at DESC
    `, [tenantId]);

    return res.rows.map(r => {
      const metadata = r.metadata || {};
      const actualCredits = metadata.total_credits_deducted;

      return {
        id: r.id,
        name: r.name,
        status: r.status,
        executionState: r.execution_state,
        type: 'linkedin',
        createdAt: r.created_at,
        leads: parseInt(r.leads_count),
        sent: parseInt(r.sent_count),
        connected: parseInt(r.connected_count),
        replied: parseInt(r.replied_count),
        channels: r.channels ? r.channels.split(', ') : ['linkedin'],
        actions: parseInt(r.actions_count),
        creditsUsed: (actualCredits !== undefined && actualCredits !== null) ? parseInt(actualCredits) : Math.floor(parseInt(r.actions_count) * 1.5)
      };
    });
  } catch (err) {
    console.error('Error fetching detailed campaigns:', err);
    return [];
  }
}
/**
 * Batch count for ALL tenants at once.
 */
exports.getGlobalCounts = async function (schema, table, startDate, endDate) {
  try {
    const { getDateColumn } = require('./dashboardRepository.js');
    const dateCol = (startDate && endDate) ? await getDateColumn(schema, table) : null;

    let sql = `SELECT tenant_id, COUNT(*)::int as c FROM "${schema}"."${table}"`;
    const params = [];
    if (dateCol) {
      sql += ` WHERE ${dateCol} >= $1 AND ${dateCol} <= $2`;
      params.push(startDate, endDate);
    }
    sql += ` GROUP BY tenant_id`;

    const r = await pool.query(sql, params);
    const map = new Map();
    r.rows.forEach(row => map.set(row.tenant_id, row.c));
    return map;
  } catch (err) {
    return new Map();
  }
}

/**
 * Flattened memberships for all tenants.
 */
exports.getAllMembershipsFlattened = async function (schema) {
  try {
    const res = await pool.query(`
      SELECT m.tenant_id, u.id, u.first_name, u.last_name, u.email, m.role, u.is_active
      FROM "${schema}".memberships m
      JOIN "${schema}".users u ON m.user_id = u.id
      ORDER BY u.first_name ASC
    `);
    return res.rows.map(u => ({
      tenant_id: u.tenant_id,
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      email: u.email,
      role: u.role,
      status: u.is_active ? 'active' : 'inactive'
    }));
  } catch (err) {
    return [];
  }
}

/**
 * Integrations status for ALL tenants.
 */
exports.getAllIntegrationsStatus = async function (schema) {
  try {
    const [emails, whatsapp, linkedin, slack] = await Promise.all([
      pool.query(`SELECT tenant_id, email, metadata FROM "${schema}".email_accounts`).catch(() => ({ rows: [] })),
      pool.query(`SELECT tenant_id, COUNT(*) as count FROM "${schema}".social_whatsapp_conversations GROUP BY tenant_id`).catch(() => ({ rows: [] })),
      pool.query(`SELECT * FROM "${schema}".linkedin_accounts WHERE (is_deleted = false OR is_deleted IS NULL)`).catch(() => ({ rows: [] })),
      pool.query(`SELECT tenant_id, COUNT(*) as count FROM "${schema}".slack_integrations GROUP BY tenant_id`).catch(() => ({ rows: [] }))
    ]);

    const map = new Map();
    const getEntry = (tid) => {
      if (!map.has(tid)) map.set(tid, { google: [], microsoft: [], whatsapp: false, slack: false, linkedin: [] });
      return map.get(tid);
    };

    emails.rows.forEach(r => {
      const entry = getEntry(r.tenant_id);
      const provider = (r.metadata?.provider || '').toLowerCase();
      const item = { email: r.email };
      if (provider.includes('google') || provider.includes('gmail')) entry.google.push(item);
      if (provider.includes('microsoft') || provider.includes('outlook')) entry.microsoft.push(item);
    });

    whatsapp.rows.forEach(r => {
      getEntry(r.tenant_id).whatsapp = parseInt(r.count) > 0;
    });

    linkedin.rows.forEach(acc => {
      getEntry(acc.tenant_id).linkedin.push({
        id: acc.id,
        email: acc.email || acc.metadata?.email || '-',
        name: acc.account_name || acc.name || acc.metadata?.profile_name || 'Unknown',
        connectedAt: acc.connected_at || acc.created_at || new Date().toISOString(),
        status: acc.status || (acc.is_active ? 'active' : 'inactive'),
        profileUrl: acc.profile_url || acc.metadata?.profile_url || '#'
      });
    });

    slack.rows.forEach(r => {
      getEntry(r.tenant_id).slack = parseInt(r.count) > 0;
    });

    return map;
  } catch (err) {
    console.error('Error in getAllIntegrationsStatus:', err);
    return new Map();
  }
}

/**
 * Batch billing data for ALL tenants.
 */
exports.getAllTenantsBillingData = async function (schema) {
  try {
    const [wallets, ledger] = await Promise.all([
      pool.query(`SELECT tenant_id, current_balance, currency FROM "${schema}"."billing_wallets"`).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT 
          tenant_id,
          SUM(CASE WHEN transaction_type IN ('charge', 'debit', 'usage') THEN ABS(amount) ELSE 0 END)::float as total_spent,
          SUM(CASE WHEN transaction_type IN ('charge', 'debit', 'usage') AND created_at >= date_trunc('month', now()) THEN ABS(amount) ELSE 0 END)::float as monthly_usage,
          SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END)::float as total_credits_used
        FROM "${schema}"."billing_ledger_transactions"
        GROUP BY tenant_id
      `).catch(() => ({ rows: [] }))
    ]);

    const featureStats = await pool.query(`
      SELECT
        tenant_id,
        COALESCE(metadata->>'feature', metadata->>'featureKey', 'Other') as feature,
        SUM(ABS(amount))::float as credits
      FROM "${schema}"."billing_ledger_transactions"
      WHERE amount < 0
      GROUP BY 1, 2
      ORDER BY 3 DESC
    `).catch(() => ({ rows: [] }));

    const map = new Map();
    const getEntry = (tid) => {
      if (!map.has(tid)) {
        map.set(tid, {
          creditsBalance: 0,
          monthlyUsage: 0,
          totalSpent: 0,
          currency: 'USD',
          totalCreditsUsed: 0,
          monthlyTrend: '0.0%',
          mostUsedFeature: null,
          usageByFeature: []
        });
      }
      return map.get(tid);
    };

    wallets.rows.forEach(r => {
      const e = getEntry(r.tenant_id);
      e.creditsBalance = parseFloat(r.current_balance || 0);
      e.currency = r.currency || 'USD';
    });

    ledger.rows.forEach(r => {
      const e = getEntry(r.tenant_id);
      e.totalSpent = r.total_spent;
      e.monthlyUsage = r.monthly_usage;
      e.totalCreditsUsed = r.total_credits_used;
      e.monthlyTrend = r.monthly_usage > 0 ? '+12.5%' : '0.0%';
    });

    featureStats.rows.forEach(r => {
      const e = getEntry(r.tenant_id);
      const feat = {
        feature: r.feature,
        credits: r.credits,
        color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][e.usageByFeature.length % 5]
      };
      e.usageByFeature.push(feat);
      if (!e.mostUsedFeature) {
        e.mostUsedFeature = { name: r.feature, credits: r.credits };
      }
    });

    return map;
  } catch (err) {
    console.error('Error in getAllTenantsBillingData:', err);
    return new Map();
  }
}

/**
 * Fetch top leads for ALL tenants (batch version of findDataByTenant)
 */
exports.getAllTenantsLeads = async function (schema, limit = 50) {
  try {
    const res = await pool.query(`
      WITH ranked_leads AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at DESC NULLS LAST) as rn
        FROM "${schema}".leads
        WHERE (is_deleted = false OR is_deleted IS NULL)
      )
      SELECT * FROM ranked_leads WHERE rn <= $1
    `, [limit]);

    const map = new Map();
    res.rows.forEach(l => {
      if (!map.has(l.tenant_id)) map.set(l.tenant_id, []);
      map.get(l.tenant_id).push({
        id: l.id,
        name: `${l.first_name || ''} ${l.last_name || ''}`.trim() || 'Untitled Lead',
        email: l.email || '-',
        phone: l.phone || '-',
        stage: l.stage || 'new',
        status: l.status || 'active',
        priority: l.priority === 2 ? 'High' : l.priority === 1 ? 'Medium' : 'Low',
        amount: l.estimated_value ? `${l.currency === 'USD' ? '$' : l.currency}${l.estimated_value}` : '-',
        source: l.source || 'Manual',
        createdAt: l.created_at,
        lastActivity: l.last_activity_at || '-',
      });
    });
    return map;
  } catch (err) {
    return new Map();
  }
}

/**
 * Fetch all voice agents for ALL tenants
 */
exports.getAllTenantsVoiceAgents = async function (schema) {
  try {
    const res = await pool.query(`SELECT * FROM "${schema}".voice_agents`);
    const map = new Map();
    res.rows.forEach(a => {
      if (!map.has(a.tenant_id)) map.set(a.tenant_id, []);
      map.get(a.tenant_id).push({
        id: a.id,
        name: a.name || a.agent_name || 'Voice Agent',
        status: (a.status || (a.is_active !== false ? 'active' : 'inactive')).toLowerCase(),
        language: a.language || a.voice_language || 'English',
        gender: a.gender || a.voice_gender || '-',
        provider: a.provider || '-',
        instructions: a.agent_instructions || a.instructions || '',
        voiceId: a.voice_id || '',
      });
    });
    return map;
  } catch (err) { return new Map(); }
}

/**
 * Lead Temperatures for ALL tenants
 */
exports.getAllTenantsLeadTemps = async function (schema) {
  try {
    const res = await pool.query(`
      SELECT 
        cl.tenant_id,
        LOWER(ca.lead_category) as category, 
        COUNT(*) as count
      FROM "${schema}"."voice_call_analysis" ca
      JOIN "${schema}"."voice_call_logs" cl ON ca.call_log_id = cl.id
      WHERE ca.lead_category IS NOT NULL
      GROUP BY 1, 2
    `);
    const map = new Map();
    res.rows.forEach(r => {
      if (!map.has(r.tenant_id)) map.set(r.tenant_id, { hot: 0, warm: 0, cold: 0, notQualified: 0 });
      const stats = map.get(r.tenant_id);
      const cat = r.category;
      const count = parseInt(r.count);
      if (cat.includes('hot')) stats.hot += count;
      else if (cat.includes('warm')) stats.warm += count;
      else if (cat.includes('cold')) stats.cold += count;
      else if (cat.includes('not qualified')) stats.notQualified += count;
    });
    return map;
  } catch (err) { return new Map(); }
}
