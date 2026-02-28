// Stub store for user - no authentication needed for public website
import { create } from "zustand";

interface UserState {
	userId?: string;
	app_id?: string;
	app_token?: string;
	avatar?: string;
	username?: string;
	roles: string[];
	dev?: boolean;
	selectedMenuIdForTab?: string;
	setSelectedMenuIdForTab: (id: string) => void;
	getUserInfo: () => Promise<void>;
	reset: () => void;
}

export const useUserStore = create<UserState>()(() => ({
	userId: undefined,
	app_id: undefined,
	app_token: undefined,
	avatar: undefined,
	username: undefined,
	roles: [],
	dev: false,
	selectedMenuIdForTab: undefined,
	setSelectedMenuIdForTab: () => {},
	getUserInfo: async () => {},
	reset: () => {},
}));
