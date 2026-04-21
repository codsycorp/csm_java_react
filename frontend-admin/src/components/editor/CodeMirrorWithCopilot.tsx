import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BaseCodeMirror, { type ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { Button, Tooltip } from "antd";
import { MessageOutlined, FullscreenOutlined, FullscreenExitOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import CopilotChat, { type CopilotUserMessagePayload } from "#src/pages/system/developer/CopilotChat";
import { useAppStore } from "#src/store";
import styles from "./CodeMirrorWithCopilot.module.css";

type CopilotLanguage = "javascript" | "html" | "python" | "java" | "css" | "sql" | "json";
type CopilotContextType = "code" | "menu_json";

type CodeMirrorWithCopilotProps = ReactCodeMirrorProps & {
  copilotEnabled?: boolean;
  copilotAppId?: string;
  copilotLanguage?: CopilotLanguage;
  copilotContextType?: CopilotContextType;
  copilotCurrentCode?: string;
  copilotAutoApplyCodeBlock?: boolean;
  copilotOnUserMessage?: (payload: CopilotUserMessagePayload) => void;
};

type GlobalCopilotState = {
  open: boolean;
  ownerId: string | null;
};

const globalCopilotState: GlobalCopilotState = {
  open: false,
  ownerId: null,
};

const copilotSubscribers = new Set<(state: GlobalCopilotState) => void>();

function updateGlobalCopilotState(next: Partial<GlobalCopilotState>) {
  if (typeof next.open === "boolean") {
    globalCopilotState.open = next.open;
  }
  if (Object.prototype.hasOwnProperty.call(next, "ownerId")) {
    globalCopilotState.ownerId = next.ownerId ?? null;
  }
  copilotSubscribers.forEach((subscriber) => {
    try {
      subscriber({ ...globalCopilotState });
    } catch {
      // Ignore subscriber errors
    }
  });
}

function subscribeGlobalCopilot(listener: (state: GlobalCopilotState) => void) {
  copilotSubscribers.add(listener);
  listener({ ...globalCopilotState });
  return () => {
    copilotSubscribers.delete(listener);
  };
}

function resolveLanguage(raw: string): CopilotLanguage {
  const text = String(raw || "").trim().toLowerCase();
  if (["html", "xml"].includes(text)) return "html";
  if (["python", "py"].includes(text)) return "python";
  if (["java"].includes(text)) return "java";
  if (["css", "scss", "less"].includes(text)) return "css";
  if (["sql", "mysql", "postgres", "postgresql"].includes(text)) return "sql";
  if (["json"].includes(text)) return "json";
  return "javascript";
}

function resolveContextType(language: CopilotLanguage, rawContextType?: CopilotContextType): CopilotContextType {
  if (rawContextType) return rawContextType;
  return language === "json" ? "menu_json" : "code";
}

export default function CodeMirrorWithCopilot(props: CodeMirrorWithCopilotProps) {
  const {
    copilotEnabled = true,
    copilotAppId,
    copilotLanguage,
    copilotContextType,
    copilotCurrentCode,
    copilotAutoApplyCodeBlock = false,
    copilotOnUserMessage,
    value,
    height,
    onChange,
    ...codeMirrorProps
  } = props;
  const { i18n } = useTranslation();
  const instanceIdRef = useRef(`cm_${Math.random().toString(36).slice(2, 10)}`);
  const [globalState, setGlobalState] = useState<GlobalCopilotState>({ ...globalCopilotState });
  const currentAppId = useAppStore((state) => state.currentAppId);

  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => setIsFullscreen((prev) => !prev), []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  const appId = String(copilotAppId || currentAppId || "csm").trim() || "csm";
  const currentCode = typeof copilotCurrentCode === "string"
    ? copilotCurrentCode
    : typeof value === "string"
      ? value
      : "";
  const language = useMemo(() => resolveLanguage(copilotLanguage || "javascript"), [copilotLanguage]);
  const contextType = useMemo(() => resolveContextType(language, copilotContextType), [language, copilotContextType]);
  const isOwner = globalState.ownerId === instanceIdRef.current;
  const chatOpen = globalState.open && isOwner;
  const editorHeight = isFullscreen ? "100%" : height;

  const handleCopilotCodeInsert = useCallback((nextCode: string) => {
    if (typeof onChange === "function") {
      onChange(nextCode, undefined as any);
    }
  }, [onChange]);

  useEffect(() => subscribeGlobalCopilot(setGlobalState), []);

  useEffect(() => {
    if (!copilotEnabled && isOwner) {
      updateGlobalCopilotState({ open: false, ownerId: null });
    }
  }, [copilotEnabled, isOwner]);

  useEffect(() => {
    return () => {
      if (globalCopilotState.ownerId === instanceIdRef.current) {
        updateGlobalCopilotState({ open: false, ownerId: null });
      }
    };
  }, []);

  const uiText = useMemo(() => {
    const lang = String(i18n.resolvedLanguage || i18n.language || "vi").toLowerCase();
    if (lang.startsWith("zh")) {
      return {
        open: "AI 助手对话",
        close: "关闭 AI 助手",
      };
    }
    if (lang.startsWith("en")) {
      return {
        open: "AI Assistant Chat",
        close: "Close AI Assistant",
      };
    }
    return {
      open: "Trò chuyện Trợ lý AI",
      close: "Đóng Trợ lý AI",
    };
  }, [i18n.language, i18n.resolvedLanguage]);

  return (
    <div className={isFullscreen ? styles.wrapperFullscreen : styles.wrapper}>
      <div className={styles.editorHost}>
        <BaseCodeMirror value={value} height={editorHeight} onChange={onChange} {...codeMirrorProps} />
      </div>
      {copilotEnabled && (
        <>
          <div className={styles.toggleButton}>
            <Tooltip title={isFullscreen ? "Thu nhỏ (Esc)" : "Toàn màn hình"}>
              <Button
                size="small"
                icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                onClick={toggleFullscreen}
                style={{ marginRight: 6 }}
              />
            </Tooltip>
            <Button
              size="small"
              icon={<MessageOutlined />}
              onClick={() => {
                if (chatOpen) {
                  updateGlobalCopilotState({ open: false, ownerId: null });
                } else {
                  updateGlobalCopilotState({ open: true, ownerId: instanceIdRef.current });
                }
              }}
            >
              {chatOpen ? uiText.close : uiText.open}
            </Button>
          </div>
          {chatOpen && (
            <div className={styles.chatPanel}>
              <div className={styles.chatPanelInner}>
                <CopilotChat
                  appId={appId}
                  currentCode={currentCode}
                  language={language}
                  contextType={contextType}
                  onCodeInsert={handleCopilotCodeInsert}
                  autoApplyCodeBlock={copilotAutoApplyCodeBlock}
                  onUserMessage={copilotOnUserMessage}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
