// Stub store for auth - no authentication needed for public website
import { create } from "zustand";

interface AuthState {
	csrfToken?: string;
	token?: string;
	logout: () => Promise<void>;
	reset: () => void;
}

export const useAuthStore = create<AuthState>()(() => ({
	csrfToken: undefined,
	token: undefined,
	logout: async () => {
		// No-op for public website
		console.log("Logout called on public website (no-op)");
	},
	reset: () => {},
}));
