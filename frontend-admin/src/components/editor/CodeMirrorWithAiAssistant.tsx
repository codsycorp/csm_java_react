import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BaseCodeMirror, { type ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { Button, Tooltip } from "antd";
import { MessageOutlined, FullscreenOutlined, FullscreenExitOutlined, CloseOutlined } from "@ant-design/icons";
import { Prec, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, keymap, type Command } from "@codemirror/view";
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
  aiAssistantEditorMetadata?: Record<string, unknown>;
  aiAssistantAutoApplyCodeBlock?: boolean;
  aiAssistantInlineReview?: boolean;
  aiAssistantInlineSuggestedCode?: string | null;
  aiAssistantOnCitationNavigate?: (location: { path?: string; line?: number; token: string }) => boolean | void;
  aiAssistantOnOpenQualityTrace?: (payload: { requestId: string; appId?: string }) => void;
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

type InlineSuggestionPayload = {
  from: number;
  to: number;
  oldText: string;
  newText: string;
  onAccept: () => void;
  onReject: () => void;
};

const CHAT_PANEL_MARGIN = 10;
const MAX_INLINE_PREVIEW_CHARS = 1200;
const MAX_INLINE_WIDGET_LINES = 20;

const setInlineSuggestionEffect = StateEffect.define<InlineSuggestionPayload | null>();

const inlineSuggestionField = StateField.define<InlineSuggestionPayload | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setInlineSuggestionEffect)) {
        return effect.value;
      }
    }
    if (value && tr.docChanged) {
      return null;
    }
    return value;
  },
});

class InlineSuggestionWidget extends WidgetType {
  private readonly suggestion: InlineSuggestionPayload;

  constructor(suggestion: InlineSuggestionPayload) {
    super();
    this.suggestion = suggestion;
  }

  eq(other: InlineSuggestionWidget) {
    return other.suggestion.from === this.suggestion.from
      && other.suggestion.to === this.suggestion.to
      && other.suggestion.oldText === this.suggestion.oldText
      && other.suggestion.newText === this.suggestion.newText;
  }

  toDOM() {
    const root = document.createElement("div");
    root.className = "cm-ai-inline-widget";

    const title = document.createElement("div");
    title.className = "cm-ai-inline-widget-title";
    title.textContent = "AI Suggested Update";
    root.appendChild(title);

    const previewWrap = document.createElement("div");
    previewWrap.className = "cm-ai-inline-preview-wrap";

    const oldBlock = document.createElement("pre");
    oldBlock.className = "cm-ai-inline-preview cm-ai-inline-preview-old";
    oldBlock.textContent = this.suggestion.oldText;
    previewWrap.appendChild(oldBlock);

    const newBlock = document.createElement("pre");
    newBlock.className = "cm-ai-inline-preview cm-ai-inline-preview-new";
    newBlock.textContent = this.suggestion.newText;
    previewWrap.appendChild(newBlock);

    root.appendChild(previewWrap);

    const controls = document.createElement("div");
    controls.className = "cm-ai-inline-controls";

    const acceptButton = document.createElement("button");
    acceptButton.className = "cm-ai-inline-btn cm-ai-inline-btn-accept";
    acceptButton.type = "button";
    acceptButton.textContent = "Accept (Tab)";
    acceptButton.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.suggestion.onAccept();
    };
    controls.appendChild(acceptButton);

    const rejectButton = document.createElement("button");
    rejectButton.className = "cm-ai-inline-btn cm-ai-inline-btn-reject";
    rejectButton.type = "button";
    rejectButton.textContent = "Reject (Esc)";
    rejectButton.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.suggestion.onReject();
    };
    controls.appendChild(rejectButton);

    root.appendChild(controls);
    return root;
  }

  ignoreEvent() {
    return false;
  }
}

const inlineSuggestionDecorations = StateField.define({
  create: () => Decoration.none,
  update(_deco, tr) {
    const suggestion = tr.state.field(inlineSuggestionField);
    if (!suggestion) {
      return Decoration.none;
    }

    const ranges: any[] = [];
    const from = Math.max(0, Math.min(tr.state.doc.length, suggestion.from));
    const to = Math.max(from, Math.min(tr.state.doc.length, suggestion.to));

    if (to > from) {
      ranges.push(Decoration.mark({ class: "cm-ai-inline-old" }).range(from, to));
    }
    ranges.push(
      Decoration.widget({
        widget: new InlineSuggestionWidget(suggestion),
        side: 1,
        block: true,
      }).range(to),
    );

    return Decoration.set(ranges, true);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const inlineSuggestionTheme = EditorView.theme({
  ".cm-ai-inline-old": {
    backgroundColor: "rgba(220, 38, 38, 0.16)",
    textDecoration: "line-through",
    borderRadius: "2px",
  },
  ".cm-ai-inline-widget": {
    marginTop: "6px",
    marginBottom: "6px",
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid rgba(125, 125, 125, 0.35)",
    backgroundColor: "var(--ant-color-bg-container, #1f2937)",
  },
  ".cm-ai-inline-widget-title": {
    fontSize: "11px",
    fontWeight: "700",
    marginBottom: "8px",
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    color: "var(--ant-color-text-secondary, #94a3b8)",
  },
  ".cm-ai-inline-preview-wrap": {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "8px",
    marginBottom: "8px",
  },
  ".cm-ai-inline-preview": {
    margin: 0,
    padding: "8px",
    borderRadius: "6px",
    whiteSpace: "pre-wrap",
    fontSize: "12px",
    lineHeight: "1.5",
    maxHeight: "180px",
    overflow: "auto",
  },
  ".cm-ai-inline-preview-old": {
    backgroundColor: "rgba(220, 38, 38, 0.12)",
    border: "1px solid rgba(220, 38, 38, 0.25)",
  },
  ".cm-ai-inline-preview-new": {
    backgroundColor: "rgba(22, 163, 74, 0.12)",
    border: "1px solid rgba(22, 163, 74, 0.26)",
  },
  ".cm-ai-inline-controls": {
    display: "flex",
    gap: "8px",
  },
  ".cm-ai-inline-btn": {
    border: "1px solid transparent",
    borderRadius: "999px",
    backgroundColor: "transparent",
    fontSize: "11px",
    padding: "2px 10px",
    lineHeight: "20px",
    cursor: "pointer",
  },
  ".cm-ai-inline-btn-accept": {
    borderColor: "rgba(22, 163, 74, 0.35)",
    color: "#22c55e",
  },
  ".cm-ai-inline-btn-reject": {
    borderColor: "rgba(220, 38, 38, 0.35)",
    color: "#ef4444",
  },
});

const acceptInlineSuggestionCommand: Command = (view) => {
  const suggestion = view.state.field(inlineSuggestionField);
  if (!suggestion) return false;
  suggestion.onAccept();
  return true;
};

const rejectInlineSuggestionCommand: Command = (view) => {
  const suggestion = view.state.field(inlineSuggestionField);
  if (!suggestion) return false;
  suggestion.onReject();
  return true;
};

const inlineSuggestionKeymap = Prec.highest(
  keymap.of([
    { key: "Tab", run: acceptInlineSuggestionCommand },
    { key: "Escape", run: rejectInlineSuggestionCommand },
  ]),
);

const inlineSuggestionExtension: Extension[] = [
  inlineSuggestionField,
  inlineSuggestionDecorations,
  inlineSuggestionTheme,
  inlineSuggestionKeymap,
];

function clampPreviewText(raw: string): string {
  const text = String(raw || "");
  const lines = text.split("\n");
  const lineLimited = lines.length > MAX_INLINE_WIDGET_LINES
    ? `${lines.slice(0, MAX_INLINE_WIDGET_LINES).join("\n")}\n...`
    : text;
  if (lineLimited.length <= MAX_INLINE_PREVIEW_CHARS) return lineLimited;
  return `${lineLimited.slice(0, MAX_INLINE_PREVIEW_CHARS)}...`;
}

function computeChangedRange(baseText: string, nextText: string): { from: number; to: number; oldText: string; newText: string } | null {
  if (baseText === nextText) return null;
  const base = String(baseText || "");
  const next = String(nextText || "");

  let start = 0;
  const maxStart = Math.min(base.length, next.length);
  while (start < maxStart && base[start] === next[start]) {
    start += 1;
  }

  let endBase = base.length;
  let endNext = next.length;
  while (endBase > start && endNext > start && base[endBase - 1] === next[endNext - 1]) {
    endBase -= 1;
    endNext -= 1;
  }

  return {
    from: start,
    to: endBase,
    oldText: base.slice(start, endBase),
    newText: next.slice(start, endNext),
  };
}

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
    aiAssistantEditorMetadata: externalAiAssistantEditorMetadata,
    aiAssistantAutoApplyCodeBlock = false,
    aiAssistantInlineReview = true,
    aiAssistantInlineSuggestedCode,
    aiAssistantOnCitationNavigate,
    aiAssistantOnOpenQualityTrace,
    aiAssistantOnUserMessage,
    value,
    height,
    onCreateEditor,
    onChange,
    extensions: externalExtensions,
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

  const presentInlineSuggestion = useCallback((nextCode: string) => {
    const view = editorViewRef.current;
    if (!view || !aiAssistantInlineReview || autoApplyEnabled) {
      return false;
    }

    const beforeCode = String(currentCode || "");
    const afterCode = String(nextCode || "");
    const range = computeChangedRange(beforeCode, afterCode);
    if (!range) {
      return false;
    }

    const clearSuggestion = () => {
      try {
        view.dispatch({ effects: setInlineSuggestionEffect.of(null) });
      } catch {
        // ignore editor dispatch failures
      }
    };

    const acceptSuggestion = () => {
      clearSuggestion();
      if (typeof onChange === "function") {
        onChange(afterCode, undefined as any);
      }
    };

    view.dispatch({
      effects: setInlineSuggestionEffect.of({
        from: range.from,
        to: range.to,
        oldText: clampPreviewText(range.oldText || "(empty)"),
        newText: clampPreviewText(range.newText || "(empty)"),
        onAccept: acceptSuggestion,
        onReject: clearSuggestion,
      }),
    });
    return true;
  }, [aiAssistantInlineReview, autoApplyEnabled, currentCode, onChange]);

  const handleCopilotCodeInsert = useCallback((nextCode: string) => {
    if (presentInlineSuggestion(nextCode)) {
      return;
    }

    if (typeof onChange === "function") {
      onChange(nextCode, undefined as any);
    }
  }, [onChange, presentInlineSuggestion]);

  // Real-time line-range edit: applies only the affected lines via CodeMirror dispatch.
  // This is the precise equivalent of Claude Code's inline diff — no full file replacement.
  const handleApplyLineEdit = useCallback((edit: {
    startLine: number; endLine: number; replacement: string; action: string
  }) => {
    const view = editorViewRef.current;
    if (!view) {
      // No editor view yet — reconstruct full code and fall back to full insert
      const lines = String(currentCode || "").split("\n");
      const s = Math.max(0, edit.startLine - 1);
      const e = Math.max(s, Math.min(edit.endLine - 1, lines.length - 1));
      lines.splice(s, e - s + 1, ...edit.replacement.split("\n"));
      handleCopilotCodeInsert(lines.join("\n"));
      return;
    }
    try {
      const doc = view.state.doc;
      const safeStart = Math.max(1, Math.min(edit.startLine, doc.lines));
      const safeEnd = Math.max(safeStart, Math.min(edit.endLine, doc.lines));
      const startLineObj = doc.line(safeStart);
      const endLineObj = doc.line(safeEnd);
      // Dispatch a precise character-range change — only the target lines are touched
      view.dispatch({
        changes: { from: startLineObj.from, to: endLineObj.to, insert: edit.replacement },
        scrollIntoView: true,
      });
      // Propagate the updated value back into React state
      if (typeof onChange === "function") {
        onChange(view.state.doc.toString(), undefined as any);
      }
    } catch {
      // Dispatch failure — fall back to full code reconstruction
      const lines = String(currentCode || "").split("\n");
      const s = Math.max(0, edit.startLine - 1);
      const e = Math.max(s, Math.min(edit.endLine - 1, lines.length - 1));
      lines.splice(s, e - s + 1, ...edit.replacement.split("\n"));
      handleCopilotCodeInsert(lines.join("\n"));
    }
  }, [currentCode, handleCopilotCodeInsert, onChange]);

  const handleCitationNavigate = useCallback((location: { path?: string; line?: number; token: string }) => {
    const delegated = aiAssistantOnCitationNavigate?.(location);
    if (delegated === true) {
      return;
    }

    const view = editorViewRef.current;
    if (!view || !location.line) {
      return;
    }

    try {
      const doc = view.state?.doc;
      const targetLineNumber = Math.max(1, Number(location.line));
      const targetLine = doc?.line ? doc.line(Math.min(targetLineNumber, doc.lines)) : null;
      if (!targetLine) {
        return;
      }

      view.dispatch({
        selection: { anchor: targetLine.from },
        scrollIntoView: true,
      });
      view.focus?.();
    } catch {
      // ignore navigation failures
    }
  }, [aiAssistantOnCitationNavigate]);

  useEffect(() => {
    const suggested = String(aiAssistantInlineSuggestedCode || "").trim();
    if (!suggested) return;
    presentInlineSuggestion(suggested);
  }, [aiAssistantInlineSuggestedCode, presentInlineSuggestion]);

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

  const aiAssistantEditorMetadata = useMemo(() => {
    const metadata: Record<string, unknown> = {
      source: "CodeMirrorWithAiAssistant",
      ownerId: instanceIdRef.current,
      viewMode: isCompactView ? "compact" : "dock",
    };

    if (externalAiAssistantEditorMetadata && typeof externalAiAssistantEditorMetadata === "object") {
      Object.assign(metadata, externalAiAssistantEditorMetadata);
    }

    const codeLength = typeof currentCode === "string" ? currentCode.length : 0;
    if (codeLength > 0) {
      metadata.bufferChars = codeLength;
      metadata.bufferLines = currentCode.split(/\r?\n/).length;
    }

    const view = editorViewRef.current;
    try {
      const mainSelection = view?.state?.selection?.main;
      const doc = view?.state?.doc;
      if (mainSelection && doc && typeof doc.lineAt === "function") {
        const from = Math.max(0, Number(mainSelection.from ?? 0));
        const to = Math.max(from, Number(mainSelection.to ?? from));
        const fromLine = doc.lineAt(from).number;
        const toLine = doc.lineAt(to).number;
        metadata.cursorLine = fromLine;
        metadata.selectionFromLine = fromLine;
        metadata.selectionToLine = toLine;
        metadata.hasSelection = to > from;
        metadata.selectedChars = Math.max(0, to - from);
      }
    } catch {
      // Keep metadata best-effort; chat requests should never fail on editor state probing.
    }

    return metadata;
  }, [currentCode, externalAiAssistantEditorMetadata, isCompactView]);

  const resolvedExtensions = useMemo<Extension[]>(() => {
    const base = Array.isArray(externalExtensions)
      ? externalExtensions
      : externalExtensions
        ? [externalExtensions]
        : [];
    if (!aiAssistantInlineReview) return base as Extension[];
    return [...(base as Extension[]), ...inlineSuggestionExtension];
  }, [aiAssistantInlineReview, externalExtensions]);

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
          extensions={resolvedExtensions}
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
                  editorMetadata={aiAssistantEditorMetadata}
                  onCodeInsert={handleCopilotCodeInsert}
                  onApplyLineEdit={handleApplyLineEdit}
                  onCitationNavigate={handleCitationNavigate}
                  onOpenQualityTrace={aiAssistantOnOpenQualityTrace}
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
