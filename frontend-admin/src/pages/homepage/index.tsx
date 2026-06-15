
import DynamicCodeMenu from "#src/pages/system/dynamic-code";
import { useUserStore } from "#src/store/user";

export default function Home() {
  const user = useUserStore();
  const homepageTemplateName = `broadcast_${user.app_id || "csm"}`;
  const containerId = "broadcast-auto-root-homepage";

  console.log("[Homepage] Trang chủ sẽ load sys_autos:", {
    template: homepageTemplateName,
    user_app_id: user.app_id,
    userId: user.userId,
  });

  return (
    <DynamicCodeMenu
      autoCodeName={homepageTemplateName}
      containerId={containerId}
      noCodeMessage="Chua cau hinh auto_code cho trang nay."
      hideOnError
    />
  );
}
