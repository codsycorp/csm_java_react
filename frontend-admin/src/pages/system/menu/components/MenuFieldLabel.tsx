import { useTranslation } from "react-i18next";

interface MenuFieldLabelProps {
  i18nKey: string;
  required?: boolean;
  style?: React.CSSProperties;
}

/** Field label from i18n — follows the user's selected UI language. */
export default function MenuFieldLabel({ i18nKey, required, style }: MenuFieldLabelProps) {
  const { t } = useTranslation();
  return (
    <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14, ...style }}>
      {t(i18nKey)}
      {required ? <span style={{ color: "#ff4d4f", marginLeft: 4 }}>*</span> : null}
    </div>
  );
}
