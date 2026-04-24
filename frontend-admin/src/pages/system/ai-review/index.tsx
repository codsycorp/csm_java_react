import { reviewCodeWithAi, type AiReviewImprovement } from "#src/api/ai";
import { PageContainer } from "@ant-design/pro-components";
import { Alert, Button, Card, Form, Input, InputNumber, Space, Table, Tag, Typography, message } from "antd";
import { useMemo, useState } from "react";

const { TextArea } = Input;

interface FormValues {
	focus?: string;
	maxFiles?: number;
	pathsText?: string;
}

function parsePaths(pathsText?: string): string[] {
	const raw = String(pathsText || "").trim();
	if (!raw) {
		return [];
	}
	const parts = raw
		.split(/\n|,/g)
		.map((item) => item.trim())
		.filter(Boolean);
	return Array.from(new Set(parts));
}

function severityColor(severity?: string): string {
	const normalized = String(severity || "").toUpperCase();
	if (normalized === "HIGH") return "red";
	if (normalized === "MEDIUM") return "gold";
	if (normalized === "LOW") return "green";
	return "default";
}

export default function AiReviewCodePage() {
	const [loading, setLoading] = useState(false);
	const [summary, setSummary] = useState("");
	const [rows, setRows] = useState<AiReviewImprovement[]>([]);
	const [scannedFiles, setScannedFiles] = useState<string[]>([]);
	const [contextChars, setContextChars] = useState(0);
	const [lastFocus, setLastFocus] = useState("");

	const columns = useMemo(
		() => [
			{
				title: "Muc do",
				dataIndex: "severity",
				key: "severity",
				width: 110,
				render: (value: string) => <Tag color={severityColor(value)}>{String(value || "-").toUpperCase()}</Tag>,
			},
			{
				title: "File",
				dataIndex: "file",
				key: "file",
				width: 280,
				render: (value: string) => <Typography.Text code>{value || "-"}</Typography.Text>,
			},
			{
				title: "Van de",
				dataIndex: "issue",
				key: "issue",
				render: (value: string) => value || "-",
			},
			{
				title: "De xuat",
				dataIndex: "recommendation",
				key: "recommendation",
				render: (value: string) => value || "-",
			},
		],
		[],
	);

	async function onSubmit(values: FormValues) {
		setLoading(true);
		try {
			const payload = {
				focus: String(values.focus || "").trim(),
				maxFiles: Number(values.maxFiles || 80),
				paths: parsePaths(values.pathsText),
			};
			const response = await reviewCodeWithAi(payload);
			if (!response?.success) {
				throw new Error(response?.message || "AI review failed");
			}

			const result = (response?.result || {}) as any;
			const review = (result?.review || {}) as Record<string, any>;
			const improvements = Array.isArray(review?.improvements) ? review.improvements : [];

			setSummary(String(review?.summary || ""));
			setRows(improvements);
			setScannedFiles(Array.isArray(result?.files) ? result.files : []);
			setContextChars(Number(result?.contextChars || 0));
			setLastFocus(String(result?.focus || payload.focus || ""));
			message.success(`Review hoan tat: ${improvements.length} diem can cai thien`);
		} catch (error: any) {
			message.error(error?.message || "Khong the review code luc nay");
		} finally {
			setLoading(false);
		}
	}

	return (
		<PageContainer
			header={{
				title: "AI Review Code",
				subTitle: "Phan tich code backend bang GitHub Models API va tra ve danh sach diem can cai thien",
			}}
		>
			<Space direction="vertical" size={16} style={{ display: "flex" }}>
				<Card title="Cau hinh review" bordered={false}>
					<Form<FormValues>
						layout="vertical"
						onFinish={onSubmit}
						initialValues={{
							maxFiles: 80,
							focus: "security, performance, architecture",
						}}
					>
						<Form.Item
							label="Focus"
							name="focus"
							extra="Vi du: security, SQL injection, transaction, performance"
						>
							<Input placeholder="Nhap trong tam review" />
						</Form.Item>

						<Form.Item label="So file toi da" name="maxFiles">
							<InputNumber min={1} max={200} style={{ width: 220 }} />
						</Form.Item>

						<Form.Item
							label="Danh sach file (tuy chon)"
							name="pathsText"
							extra="Nhap moi file mot dong hoac phan tach boi dau phay. Bo trong de backend tu quet toan bo src/main/java"
						>
							<TextArea
								autoSize={{ minRows: 4, maxRows: 10 }}
								placeholder="src/main/java/net/phanmemmottrieu/service/GitHubModelsService.java"
							/>
						</Form.Item>

						<Button type="primary" htmlType="submit" loading={loading}>
							Run AI Review
						</Button>
					</Form>
				</Card>

				{summary ? <Alert type="info" showIcon message={summary} /> : null}

				<Card
					title={`Ket qua (${rows.length} muc)`}
					extra={
						<Space size={16}>
							<Typography.Text type="secondary">Scanned files: {scannedFiles.length}</Typography.Text>
							<Typography.Text type="secondary">Context chars: {contextChars}</Typography.Text>
							{lastFocus ? <Typography.Text type="secondary">Focus: {lastFocus}</Typography.Text> : null}
						</Space>
					}
				>
					<Table<AiReviewImprovement>
						rowKey={(_, index) => String(index)}
						columns={columns as any}
						dataSource={rows}
						pagination={{ pageSize: 10 }}
						loading={loading}
						scroll={{ x: 1200 }}
					/>
				</Card>
			</Space>
		</PageContainer>
	);
}
