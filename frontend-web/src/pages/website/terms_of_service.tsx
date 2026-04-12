import React from "react";
import { useTranslation } from "react-i18next";

const TermsOfService: React.FC = () => {
  const { t } = useTranslation();

  const points = [
    t("website.termsOfService.point1"),
    t("website.termsOfService.point2"),
    t("website.termsOfService.point3"),
    t("website.termsOfService.point4"),
    t("website.termsOfService.point5"),
    t("website.termsOfService.point6"),
    t("website.termsOfService.point7"),
  ];

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">{t("website.termsOfService.title")}</h1>
      <p className="mb-2">{t("website.termsOfService.intro")}</p>
      <ul className="list-disc pl-6 mb-4">
        {points.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2 className="text-xl font-semibold mb-2">{t("website.termsOfService.rightsTitle")}</h2>
      <p className="mb-2">{t("website.termsOfService.rightsContent")}</p>
      <h2 className="text-xl font-semibold mb-2">{t("website.termsOfService.limitsTitle")}</h2>
      <p className="mb-2">{t("website.termsOfService.limitsContent")}</p>
      <h2 className="text-xl font-semibold mb-2">{t("website.termsOfService.contactTitle")}</h2>
      <p>{t("website.termsOfService.contactContent")}</p>
    </div>
  );
};

export default TermsOfService;
