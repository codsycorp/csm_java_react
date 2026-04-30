import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BaseCodeMirror, { type ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { Button, Tooltip } from "antd";
import { MessageOutlined, FullscreenOutlined, FullscreenExitOutlined, CloseOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import AiAssistantChat, { type AiAssistantUserMessagePayload } from "#src/pages/system/developer/AiAssistantChat";
import { useAppStore } from "#src/store";
import styles from "./CodeMirrorWithAiAssistant.module.css";

type AiAssistantLanguage = "javascript" | "html" | "python" | "java" | "css" | "sql" | "json";
type AiAssistantContextType = "code" | "menu_json";

type CodeMirrorWithAiAssistantProps = ReactCodeMirrorProps & {
  aiAssistantEnabled?: boolean;
  aiAssistantAppId?: string;
  aiAssistantLanguage?: AiAssistantLanguage;
  aiAssistantContextType?: AiAssistantContextType;
  aiAssistantCurrentCode?: string;
  aiAssistantPName?: string;
  aiAssistantPType?: number;
  aiAssistantAutoApplyCodeBlock?: boolean;
  aiAssistantOnUserMessage?: (payload: AiAssistantUserMessagePayload) => void;
};

type GlobalAiAssistantState = {
  open: boolean;
  ownerId: string | null;
};

type ChatPanelPosition = {
  left: number;
  top: number;
};

type FullscreenViewportStyle = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const CHAT_PANEL_MARGIN = 10;

function getFloatingPanelMinTop(): number {
  if (typeof document === "undefined") return CHAT_PANEL_MARGIN;
  const ribbonRoot = document.querySelector("[data-csm-ribbon-root='true']") as HTMLElement | null;
  if (!ribbonRoot) return CHAT_PANEL_MARGIN;
  const rect = ribbonRoot.getBoundingClientRect();
  if (!Number.isFinite(rect.bottom)) return CHAT_PANEL_MARGIN;
  return Math.max(CHAT_PANEL_MARGIN, Math.round(rect.bottom + 8));
}

function getViewportWidth(): number {
  const vv = window.visualViewport;
  if (vv && Number.isFinite(vv.width) && vv.width > 0) {
    return vv.width;
  }
  return window.innerWidth;
}

const globalAiAssistantState: GlobalAiAssistantState = {
  open: false,
  ownerId: null,
};

const aiAssistantSubscribers = new Set<(state: GlobalAiAssistantState) => void>();

function updateGlobalAiAssistantState(next: Partial<GlobalAiAssistantState>) {
  if (typeof next.open === "boolean") {
    globalAiAssistantState.open = next.open;
  }
  if (Object.prototype.hasOwnProperty.call(next, "ownerId")) {
    globalAiAssistantState.ownerId = next.ownerId ?? null;
  }
  aiAssistantSubscribers.forEach((subscriber) => {
    try {
      subscriber({ ...globalAiAssistantState });
    } catch {
      // Ignore subscriber errors
    }
  });
}

function subscribeGlobalAiAssistant(listener: (state: GlobalAiAssistantState) => void) {
  aiAssistantSubscribers.add(listener);
  listener({ ...globalAiAssistantState });
  return () => {
    aiAssistantSubscribers.delete(listener);
  };
}

function resolveLanguage(raw: string): AiAssistantLanguage {
  const text = String(raw || "").trim().toLowerCase();
  if (["html", "xml"].includes(text)) return "html";
  if (["python", "py"].includes(text)) return "python";
  if (["java"].includes(text)) return "java";
  if (["css", "scss", "less"].includes(text)) return "css";
  if (["sql", "mysql", "postgres", "postgresql"].includes(text)) return "sql";
  if (["json"].includes(text)) return "json";
  return "javascript";
}

function resolveContextType(language: AiAssistantLanguage, rawContextType?: AiAssistantContextType): AiAssistantContextType {
  if (rawContextType) return rawContextType;
  // Keep coding context as default. Menu designer must opt-in explicitly.
  return "code";
}

function isLikelyIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "");
  const platform = String((navigator as any).platform || "");
  const maxTouchPoints = Number((navigator as any).maxTouchPoints || 0);
  const iOSByUA = /iPad|iPhone|iPod/i.test(ua);
  const iPadOSDesktopUA = platform === "MacIntel" && maxTouchPoints > 1;
  return iOSByUA || iPadOSDesktopUA;
}

export default function CodeMirrorWithAiAssistant(props: CodeMirrorWithAiAssistantProps) {
  const {
    aiAssistantEnabled = true,
    aiAssistantAppId,
    aiAssistantLanguage,
    aiAssistantContextType,
    aiAssistantCurrentCode,
    aiAssistantPName,
    aiAssistantPType,
    aiAssistantAutoApplyCodeBlock = false,
    aiAssistantOnUserMessage,
    value,
    height,
    onCreateEditor,
    onChange,
    ...codeMirrorProps
  } = props;
  const { i18n } = useTranslation();
  const instanceIdRef = useRef(`cm_${Math.random().toString(36).slice(2, 10)}`);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<any>(null);
  const chatPanelRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const [globalState, setGlobalState] = useState<GlobalAiAssistantState>({ ...globalAiAssistantState });
  const currentAppId = useAppStore((state) => state.currentAppId);

  const prefersCoarsePointer = useMemo(() => {
    try {
      return Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);
    } catch {
      return false;
    }
  }, []);
  const compactBreakpoint = prefersCoarsePointer ? 1180 : 992;
  const [viewportWidth, setViewportWidth] = useState<number>(() => getViewportWidth());

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenViewportStyle, setFullscreenViewportStyle] = useState<FullscreenViewportStyle | null>(null);
  const [isCompactView, setIsCompactView] = useState<boolean>(() => getViewportWidth() <= compactBreakpoint);
  const [chatPanelPosition, setChatPanelPosition] = useState<ChatPanelPosition | null>(null);
  const prevFullscreenRef = useRef<boolean>(false);

  const toggleFullscreen = useCallback(() => setIsFullscreen((prev) => !prev), []);
  const shouldUseNativeFullscreen = useMemo(() => !isLikelyIOSDevice(), []);

  const syncFullscreenViewport = useCallback(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (vv && Number.isFinite(vv.width) && Number.isFinite(vv.height)) {
      setFullscreenViewportStyle({
        top: vv.offsetTop || 0,
        left: vv.offsetLeft || 0,
        width: vv.width,
        height: vv.height,
      });
      return;
    }
    setFullscreenViewportStyle({
      top: 0,
      left: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }, []);

  const requestNativeFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    const el = wrapperRef.current as (HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    }) | null;
    if (!el) return;
    try {
      if (document.fullscreenElement) return;
      if (el.requestFullscreen) {
        await el.requestFullscreen();
        return;
      }
      if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
        return;
      }
      if (el.msRequestFullscreen) {
        await el.msRequestFullscreen();
      }
    } catch {
      // Keep CSS fullscreen fallback when native API is blocked.
    }
  }, []);

  const exitNativeFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
      msExitFullscreen?: () => Promise<void> | void;
    };
    try {
      if (doc.fullscreenElement && doc.exitFullscreen) {
        await doc.exitFullscreen();
        return;
      }
      if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
        return;
      }
      if (doc.msExitFullscreen) {
        await doc.msExitFullscreen();
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  useEffect(() => {
    setIsCompactView(viewportWidth <= compactBreakpoint);
  }, [viewportWidth, compactBreakpoint]);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(getViewportWidth());
    };
    window.addEventListener("resize", handleResize);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleViewportChange = () => {
      setViewportWidth(getViewportWidth());
    };

    window.addEventListener("orientationchange", handleViewportChange);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", handleViewportChange);

    return () => {
      window.removeEventListener("orientationchange", handleViewportChange);
      vv?.removeEventListener("resize", handleViewportChange);
    };
  }, []);

  useEffect(() => {
    if (!isFullscreen) {
      setFullscreenViewportStyle(null);
      return;
    }
    syncFullscreenViewport();
    const handleViewportChange = () => syncFullscreenViewport();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("orientationchange", handleViewportChange);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", handleViewportChange);
    vv?.addEventListener("scroll", handleViewportChange);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
      vv?.removeEventListener("resize", handleViewportChange);
      vv?.removeEventListener("scroll", handleViewportChange);
    };
  }, [isFullscreen, syncFullscreenViewport]);

  useEffect(() => {
    if (!shouldUseNativeFullscreen) return;
    if (!isFullscreen) {
      exitNativeFullscreen();
      return;
    }
    requestNativeFullscreen();
  }, [isFullscreen, requestNativeFullscreen, exitNativeFullscreen, shouldUseNativeFullscreen]);

  useEffect(() => {
    if (!shouldUseNativeFullscreen) return;
    const handleNativeFullscreenChange = () => {
      if (typeof document === "undefined") return;
      if (!document.fullscreenElement && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", handleNativeFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleNativeFullscreenChange);
  }, [isFullscreen, shouldUseNativeFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [isFullscreen]);

  const appId = String(aiAssistantAppId || currentAppId || "csm").trim() || "csm";
  const currentCode = typeof aiAssistantCurrentCode === "string"
    ? aiAssistantCurrentCode
    : typeof value === "string"
      ? value
      : "";
  const language = useMemo(() => resolveLanguage(aiAssistantLanguage || "javascript"), [aiAssistantLanguage]);
  const contextType = useMemo(() => resolveContextType(language, aiAssistantContextType), [language, aiAssistantContextType]);
  const autoApplyStorageKey = useMemo(
    () => `${appId}:${contextType}:${language}`,
    [appId, contextType, language],
  );
  const [autoApplyEnabled, setAutoApplyEnabled] = useState<boolean>(Boolean(aiAssistantAutoApplyCodeBlock));
  const isOwner = globalState.ownerId === instanceIdRef.current;
  const chatOpen = globalState.open && isOwner;
  const editorHeight = isFullscreen ? "100%" : height;

  const clampPanelPosition = useCallback((left: number, top: number): ChatPanelPosition => {
    const panel = chatPanelRef.current;
    if (!panel) {
      return { left, top };
    }
    const minTop = getFloatingPanelMinTop();
    const maxLeft = Math.max(CHAT_PANEL_MARGIN, window.innerWidth - panel.offsetWidth - CHAT_PANEL_MARGIN);
    const maxTop = Math.max(minTop, window.innerHeight - panel.offsetHeight - CHAT_PANEL_MARGIN);
    return {
      left: Math.max(CHAT_PANEL_MARGIN, Math.min(left, maxLeft)),
      top: Math.max(minTop, Math.min(top, maxTop)),
    };
  }, []);

  const ensureInitialPanelPosition = useCallback(() => {
    if (isCompactView) return;
    const wrapper = wrapperRef.current;
    const panel = chatPanelRef.current;
    if (!wrapper || !panel) return;
    setChatPanelPosition((prev) => {
      if (prev) {
        return clampPanelPosition(prev.left, prev.top);
      }
      const rect = wrapper.getBoundingClientRect();
      const left = rect.right - panel.offsetWidth - CHAT_PANEL_MARGIN;
      const top = getFloatingPanelMinTop();
      return clampPanelPosition(left, top);
    });
  }, [clampPanelPosition, isCompactView]);

  const startDraggingPanel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isCompactView) return;
    const wrapper = wrapperRef.current;
    const panel = chatPanelRef.current;
    if (!wrapper || !panel) return;

    const panelRect = panel.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - panelRect.left,
      y: event.clientY - panelRect.top,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!dragOffsetRef.current) return;
      const rawLeft = moveEvent.clientX - dragOffsetRef.current.x;
      const rawTop = moveEvent.clientY - dragOffsetRef.current.y;
      setChatPanelPosition(clampPanelPosition(rawLeft, rawTop));
    };

    const stopDragging = () => {
      dragOffsetRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
  }, [clampPanelPosition, isCompactView]);

  const handleCopilotCodeInsert = useCallback((nextCode: string) => {
    if (typeof onChange === "function") {
      onChange(nextCode, undefined as any);
    }
  }, [onChange]);

  const handleCreateEditor = useCallback((view: any, state: any) => {
    editorViewRef.current = view;
    if (typeof onCreateEditor === "function") {
      onCreateEditor(view, state);
    }
  }, [onCreateEditor]);

  const blurEditorInput = useCallback(() => {
    const view = editorViewRef.current;
    if (!view) return;
    try {
      const contentDom = (view.contentDOM || null) as HTMLElement | null;
      contentDom?.blur?.();
      const active = document.activeElement as HTMLElement | null;
      if (active && active.closest?.(".cm-editor")) {
        active.blur();
      }
    } catch {
      // ignore focus handling failures
    }
  }, []);

  useEffect(() => {
    setAutoApplyEnabled(Boolean(aiAssistantAutoApplyCodeBlock));
  }, [aiAssistantAutoApplyCodeBlock, autoApplyStorageKey]);

  const handleAutoApplyChange = useCallback((enabled: boolean) => {
    setAutoApplyEnabled(Boolean(enabled));
  }, []);

  const closeChat = useCallback(() => {
    updateGlobalAiAssistantState({ open: false, ownerId: null });
  }, []);

  useEffect(() => subscribeGlobalAiAssistant(setGlobalState), []);

  useEffect(() => {
    if (!aiAssistantEnabled && isOwner) {
      updateGlobalAiAssistantState({ open: false, ownerId: null });
    }
  }, [aiAssistantEnabled, isOwner]);

  useEffect(() => {
    return () => {
      if (globalAiAssistantState.ownerId === instanceIdRef.current) {
        updateGlobalAiAssistantState({ open: false, ownerId: null });
      }
    };
  }, []);

  useEffect(() => {
    if (!chatOpen || isCompactView) return;
    const timer = window.setTimeout(() => ensureInitialPanelPosition(), 0);
    return () => window.clearTimeout(timer);
  }, [chatOpen, isCompactView, ensureInitialPanelPosition]);

  useEffect(() => {
    const previous = prevFullscreenRef.current;
    prevFullscreenRef.current = isFullscreen;
    if (previous === isFullscreen) return;
    if (!chatOpen || isCompactView) return;

    // Re-anchor panel after fullscreen transitions to avoid stale overlay position.
    setChatPanelPosition(null);
    const timer = window.setTimeout(() => ensureInitialPanelPosition(), 0);
    return () => window.clearTimeout(timer);
  }, [isFullscreen, chatOpen, isCompactView, ensureInitialPanelPosition]);

  useEffect(() => {
    if (!chatOpen || isCompactView) return;
    const handleResize = () => ensureInitialPanelPosition();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [chatOpen, isCompactView, ensureInitialPanelPosition]);

  useEffect(() => {
    const handlePointerDownCapture = (event: PointerEvent) => {
      const root = wrapperRef.current;
      const target = event.target as Node | null;
      if (!root || !target) return;

      if (!root.contains(target)) {
        blurEditorInput();
        return;
      }

      const editorElement = root.querySelector(".cm-editor");
      if (editorElement && !editorElement.contains(target)) {
        blurEditorInput();
      }
    };

    document.addEventListener("pointerdown", handlePointerDownCapture, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownCapture, true);
    };
  }, [blurEditorInput]);

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

  const dragText = useMemo(() => {
    const lang = String(i18n.resolvedLanguage || i18n.language || "vi").toLowerCase();
    if (lang.startsWith("zh")) {
      return "按住拖动";
    }
    if (lang.startsWith("en")) {
      return "Drag to move";
    }
    return "Giữ và kéo để di chuyển";
  }, [i18n.language, i18n.resolvedLanguage]);

  const chatPanelStyle = isCompactView || !chatPanelPosition
    ? undefined
    : {
      left: `${chatPanelPosition.left}px`,
      top: `${chatPanelPosition.top}px`,
    };

  const chatPanelClassName = [
    styles.chatPanel,
    !isCompactView ? styles.chatPanelFloating : "",
    isCompactView ? styles.chatPanelCompact : "",
  ].filter(Boolean).join(" ");

  const rootNode = (
    <div
      className={isFullscreen ? styles.wrapperFullscreen : styles.wrapper}
      ref={wrapperRef}
      style={isFullscreen && fullscreenViewportStyle
        ? {
            top: fullscreenViewportStyle.top,
            left: fullscreenViewportStyle.left,
            width: fullscreenViewportStyle.width,
            height: fullscreenViewportStyle.height,
          }
        : undefined}
    >
      <div className={styles.editorHost}>
        <BaseCodeMirror
          value={value}
          height={editorHeight}
          onChange={onChange}
          onCreateEditor={handleCreateEditor}
          {...codeMirrorProps}
        />
      </div>
      {aiAssistantEnabled && (
        <>
          <div className={styles.toggleButton}>
            <Tooltip title={isFullscreen ? "Thu nhỏ (Esc)" : "Toàn màn hình"}>
              <Button
                size={prefersCoarsePointer ? "middle" : "small"}
                icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                onClick={toggleFullscreen}
                style={{ marginRight: 6 }}
              />
            </Tooltip>
            <Button
              size={prefersCoarsePointer ? "middle" : "small"}
              icon={<MessageOutlined />}
              onClick={() => {
                if (chatOpen) {
                  closeChat();
                } else {
                  updateGlobalAiAssistantState({ open: true, ownerId: instanceIdRef.current });
                }
              }}
            >
              {chatOpen ? uiText.close : uiText.open}
            </Button>
            </div>
          {chatOpen && (
            <div
              ref={chatPanelRef}
              className={chatPanelClassName}
              style={chatPanelStyle}
            >
              {isCompactView && (
                <div className={styles.chatTopBar}>
                  <span>{uiText.open}</span>
                  <Button
                    size="small"
                    type="text"
                    icon={<CloseOutlined />}
                    onClick={closeChat}
                    aria-label={uiText.close}
                  />
                </div>
              )}
              {!isCompactView && (
                <div className={styles.chatDragHandle} onPointerDown={startDraggingPanel}>
                  <span className={styles.chatDragDot} />
                  <span>{dragText}</span>
                  <Button
                    size="small"
                    type="text"
                    className={styles.chatCloseBtn}
                    icon={<CloseOutlined />}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={closeChat}
                    aria-label={uiText.close}
                  />
                </div>
              )}
              <div className={styles.chatPanelInner}>
                <AiAssistantChat
                  appId={appId}
                  currentCode={currentCode}
                  language={language}
                  contextType={contextType}
                  targetPName={aiAssistantPName}
                  targetPType={aiAssistantPType}
                  onCodeInsert={handleCopilotCodeInsert}
                  autoApplyCodeBlock={autoApplyEnabled}
                  autoApplyPreferenceKey={autoApplyStorageKey}
                  onAutoApplyChange={handleAutoApplyChange}
                  onUserMessage={aiAssistantOnUserMessage}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  if (isFullscreen && typeof document !== "undefined") {
    return createPortal(rootNode, document.body);
  }

  return rootNode;
}
