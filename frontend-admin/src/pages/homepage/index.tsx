
import DynamicCodeMenu from "#src/pages/system/dynamic-code";
import { useUserStore } from "#src/store/user";
import { useLocation } from "react-router";

export default function Home() {
  const user = useUserStore();
  const userAppId = user.app_id || "csm";
  const location = useLocation();

  // Dùng containerId cố định để giữ nguyên nội dung khi chuyển tab
  const containerId = `broadcast-auto-root-${userAppId}`;

  return (
    <DynamicCodeMenu
      autoCodeName={`broadcast_${userAppId}`}
      containerId={containerId}
      noCodeMessage="Chua cau hinh auto_code cho trang nay."
      hideOnError
    />
  );
}
