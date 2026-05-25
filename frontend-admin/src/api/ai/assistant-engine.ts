import { request } from "#src/utils";

export interface WorkspaceSourceFile {
	path: string
	scope: string
	content: string
	truncated: boolean
	sizeBytes: number
}

export async function fetchWorkspaceSourceFile(params: {
	path: string
	contextType?: "code" | "menu_json"
}): Promise<WorkspaceSourceFile | null> {
	const search = new URLSearchParams();
	search.set("path", params.path);
	if (params.contextType) {
		search.set("contextType", params.contextType);
	}

	const res = await request
		.get(`ai-assistant/workspace-source?${search.toString()}`, {
			timeout: 30_000,
		})
		.json<any>();

	return res?.success && res?.result ? res.result as WorkspaceSourceFile : null;
}
