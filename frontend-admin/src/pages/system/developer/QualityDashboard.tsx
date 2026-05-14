import React, { useEffect, useMemo, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tabs, Progress, Spin, Alert, Empty, Button, Popconfirm, message, Space, Input } from 'antd';
import { LineChartOutlined, CheckCircleOutlined, ExclamationOutlined, ReloadOutlined } from '@ant-design/icons';

interface MetricsData {
  timestamp: number;
  window_size_ms: number;
  totals: {
    total_requests: number;
    total_retries: number;
    total_fallbacks: number;
    total_patch_rejects: number;
    total_validator_rejects: number;
  };
  retry_reason_distribution: Record<string, number>;
  evidence_gate_hits: Record<string, number>;
  patch_reject_reasons: Record<string, number>;
  validator_reject_reasons: Record<string, number>;
  fallback_rate: number;
  patch_reject_rate: number;
  validator_reject_rate: number;
  quality_trends?: Record<string, Record<string, number>>;
  request_status_trends?: Record<string, Record<string, number>>;
  recent_request_traces?: Array<{
    timestamp: number;
    requestId: string;
    flow: string;
    stage: string;
    status: string;
    reason_code: string;
    app_id?: string;
    response_mode?: string;
    model?: string;
    elapsed_ms?: number;
    meta?: Record<string, unknown>;
  }>;
  scope?: 'global' | 'app';
  app_id?: string;
}

interface QualityDashboardProps {
  refreshInterval?: number; // ms
  enabled?: boolean;
  focusRequestId?: string;
  focusAppId?: string;
  focusNonce?: number;
}

const QualityDashboard: React.FC<QualityDashboardProps> = ({ 
  refreshInterval = 5000, 
  enabled = true,
  focusRequestId,
  focusAppId,
  focusNonce,
}) => {
  const traceLimit = 80;
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateMs, setLastUpdateMs] = useState<number>(0);
  const [appIdFilter, setAppIdFilter] = useState<string>('');
  const [traceFilter, setTraceFilter] = useState<string>('');
  const [activeMetricsTab, setActiveMetricsTab] = useState<string>('request-timeline');
  const [expandedTimelineRowKeys, setExpandedTimelineRowKeys] = useState<React.Key[]>([]);

  // Fetch metrics from backend
  const fetchMetrics = async () => {
    if (!enabled) return;

    try {
      setLoading(true);
      setError(null);

      const safeAppId = appIdFilter.trim();
      const queryParams = new URLSearchParams();
      queryParams.set('traceLimit', String(traceLimit));
      if (safeAppId) {
        queryParams.set('appId', safeAppId);
      }
      const query = `?${queryParams.toString()}`;
      const response = await fetch(`/api/ai/metrics${query}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: MetricsData = await response.json();
      setMetrics(data);
      setLastUpdateMs(Date.now());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to fetch metrics: ${msg}`);
      console.error('[QualityDashboard] fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh interval
  useEffect(() => {
    if (!enabled) return;

    // Fetch immediately
    fetchMetrics();

    // Then set up interval
    const interval = setInterval(fetchMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [enabled, refreshInterval, appIdFilter]);

  useEffect(() => {
    const safeRequestId = String(focusRequestId || '').trim();
    const safeAppId = String(focusAppId || '').trim();
    if (!safeRequestId && !safeAppId) {
      return;
    }
    if (safeAppId) {
      setAppIdFilter(safeAppId);
    }
    if (safeRequestId) {
      setTraceFilter(safeRequestId);
      setActiveMetricsTab('request-timeline');
    }
  }, [focusAppId, focusNonce, focusRequestId]);

  const handleResetMetrics = async () => {
    try {
      setResetLoading(true);
      const safeAppId = appIdFilter.trim();
      const query = safeAppId ? `?appId=${encodeURIComponent(safeAppId)}` : '';
      const response = await fetch(`/api/ai/metrics/reset${query}`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      message.success(safeAppId ? `Metrics reset for appId=${safeAppId}` : 'Global metrics reset successfully');
      await fetchMetrics();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`Reset metrics failed: ${msg}`);
    } finally {
      setResetLoading(false);
    }
  };

  if (!enabled) {
    return <Empty description="Dashboard disabled" />;
  }

  if (error) {
    return <Alert type="error" message="Metrics Error" description={error} />;
  }

  if (loading && !metrics) {
    return <Spin size="large" />;
  }

  if (!metrics) {
    return <Empty description="No metrics available" />;
  }

  // Convert distribution records to table format
  const retryReasonData = Object.entries(metrics.retry_reason_distribution).map(([reason, count]) => ({
    reason,
    count,
    percentage: metrics.totals.total_retries > 0 
      ? ((count / metrics.totals.total_retries) * 100).toFixed(1)
      : '0.0',
  }));

  const evidenceGateData = Object.entries(metrics.evidence_gate_hits).map(([gate, count]) => ({
    gate,
    count,
    percentage: metrics.totals.total_requests > 0
      ? ((count / metrics.totals.total_requests) * 100).toFixed(1)
      : '0.0',
  }));

  const patchRejectData = Object.entries(metrics.patch_reject_reasons).map(([reason, count]) => ({
    reason,
    count,
    percentage: metrics.totals.total_patch_rejects > 0
      ? ((count / metrics.totals.total_patch_rejects) * 100).toFixed(1)
      : '0.0',
  }));

  const validatorRejectData = Object.entries(metrics.validator_reject_reasons).map(([reason, count]) => ({
    reason,
    count,
    percentage: metrics.totals.total_validator_rejects > 0
      ? ((count / metrics.totals.total_validator_rejects) * 100).toFixed(1)
      : '0.0',
  }));

  const formatRate = (rate: number) => `${(rate * 100).toFixed(2)}%`;
  const timeAgoMs = Date.now() - lastUpdateMs;
  const timeAgoStr = timeAgoMs < 1000 ? 'now' : `${Math.round(timeAgoMs / 1000)}s ago`;

  const retrievalPassCount = Number(metrics.evidence_gate_hits['retrieval_quality_pass'] || 0);
  const retrievalLowCount = Number(metrics.evidence_gate_hits['retrieval_quality_low'] || 0);
  const retrievalRetryAppliedCount = Number(metrics.evidence_gate_hits['retrieval_quality_retry_applied'] || 0);
  const retrievalTotal = retrievalPassCount + retrievalLowCount;
  const retrievalPassRate = retrievalTotal > 0 ? retrievalPassCount / retrievalTotal : 0;
  const retrievalLowRate = retrievalTotal > 0 ? retrievalLowCount / retrievalTotal : 0;

  const stepContractViolationCount = Number(metrics.evidence_gate_hits['step_output_contract_violation'] || 0);
  const stepContractRepairAppliedCount = Number(metrics.evidence_gate_hits['step_output_contract_repair_applied'] || 0);
  const stepContractRepairFailedCount = Number(metrics.evidence_gate_hits['step_output_contract_repair_failed'] || 0);
  const stepContractRepairLowQualityCount = Number(metrics.evidence_gate_hits['step_output_contract_repair_low_quality'] || 0);
  const stepContractHandledTotal = stepContractViolationCount + stepContractRepairAppliedCount;
  const stepContractViolationRate = metrics.totals.total_requests > 0
    ? stepContractViolationCount / metrics.totals.total_requests
    : 0;
  const stepContractRepairSuccessRate = (stepContractRepairAppliedCount + stepContractRepairFailedCount) > 0
    ? stepContractRepairAppliedCount / (stepContractRepairAppliedCount + stepContractRepairFailedCount)
    : 0;

  const retrievalGateData = [
    {
      gate: 'retrieval_quality_pass',
      count: retrievalPassCount,
      percentage: retrievalTotal > 0 ? ((retrievalPassCount / retrievalTotal) * 100).toFixed(1) : '0.0',
    },
    {
      gate: 'retrieval_quality_low',
      count: retrievalLowCount,
      percentage: retrievalTotal > 0 ? ((retrievalLowCount / retrievalTotal) * 100).toFixed(1) : '0.0',
    },
    {
      gate: 'retrieval_quality_retry_applied',
      count: retrievalRetryAppliedCount,
      percentage: retrievalTotal > 0 ? ((retrievalRetryAppliedCount / retrievalTotal) * 100).toFixed(1) : '0.0',
    },
  ].filter((item) => item.count > 0);

  const stepContractData = [
    {
      gate: 'step_output_contract_violation',
      count: stepContractViolationCount,
      percentage: metrics.totals.total_requests > 0
        ? ((stepContractViolationCount / metrics.totals.total_requests) * 100).toFixed(1)
        : '0.0',
    },
    {
      gate: 'step_output_contract_repair_applied',
      count: stepContractRepairAppliedCount,
      percentage: stepContractHandledTotal > 0
        ? ((stepContractRepairAppliedCount / stepContractHandledTotal) * 100).toFixed(1)
        : '0.0',
    },
    {
      gate: 'step_output_contract_repair_failed',
      count: stepContractRepairFailedCount,
      percentage: stepContractHandledTotal > 0
        ? ((stepContractRepairFailedCount / stepContractHandledTotal) * 100).toFixed(1)
        : '0.0',
    },
    {
      gate: 'step_output_contract_repair_low_quality',
      count: stepContractRepairLowQualityCount,
      percentage: stepContractHandledTotal > 0
        ? ((stepContractRepairLowQualityCount / stepContractHandledTotal) * 100).toFixed(1)
        : '0.0',
    },
  ].filter((item) => item.count > 0);

  const recentRequestTraceData = (metrics.recent_request_traces || []).map((item, index) => ({
    key: `${item.requestId || 'unknown'}_${item.timestamp}_${index}`,
    ...item,
  })).filter((item) => {
    const q = traceFilter.trim().toLowerCase();
    if (!q) {
      return true;
    }
    const haystack = [
      String(item.requestId || ''),
      String(item.stage || ''),
      String(item.status || ''),
      String(item.reason_code || ''),
      String(item.model || ''),
      String(item.flow || ''),
      String(item.response_mode || ''),
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });

  const requestTimelineData = useMemo(() => {
    const grouped = new Map<string, typeof recentRequestTraceData>();
    for (const item of recentRequestTraceData) {
      const id = String(item.requestId || 'unknown').trim() || 'unknown';
      const entries = grouped.get(id) || [];
      entries.push(item);
      grouped.set(id, entries);
    }

    return Array.from(grouped.entries()).map(([requestId, events]) => {
      const sorted = [...events].sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
      const firstTs = Number(sorted[0]?.timestamp || 0);
      const lastTs = Number(sorted[sorted.length - 1]?.timestamp || firstTs);
      const durationMs = Math.max(0, lastTs - firstTs);
      const finalEvent = sorted[sorted.length - 1];
      const stages = Array.from(new Set(sorted.map((e) => String(e.stage || '').trim()).filter(Boolean)));

      return {
        key: `timeline_${requestId}`,
        requestId,
        events: sorted,
        eventCount: sorted.length,
        startedAt: firstTs,
        endedAt: lastTs,
        durationMs,
        finalStatus: String(finalEvent?.status || '-'),
        finalReason: String(finalEvent?.reason_code || '-'),
        model: String(finalEvent?.model || '-'),
        stages: stages.join(' -> '),
      };
    }).sort((a, b) => b.startedAt - a.startedAt);
  }, [recentRequestTraceData]);

  useEffect(() => {
    const safeRequestId = String(focusRequestId || '').trim();
    if (!safeRequestId) {
      return;
    }
    const matchedKeys = requestTimelineData
      .filter((item) => String(item.requestId || '').trim() === safeRequestId)
      .map((item) => item.key);
    if (matchedKeys.length > 0) {
      setExpandedTimelineRowKeys(matchedKeys);
    }
  }, [focusNonce, focusRequestId, requestTimelineData]);

  const qualityTrendData = Object.entries(metrics.quality_trends || {}).map(([signal, values]) => ({
    key: `quality_${signal}`,
    category: 'evidence_gate',
    signal,
    m5: Number(values['5m'] || 0),
    h1: Number(values['1h'] || 0),
    h24: Number(values['24h'] || 0),
  }));

  const requestStatusTrendData = Object.entries(metrics.request_status_trends || {}).map(([signal, values]) => ({
    key: `request_${signal}`,
    category: 'request_status',
    signal,
    m5: Number(values['5m'] || 0),
    h1: Number(values['1h'] || 0),
    h24: Number(values['24h'] || 0),
  }));

  const trendData = [...qualityTrendData, ...requestStatusTrendData];

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div style={{ fontSize: '12px', color: '#999' }}>
          Updated {timeAgoStr}
          {metrics.scope === 'app' && metrics.app_id ? ` | Scope: app (${metrics.app_id})` : ' | Scope: global'}
        </div>
        <Space size="small">
          <Input
            placeholder="Filter by appId"
            allowClear
            value={appIdFilter}
            onChange={(e) => setAppIdFilter(e.target.value)}
            style={{ width: 220 }}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchMetrics} loading={loading}>
            Refresh
          </Button>
          <Popconfirm
            title={appIdFilter.trim() ? `Reset quality metrics for ${appIdFilter.trim()}?` : 'Reset all quality metrics?'}
            description={appIdFilter.trim()
              ? 'This will clear retry/fallback/reject counters for this appId only.'
              : 'This will clear retry/fallback/reject counters immediately for global scope.'}
            okText="Reset"
            cancelText="Cancel"
            onConfirm={handleResetMetrics}
          >
            <Button danger loading={resetLoading}>Reset Metrics</Button>
          </Popconfirm>
        </Space>
      </div>

      {/* Key Metrics - Summary Row */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Requests"
              value={metrics.totals.total_requests}
              prefix={<LineChartOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Retry Rate"
              value={metrics.totals.total_requests > 0 
                ? ((metrics.totals.total_retries / metrics.totals.total_requests) * 100).toFixed(1)
                : 0}
              suffix="%"
              prefix={<ExclamationOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Fallback Rate"
              value={formatRate(metrics.fallback_rate)}
              prefix={<ExclamationOutlined />}
              valueStyle={{ color: metrics.fallback_rate > 0.1 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Health"
              value={metrics.patch_reject_rate + metrics.validator_reject_rate < 0.2 ? 'Good' : 'Fair'}
              prefix={metrics.patch_reject_rate + metrics.validator_reject_rate < 0.2 ? <CheckCircleOutlined /> : <ExclamationOutlined />}
              valueStyle={{ color: metrics.patch_reject_rate + metrics.validator_reject_rate < 0.2 ? '#52c41a' : '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Rejection Rates - Progress Indicators */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={8}>
          <Card title="Patch Reject Rate" size="small">
            <Progress 
              type="circle" 
              percent={Math.round(metrics.patch_reject_rate * 100)} 
              strokeColor={metrics.patch_reject_rate > 0.15 ? '#ff4d4f' : '#52c41a'}
            />
            <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '12px' }}>
              {metrics.totals.total_patch_rejects} / {metrics.totals.total_requests} rejected
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card title="Validator Reject Rate" size="small">
            <Progress 
              type="circle" 
              percent={Math.round(metrics.validator_reject_rate * 100)}
              strokeColor={metrics.validator_reject_rate > 0.1 ? '#ff4d4f' : '#52c41a'}
            />
            <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '12px' }}>
              {metrics.totals.total_validator_rejects} / {metrics.totals.total_requests} rejected
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card title="Total Retries" size="small">
            <Progress 
              type="circle" 
              percent={Math.round((metrics.totals.total_retries / Math.max(1, metrics.totals.total_requests)) * 100)}
              strokeColor="#1890ff"
            />
            <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '12px' }}>
              {metrics.totals.total_retries} retries
            </div>
          </Card>
        </Col>
      </Row>

      {/* Retrieval Quality - Copilot parity signals */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={8}>
          <Card title="Retrieval Pass Rate" size="small">
            <Progress
              type="circle"
              percent={Math.round(retrievalPassRate * 100)}
              strokeColor={retrievalPassRate >= 0.75 ? '#52c41a' : '#faad14'}
            />
            <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '12px' }}>
              {retrievalPassCount} pass / {retrievalTotal} total
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card title="Retrieval Low Evidence" size="small">
            <Progress
              type="circle"
              percent={Math.round(retrievalLowRate * 100)}
              strokeColor={retrievalLowRate > 0.2 ? '#ff4d4f' : '#52c41a'}
            />
            <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '12px' }}>
              {retrievalLowCount} low-evidence hits
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card title="Retrieval Remediation" size="small">
            <Progress
              type="circle"
              percent={Math.round(retrievalTotal > 0 ? (retrievalRetryAppliedCount / retrievalTotal) * 100 : 0)}
              strokeColor="#1890ff"
            />
            <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '12px' }}>
              {retrievalRetryAppliedCount} retry-applied events
            </div>
          </Card>
        </Col>
      </Row>

      {/* Step Contract Reliability - Copilot parity signals */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={8}>
          <Card title="Step Contract Violations" size="small">
            <Progress
              type="circle"
              percent={Math.round(stepContractViolationRate * 100)}
              strokeColor={stepContractViolationRate > 0.08 ? '#ff4d4f' : '#52c41a'}
            />
            <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '12px' }}>
              {stepContractViolationCount} violations / {metrics.totals.total_requests} requests
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card title="Step Contract Repair Success" size="small">
            <Progress
              type="circle"
              percent={Math.round(stepContractRepairSuccessRate * 100)}
              strokeColor={stepContractRepairSuccessRate >= 0.7 ? '#52c41a' : '#faad14'}
            />
            <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '12px' }}>
              {stepContractRepairAppliedCount} repaired successfully
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card title="Step Contract Repair Failed" size="small">
            <Progress
              type="circle"
              percent={Math.round(stepContractHandledTotal > 0
                ? (stepContractRepairFailedCount / stepContractHandledTotal) * 100
                : 0)}
              strokeColor={stepContractRepairFailedCount > 0 ? '#ff4d4f' : '#52c41a'}
            />
            <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '12px' }}>
              {stepContractRepairFailedCount} repair-failed events
            </div>
          </Card>
        </Col>
      </Row>

      {/* Detailed Breakdown Tables */}
      <Tabs
        activeKey={activeMetricsTab}
        onChange={setActiveMetricsTab}
        items={[
          {
            key: 'retry',
            label: `Retry Reasons (${retryReasonData.length})`,
            children: (
              retryReasonData.length > 0 ? (
                <Table
                  size="small"
                  pagination={false}
                  columns={[
                    { title: 'Reason', dataIndex: 'reason', key: 'reason' },
                    { title: 'Count', dataIndex: 'count', key: 'count', sorter: (a, b) => a.count - b.count },
                    { title: '%', dataIndex: 'percentage', key: 'percentage' },
                  ]}
                  dataSource={retryReasonData.sort((a, b) => b.count - a.count)}
                  rowKey="reason"
                />
              ) : (
                <Empty description="No retry reasons recorded" />
              )
            ),
          },
          {
            key: 'gates',
            label: `Evidence Gates (${evidenceGateData.length})`,
            children: (
              evidenceGateData.length > 0 ? (
                <Table
                  size="small"
                  pagination={false}
                  columns={[
                    { title: 'Gate Type', dataIndex: 'gate', key: 'gate' },
                    { title: 'Hits', dataIndex: 'count', key: 'count', sorter: (a, b) => a.count - b.count },
                    { title: '%', dataIndex: 'percentage', key: 'percentage' },
                  ]}
                  dataSource={evidenceGateData.sort((a, b) => b.count - a.count)}
                  rowKey="gate"
                />
              ) : (
                <Empty description="No evidence gate hits recorded" />
              )
            ),
          },
          {
            key: 'retrieval',
            label: `Retrieval Quality (${retrievalGateData.length})`,
            children: (
              retrievalGateData.length > 0 ? (
                <Table
                  size="small"
                  pagination={false}
                  columns={[
                    { title: 'Signal', dataIndex: 'gate', key: 'gate' },
                    { title: 'Count', dataIndex: 'count', key: 'count', sorter: (a, b) => a.count - b.count },
                    { title: '%', dataIndex: 'percentage', key: 'percentage' },
                  ]}
                  dataSource={retrievalGateData.sort((a, b) => b.count - a.count)}
                  rowKey="gate"
                />
              ) : (
                <Empty description="No retrieval quality events recorded" />
              )
            ),
          },
          {
            key: 'step-contract',
            label: `Step Contract (${stepContractData.length})`,
            children: (
              stepContractData.length > 0 ? (
                <Table
                  size="small"
                  pagination={false}
                  columns={[
                    { title: 'Signal', dataIndex: 'gate', key: 'gate' },
                    { title: 'Count', dataIndex: 'count', key: 'count', sorter: (a, b) => a.count - b.count },
                    { title: '%', dataIndex: 'percentage', key: 'percentage' },
                  ]}
                  dataSource={stepContractData.sort((a, b) => b.count - a.count)}
                  rowKey="gate"
                />
              ) : (
                <Empty description="No step contract events recorded" />
              )
            ),
          },
          {
            key: 'patch',
            label: `Patch Rejections (${patchRejectData.length})`,
            children: (
              patchRejectData.length > 0 ? (
                <Table
                  size="small"
                  pagination={false}
                  columns={[
                    { title: 'Rejection Reason', dataIndex: 'reason', key: 'reason' },
                    { title: 'Count', dataIndex: 'count', key: 'count', sorter: (a, b) => a.count - b.count },
                    { title: '%', dataIndex: 'percentage', key: 'percentage' },
                  ]}
                  dataSource={patchRejectData.sort((a, b) => b.count - a.count)}
                  rowKey="reason"
                />
              ) : (
                <Empty description="No patch rejections recorded" />
              )
            ),
          },
          {
            key: 'validator',
            label: `Validator Rejections (${validatorRejectData.length})`,
            children: (
              validatorRejectData.length > 0 ? (
                <Table
                  size="small"
                  pagination={false}
                  columns={[
                    { title: 'Rejection Reason', dataIndex: 'reason', key: 'reason' },
                    { title: 'Count', dataIndex: 'count', key: 'count', sorter: (a, b) => a.count - b.count },
                    { title: '%', dataIndex: 'percentage', key: 'percentage' },
                  ]}
                  dataSource={validatorRejectData.sort((a, b) => b.count - a.count)}
                  rowKey="reason"
                />
              ) : (
                <Empty description="No validator rejections recorded" />
              )
            ),
          },
          {
            key: 'trends',
            label: `Trends (${trendData.length})`,
            children: (
              trendData.length > 0 ? (
                <Table
                  size="small"
                  pagination={false}
                  columns={[
                    { title: 'Category', dataIndex: 'category', key: 'category', width: 150 },
                    { title: 'Signal', dataIndex: 'signal', key: 'signal' },
                    { title: '5m', dataIndex: 'm5', key: 'm5', sorter: (a, b) => a.m5 - b.m5, width: 90 },
                    { title: '1h', dataIndex: 'h1', key: 'h1', sorter: (a, b) => a.h1 - b.h1, width: 90 },
                    { title: '24h', dataIndex: 'h24', key: 'h24', sorter: (a, b) => a.h24 - b.h24, width: 90 },
                  ]}
                  dataSource={trendData.sort((a, b) => b.h24 - a.h24)}
                />
              ) : (
                <Empty description="No trend data recorded" />
              )
            ),
          },
          {
            key: 'request-timeline',
            label: `Timeline (${requestTimelineData.length})`,
            children: (
              requestTimelineData.length > 0 ? (
                <Table
                  size="small"
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: 1400 }}
                  columns={[
                    {
                      title: 'Started At',
                      dataIndex: 'startedAt',
                      key: 'startedAt',
                      width: 130,
                      render: (value: number) => new Date(value).toLocaleTimeString(),
                      sorter: (a, b) => a.startedAt - b.startedAt,
                      defaultSortOrder: 'descend',
                    },
                    { title: 'Request ID', dataIndex: 'requestId', key: 'requestId', ellipsis: true, width: 180 },
                    { title: 'Events', dataIndex: 'eventCount', key: 'eventCount', width: 90, sorter: (a, b) => a.eventCount - b.eventCount },
                    { title: 'Duration (ms)', dataIndex: 'durationMs', key: 'durationMs', width: 120, sorter: (a, b) => a.durationMs - b.durationMs },
                    { title: 'Final Status', dataIndex: 'finalStatus', key: 'finalStatus', width: 140 },
                    { title: 'Final Reason', dataIndex: 'finalReason', key: 'finalReason', width: 220, ellipsis: true },
                    { title: 'Model', dataIndex: 'model', key: 'model', width: 180, ellipsis: true },
                    { title: 'Stages', dataIndex: 'stages', key: 'stages', ellipsis: true },
                  ]}
                  expandable={{
                    expandedRowKeys: expandedTimelineRowKeys,
                    onExpandedRowsChange: (keys) => setExpandedTimelineRowKeys([...keys]),
                    expandedRowRender: (record) => (
                      <Table
                        size="small"
                        pagination={false}
                        columns={[
                          {
                            title: 'Time',
                            dataIndex: 'timestamp',
                            key: 'timestamp',
                            width: 140,
                            render: (value: number) => new Date(value).toLocaleTimeString(),
                          },
                          { title: 'Stage', dataIndex: 'stage', key: 'stage', width: 170 },
                          { title: 'Status', dataIndex: 'status', key: 'status', width: 150 },
                          { title: 'Reason', dataIndex: 'reason_code', key: 'reason_code', width: 220, ellipsis: true },
                          {
                            title: 'Elapsed (ms)',
                            dataIndex: 'elapsed_ms',
                            key: 'elapsed_ms',
                            width: 120,
                            render: (value: number | undefined) => (typeof value === 'number' ? value : '-'),
                          },
                          { title: 'Model', dataIndex: 'model', key: 'model', width: 170, ellipsis: true },
                        ]}
                        dataSource={record.events.map((event, index) => ({
                          ...event,
                          key: `${record.requestId}_${index}_${event.stage}_${event.status}`,
                        }))}
                      />
                    ),
                  }}
                  dataSource={requestTimelineData}
                />
              ) : (
                <Empty description="No request timeline data" />
              )
            ),
          },
          {
            key: 'request-traces',
            label: `Request Traces (${recentRequestTraceData.length})`,
            children: (
              <div>
                <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Input
                    placeholder="Filter request traces (requestId, stage, status, reason, model...)"
                    allowClear
                    value={traceFilter}
                    onChange={(e) => setTraceFilter(e.target.value)}
                    style={{ maxWidth: 460 }}
                  />
                </div>
                {recentRequestTraceData.length > 0 ? (
                  <Table
                    size="small"
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: 1300 }}
                    columns={[
                      {
                        title: 'Timestamp',
                        dataIndex: 'timestamp',
                        key: 'timestamp',
                        render: (value: number) => new Date(value).toLocaleTimeString(),
                        sorter: (a, b) => a.timestamp - b.timestamp,
                        defaultSortOrder: 'descend',
                      },
                      { title: 'Request ID', dataIndex: 'requestId', key: 'requestId', ellipsis: true, width: 180 },
                      { title: 'Flow', dataIndex: 'flow', key: 'flow', width: 130 },
                      { title: 'Stage', dataIndex: 'stage', key: 'stage', width: 160 },
                      { title: 'Status', dataIndex: 'status', key: 'status', width: 120 },
                      { title: 'Reason', dataIndex: 'reason_code', key: 'reason_code', width: 180 },
                      { title: 'Model', dataIndex: 'model', key: 'model', width: 180 },
                      {
                        title: 'Elapsed (ms)',
                        dataIndex: 'elapsed_ms',
                        key: 'elapsed_ms',
                        width: 120,
                        render: (value: number | undefined) => (typeof value === 'number' ? value : '-'),
                      },
                    ]}
                    expandable={{
                      expandedRowRender: (record) => (
                        <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                          <div><strong>app_id:</strong> {record.app_id || '-'}</div>
                          <div><strong>response_mode:</strong> {record.response_mode || '-'}</div>
                          <div><strong>meta:</strong></div>
                          <pre style={{ marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
{JSON.stringify(record.meta || {}, null, 2)}
                          </pre>
                        </div>
                      ),
                      rowExpandable: () => true,
                    }}
                    dataSource={recentRequestTraceData}
                  />
                ) : (
                  <Empty description="No recent request traces" />
                )}
              </div>
            ),
          },
        ]}
      />

      {/* Footer: Window info */}
      <div style={{ marginTop: '16px', fontSize: '12px', color: '#999' }}>
        <p>Data collected over {(metrics.window_size_ms / 60000).toFixed(0)} minutes</p>
      </div>
    </div>
  );
};

export default QualityDashboard;
