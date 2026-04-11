
import DynamicCodeMenu from "#src/pages/system/dynamic-code";
import { useUserStore } from "#src/store/user";
import { useLocation } from "react-router";

export default function Home() {
  const user = useUserStore();
  // Luôn dùng containerId cố định cho tab Trang Chủ
  const containerId = "broadcast-auto-root-homepage";
  return (
    <DynamicCodeMenu
      autoCodeName={`broadcast_${user.app_id || "csm"}`}
      containerId={containerId}
      noCodeMessage="Chua cau hinh auto_code cho trang nay."
      hideOnError
    />
  );
}
