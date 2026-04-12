import type { FormComponentMapType } from "./form-mode-context";
import logo from "#src/assets/svg/logo.svg?url";
import { LayoutFooter } from "#src/layout";
import { LanguageButton } from "#src/layout/layout-header/components/language-button";
import { ThemeButton } from "#src/layout/layout-header/components/theme-button";
import { usePreferences, useThemeEffect } from "#src/hooks";
import { useTranslation } from "react-i18next";
import "./login-scoped.css";

import {
	Col,
	Layout,
	Row,
	Space,
	Typography,
} from "antd";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { createUseStyles } from "react-jss";
import { FORM_COMPONENT_MAP, FormModeContext } from "./form-mode-context";

const { Title } = Typography;

const useStyles = createUseStyles(({ token }) => {
	return {
		loginWrapper: {
			display: "flex",
			minWidth: "440px",
			maxWidth: "520px",
			width: "100%",
			justifyContent: "center",
			alignItems: "center",
			flexDirection: "column",
			backgroundColor: token.colorBgContainer,
			borderRadius: "20px",
			border: `1px solid ${token.colorBorderSecondary}`,
			boxShadow: `
				0 24px 48px -12px rgba(0, 0, 0, 0.18),
				0 20px 40px -12px rgba(0, 0, 0, 0.12),
				0 8px 16px -8px rgba(0, 0, 0, 0.1),
				inset 0 1px 0 rgba(255, 255, 255, 0.1)
			`,
			backdropFilter: "blur(24px)",
			position: "relative",
			overflow: "hidden",
			transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
			"&::before": {
				content: '""',
				position: "absolute",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: token.colorPrimary ? 
					`linear-gradient(145deg, ${token.colorPrimary}08, ${token.colorPrimaryBg}15, transparent)` :
					`linear-gradient(145deg, #1677ff08, #e6f4ff15, transparent)`,
				zIndex: -1,
			},
			"&::after": {
				content: '""',
				position: "absolute",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: `
					radial-gradient(circle at 20% 20%, rgba(22, 119, 255, 0.08) 0%, transparent 50%),
					radial-gradient(circle at 80% 80%, rgba(82, 196, 26, 0.06) 0%, transparent 50%)
				`,
				zIndex: -1,
			},
		},
		logo: {
			width: "5rem",
			height: "5rem",
			filter: "drop-shadow(0 8px 16px rgba(22, 119, 255, 0.2))",
			transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
		},
		section: {
			minHeight: "100vh",
			display: "flex",
			flexDirection: "column",
			background: token.colorBgLayout ? 
				`
					linear-gradient(135deg, ${token.colorBgLayout} 0%, ${token.colorBgContainer} 100%),
					radial-gradient(circle at 25% 25%, rgba(22, 119, 255, 0.05) 0%, transparent 50%),
					radial-gradient(circle at 75% 75%, rgba(82, 196, 26, 0.03) 0%, transparent 50%)
				` :
				`
					linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%),
					radial-gradient(circle at 25% 25%, rgba(22, 119, 255, 0.05) 0%, transparent 50%),
					radial-gradient(circle at 75% 75%, rgba(82, 196, 26, 0.03) 0%, transparent 50%)
				`,
			position: "relative",
			overflow: "hidden",
			"&::before": {
				content: '""',
				position: "absolute",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: `
					repeating-linear-gradient(
						90deg,
						transparent,
						transparent 100px,
						rgba(255, 255, 255, 0.03) 100px,
						rgba(255, 255, 255, 0.03) 101px
					)
				`,
				zIndex: 1,
				pointerEvents: "none",
			},
		},
		logoContainer: {
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			marginBottom: "2rem",
			padding: "1.5rem",
			background: token.colorPrimary ? 
				`radial-gradient(circle, ${token.colorPrimary}10 0%, transparent 70%)` :
				`radial-gradient(circle, #1677ff10 0%, transparent 70%)`,
			borderRadius: "50%",
			position: "relative",
			"&::before": {
				content: '""',
				position: "absolute",
				top: "50%",
				left: "50%",
				width: "120%",
				height: "120%",
				transform: "translate(-50%, -50%)",
				background: `conic-gradient(from 0deg, transparent, ${token.colorPrimary || '#1677ff'}20, transparent)`,
				borderRadius: "50%",
				animation: "rotate 8s linear infinite",
				zIndex: -1,
			},
		},
		brandSection: {
			display: "flex",
			flexDirection: "column",
			alignItems: "flex-start",
			justifyContent: "center",
			height: "100%",
			padding: "2.5rem 1.5rem",
			position: "relative",
			"&::before": {
				content: '""',
				position: "absolute",
				top: "15%",
				left: "-8%",
				width: "110%",
				height: "70%",
				background: `
					linear-gradient(
						135deg,
						${token.colorPrimary || '#1677ff'}04 0%,
						transparent 25%,
						${token.colorSuccess || '#52c41a'}02 75%,
						transparent 100%
					)
				`,
				borderRadius: "24px",
				transform: "rotate(-3deg)",
				zIndex: -1,
			},
		},
		brandTitle: {
			fontSize: "3.2rem",
			fontWeight: "800",
			background: token.colorPrimary ? 
				`linear-gradient(135deg, ${token.colorPrimary}, ${token.colorPrimaryActive || token.colorPrimary}, #52c41a)` :
				`linear-gradient(135deg, #1677ff, #4096ff, #52c41a)`,
			backgroundClip: "text",
			WebkitBackgroundClip: "text",
			WebkitTextFillColor: "transparent",
			marginBottom: "1.25rem",
			textAlign: "left",
			backgroundSize: "300% 300%",
			animation: "loginGradientShift 4s ease infinite",
			lineHeight: "1.1",
			letterSpacing: "-0.025em",
		},
		brandSubtitle: {
			fontSize: "1.1rem",
			color: token.colorTextSecondary,
			textAlign: "left",
			maxWidth: "480px",
			lineHeight: "1.7",
			fontWeight: "400",
			marginBottom: "1.75rem",
			opacity: 0.9,
		},
		brandFeatures: {
			display: "flex",
			flexDirection: "column",
			gap: "0.875rem",
			marginTop: "1.5rem",
		},
		featureItem: {
			display: "flex",
			alignItems: "center",
			gap: "0.875rem",
			padding: "0.625rem 0",
			color: token.colorTextSecondary,
			fontSize: "0.9rem",
			"& .feature-icon": {
				width: "22px",
				height: "22px",
				borderRadius: "5px",
				background: token.colorPrimary ? 
					`linear-gradient(45deg, ${token.colorPrimary}18, ${token.colorPrimary}08)` :
					`linear-gradient(45deg, #1677ff18, #1677ff08)`,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				color: token.colorPrimary || '#1677ff',
				fontSize: "13px",
			},
		},
		decorativeElement: {
			position: "absolute",
			borderRadius: "50%",
			background: token.colorPrimary ? 
				`linear-gradient(45deg, ${token.colorPrimary}12, ${token.colorPrimaryBg || token.colorPrimary + '20'})` :
				`linear-gradient(45deg, #1677ff12, #e6f4ff20)`,
			filter: "blur(60px)",
			animation: "loginPulse 6s ease-in-out infinite",
		},
		decorativeElement1: {
			width: "300px",
			height: "300px",
			top: "5%",
			right: "5%",
			animationDelay: "0s",
		},
		decorativeElement2: {
			width: "250px",
			height: "250px",
			bottom: "10%",
			left: "5%",
			animationDelay: "3s",
		},
		decorativeElement3: {
			width: "200px",
			height: "200px",
			top: "50%",
			left: "50%",
			transform: "translate(-50%, -50%)",
			animationDelay: "1.5s",
		},
		headerControls: {
			position: "absolute",
			top: "1.5rem",
			right: "1.5rem",
			zIndex: 20,
			display: "flex",
			gap: "0.5rem",
			background: `rgba(255, 255, 255, 0.1)`,
			backdropFilter: "blur(20px)",
			borderRadius: "16px",
			padding: "0.5rem",
			border: `1px solid rgba(255, 255, 255, 0.1)`,
		},
		formContainer: {
			position: "relative",
			zIndex: 10,
			width: "100%",
			maxWidth: "420px",
		},
	};
});

const { Content } = Layout;

export default function Login() {
	const classes = useStyles();
	const { isDark } = usePreferences();
	const { t } = useTranslation();
	const [formMode, setFormMode] = useState<FormComponentMapType>("login");
	
	// Auto-apply theme effect
	useThemeEffect();

	const providedValue = useMemo(() => ({ formMode, setFormMode }), [formMode, setFormMode]);

	const containerVariants = {
		hidden: { opacity: 0 },
		visible: {
			opacity: 1,
			transition: {
				duration: 0.6,
				staggerChildren: 0.2,
			},
		},
	};

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

	return (
		<>
			<style>{`
				@keyframes loginFloat {
					0%, 100% { transform: translateY(0px) rotate(0deg); }
					50% { transform: translateY(-20px) rotate(180deg); }
				}
				@keyframes loginPulse {
					0%, 100% { transform: scale(1); opacity: 0.4; }
					50% { transform: scale(1.1); opacity: 0.7; }
				}
				@keyframes loginGradientShift {
					0% { background-position: 0% 50%; }
					50% { background-position: 100% 50%; }
					100% { background-position: 0% 50%; }
				}
				@keyframes rotate {
					from { transform: translate(-50%, -50%) rotate(0deg); }
					to { transform: translate(-50%, -50%) rotate(360deg); }
				}
			`}</style>
			<Layout className={`${classes.section} login-page-container`}>
				{/* Enhanced Decorative Elements */}
				<div className={`${classes.decorativeElement} ${classes.decorativeElement1}`} />
				<div className={`${classes.decorativeElement} ${classes.decorativeElement2}`} />
				<div className={`${classes.decorativeElement} ${classes.decorativeElement3}`} />
				
				{/* Modern Header Controls */}
				<div className={`${classes.headerControls} login-header-controls`}>
					<ThemeButton size="large" />
					<LanguageButton size="large" />
				</div>

				<Content className="flex items-center justify-center min-h-screen p-6 relative z-5">
					<motion.div
						variants={containerVariants}
						initial="hidden"
						animate="visible"
						className="w-full max-w-7xl mx-auto"
					>
						<Row gutter={[{ xs: 0, sm: 0, lg: 60, xl: 80 }, 0]} align="middle" className="min-h-screen">
							{/* Brand Section - Enhanced */}
							<Col xs={0} sm={0} lg={13} xl={12}>
								<motion.div variants={itemVariants} className={`${classes.brandSection} login-brand-section`}>
									<motion.div
										variants={itemVariants}
										className={classes.logoContainer}
									>
										<img src={logo} alt="logo" className={`${classes.logo} login-logo`} />
									</motion.div>
									
									<motion.h1 variants={itemVariants} className={`${classes.brandTitle} login-brand-title`}>
										{t('login.brandTitle') || import.meta.env.VITE_GLOB_APP_SHORT_NAME || "CSM System"}
									</motion.h1>
									
									<motion.p variants={itemVariants} className={classes.brandSubtitle}>
										{t('login.brandSubtitle')}
									</motion.p>

									{/* Feature Highlights */}
									<motion.div variants={itemVariants} className={classes.brandFeatures}>
										<div className={classes.featureItem}>
											<div className="feature-icon">
												<i className="ri-shield-check-line" />
											</div>
											<span>{t('login.features.security')}</span>
										</div>
										<div className={classes.featureItem}>
											<div className="feature-icon">
												<i className="ri-speed-line" />
											</div>
											<span>{t('login.features.performance')}</span>
										</div>
										<div className={classes.featureItem}>
											<div className="feature-icon">
												<i className="ri-smartphone-line" />
											</div>
											<span>{t('login.features.responsive')}</span>
										</div>
									</motion.div>
								</motion.div>
							</Col>

							<Col xs={24} sm={24} lg={11} xl={12}>
								<motion.div variants={itemVariants} className="flex justify-center items-center h-full">
									<div className={`${classes.loginWrapper} ${classes.formContainer} login-form-container`}>
										<div className="w-full px-8 py-8">{/* Giảm padding để cân đối hơn */}
											<FormModeContext.Provider value={providedValue}>
												<AnimatePresence mode="wait" initial={false}>
													<motion.div
														key={formMode}
														initial={{ x: 40, opacity: 0, scale: 0.95 }}
														animate={{ x: 0, opacity: 1, scale: 1 }}
														exit={{ x: -40, opacity: 0, scale: 0.95 }}
														transition={{ 
															duration: 0.5,
															type: "spring",
															stiffness: 120,
															damping: 25
														}}
													>
														{FORM_COMPONENT_MAP[formMode]}
													</motion.div>
												</AnimatePresence>
											</FormModeContext.Provider>
										</div>
									</div>
								</motion.div>
							</Col>
						</Row>
					</motion.div>
				</Content>
				<LayoutFooter />
			</Layout>
		</>
	);
}
