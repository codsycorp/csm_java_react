import DynamicCodeMenu from "#src/pages/system/dynamic-code";
import { subscribeDynamicCodeReload, resolveWatchedPNames, getMatchingReloadVersion } from "#src/pages/system/dynamic-code/reload";
import { useAppStore, useUserStore } from "#src/store";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";

export default function AutoSetup() {
  const location = useLocation() as any;
  const appId = useAppStore(state => state.currentAppId);
  const user = useUserStore();
  const [ignoreInlineCode, setIgnoreInlineCode] = useState(false);
  const seenReloadVersionRef = useRef(0);

  const effectiveAppId = user.app_id || appId || "csm";
  const watchedPNames = useMemo(
    () => resolveWatchedPNames("", effectiveAppId),
    [effectiveAppId],
  );

  useEffect(() => {
    const syncFromStore = () => {
      const latest = getMatchingReloadVersion(watchedPNames);
      if (latest <= seenReloadVersionRef.current) return;
      seenReloadVersionRef.current = latest;
      setIgnoreInlineCode(true);
      try {
        sessionStorage.removeItem("auto_setup_code");
        sessionStorage.removeItem("auto_setup_label");
      } catch {}
    };

    seenReloadVersionRef.current = getMatchingReloadVersion(watchedPNames);
    return subscribeDynamicCodeReload(syncFromStore);
  }, [watchedPNames]);

  const inlineCode = useMemo(() => {
    if (ignoreInlineCode) {
      return undefined;
    }

    const fromState = location?.state?.autoCode;
    if (typeof fromState === "string" && fromState.trim()) return fromState;

    const fromSession = sessionStorage.getItem("auto_setup_code");
    if (typeof fromSession === "string" && fromSession.trim()) return fromSession;

    return undefined;
  }, [ignoreInlineCode, location?.state]);

  const autoCodeName = useMemo(() => {
    if (inlineCode) return undefined;
    return effectiveAppId;
  }, [inlineCode, effectiveAppId]);

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
