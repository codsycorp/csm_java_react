import React from "react";
import { useTranslation } from "react-i18next";

const PrivacyPolicy: React.FC = () => {
  const { t } = useTranslation();

  const features = [
    t("website.privacyPolicy.sector1"),
    t("website.privacyPolicy.sector2"),
    t("website.privacyPolicy.sector3"),
    t("website.privacyPolicy.sector4"),
  ];

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">{t("website.privacyPolicy.title")}</h1>
      <p className="mb-2">{t("website.privacyPolicy.intro")}</p>
      <ul className="list-disc pl-6 mb-4">
        {features.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2 className="text-xl font-semibold mb-2">{t("website.privacyPolicy.collectTitle")}</h2>
      <p className="mb-2">{t("website.privacyPolicy.collectContent")}</p>
      <h2 className="text-xl font-semibold mb-2">{t("website.privacyPolicy.securityTitle")}</h2>
      <p className="mb-2">{t("website.privacyPolicy.securityContent")}</p>
      <h2 className="text-xl font-semibold mb-2">{t("website.privacyPolicy.userRightsTitle")}</h2>
      <p className="mb-2">{t("website.privacyPolicy.userRightsContent")}</p>
      <h2 className="text-xl font-semibold mb-2">{t("website.privacyPolicy.contactTitle")}</h2>
      <p>{t("website.privacyPolicy.contactContent")}</p>
    </div>
  );
};

export default PrivacyPolicy;
