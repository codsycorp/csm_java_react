import DynamicCodeMenu from "#src/pages/system/dynamic-code";
import { useUserStore } from "#src/store/user";

export default function Home() {
  const user = useUserStore();
  const userAppId = user.app_id || "csm";

  return (
    <DynamicCodeMenu
      autoCodeName={`broadcast_${userAppId}`}
      containerId="broadcast-auto-root"
      noCodeMessage="Chua cau hinh auto_code cho trang nay."
    />
  );
}
