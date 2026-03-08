import DynamicCodeMenu from "#src/pages/system/dynamic-code";
import { useMemo } from "react";
import { useLocation } from "react-router";
import { useAppStore, useUserStore } from "#src/store";

export default function AutoSetup() {
  const location = useLocation() as any;
  const appId = useAppStore(state => state.currentAppId);
  const user = useUserStore();

  const inlineCode = useMemo(() => {
    const fromState = location?.state?.autoCode;
    if (typeof fromState === "string" && fromState.trim()) return fromState;

    const fromSession = sessionStorage.getItem("auto_setup_code");
    if (typeof fromSession === "string" && fromSession.trim()) return fromSession;

    return undefined;
  }, [location?.state]);

  const autoCodeName = useMemo(() => {
    if (inlineCode) return undefined;
    return user.app_id || appId || "csm";
  }, [inlineCode, user.app_id, appId]);

  return (
    <DynamicCodeMenu
      inlineCode={inlineCode}
      autoCodeName={autoCodeName}
      containerId="context-auto"
      containerClassName="card-body"
      rootPadding={16}
      noCodeMessage="Khong co auto_code de chay"
    />
  );
}
