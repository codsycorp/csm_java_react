import { BasicButton } from "#src/components";
import { isDynamicRoutingEnabled } from "#src/router/routes/config";
import { useAuthStore, usePermissionStore, useUserStore, useAppStore } from "#src/store";
import { resolveDevFlag, persistDevLocalFlag } from "#src/utils/dev-flag";
import { fetchUserInfo } from "#src/api/user";

import {
	Button,
	Checkbox,
	Divider,
	Form,
	Input,
	Space,
	Typography,
} from "antd";
import { motion } from "framer-motion";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";

import { FormModeContext } from "../form-mode-context";

const { Title } = Typography;

const FORM_INITIAL_VALUES = {
	username: "admin",
	password: "123456789admin",
	remember: true,
};
export type PasswordLoginFormType = typeof FORM_INITIAL_VALUES;

function resetAuthArtifacts() {
	try {
		useAuthStore.getState().reset();
	} catch {}
	try {
		useUserStore.getState().reset();
	} catch {}
	try {
		localStorage.removeItem("access-token");
		localStorage.removeItem("user-info");
		localStorage.removeItem("refreshToken");
	} catch {}
}

function getReadableLoginError(error: any, fallback: string) {
	const status = error?.response?.status;
	if (status === 401) {
		return "Đăng nhập thành công nhưng không đồng bộ được phiên người dùng. Vui lòng thử lại.";
	}

	const rawMessage = error?.message || error?.toString?.() || "";
	if (typeof rawMessage === "string" && rawMessage.startsWith("Request failed with status code")) {
		return fallback;
	}

	return rawMessage || fallback;
}

export function PasswordLogin() {
	const [loading, setLoading] = useState(false);
	const [passwordLoginForm] = Form.useForm();
	const { t } = useTranslation();
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const login = useAuthStore(state => state.login);
	const handleAsyncRoutes = usePermissionStore(state => state.handleAsyncRoutes);
	const applyAsyncRoutesFromLogin = usePermissionStore(state => (state as any).applyAsyncRoutesFromLogin);
	const getUserInfo = useUserStore(state => state.getUserInfo);
	const setCurrentAppId = useAppStore.getState().setCurrentAppId;
	const { setFormMode } = useContext(FormModeContext);

	const itemVariants = {
		hidden: { y: 20, opacity: 0 },
		visible: {
			y: 0,
			opacity: 1,
			transition: {
				duration: 0.5,
			},
		},
	};

	const handleFinish = (values: PasswordLoginFormType) => {
		resetAuthArtifacts();
		setLoading(true);
		login(values)
			.then((loginRes: any) => {
				if (!loginRes || !loginRes.success) {
					console.error("[LOGIN] Login failed, clearing all state");
					useAuthStore.getState().reset();
					throw new Error(loginRes?.message || "Đăng nhập thất bại");
				}
				return new Promise(resolve => setTimeout(resolve, 600)).then(() => loginRes);
			})
			.then((loginRes: any) => {
			// Token đã được lưu vào auth store bởi login() rồi
			// Đợi một chút để persist middleware flushed
			return new Promise(resolve => setTimeout(resolve, 100)).then(() => {
				console.log("[LOGIN] Token stored in auth store, calling fetchUserInfo()");
				return fetchUserInfo().then((response: any) => {
					const userInfoResult = response?.result;
					if (userInfoResult) {
						useUserStore.setState({ ...userInfoResult });
					}
					if (!userInfoResult || !userInfoResult.userId) {
						console.error("[LOGIN] Failed to get user info after login");
						useAuthStore.getState().reset();
						navigate("/error/500");
						throw new Error("Failed to get user info");
					}
					const devNormalized = resolveDevFlag(loginRes?.result?.dev ?? userInfoResult.dev, userInfoResult.roles);
					useUserStore.setState({ dev: devNormalized });
					persistDevLocalFlag(devNormalized);
					
					// CRITICAL: Always set currentAppId from user's app_id after successful login
					const redirect = searchParams.get("redirect");
					if (redirect === "admin") {
						setCurrentAppId("csm");
						console.log("[LOGIN] Set appId to 'csm' (admin redirect)");
					} else {
						// Always use user's app_id, fallback to "csm" only if not set
						const userAppId = userInfoResult.app_id || "csm";
						setCurrentAppId(userAppId);
						console.log(`[LOGIN] Set appId to '${userAppId}' from user profile`);
					}

					return { loginRes, userInfoResult };
				});
			});
		})
		.then(({ loginRes, userInfoResult }) => {
				if (isDynamicRoutingEnabled) {
					const routesFromLogin = loginRes?.result?.asyncRoutes;
					const devFromLogin = resolveDevFlag(loginRes?.result?.dev ?? userInfoResult.dev, userInfoResult.roles);
					const appId = useAppStore.getState().currentAppId;
					if (routesFromLogin && Array.isArray(routesFromLogin) && routesFromLogin.length > 0) {
						return applyAsyncRoutesFromLogin(routesFromLogin, appId, devFromLogin).then(() => ({ loginRes, userInfoResult }));
					} else {
						return handleAsyncRoutes(appId).then(() => ({ loginRes, userInfoResult }));
					}
				}
				return { loginRes, userInfoResult };
			})
			.then(({ loginRes, userInfoResult }) => {
				const redirect = searchParams.get("redirect");
				if (redirect) {
					if (redirect === "admin") {
						window.sessionStorage.setItem("forceAdminMode", "true");
						navigate(import.meta.env.VITE_BASE_HOME_PATH || "/home");
					} else {
						navigate(`/${redirect.slice(1)}`);
					}
				} else {
					navigate("/");
				}
			})
			.catch(async (error: any) => {
				console.error("[LOGIN] Login error:", error);
				try {
					useAuthStore.getState().reset();
				} catch (e) {
					console.error("[LOGIN] Error resetting auth state:", e);
				}
				const fallbackMessage = t("login.loginFailed") || "Đăng nhập thất bại";
				const { message } = await import("#src/utils/static-antd");
				message.error({
					content: getReadableLoginError(error, fallbackMessage),
					duration: 3,
				});
			})
			.finally(() => {
				setLoading(false);
			});
	};

	return (
		<motion.div
			initial="hidden"
			animate="visible"
			variants={{
				visible: {
					transition: {
						staggerChildren: 0.08,
					},
				},
			}}
			className="w-full"
		>
			{/* Compact Header Section */}
			<motion.div variants={itemVariants} className="text-center mb-6">
				<Space direction="vertical" size={4} className="w-full">
					<Title level={3} className="!mb-1 !mt-0 font-bold bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 bg-clip-text text-transparent">
						{t('login.welcomeBack') || 'Chào mừng trở lại!'}
					</Title>
					<Title className="!mt-0 !mb-0 text-sm" level={5} type="secondary">
						{t('login.subtitle')} {import.meta.env.VITE_GLOB_APP_SHORT_NAME || 'CSM System'}
					</Title>
				</Space>
			</motion.div>

			{/* Streamlined Login Form */}
			<motion.div variants={itemVariants}>
				<Form
					name="passwordLoginForm"
					form={passwordLoginForm}
					layout="vertical"
					initialValues={FORM_INITIAL_VALUES}
					onFinish={handleFinish}
					size="large"
					className="login-form modern-form"
				>
					{/* Compact Username Field */}
					<motion.div variants={itemVariants}>
						<Form.Item
							label={t("login.username") || t("authority.username")}
							name="username"
							rules={[{ required: true, message: t("form.username.required") }]}
							className="mb-4"
						>
							<Input
								placeholder={t("login.usernamePlaceholder") || t("form.username.required")}
								prefix={<i className="ri-user-line text-gray-400 text-base" />}
								className="h-11 rounded-xl border-gray-200 hover:border-blue-400 focus:border-blue-500 transition-all duration-300"
							/>
						</Form.Item>
					</motion.div>

					{/* Compact Password Field */}
					<motion.div variants={itemVariants}>
						<Form.Item
							label={t("login.password") || t("authority.password")}
							name="password"
							rules={[{ required: true, message: t("form.password.required") }]}
							className="mb-3"
						>
							<Input.Password
								placeholder={t("login.passwordPlaceholder") || t("form.password.required")}
								prefix={<i className="ri-lock-line text-gray-400 text-base" />}
								className="h-11 rounded-xl border-gray-200 hover:border-blue-400 focus:border-blue-500 transition-all duration-300"
							/>
						</Form.Item>
					</motion.div>

					{/* Inline Remember & Forgot */}
					<motion.div variants={itemVariants}>
						<div className="flex justify-between items-center mb-5">
							<Form.Item name="remember" valuePropName="checked" className="!mb-0">
								<Checkbox className="text-xs text-gray-600">
									{t("login.rememberMe") || "Ghi nhớ"}
								</Checkbox>
							</Form.Item>
							<BasicButton
								type="link"
								className="p-0 text-blue-500 hover:text-blue-600 text-xs font-medium"
								onPointerDown={() => {
									setFormMode("forgotPassword");
								}}
							>
								{t("login.forgotPassword") || t("authority.forgotPassword")}
							</BasicButton>
						</div>
					</motion.div>

					{/* Modern Login Button */}
					<motion.div variants={itemVariants}>
						<Form.Item className="mb-4">
							<Button
								block
								type="primary"
								htmlType="submit"
								loading={loading}
								className="h-11 font-semibold text-base rounded-xl bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 hover:from-blue-600 hover:via-blue-700 hover:to-blue-800 border-0 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]"
							>
								{loading ? "Đang đăng nhập..." : (t("login.loginButton") || t("authority.login"))}
							</Button>
						</Form.Item>
					</motion.div>

					{/* Compact Divider */}
					<motion.div variants={itemVariants}>
						<Divider className="my-4 text-xs">
							<span className="text-gray-400 text-xs">hoặc</span>
						</Divider>
					</motion.div>

					{/* Compact Alternative Login */}
					<motion.div variants={itemVariants}>
						<div className="mb-4">
							<Button
								block
								type="default"
								className="h-10 rounded-xl border-gray-200 hover:border-blue-400 hover:text-blue-500 transition-all duration-300 text-sm"
								onPointerDown={() => {
									setFormMode("codeLogin");
								}}
							>
								<i className="ri-smartphone-line mr-2 text-base" />
								{t("authority.codeLogin") || "Đăng nhập bằng mã"}
							</Button>
						</div>
					</motion.div>

					{/* Compact Register Link */}
					<motion.div variants={itemVariants}>
						<div className="text-xs text-center text-gray-500">
							{t("login.registerText") || t("authority.noAccountYet")}
							<BasicButton
								type="link"
								className="px-1 text-blue-500 hover:text-blue-600 font-medium text-xs"
								onPointerDown={() => {
									setFormMode("register");
								}}
							>
								{t("login.registerLink") || t("authority.goToRegister")}
							</BasicButton>
						</div>
					</motion.div>
				</Form>
			</motion.div>
		</motion.div>
	);
}
