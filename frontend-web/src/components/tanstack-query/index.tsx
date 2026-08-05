import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: 0, // 重试次数
		},
		mutations: {
			retry: 0, // 重试次数
		},
	},
});

export interface TanstackQueryProps {
	children: ReactNode
}

export function TanstackQuery({ children }: TanstackQueryProps) {
	const [showDevtools, setShowDevtools] = useState(false);

	useEffect(() => {
		if (import.meta.env.DEV) {
			setShowDevtools(true);
		}
	}, []);

	return (
		<QueryClientProvider client={queryClient}>
			{showDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
			{children}
		</QueryClientProvider>
	);
}
