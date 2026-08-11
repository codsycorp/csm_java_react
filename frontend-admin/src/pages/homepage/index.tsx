
import DynamicCodeMenu from "#src/pages/system/dynamic-code";
import { useUserStore } from "#src/store/user";
import { Alert } from "antd";

export default function Home() {
  const user = useUserStore();
  const warningLevel = String((user as any).account_expiry_warning_level || "").trim();
  const warningMessage = String((user as any).account_expiry_warning_message || "").trim();
  const remainingDays = Number((user as any).account_remaining_days || 0);
  const expiryDate = String((user as any).account_expiry_date || "").trim();
  const homepageTemplateName = `broadcast_${user.app_id || "csm"}`;
  const containerId = "broadcast-auto-root-homepage";

  const warningType = (() => {
    if (warningLevel === "expired" || warningLevel === "critical") return "error" as const;
    if (warningLevel === "high" || warningLevel === "medium") return "warning" as const;
    return "info" as const;
  })();

  console.log("[Homepage] Trang chủ sẽ load sys_autos:", {
    template: homepageTemplateName,
    user_app_id: user.app_id,
    userId: user.userId,
  });

  return (
    <>
      {(warningMessage || expiryDate) && (
        <Alert
          showIcon
          type={warningType}
          className="mb-4"
          message={warningMessage || "Thông tin thời hạn sử dụng tài khoản"}
          description={expiryDate
            ? `Ngày hết hạn: ${expiryDate}${remainingDays > 0 ? ` (${remainingDays} ngày còn lại)` : ""}`
            : undefined}
        />
      )}
      <DynamicCodeMenu
        autoCodeName={homepageTemplateName}
        containerId={containerId}
        noCodeMessage="Chua cau hinh auto_code cho trang nay."
        hideOnError
      />
    </>
  );
}
