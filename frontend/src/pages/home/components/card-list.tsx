import type { ColProps } from "antd";
import {
	MessageOutlined,
	MoneyCollectOutlined,
	ShoppingCartOutlined,
	UserOutlined,
	RobotOutlined,
} from "@ant-design/icons";
import { Card, Col, Row } from "antd";
import { useTranslation } from "react-i18next";
import { useEffect, useState, useMemo } from "react";
import { useChatHistory } from "#src/contexts/ChatHistoryContext";
import { useUserStore } from "#src/store/user";
import { useAppStore } from "#src/store/app";
import { fetchGooglebotStats, type GooglebotStats } from "#src/api/home";

const { Meta } = Card;

const formatDateTime = (value?: string, locale?: string) => {
	if (!value) return "-";
	try {
		const dt = new Date(value);
		return new Intl.DateTimeFormat(locale || undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(dt);
	} catch (e) {
		return value;
	}
};
const wrapperCol: ColProps = {
	xs: 24,
	sm: 24,
	md: 12,
	lg: 12,
	xl: 12,
	xxl: 6,
};
export default function CardList() {
	const { t, i18n } = useTranslation();
	const user = useUserStore();
	// CRITICAL: Use same pattern as permission.ts for getting effective appId
	// Priority: user.app_id (from login) > store.currentAppId (from AppStore) > fallback to "csm"
	const appId = (user.app_id || "").trim() || useAppStore.getState().getCurrentAppId() || "csm";
	
	// Use ChatHistoryContext for unified chat state
	const { messages, unreadCounts } = useChatHistory();

	const [botStats, setBotStats] = useState<GooglebotStats | null>(null);
	const [botLoading, setBotLoading] = useState(false);
	
	// Calculate total messages from all rooms/guests
	const totalMessages = useMemo(() => {
		return Object.values(messages).reduce((total, msgs) => total + msgs.length, 0);
	}, [messages]);
	
	// Calculate total unread messages
	const totalUnread = useMemo(() => {
		return Object.values(unreadCounts).reduce((total, count) => total + count, 0);
	}, [unreadCounts]);

	useEffect(() => {
		setBotLoading(true);
		fetchGooglebotStats({ limit: 1 })
			.then(({ result }) => setBotStats(result))
			.catch(() => {})
			.finally(() => setBotLoading(false));
	}, []);

	const lastBotVisit = botStats?.latest?.[0]?.visitedAt;
	const lastBotVisitText = lastBotVisit
		? formatDateTime(lastBotVisit, i18n.language)
		: t("home.googlebotNoVisit");
	const botDescription = `${(botStats?.totalVisits ?? 0).toLocaleString()} • ${lastBotVisitText}`;
	return (
		<Row justify="space-between" gutter={[20, 20]}>
			<Col {...wrapperCol}>
				<Card loading={botLoading}>
					<Meta
						avatar={<RobotOutlined style={{ fontSize: 30 }} />}
						title={t("home.googlebotVisits")}
						description={botDescription}
					/>
				</Card>
			</Col>
			<Col {...wrapperCol}>
				<Card>
					<Meta
						avatar={<UserOutlined style={{ fontSize: 30 }} />}
						title={t("home.newVisits")}
						description="102,400"
					/>
				</Card>
			</Col>
			<Col {...wrapperCol}>
				<Card>
					<Meta
						avatar={<MessageOutlined style={{ fontSize: 30, color: totalUnread > 0 ? '#ff4d4f' : undefined }} />}
						title={
							<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
								{t("home.messages")}
								{totalUnread > 0 && (
									<span style={{ 
										backgroundColor: '#ff4d4f', 
										color: 'white', 
										borderRadius: '50%', 
										padding: '2px 8px', 
										fontSize: 12,
										fontWeight: 'bold'
									}}>
										{totalUnread}
									</span>
								)}
							</div>
						}
						description={`${totalMessages.toLocaleString()} ${t("home.total_messages", "tin nhắn")}`}
					/>
				</Card>
			</Col>
			<Col {...wrapperCol}>
				<Card>
					<Meta
						avatar={<MoneyCollectOutlined style={{ fontSize: 30 }} />}
						title={t("home.purchases")}
						description="9,280"
					/>
				</Card>
			</Col>
			<Col span={6} {...wrapperCol}>
				<Card>
					<Meta
						avatar={<ShoppingCartOutlined style={{ fontSize: 30 }} />}
						title={t("home.shoppings")}
						description="13,600"
					/>
				</Card>
			</Col>
		</Row>
	);
}
