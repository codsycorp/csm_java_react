
import WebsiteLayout from "#src/layout/website/WebsiteLayout";
import { useWebsiteMenu } from "#src/layout/website/wu_menu";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { useEffect } from "react";
import i18n from "i18next";

const PrivacyPolicyPage = () => {
	const location = useLocation();
	const menuItems = useWebsiteMenu();
	const { t } = useTranslation();

	// Xử lý ngôn ngữ từ URL parameter ?hl=en|zh
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const hl = params.get("hl");
		
		if (hl === "en") {
			i18n.changeLanguage("en-US");
		} else if (hl === "zh") {
			i18n.changeLanguage("zh-CN");
		} else {
			i18n.changeLanguage("vi-VN");
		}
	}, [location.search]);
	
	return (
		<WebsiteLayout menuItems={menuItems}>
			<main style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
				{/* Hero Section */}
				<div style={{ padding: "80px 24px", textAlign: "center", background: "linear-gradient(135deg, var(--brand-primary, #1a365d) 0%, var(--bg-secondary) 100%)", color: "var(--text-primary)" }}>
					<div style={{ maxWidth: 800, margin: "0 auto" }}>
						<h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 700, marginBottom: 16, letterSpacing: "-0.02em" }}>
							{t('website.privacyPolicy.title')}
						</h1>
						<p style={{ fontSize: "1.1rem", opacity: 0.9, lineHeight: 1.6 }}>
							{t('website.privacyPolicy.intro')}
						</p>
					</div>
				</div>

				{/* Content Section */}
				<div style={{ maxWidth: 900, margin: "0 auto", padding: "80px 24px" }}>
					{/* Business Sectors */}
					<section style={{ marginBottom: 64 }}>
						<h2 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: 32, color: "var(--text-primary)" }}>
							{t('website.privacyPolicy.intro')}
						</h2>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, marginBottom: 32 }}>
							<div style={{ padding: 24, background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--card-border)", transition: "all 0.3s ease" }} className="sector-card">
								<div style={{ fontSize: 24, fontWeight: 600, color: "var(--brand-primary)", marginBottom: 12 }}>📋</div>
								<h3 style={{ fontWeight: 600, marginBottom: 8, fontSize: "1.1rem" }}>{t('website.privacyPolicy.sector1')}</h3>
							</div>
							<div style={{ padding: 24, background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--card-border)", transition: "all 0.3s ease" }} className="sector-card">
								<div style={{ fontSize: 24, fontWeight: 600, color: "var(--brand-primary)", marginBottom: 12 }}>🚗</div>
								<h3 style={{ fontWeight: 600, marginBottom: 8, fontSize: "1.1rem" }}>{t('website.privacyPolicy.sector2')}</h3>
							</div>
							<div style={{ padding: 24, background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--card-border)", transition: "all 0.3s ease" }} className="sector-card">
								<div style={{ fontSize: 24, fontWeight: 600, color: "var(--brand-primary)", marginBottom: 12 }}>🏠</div>
								<h3 style={{ fontWeight: 600, marginBottom: 8, fontSize: "1.1rem" }}>{t('website.privacyPolicy.sector3')}</h3>
							</div>
							<div style={{ padding: 24, background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--card-border)", transition: "all 0.3s ease" }} className="sector-card">
								<div style={{ fontSize: 24, fontWeight: 600, color: "var(--brand-primary)", marginBottom: 12 }}>💻</div>
								<h3 style={{ fontWeight: 600, marginBottom: 8, fontSize: "1.1rem" }}>{t('website.privacyPolicy.sector4')}</h3>
							</div>
							<div style={{ padding: 24, background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--card-border)", transition: "all 0.3s ease" }} className="sector-card">
								<div style={{ fontSize: 24, fontWeight: 600, color: "var(--brand-primary)", marginBottom: 12 }}>💄</div>
								<h3 style={{ fontWeight: 600, marginBottom: 8, fontSize: "1.1rem" }}>{t('website.privacyPolicy.sector5')}</h3>
							</div>
						</div>
					</section>

					{/* Policy Sections */}
					<section style={{ marginBottom: 64 }}>
						<div style={{ padding: 32, background: "var(--card-bg)", borderRadius: 20, border: "1px solid var(--card-border)", marginBottom: 24 }}>
							<h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 16, color: "var(--text-primary)" }}>
								{t('website.privacyPolicy.collectTitle')}
							</h2>
							<p style={{ lineHeight: 1.8, color: "var(--text-secondary)", fontSize: "1rem" }}>
								{t('website.privacyPolicy.collectContent')}
							</p>
						</div>

						<div style={{ padding: 32, background: "var(--card-bg)", borderRadius: 20, border: "1px solid var(--card-border)", marginBottom: 24 }}>
							<h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 16, color: "var(--text-primary)" }}>
								{t('website.privacyPolicy.securityTitle')}
							</h2>
							<p style={{ lineHeight: 1.8, color: "var(--text-secondary)", fontSize: "1rem" }}>
								{t('website.privacyPolicy.securityContent')}
							</p>
						</div>

						<div style={{ padding: 32, background: "var(--card-bg)", borderRadius: 20, border: "1px solid var(--card-border)", marginBottom: 24 }}>
							<h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 16, color: "var(--text-primary)" }}>
								{t('website.privacyPolicy.userRightsTitle')}
							</h2>
							<p style={{ lineHeight: 1.8, color: "var(--text-secondary)", fontSize: "1rem" }}>
								{t('website.privacyPolicy.userRightsContent')}
							</p>
						</div>

						<div style={{ padding: 32, background: "linear-gradient(135deg, var(--brand-primary, #1a365d)22 0%, var(--bg-secondary) 100%)", borderRadius: 20, border: "1px solid var(--card-border)" }}>
							<h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 16, color: "var(--text-primary)" }}>
								{t('website.privacyPolicy.contactTitle')}
							</h2>
							<p style={{ lineHeight: 1.8, color: "var(--text-secondary)", fontSize: "1rem" }}>
								{t('website.privacyPolicy.contactContent')}
							</p>
						</div>
					</section>
				</div>
			</main>

			<style>{`
				.sector-card {
					cursor: pointer;
				}
				.sector-card:hover {
					transform: translateY(-4px);
					box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
					border-color: var(--brand-primary, #1a365d);
				}
			`}</style>
		</WebsiteLayout>
	);
};

export default PrivacyPolicyPage;
