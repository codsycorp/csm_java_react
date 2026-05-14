import { useState } from "react";
import CodeEditor from "./CodeEditor";
import QualityDashboard from "./QualityDashboard";
import { Tabs } from "antd";

export default function DeveloperPage() {
	const [activeTab, setActiveTab] = useState("editor");
	const [traceFocus, setTraceFocus] = useState<{ requestId: string; appId?: string; nonce: number } | null>(null);
	return (
		<div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
			<Tabs
				activeKey={activeTab}
				onChange={setActiveTab}
				style={{ height: "100%", display: "flex", flexDirection: "column" }}
				items={[
					{
						key: "editor",
						label: "Code Editor",
						children: (
						<CodeEditor
							onOpenQualityTrace={(payload) => {
							setTraceFocus({ requestId: payload.requestId, appId: payload.appId, nonce: Date.now() });
							setActiveTab("quality");
						}}
						/>
					),
					},
					{
						key: "quality",
						label: "AI Quality Metrics",
						children: (
							<div style={{ height: "100%", overflow: "auto" }}>
								<QualityDashboard enabled={true} refreshInterval={5000} focusRequestId={traceFocus?.requestId} focusAppId={traceFocus?.appId} focusNonce={traceFocus?.nonce} />
							</div>
						),
					},
				]}
			/>
		</div>
	);
}
