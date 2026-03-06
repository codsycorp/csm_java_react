# BROADCAST ALL-IN-ONE GUIDE (ONE FILE ONLY)

Single runtime file:
- `broadcast_analytics_rocksdb.js`

No TSX split components.

## Included In One JS

1. CRM logic
- Calls `window.csmApi.getCRMStats({ appId })`
- Renders CRM Operations Overview
- Saves CRM snapshot to `crm_dashboard_overview` via `updateTableData`

2. Analytics + AI logic
- Calls `window.csmApi.getAnalytics(appId, period)`
- Calls `window.csmApi.getAIInsights(appId, period)`
- Renders KPI, trends, channel/ad analysis, AI insights
- Saves analytics data to `crm_analytics` via `updateTableData`

The JS supports both API response styles:
- `{ success, data }`
- direct payload object

## Broadcast Runtime Flow

1. Open `/broadcast`
2. `broadcast.tsx` reads `sys_autos` with:
- `app_id = "broadcast_" + baseAppId`
- `p_type = 2`
3. Execute `auto_code`
4. JS runs CRM + Analytics + AI in one page
5. Auto-save every 5 minutes

## Deploy

Insert one record:

```sql
INSERT INTO sys_autos (app_id, p_type, auto_code)
VALUES (
  'broadcast_csm',
  2,
  '<paste full content of broadcast_analytics_rocksdb.js>'
);
```

## Required APIs

`window.csmApi` must provide:
- `getCRMStats(params)`
- `getAnalytics(appId, period)`
- `getAIInsights(appId, period)`
- `updateTableData(payload)`

Backend endpoints:
- `POST /crm/stats`
- `POST /crm/analytics`
- `POST /crm/insights`
- `POST /update-table-data`

## Verify

1. Open `/broadcast`
2. Must show all sections:
- CRM Operations Overview
- KPI Metrics
- Revenue and Customer Trends
- Channel and Ad Performance
- AI Insights and Recommendations

3. Check logs after 5+ minutes for writes to:
- `crm_dashboard_overview`
- `crm_analytics`

This is the only guide file for Broadcast deployment.
