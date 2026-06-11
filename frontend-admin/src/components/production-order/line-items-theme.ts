/** Theme-aware styles cho form dòng hàng (type_form=7) — light/dark. */
import { useMemo } from "react";
import type { CSSProperties } from "react";
import { theme } from "antd";

export function useLineItemsTheme() {
  const { token } = theme.useToken();

  return useMemo(() => {
    const accentRow: CSSProperties = {
      background: token.colorPrimaryBg,
      color: token.colorText,
    };
    const accentCell: CSSProperties = {
      background: token.colorPrimaryBg,
      color: token.colorText,
      fontWeight: 600,
    };
    const inheritText: CSSProperties = { color: "inherit" };

    return {
      token,
      accentRow,
      accentCell,
      inheritText,
      fieldLabel: {
        marginBottom: 2,
        fontSize: 12,
        color: token.colorTextSecondary,
      } satisfies CSSProperties,
      groupCard: {
        marginBottom: 16,
        borderLeft: `4px solid ${token.colorPrimary}`,
      } satisfies CSSProperties,
      groupTitle: {
        color: token.colorPrimary,
        fontSize: 14,
      } satisfies CSSProperties,
      totalsTable: {
        borderCollapse: "collapse",
        minWidth: 360,
        color: token.colorText,
      } satisfies CSSProperties,
      totalsWords: {
        padding: "2px 8px",
        fontStyle: "italic",
        color: token.colorTextSecondary,
      } satisfies CSSProperties,
    };
  }, [token]);
}
