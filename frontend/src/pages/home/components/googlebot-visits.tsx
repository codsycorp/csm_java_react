import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined, DeleteOutlined, RobotOutlined, SearchOutlined, FilterOutlined } from "@ant-design/icons";
import { Button, Card, Col, Popconfirm, Row, Space, Statistic, Table, Tag, Typography, message, Input, Select, DatePicker } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";

import type { GooglebotStats, GooglebotVisit } from "#src/api/home";
import { deleteGooglebotVisits, fetchGooglebotStats } from "#src/api/home";

const { Text } = Typography;

function formatDateTime(value: string | undefined, locale: string) {
	if (!value) return "-";
	try {
		const date = dayjs(value);
		if (locale === 'vi' || locale === 'vi-VN') {
			return date.format('DD/MM/YYYY HH:mm');
		}
		return new Intl.DateTimeFormat(locale || undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(date.toDate());
	} catch (e) {
		return value;
	}
}

function formatDate(dateStr: string, locale: string) {
	if (!dateStr) return dateStr;
	try {
		const date = dayjs(dateStr);
		if (locale === 'vi' || locale === 'vi-VN') {
			return date.format('DD/MM/YYYY');
		}
		if (locale === 'zh' || locale === 'zh-CN') {
			return date.format('YYYY年MM月DD日');
		}
		return date.format('MMM DD, YYYY');
	} catch (e) {
		return dateStr;
	}
}

export default function GooglebotVisits() {
	const { t, i18n } = useTranslation();
	const [stats, setStats] = useState<GooglebotStats | null>(null);
	const [loading, setLoading] = useState(false);
	const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
	const [currentPage, setCurrentPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	
	// Filter states
	const [searchText, setSearchText] = useState("");
	const [hostFilter, setHostFilter] = useState<string | undefined>(undefined);
	const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

	const loadData = async () => {
		setLoading(true);
		try {
			// Load all data for client-side filtering
			const { result } = await fetchGooglebotStats({ limit: 200, offset: 0 });
			setStats(result);
		} catch (error) {
			message.error(t("home.googlebotLoadFailed"));
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void loadData();
	}, []);
	
	// Reset to page 1 when filters change
	useEffect(() => {
		setCurrentPage(1);
	}, [searchText, hostFilter, dateRange]);

	const handleDelete = async (deleteAll: boolean) => {
		if (!deleteAll && selectedRowKeys.length === 0) return;
		setLoading(true);
		try {
			const payload = deleteAll
				? { deleteAll: true }
				: { ids: selectedRowKeys as string[] };
			const { result } = await deleteGooglebotVisits(payload);
			setStats(result);
			setSelectedRowKeys([]);
			setCurrentPage(1); // Reset về trang đầu sau khi xóa
			message.success(t("home.googlebotDeleted"));
			// Reload data sau khi xóa
			await loadData();
		} catch (error) {
			message.error(t("home.googlebotDeleteFailed"));
		} finally {
			setLoading(false);
		}
	};

	const columns: ColumnsType<GooglebotVisit> = useMemo(() => [
		{
			title: t("home.googlebotVisitedAt"),
			dataIndex: "visitedAt",
			width: 180,
			render: (value: string) => <Text>{formatDateTime(value, i18n.language)}</Text>,
		},
		{
			title: t("home.googlebotHost"),
			dataIndex: "host",
			width: 160,
			render: (value: string) => <Tag color="blue">{value || "-"}</Tag>,
		},
		{
			title: t("home.googlebotPath"),
			dataIndex: "path",
			width: 280,
			render: (value: string) => (
				<Text ellipsis={{ tooltip: value }} style={{ maxWidth: 260 }}>
					{value || "-"}
				</Text>
			),
		},
		{
			title: t("home.googlebotIp"),
			dataIndex: "ip",
			width: 140,
		},
		{
			title: t("home.googlebotUserAgent"),
			dataIndex: "userAgent",
			width: 320,
			render: (value: string) => (
				<Text ellipsis={{ tooltip: value }} style={{ maxWidth: 300 }}>
					{value || "-"}
				</Text>
			),
		},
	], [t, i18n.language]);

	const todayCount = useMemo(() => {
		const todayKey = new Date().toISOString().slice(0, 10);
		return stats?.byDate?.find((item) => item.date === todayKey)?.count ?? 0;
	}, [stats]);

	const lastVisitText = useMemo(() => {
		const latest = stats?.latest?.[0]?.visitedAt;
		return latest ? formatDateTime(latest, i18n.language) : t("home.googlebotNoVisit");
	}, [stats, t, i18n.language]);

	const byDate = useMemo(() => (stats?.byDate ?? []).slice(0, 7), [stats]);
	
	// Get unique hosts for filter dropdown
	const uniqueHosts = useMemo(() => {
		const hosts = new Set<string>();
		(stats?.latest ?? []).forEach(item => {
			if (item.host) hosts.add(item.host);
		});
		return Array.from(hosts).sort();
	}, [stats]);
	
	// Filter data based on search and filters
	const filteredData = useMemo(() => {
		let data = stats?.latest ?? [];
		
		// Apply search filter
		if (searchText) {
			const search = searchText.toLowerCase();
			data = data.filter(item => 
				item.path?.toLowerCase().includes(search) ||
				item.ip?.toLowerCase().includes(search) ||
				item.userAgent?.toLowerCase().includes(search)
			);
		}
		
		// Apply host filter
		if (hostFilter) {
			data = data.filter(item => item.host === hostFilter);
		}
		
		// Apply date range filter
		if (dateRange && dateRange[0] && dateRange[1]) {
			const startDate = dateRange[0].startOf('day');
			const endDate = dateRange[1].endOf('day');
			data = data.filter(item => {
				if (!item.visitedAt) return false;
				const visitDate = dayjs(item.visitedAt);
				return visitDate.isAfter(startDate) && visitDate.isBefore(endDate);
			});
		}
		
		return data;
	}, [stats?.latest, searchText, hostFilter, dateRange]);
	
	const handleClearFilters = () => {
		setSearchText("");
		setHostFilter(undefined);
		setDateRange(null);
		setCurrentPage(1);
	};

	return (
		<Card
			title={
				<Space>
					<RobotOutlined />
					<span>{t("home.googlebotSectionTitle")}</span>
				</Space>
			}
			extra={
				<Space wrap>
					<Button size="small" icon={<ReloadOutlined />} onClick={() => loadData()} loading={loading}>
						{t("home.googlebotRefresh")}
					</Button>
					<Button
						size="small"
						disabled={!selectedRowKeys.length}
						icon={<DeleteOutlined />}
						onClick={() => handleDelete(false)}
						loading={loading}
					>
						{t("home.googlebotDeleteSelected")}
					</Button>
					<Popconfirm
						title={t("home.googlebotDeleteAllConfirm")}
						onConfirm={() => handleDelete(true)}
						okButtonProps={{ danger: true }}
					>
						<Button size="small" danger icon={<DeleteOutlined />} loading={loading}>
							{t("home.googlebotDeleteAll")}
						</Button>
					</Popconfirm>
				</Space>
			}
		>
			<Space direction="vertical" style={{ width: "100%" }} size={16}>
				<Row gutter={[16, 16]}>
					<Col xs={24} sm={12} md={8}>
						<Statistic title={t("home.googlebotTotalVisits")}
							value={stats?.totalVisits ?? 0}
							loading={loading}
						/>
					</Col>
					<Col xs={24} sm={12} md={8}>
						<Statistic title={t("home.googlebotToday")}
							value={todayCount}
							loading={loading}
						/>
					</Col>
					<Col xs={24} sm={12} md={8}>
						<Statistic title={t("home.googlebotLastVisit")}
							value={lastVisitText}
							loading={loading}
						/>
					</Col>
				</Row>

				<Space direction="vertical" size={6} style={{ width: "100%" }}>
					<Text strong>{t("home.googlebotByDate")}</Text>
					{byDate.length === 0 && <Text type="secondary">{t("home.googlebotNoVisit")}</Text>}
					{byDate.map((item) => (
						<Space key={item.date} size={12} wrap>
							<Tag color="geekblue">{formatDate(item.date, i18n.language)}</Tag>
							<Text>{t("home.googlebotVisitsCount", { count: item.count })}</Text>
							{item.lastVisitAt && (
								<Text type="secondary">{formatDateTime(item.lastVisitAt, i18n.language)}</Text>
							)}
						</Space>
					))}
				</Space>

				{/* Filter Controls */}
				<Space wrap size={8} style={{ width: "100%" }}>
					<Input
						prefix={<SearchOutlined />}
						placeholder={t("home.googlebotSearchPlaceholder")}
						value={searchText}
						onChange={(e) => setSearchText(e.target.value)}
						style={{ width: 250 }}
						allowClear
					/>
					<Select
						placeholder={t("home.googlebotFilterByHost")}
						value={hostFilter}
						onChange={setHostFilter}
						style={{ width: 180 }}
						allowClear
						options={uniqueHosts.map(host => ({ label: host, value: host }))}
					/>
					<DatePicker.RangePicker
						value={dateRange}
						onChange={(dates) => setDateRange(dates)}
						style={{ width: 260 }}
						format="YYYY-MM-DD"
						placeholder={[t("home.googlebotStartDate"), t("home.googlebotEndDate")]}
					/>
					{(searchText || hostFilter || dateRange) && (
						<Button 
							size="small" 
							icon={<FilterOutlined />} 
							onClick={handleClearFilters}
						>
							{t("home.googlebotClearFilters")}
						</Button>
					)}
					<Text type="secondary">
						{t("home.googlebotFilteredCount", { count: filteredData.length, total: stats?.latest?.length ?? 0 })}
					</Text>
				</Space>

				<Table<GooglebotVisit>
					rowKey="id"
					columns={columns}
					dataSource={filteredData}
					loading={loading}
					size="small"
					scroll={{ x: 'max-content' }}
					pagination={{
						current: currentPage,
						pageSize: pageSize,
						total: filteredData.length,
						showSizeChanger: true,
						showTotal: (total, range) => t('home.googlebotPaginationTotal', { 
							start: range[0], 
							end: range[1], 
							total 
						}),
						onChange: (page, size) => {
							setCurrentPage(page);
							setPageSize(size);
						},
					}}
					rowSelection={{
						selectedRowKeys,
						onChange: (keys) => setSelectedRowKeys(keys),
					}}
				/>
			</Space>
		</Card>
	);
}
