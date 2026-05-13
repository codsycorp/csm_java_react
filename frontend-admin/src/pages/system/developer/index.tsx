import CodeEditor from "./CodeEditor";
import QualityDashboard from "./QualityDashboard";
import { Tabs } from "antd";

export default function DeveloperPage() {
	return (
		<div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
			<Tabs
				defaultActiveKey="editor"
				style={{ height: "100%", display: "flex", flexDirection: "column" }}
				items={[
					{
						key: "editor",
						label: "Code Editor",
						children: <CodeEditor />,
					},
					{
						key: "quality",
						label: "AI Quality Metrics",
						children: (
							<div style={{ height: "100%", overflow: "auto" }}>
								<QualityDashboard enabled={true} refreshInterval={5000} />
							</div>
						),
					},
				]}
			/>
		</div>
	);
}
