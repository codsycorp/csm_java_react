import React, { useEffect, useState } from 'react';
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
  scope?: 'global' | 'app';
  app_id?: string;
}

interface QualityDashboardProps {
  refreshInterval?: number; // ms
  enabled?: boolean;
}

const QualityDashboard: React.FC<QualityDashboardProps> = ({ 
  refreshInterval = 5000, 
  enabled = true 
}) => {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateMs, setLastUpdateMs] = useState<number>(0);
  const [appIdFilter, setAppIdFilter] = useState<string>('');

  // Fetch metrics from backend
  const fetchMetrics = async () => {
    if (!enabled) return;

    try {
      setLoading(true);
      setError(null);

      const safeAppId = appIdFilter.trim();
      const query = safeAppId ? `?appId=${encodeURIComponent(safeAppId)}` : '';
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

      {/* Detailed Breakdown Tables */}
      <Tabs
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
