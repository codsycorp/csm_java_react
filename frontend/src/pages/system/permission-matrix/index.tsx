import { BasicContent } from "#src/components";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { Table, Spin, message, Button, Space } from "antd";
import { ReloadOutlined, ExportOutlined } from "@ant-design/icons";
import { fetchPermissionMatrix, fetchAllPermissions } from "#src/api/permission";

interface PermissionData {
	[user: string]: {
		[permission: string]: boolean;
	};
}

interface Permission {
	id: string;
	permission_code: string;
	permission_name: string;
	description: string;
	category: string;
}

interface ApiResponse<T> {
	code: number;
	result: T;
	success: boolean;
	message: string;
}
export default function PermissionMatrix() {
	const { t } = useTranslation();
	const [loading, setLoading] = useState(false);
	const [matrixData, setMatrixData] = useState<PermissionData>({});
	const [permissions, setPermissions] = useState<Permission[]>([]);
	const [tableData, setTableData] = useState<any[]>([]);

	useEffect(() => {
		fetchData();
	}, []);

	const fetchData = async () => {
		setLoading(true);
		try {
			const [matrixRes, permsRes] = await Promise.all([
				fetchPermissionMatrix() as Promise<ApiResponse<PermissionData>>,
				fetchAllPermissions() as Promise<ApiResponse<Permission[]>>,
			]);

			if (matrixRes?.success && matrixRes.result) {
				setMatrixData(matrixRes.result);
			}

			if (permsRes?.success && permsRes.result) {
				setPermissions(permsRes.result);
				// Transform data for table display
				const rows = Object.entries(matrixRes.result || {}).map(([user, perms]) => {
					const permObj = perms as Record<string, boolean>;
					return {
					key: user,
					user,
						...permObj,
					};
				});
				setTableData(rows);
			}
		} catch (error) {
			console.error("Failed to fetch permission matrix:", error);
			message.error(t("common.loadFailed"));
		} finally {
			setLoading(false);
		}
	};

	const handleRefresh = () => {
		fetchData();
	};

	const handleExport = () => {
		// Create CSV export
		const headers = ["User", ...permissions.map((p) => p.permission_code)];
		const rows = tableData.map((row) => [
			row.user,
			...permissions.map((p) => (row[p.permission_code] ? "✓" : "✗")),
		]);

		const csvContent = [headers, ...rows].map((row) => row.join(",")).join("\n");
		const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
		const link = document.createElement("a");
		const url = URL.createObjectURL(blob);
		link.setAttribute("href", url);
		link.setAttribute("download", "permission-matrix.csv");
		link.style.visibility = "hidden";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		message.success("Exported successfully");
	};

	const columns: any[] = [
		{
			title: "User",
			dataIndex: "user",
			key: "user",
			width: 200,
			fixed: "left",
			render: (text: string) => <strong>{text}</strong>,
		},
		...permissions.map((perm) => ({
			title: (
				<div style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
					<div style={{ fontSize: "12px", fontWeight: "bold" }}>{perm.permission_code}</div>
					<div style={{ fontSize: "11px", color: "#666" }}>{perm.permission_name}</div>
				</div>
			),
			dataIndex: perm.permission_code,
			key: perm.permission_code,
			width: 100,
			align: "center" as const,
			render: (value: boolean) => (
				<span style={{ color: value ? "#52c41a" : "#d9d9d9" }}>
					{value ? "✓" : "✗"}
				</span>
			),
		})),
	];

	return (
		<BasicContent>
			<div style={{ marginBottom: "20px" }}>
				<Space>
					<Button icon={<ReloadOutlined />} onClick={handleRefresh}>
						{t("common.refresh")}
					</Button>
					<Button icon={<ExportOutlined />} onClick={handleExport}>
						Export CSV
					</Button>
				</Space>
			</div>

			<Spin spinning={loading}>
				<div style={{ overflow: "auto" }}>
					<Table
						columns={columns}
						dataSource={tableData}
						pagination={{
							pageSize: 20,
							showSizeChanger: true,
							showTotal: (total) => `Total ${total} users`,
						}}
						scroll={{ x: 1500 }}
						size="small"
						loading={loading}
					/>
				</div>
			</Spin>
		</BasicContent>
	);
}
