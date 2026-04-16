import React, { useState, useEffect, useRef, useCallback } from "react";
import { UserOutlined, SendOutlined, CloseOutlined, MinusOutlined, DeleteOutlined, PushpinOutlined, PaperClipOutlined, CameraOutlined, EyeOutlined, CheckOutlined, CheckCircleOutlined, FileOutlined } from "@ant-design/icons";
import { Input, Button, List, Avatar, theme, Tooltip, Popconfirm, Tag, message } from "antd";
import { useTranslation } from "react-i18next";
import { useChatHistory } from "#src/contexts/ChatHistoryContext";
import { useUserStore } from "#src/store/user";
import { useAppStore } from "#src/store/app";
import { useGuestPhone } from "#src/hooks/useGuestPhone";
import type { ChatMessage } from "#src/model/ChatMessage";
import FloatingChatButton from "./FloatingChatButton";

const UPLOAD_ENDPOINT = "/upload.shtml";
const RECALL_WINDOW_MS = 2 * 60 * 1000;

function resolveMediaUrl(pathValue?: string): string {
  if (!pathValue) return "";
  if (/^https?:\/\//i.test(pathValue)) return pathValue;
  if (/^data:/i.test(pathValue)) return pathValue;
  return pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
}

function inferAttachmentType(fileName?: string, mime?: string): "image" | "video" | "file" {
  const lowerName = String(fileName || "").toLowerCase();
  const lowerMime = String(mime || "").toLowerCase();
  if (lowerMime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/.test(lowerName)) return "image";
  if (lowerMime.startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v|mkv|avi)$/.test(lowerName)) return "video";
  return "file";
}




const InternalChatBox: React.FC<{visible: boolean, onClose: () => void, username?: string, room?: string, targetUserId?: string, index?: number}> = ({ visible, onClose, username, room, targetUserId, index }) => {
  const [input, setInput] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [deletedMessageIds, setDeletedMessageIds] = useState<Set<string>>(new Set());
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [requestingCheckinPermission, setRequestingCheckinPermission] = useState(false);
  const [checkinCaptureOpen, setCheckinCaptureOpen] = useState(false);
  const [checkinGeo, setCheckinGeo] = useState<{ latitude: number; longitude: number; address: string } | null>(null);
  const filePickerRef = useRef<HTMLInputElement>(null);
  const checkinVideoRef = useRef<HTMLVideoElement>(null);
  const checkinStreamRef = useRef<MediaStream | null>(null);
  const user = useUserStore();
  // CRITICAL: Use same pattern as permission.ts for getting effective appId
  // Priority: user.app_id (from login) > store.currentAppId (from AppStore) > fallback to "csm"
  const appId = (user.app_id || "").trim() || useAppStore.getState().getCurrentAppId() || "csm";
  const chatRoom = room || appId;
  const listRef = useRef<HTMLDivElement>(null);
  const lastMarkReadRef = useRef<{ room: string; at: number } | null>(null);
  const [position, setPosition] = useState({ x: 20 + (index || 0) * 320, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const { token } = theme.useToken();
  const { t } = useTranslation();
  
  // Use ChatHistoryContext instead of local state
  const { 
    messages: allMessages, 
    sendMessage: sendMessageContext, 
    loadHistory, 
    markAsRead, 
    recallMessage,
    unreadCounts,
    connected,
    openChat: openChatContext,
    closeChat: closeChatContext,
    typingUsers
  } = useChatHistory();
  const openChatRef = useRef(openChatContext);
  const closeChatRef = useRef(closeChatContext);
  
  const { guestPhone: guestPhoneFromHook, guestSessionId, ensureGuestSessionId, isGuest, setChatUrl, getChatUrlToSend } = useGuestPhone();

  useEffect(() => {
    openChatRef.current = openChatContext;
    closeChatRef.current = closeChatContext;
  }, [openChatContext, closeChatContext]);

  // Ensure we always pick the latest guest phone (state or localStorage)
  const storedGuestPhone = React.useMemo(() => {
    if (!isGuest) return "";
    try {
      return localStorage.getItem(`csm_guest_phone_${appId}`) || "";
    } catch (e) {
      console.warn("Cannot read guest phone from localStorage", e);
      return "";
    }
  }, [isGuest, appId, guestPhoneFromHook]);

  const storedGuestSessionId = React.useMemo(() => {
    if (!isGuest) return "";
    try {
      return localStorage.getItem(`csm_guest_session_${appId}`) || guestSessionId || "";
    } catch (e) {
      console.warn("Cannot read guest session from localStorage", e);
      return guestSessionId || "";
    }
  }, [isGuest, appId, guestSessionId]);
  
  // Use priority: prop.username (if provided) > hook state > localStorage
  const effectiveGuestPhone = isGuest
    ? ((username && username.trim()) || guestPhoneFromHook || storedGuestPhone)
    : "";

  const effectiveGuestSessionId = isGuest
    ? (guestSessionId || storedGuestSessionId || ensureGuestSessionId())
    : "";

  const isGuestConversation = !isGuest && !!room && room !== appId && room !== 'csm' && !room.includes(':');
  const isStructuredRoom = !!room && room.includes(':');

  // Consistent room key for guests: use session id; for portal users keep structured room key (private/user/app/guest)
  const roomKey = isGuest
    ? (effectiveGuestSessionId || chatRoom)
    : (isStructuredRoom ? room : (isGuestConversation ? room : (username || chatRoom)));
  const localHiddenStorageKey = `csm_chat_hidden_${String(user.userId || effectiveGuestSessionId || 'guest')}_${roomKey}`;

  const pinnedStorageKey = `csm_chat_pin_${roomKey}`;
  const pinnedPosStorageKey = `csm_chat_pin_pos_${roomKey}`;

  // Get messages for this specific chat
  const messages = allMessages[roomKey] || [];
  const unreadCount = unreadCounts[roomKey] || 0;
  // frontend-admin always uses the unified internal chat UX, including guest conversations.
  const useMobileFloatingLauncher = false;

  // Filter out deleted messages
  const visibleMessages = messages.filter((msg: ChatMessage) => !deletedMessageIds.has(msg.timestamp?.toString() || ''));

  // Local-only hide: affects only the current viewer window/history state.
  const handleDeleteMessage = useCallback((msgTimestamp?: number) => {
    if (!msgTimestamp) return;
    setDeletedMessageIds(prev => {
      const next = new Set(prev);
      next.add(String(msgTimestamp));
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(localHiddenStorageKey);
      if (!raw) {
        setDeletedMessageIds(new Set());
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setDeletedMessageIds(new Set(parsed.map((x) => String(x))));
      } else {
        setDeletedMessageIds(new Set());
      }
    } catch {
      setDeletedMessageIds(new Set());
    }
  }, [localHiddenStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(localHiddenStorageKey, JSON.stringify(Array.from(deletedMessageIds)));
    } catch {
      // ignore localStorage errors
    }
  }, [deletedMessageIds, localHiddenStorageKey]);

  const canRecall = useCallback((item: ChatMessage, isMyMessage: boolean) => {
    if (!isMyMessage) return false;
    if (item.eventType === 'message_recalled') return false;
    const ts = Number(item.timestamp || 0);
    if (!ts) return false;
    return (Date.now() - ts) <= RECALL_WINDOW_MS;
  }, []);

  const handleRecallMessage = useCallback(async (item: ChatMessage) => {
    const ts = Number(item.timestamp || 0);
    if (!ts) return;
    const ok = await recallMessage(roomKey, ts);
    if (!ok) {
      console.warn('Recall message failed', ts);
    }
  }, [recallMessage, roomKey]);

  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 576);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isMobile && !useMobileFloatingLauncher && isMinimized) {
      setIsMinimized(false);
    }
  }, [isMobile, useMobileFloatingLauncher, isMinimized]);

  // Open chat khi component mount
  useEffect(() => {
    if (visible) {
      openChatRef.current(roomKey);
    }
    return () => {
      if (visible) {
        closeChatRef.current(roomKey);
      }
    };
  }, [visible, roomKey]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isPinned) {
      return;
    }
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging && !isPinned) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isPinned]);

  // Center the chat box when it becomes visible; still draggable afterwards
  useEffect(() => {
    if (!visible) return;
    if (isPinned) {
      try {
        const raw = localStorage.getItem(pinnedPosStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
            setPosition({ x: parsed.x, y: parsed.y });
            return;
          }
        }
      } catch {
        // Ignore persisted position parse errors.
      }
    }
    const width = 300;
    const height = 400;
    const padding = 16;
    const nextX = Math.max(padding, (window.innerWidth - width) / 2);
    const nextY = Math.max(padding, (window.innerHeight - height) / 2);
    setPosition({ x: nextX, y: nextY });
  }, [visible, isPinned, pinnedPosStorageKey]);

  useEffect(() => {
    try {
      const savedPinned = localStorage.getItem(pinnedStorageKey);
      setIsPinned(savedPinned === '1');
    } catch {
      setIsPinned(false);
    }
  }, [pinnedStorageKey]);

  useEffect(() => {
    try {
      if (isPinned) {
        localStorage.setItem(pinnedStorageKey, '1');
        localStorage.setItem(pinnedPosStorageKey, JSON.stringify(position));
      } else {
        localStorage.removeItem(pinnedStorageKey);
        localStorage.removeItem(pinnedPosStorageKey);
      }
    } catch {
      // Ignore localStorage errors.
    }
  }, [isPinned, position, pinnedStorageKey, pinnedPosStorageKey]);

  const togglePinned = useCallback(() => {
    setIsPinned(prev => !prev);
  }, []);

  // Mark as read when chat box opens (consolidated single effect)
  useEffect(() => {
    if (visible) {
      const now = Date.now();
      const last = lastMarkReadRef.current;
      if (last && last.room === roomKey && now - last.at < 2000) {
        return;
      }
      lastMarkReadRef.current = { room: roomKey, at: now };
      console.log(`📖 [InternalChatBox] Marking as read for room: ${roomKey}`);
      markAsRead(roomKey);
    }
  }, [visible, roomKey, markAsRead]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  }, [messages]);

  // Handle input with typing indicator
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    
    // Emit typing event if socket connected
    const guestIdentifier = effectiveGuestSessionId;
    const roomIdentifier = isGuest ? guestIdentifier : roomKey;
    
    if (connected && roomIdentifier) {
      const actualRoom = isGuest && guestIdentifier
        ? `guest:${appId};${guestIdentifier}`
        : (isStructuredRoom ? roomKey : (isGuestConversation ? `guest:${appId};${roomKey}` : (username ? `user:${appId};${username}` : `app:${appId}`)));
      
      (window as any).emitTyping?.(actualRoom, isGuest ? (effectiveGuestPhone || guestIdentifier) : username, appId);
    }
  };

  const uploadFileToServer = useCallback(async (file: File): Promise<{ name: string; url: string; type: string; size: number; thumb?: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", file.name);

    const response = await fetch(`${UPLOAD_ENDPOINT}?app_id=${encodeURIComponent(appId)}`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    const text = await response.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { path: text };
    }
    const mediaType = inferAttachmentType(file.name, file.type);
    return {
      name: file.name,
      url: String(parsed?.path || parsed?.url || "").trim(),
      type: mediaType,
      size: Number(file.size || 0),
      thumb: String(parsed?.thumb || "").trim() || undefined,
    };
  }, [appId]);

  const reverseGeocodeAddress = useCallback(async (lat: number, lon: number): Promise<string> => {
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
      if (!resp.ok) return "";
      const data = await resp.json();
      return String(data?.display_name || "").trim();
    } catch {
      return "";
    }
  }, []);

  const drawCheckinOverlay = useCallback(async (file: File, overlayLines: string[]): Promise<File> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("read-file-failed"));
      reader.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image-load-failed"));
      el.src = dataUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const padding = Math.max(14, Math.round(canvas.width * 0.015));
    const fontSize = Math.max(16, Math.round(canvas.width * 0.022));
    const lineHeight = Math.round(fontSize * 1.35);
    const lines = overlayLines.filter(Boolean);
    const boxHeight = padding * 2 + lineHeight * lines.length;

    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, canvas.height - boxHeight, canvas.width, boxHeight);
    ctx.fillStyle = "#ffffff";
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = "top";
    lines.forEach((line, idx) => {
      ctx.fillText(line, padding, canvas.height - boxHeight + padding + idx * lineHeight);
    });

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return file;
    return new File([blob], `checkin-${Date.now()}.jpg`, { type: "image/jpeg" });
  }, []);

  const fileToDataUrl = useCallback(async (file: File): Promise<string> => {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("read-checkin-dataurl-failed"));
      reader.readAsDataURL(file);
    });
  }, []);

  const stopCheckinStream = useCallback(() => {
    if (checkinStreamRef.current) {
      checkinStreamRef.current.getTracks().forEach((track) => track.stop());
      checkinStreamRef.current = null;
    }
    if (checkinVideoRef.current) {
      checkinVideoRef.current.srcObject = null;
    }
  }, []);

  const requestCameraPermission = useCallback(async (): Promise<MediaStream | null> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      message.error(t('common.chat.checkinCameraUnsupported', 'Thiet bi/Trinh duyet khong ho tro truy cap camera'));
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      return stream;
    } catch (error) {
      console.warn('camera permission denied', error);
      return null;
    }
  }, [t]);

  const requestLocationPermission = useCallback(async (): Promise<{ latitude: number; longitude: number; address: string } | null> => {
    if (!navigator.geolocation) {
      message.error(t('common.chat.checkinLocationUnsupported', 'Thiet bi/Trinh duyet khong ho tro vi tri'));
      return null;
    }

    const geo = await new Promise<GeolocationPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        () => resolve(null),
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        },
      );
    });

    const latitude = geo?.coords?.latitude;
    const longitude = geo?.coords?.longitude;
    if (latitude == null || longitude == null) {
      return null;
    }

    const address = await reverseGeocodeAddress(latitude, longitude);
    return { latitude, longitude, address };
  }, [t, reverseGeocodeAddress]);

  const closeCheckinCapture = useCallback(() => {
    setCheckinCaptureOpen(false);
    setCheckinGeo(null);
    stopCheckinStream();
  }, [stopCheckinStream]);

  useEffect(() => {
    return () => {
      stopCheckinStream();
    };
  }, [stopCheckinStream]);

  const buildOwnMessageStatus = useCallback((item: ChatMessage) => {
    const readBy = Array.isArray(item.readBy) ? item.readBy : [];
    const seenByPeer = readBy.some((reader) => !!reader && reader !== user.userId);
    if (seenByPeer) {
      return { label: t('common.chat.read', 'Đã xem'), icon: <EyeOutlined /> };
    }
    if (connected) {
      return { label: t('common.chat.received', 'Đã nhận'), icon: <CheckCircleOutlined /> };
    }
    return { label: t('common.chat.sent', 'Đã gửi'), icon: <CheckOutlined /> };
  }, [user.userId, connected, t]);

  const sendMessage = async () => {
    const text = input.trim();
    const hasMedia = pendingFiles.length > 0;
    if (!text && !hasMedia) return;

    const urlToSend = getChatUrlToSend();
    if (urlToSend) {
      setChatUrl(urlToSend);
    }

    const guestIdentifier = effectiveGuestSessionId;
    const roomIdentifier = isGuest ? guestIdentifier : roomKey;
    if (isGuest && !roomIdentifier) {
      console.warn("Guest identity is missing; cannot send message.");
      return;
    }

    try {
      setUploadingMedia(true);
      let attachments: ChatMessage['attachments'] = undefined;
      if (hasMedia) {
        const uploaded = await Promise.all(pendingFiles.map((file) => uploadFileToServer(file)));
        attachments = uploaded.map((item) => ({
          name: item.name,
          url: item.url,
          type: item.type,
          size: item.size,
          thumb: item.thumb,
        }));
      }

      sendMessageContext(
        roomIdentifier,
        text,
        isGuest ? undefined : (isGuestConversation ? undefined : targetUserId),
        {
          attachments,
          eventType: attachments && attachments.length > 0 ? "chat_media" : undefined,
        },
      );
      setInput("");
      setPendingFiles([]);
    } catch (error) {
      console.error("send chat media error", error);
    } finally {
      setUploadingMedia(false);
    }
  };

  const formatMessageTime = (rawTimestamp?: number) => {
    if (!rawTimestamp) return '';

    const normalizedTimestamp = rawTimestamp < 1000000000000 ? rawTimestamp * 1000 : rawTimestamp;
    const date = new Date(normalizedTimestamp);

    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isFreshMessage = useCallback((rawTimestamp?: number) => {
    if (!rawTimestamp) return false;
    const normalizedTimestamp = rawTimestamp < 1000000000000 ? rawTimestamp * 1000 : rawTimestamp;
    if (!Number.isFinite(normalizedTimestamp)) return false;
    return (Date.now() - normalizedTimestamp) <= 8000;
  }, []);

  const handlePickFiles = () => {
    filePickerRef.current?.click();
  };

  const handleSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      setPendingFiles((prev) => [...prev, ...selected]);
    }
    e.target.value = "";
  };

  const handleCheckinPick = async () => {
    if (uploadingMedia || requestingCheckinPermission) return;

    try {
      setRequestingCheckinPermission(true);
      const [cameraStream, location] = await Promise.all([
        requestCameraPermission(),
        requestLocationPermission(),
      ]);

      if (!cameraStream || !location) {
        if (cameraStream) {
          cameraStream.getTracks().forEach((track) => track.stop());
        }
        const missing = [
          !cameraStream ? t('common.chat.camera', 'camera') : '',
          !location ? t('common.chat.location', 'vi tri') : '',
        ].filter(Boolean).join(' + ');
        message.warning(
          t('common.chat.checkinPermissionRequired', 'Can cap quyen {{missing}} de tao anh check-in dung logic')
            .replace('{{missing}}', missing || 'camera + vi tri')
        );
        return;
      }

      checkinStreamRef.current = cameraStream;
      setCheckinGeo(location);
      setCheckinCaptureOpen(true);

      setTimeout(() => {
        if (checkinVideoRef.current) {
          checkinVideoRef.current.srcObject = cameraStream;
          checkinVideoRef.current.play().catch(() => {
            // Ignore autoplay/play interruption and let user click capture again.
          });
        }
      }, 0);
    } finally {
      setRequestingCheckinPermission(false);
    }
  };

  const handleCaptureCheckin = async () => {
    const video = checkinVideoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      message.error(t('common.chat.checkinCameraNotReady', 'Camera chua san sang, vui long thu lai'));
      return;
    }
    if (!checkinGeo) {
      message.error(t('common.chat.checkinNeedLocation', 'Khong lay duoc vi tri. Vui long cap quyen vi tri va thu lai'));
      return;
    }

    try {
      setUploadingMedia(true);

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('checkin-canvas-context-missing');
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const rawBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!rawBlob) {
        throw new Error('checkin-capture-blob-empty');
      }

      const capturedFile = new File([rawBlob], `checkin-raw-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const now = Date.now();
      const timeText = new Date(now).toLocaleString('vi-VN');
      const coordText = `${checkinGeo.latitude.toFixed(6)}, ${checkinGeo.longitude.toFixed(6)}`;
      const mergedFile = await drawCheckinOverlay(capturedFile, [
        `Check-in: ${timeText}`,
        `Toa do: ${coordText}`,
        `Dia chi: ${checkinGeo.address || 'Khong xac dinh'}`,
      ]);
      const dataUrl = await fileToDataUrl(mergedFile);
      if (!dataUrl) {
        throw new Error("checkin-dataurl-empty");
      }

      const roomIdentifier = isGuest ? effectiveGuestSessionId : roomKey;
      sendMessageContext(
        roomIdentifier,
        "Check-in",
        isGuest ? undefined : (isGuestConversation ? undefined : targetUserId),
        {
          eventType: "chat_checkin",
          attachments: [{
            name: mergedFile.name,
            url: dataUrl,
            type: "image",
            size: Number(mergedFile.size || 0),
          }],
          checkinMeta: {
            timestamp: now,
            latitude: checkinGeo.latitude,
            longitude: checkinGeo.longitude,
            address: checkinGeo.address,
          },
        },
      );

      closeCheckinCapture();
    } catch (error) {
      console.error("checkin capture error", error);
    } finally {
      setUploadingMedia(false);
    }
  };

  const renderMessageAttachments = (item: ChatMessage) => {
    const attachments = Array.isArray(item.attachments) ? item.attachments : [];
    if (attachments.length === 0) return null;

    const imageItems: Array<{ key: string; url: string; name: string }> = [];
    const videoItems: Array<{ key: string; url: string; name: string }> = [];
    const fileItems: Array<{ key: string; url: string; name: string }> = [];

    attachments.forEach((att, idx) => {
      const kind = inferAttachmentType(att?.name, att?.type);
      const attUrl = resolveMediaUrl(att?.url || "");
      if (!attUrl) return;
      const key = `${attUrl}-${idx}`;
      const name = att?.name || 'file';
      if (kind === 'image') {
        imageItems.push({ key, url: attUrl, name });
      } else if (kind === 'video') {
        videoItems.push({ key, url: attUrl, name });
      } else {
        fileItems.push({ key, url: attUrl, name });
      }
    });

    return (
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {imageItems.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, maxWidth: 240 }}>
            {imageItems.map((att) => (
              <img
                key={att.key}
                src={att.url}
                alt={att.name}
                style={{ width: '100%', borderRadius: 8, cursor: 'pointer', border: `1px solid ${token.colorBorder}`, objectFit: 'cover' }}
                onClick={() => window.open(att.url, '_blank', 'noopener,noreferrer')}
              />
            ))}
          </div>
        )}
        {videoItems.map((att) => (
          <video
            key={att.key}
            src={att.url}
            controls
            style={{ width: 240, maxWidth: '100%', borderRadius: 8, border: `1px solid ${token.colorBorder}` }}
          />
        ))}
        {fileItems.map((att) => (
          <a
            key={att.key}
            href={att.url}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', border: `1px solid ${token.colorBorder}`, borderRadius: 8, width: 'fit-content', maxWidth: '100%' }}
          >
            <FileOutlined />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }}>{att.name}</span>
          </a>
        ))}
      </div>
    );
  };

  // Mobile: show floating button + modal
  if (isMobile) {
    const handleMobileDismiss = () => {
      if (useMobileFloatingLauncher) {
        setIsMinimized(true);
        return;
      }
      onClose();
    };

    return (
      <>
        {/* Floating Chat Button */}
        <FloatingChatButton
          onClick={() => {
            setIsMinimized(false);
          }}
          label={username ? t('common.chat.with', { name: username }) : t('common.chat.withAdmin')}
          visible={useMobileFloatingLauncher && visible && isMinimized}
          badge={unreadCount}
        />

        {/* Chat Box Modal */}
        {!isMinimized && visible && (
          <div
            style={{
              position: 'fixed',
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.45)',
              zIndex: 1998,
              display: 'flex',
              flexDirection: 'column',
              animation: 'fadeIn 0.3s ease-out',
            }}
            onClick={handleMobileDismiss}
          >
            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes slideUp {
                from { transform: translateY(100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
              }
              @keyframes csmChatMessageIn {
                from { opacity: 0; transform: translateY(6px) scale(0.995); }
                to { opacity: 1; transform: translateY(0) scale(1); }
              }
            `}</style>
            <div
              style={{
                position: 'fixed',
                left: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                maxHeight: '90vh',
                background: token.colorBgContainer,
                borderRadius: '16px 16px 0 0',
                boxShadow: '0 -8px 24px rgba(0,0,0,0.15)',
                zIndex: 1999,
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideUp 0.3s ease-out',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                style={{
                  padding: '16px',
                  borderBottom: `1px solid ${token.colorBorder}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: `linear-gradient(135deg, ${token.colorPrimaryBg} 0%, ${token.colorBgTextHover} 100%)`,
                  borderRadius: '16px 16px 0 0',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 16, color: token.colorPrimary }}>
                  {username ? t('common:chat.with', { name: username }) : t('common:chat.withAdmin')}
                </span>
                <Button
                  type="text"
                  icon={useMobileFloatingLauncher ? <MinusOutlined /> : <CloseOutlined />}
                  size="middle"
                  onClick={handleMobileDismiss}
                  title={useMobileFloatingLauncher ? t('common.chat.minimize') : t('common.chat.close', 'Đóng')}
                />
              </div>

              {/* Messages */}
              <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: 12 }}>
                <List
                  dataSource={visibleMessages}
                  renderItem={item => {
                    const isMyMessage = isGuest
                      ? (item.guestSessionId === effectiveGuestSessionId || item.guestPhone === effectiveGuestPhone || (!item.isAdmin && !item.userId))
                      : item.userId === user.userId;
                    const displayName = isMyMessage ? t('common.chat.you') : item.username;
                    const messageTime = formatMessageTime(item.timestamp);
                    const isReadForCurrent = (() => {
                      if (item.readBy && item.readBy.length > 0) {
                        if (user.userId) return item.readBy.includes(user.userId);
                        if (isGuest && effectiveGuestSessionId) return item.readBy.includes(`guest:${effectiveGuestSessionId}`) || item.readBy.includes(effectiveGuestSessionId);
                      }
                      return false;
                    })();

                    const showUnreadEmphasis = !isMyMessage && !isReadForCurrent;
                    const ownStatus = buildOwnMessageStatus(item);
                    const isRecalledMessage = item.eventType === 'message_recalled';
                    const isCheckinMessage = item.eventType === 'chat_checkin' || !!item.checkinMeta;
                    const isNewMessage = isFreshMessage(item.timestamp);

                    const bubbleBackground = isRecalledMessage
                      ? token.colorFillAlter
                      : (isMyMessage ? token.colorBgTextHover : (showUnreadEmphasis ? token.colorPrimaryBg : undefined));

                    const bubbleBorderLeft = isRecalledMessage
                      ? `3px dashed ${token.colorTextTertiary}`
                      : (showUnreadEmphasis ? `3px solid ${token.colorPrimary}` : (isCheckinMessage ? `3px solid ${token.colorInfo}` : undefined));

                    return (
                      <List.Item
                        style={{
                          background: bubbleBackground,
                          padding: '8px 4px',
                          marginBottom: 8,
                          borderRadius: 4,
                          borderLeft: bubbleBorderLeft,
                          opacity: isRecalledMessage ? 0.88 : 1,
                          animation: isNewMessage ? 'csmChatMessageIn 180ms ease-out' : undefined,
                          transformOrigin: isMyMessage ? 'right center' : 'left center',
                        }}
                      >
                        <List.Item.Meta
                          avatar={item.avatar ? <Avatar src={item.avatar} size="small" /> : <Avatar icon={<UserOutlined />} size="small" />}
                          title={
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 600 }}>
                                {displayName}
                                {item.isAdmin && !isMyMessage && (
                                  <span style={{ color: token.colorWarning, marginLeft: 6 }}>
                                    [{t('common.chat.admin')}]
                                  </span>
                                )}
                                {!isMyMessage && !isReadForCurrent && (
                                  <span style={{ color: token.colorPrimary, marginLeft: 8, fontSize: 10 }}>
                                    • {t('common.chat.unread', 'Chưa đọc')}
                                  </span>
                                )}
                              </span>
                              <span style={{ fontSize: 10, color: token.colorTextSecondary, fontWeight: 400, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                {messageTime || ''}
                                {isMyMessage && (
                                  <Tooltip title={ownStatus.label}>
                                    <span style={{ color: token.colorSuccess, display: 'inline-flex', alignItems: 'center' }}>
                                      {ownStatus.icon}
                                    </span>
                                  </Tooltip>
                                )}
                              </span>
                            </div>
                          }
                          description={
                            <div>
                              <span style={{ fontSize: 13, color: showUnreadEmphasis ? token.colorText : token.colorTextSecondary, fontWeight: showUnreadEmphasis ? 600 : 400, fontStyle: isRecalledMessage ? 'italic' : 'normal' }}>
                                {item.message}
                              </span>
                              {renderMessageAttachments(item)}
                              {item.checkinMeta && (
                                <div style={{ marginTop: 6 }}>
                                  <Tag color="blue">📍 Check-in</Tag>
                                  <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                                    {item.checkinMeta?.timestamp ? new Date(item.checkinMeta.timestamp).toLocaleString('vi-VN') : ''}
                                  </div>
                                  <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                                    {`${item.checkinMeta?.latitude || ''}, ${item.checkinMeta?.longitude || ''}`.trim().replace(/^,\s*|,\s*$/g, '')}
                                  </div>
                                  <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                                    {item.checkinMeta?.address || ''}
                                  </div>
                                </div>
                              )}
                            </div>
                          }
                        />
                        {/* Only show delete button for logged-in admin users */}
                        {!isGuest && user.userId && canRecall(item, isMyMessage) && (
                          <Tooltip title={t('common.chat.recallMessage', 'Thu hồi tin nhắn')}>
                            <Popconfirm
                              title={t('common.chat.recallMessageTitle', 'Thu hồi tin nhắn')}
                              description={t('common.chat.recallMessageDesc', 'Tin nhắn sẽ được thu hồi với tất cả người trong cuộc chat.')}
                              onConfirm={() => handleRecallMessage(item)}
                              okText={t('common.confirm', 'Xác nhận')}
                              cancelText={t('common.cancel', 'Hủy')}
                            >
                              <Button
                                type="text"
                                size="small"
                                icon={<EyeOutlined />}
                                style={{ opacity: 0.7 }}
                              />
                            </Popconfirm>
                          </Tooltip>
                        )}
                        {!isGuest && user.userId && !isMyMessage && (
                          <Tooltip title={t('common.chat.deleteLocalMessage', 'Xoá phía tôi')}>
                            <Popconfirm
                              title={t('common.chat.deleteLocalMessageTitle', 'Xoá phía tôi')}
                              description={t('common.chat.deleteLocalMessageDesc', 'Tin nhắn sẽ chỉ bị ẩn trong cửa sổ chat của bạn.')}
                              onConfirm={() => handleDeleteMessage(item.timestamp)}
                              okText={t('common.confirm', 'Xác nhận')}
                              cancelText={t('common.cancel', 'Hủy')}
                            >
                              <Button
                                type="text"
                                size="small"
                                icon={<DeleteOutlined />}
                                danger
                                style={{ opacity: 0.6, transition: 'opacity 0.2s' }}
                                onMouseEnter={(e) => {
                                  if (e.currentTarget) e.currentTarget.style.opacity = '1';
                                }}
                                onMouseLeave={(e) => {
                                  if (e.currentTarget) e.currentTarget.style.opacity = '0.6';
                                }}
                              />
                            </Popconfirm>
                          </Tooltip>
                        )}
                      </List.Item>
                    );
                  }}
                />
              </div>

              {/* Typing Indicator */}
              {typingUsers[roomKey] && typingUsers[roomKey].length > 0 && (
                <div style={{ padding: '6px 12px', background: token.colorBgElevated, borderTop: `1px solid ${token.colorBorder}`, fontSize: 11, color: token.colorTextSecondary, fontStyle: 'italic' }}>
                  💬 {typingUsers[roomKey].join(', ')} {t('common.chat.isTyping', 'đang nhập...')}
                </div>
              )}

              {/* Input */}
              <div style={{ padding: '8px 12px 0 12px', borderTop: `1px solid ${token.colorBorder}`, background: token.colorBgElevated, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button size="small" icon={<PaperClipOutlined />} onClick={handlePickFiles} disabled={uploadingMedia}>
                  Media
                </Button>
                <Button size="small" icon={<CameraOutlined />} onClick={handleCheckinPick} disabled={uploadingMedia || requestingCheckinPermission || checkinCaptureOpen}>
                  Check-in
                </Button>
                {uploadingMedia && <Tag color="processing">Dang tai len...</Tag>}
                {requestingCheckinPermission && <Tag color="gold">Dang xin quyen camera + vi tri...</Tag>}
                {pendingFiles.slice(0, 3).map((f, idx) => (
                  <Tag key={`${f.name}-${idx}`} closable onClose={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}>
                    {f.name}
                  </Tag>
                ))}
                {pendingFiles.length > 3 && <Tag>+{pendingFiles.length - 3}</Tag>}
              </div>
              <Input.Group compact style={{ padding: 12, borderTop: `1px solid ${token.colorBorder}`, background: token.colorBgElevated }}>
                <Input
                  style={{ width: 'calc(100% - 44px)' }}
                  value={input}
                  onChange={handleInputChange}
                  onPressEnter={sendMessage}
                  placeholder={t('common.chat.messagePlaceholder')}
                  size="large"
                />
                <Button type="primary" icon={<SendOutlined />} onClick={sendMessage} size="large" loading={uploadingMedia} />
              </Input.Group>
              <input ref={filePickerRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar" style={{ display: 'none' }} onChange={handleSelectFiles} />
            </div>
          </div>
        )}

        {checkinCaptureOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              zIndex: 3100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <div style={{ width: '100%', maxWidth: 520, background: token.colorBgContainer, borderRadius: 12, overflow: 'hidden', border: `1px solid ${token.colorBorder}` }}>
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${token.colorBorder}`, fontWeight: 600 }}>
                Check-in Camera
              </div>
              <div style={{ padding: 12 }}>
                <video ref={checkinVideoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 10, background: '#000', minHeight: 220, objectFit: 'cover' }} />
                {checkinGeo && (
                  <div style={{ marginTop: 8, fontSize: 12, color: token.colorTextSecondary }}>
                    {`Toa do: ${checkinGeo.latitude.toFixed(6)}, ${checkinGeo.longitude.toFixed(6)}`}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 12px 12px' }}>
                <Button onClick={closeCheckinCapture} disabled={uploadingMedia}>Huy</Button>
                <Button type="primary" onClick={handleCaptureCheckin} loading={uploadingMedia}>Chup va gui</Button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Desktop: show floating window
  return (
    <>
      <style>{`
        @keyframes csmChatMessageIn {
          from { opacity: 0; transform: translateY(6px) scale(0.995); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      {/* Floating Chat Button (Desktop fallback khi minimize) */}
      {isMinimized && visible && (
        <FloatingChatButton
          onClick={() => {
            setIsMinimized(false);
          }}
          label={username ? t('common.chat.with', { name: username }) : t('common.chat.withAdmin')}
          visible={true}
          badge={unreadCount}
          isLarge={true}
        />
      )}

      {/* Chat Window */}
      {!isMinimized && visible && (
        <div
          style={{
            position: 'fixed',
            left: position.x,
            top: position.y,
            width: 360,
            height: 480,
            background: token.colorBgContainer,
            border: `1px solid ${token.colorBorder}`,
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            zIndex: 2000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'box-shadow 0.3s ease',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            el.style.boxShadow = '0 12px 32px rgba(0,0,0,0.2)';
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget;
            el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              borderBottom: `1px solid ${token.colorBorder}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: `linear-gradient(135deg, ${token.colorPrimaryBg} 0%, ${token.colorBgTextHover} 100%)`,
              borderRadius: '12px 12px 0 0',
              cursor: isPinned ? 'default' : 'move',
              userSelect: 'none',
            }}
            onMouseDown={handleMouseDown}
          >
            <span style={{ fontWeight: 700, color: token.colorPrimary }}>
              {username ? t('common.chat.with', { name: username }) : t('common.chat.withAdmin')}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                type="text"
                icon={<PushpinOutlined rotate={isPinned ? 45 : 0} />}
                size="small"
                onClick={togglePinned}
                title={isPinned ? t('common.chat.unpin', 'Bỏ ghim') : t('common.chat.pin', 'Ghim vị trí')}
              />
              <Button
                type="text"
                icon={<MinusOutlined />}
                size="small"
                onClick={() => setIsMinimized(true)}
                title={t('common.chat.minimize')}
              />
              <Button type="text" icon={<CloseOutlined />} size="small" onClick={onClose} title={t('common.chat.close', 'Đóng')} />
            </div>
          </div>

          {/* Messages */}
          <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: 12, background: token.colorBgBase }}>
            <List
              dataSource={visibleMessages}
              renderItem={item => {
                const isMyMessage = isGuest
                  ? (item.guestSessionId === effectiveGuestSessionId || item.guestPhone === effectiveGuestPhone || (!item.isAdmin && !item.userId))
                  : item.userId === user.userId;
                const displayName = isMyMessage ? t('common.chat.you') : item.username;
                const messageTime = formatMessageTime(item.timestamp);
                const isReadForCurrent = (() => {
                  if (item.readBy && item.readBy.length > 0) {
                    if (user.userId) return item.readBy.includes(user.userId);
                    if (isGuest && effectiveGuestSessionId) return item.readBy.includes(`guest:${effectiveGuestSessionId}`) || item.readBy.includes(effectiveGuestSessionId);
                  }
                  return false;
                })();
                const showUnreadEmphasis = !isMyMessage && !isReadForCurrent;
                const ownStatus = buildOwnMessageStatus(item);
                const isRecalledMessage = item.eventType === 'message_recalled';
                const isCheckinMessage = item.eventType === 'chat_checkin' || !!item.checkinMeta;
                const isNewMessage = isFreshMessage(item.timestamp);

                const bubbleBackground = isRecalledMessage
                  ? token.colorFillAlter
                  : (isMyMessage ? token.colorBgTextHover : (showUnreadEmphasis ? token.colorPrimaryBg : undefined));

                const bubbleBorderLeft = isRecalledMessage
                  ? `3px dashed ${token.colorTextTertiary}`
                  : (showUnreadEmphasis ? `3px solid ${token.colorPrimary}` : (isCheckinMessage ? `3px solid ${token.colorInfo}` : undefined));

                return (
                  <List.Item
                    style={{
                      background: bubbleBackground,
                      padding: '8px 4px',
                      marginBottom: 6,
                      borderRadius: 4,
                      borderLeft: bubbleBorderLeft,
                      opacity: isRecalledMessage ? 0.88 : 1,
                      animation: isNewMessage ? 'csmChatMessageIn 180ms ease-out' : undefined,
                      transformOrigin: isMyMessage ? 'right center' : 'left center',
                    }}
                  >
                    <List.Item.Meta
                      avatar={item.avatar ? <Avatar src={item.avatar} size="small" /> : <Avatar icon={<UserOutlined />} size="small" />}
                      title={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>
                            {displayName}
                            {item.isAdmin && !isMyMessage && (
                              <span style={{ color: token.colorWarning, marginLeft: 6 }}>
                                [{t('common.chat.admin')}]
                              </span>
                            )}
                            {!isMyMessage && !isReadForCurrent && (
                              <span style={{ color: token.colorPrimary, marginLeft: 8, fontSize: 10 }}>
                                • {t('common.chat.unread', 'Chưa đọc')}
                              </span>
                            )}
                          </span>
                          <span style={{ fontSize: 10, color: token.colorTextSecondary, fontWeight: 400, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {messageTime || ''}
                            {isMyMessage && (
                              <Tooltip title={ownStatus.label}>
                                <span style={{ color: token.colorSuccess, display: 'inline-flex', alignItems: 'center' }}>
                                  {ownStatus.icon}
                                </span>
                              </Tooltip>
                            )}
                          </span>
                        </div>
                      }
                      description={
                        <div>
                          <span style={{ fontSize: 12, color: showUnreadEmphasis ? token.colorText : token.colorTextSecondary, marginTop: 4, fontWeight: showUnreadEmphasis ? 600 : 400, fontStyle: isRecalledMessage ? 'italic' : 'normal' }}>
                            {item.message}
                          </span>
                          {renderMessageAttachments(item)}
                          {item.checkinMeta && (
                            <div style={{ marginTop: 6 }}>
                              <Tag color="blue">📍 Check-in</Tag>
                              <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                                {item.checkinMeta?.timestamp ? new Date(item.checkinMeta.timestamp).toLocaleString('vi-VN') : ''}
                              </div>
                              <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                                {`${item.checkinMeta?.latitude || ''}, ${item.checkinMeta?.longitude || ''}`.trim().replace(/^,\s*|,\s*$/g, '')}
                              </div>
                              <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                                {item.checkinMeta?.address || ''}
                              </div>
                            </div>
                          )}
                        </div>
                      }
                    />
                    {/* Only show delete button for logged-in admin users */}
                    {!isGuest && user.userId && canRecall(item, isMyMessage) && (
                      <Tooltip title={t('common.chat.recallMessage', 'Thu hồi tin nhắn')}>
                        <Popconfirm
                          title={t('common.chat.recallMessageTitle', 'Thu hồi tin nhắn')}
                          description={t('common.chat.recallMessageDesc', 'Tin nhắn sẽ được thu hồi với tất cả người trong cuộc chat.')}
                          onConfirm={() => handleRecallMessage(item)}
                          okText={t('common.confirm', 'Xác nhận')}
                          cancelText={t('common.cancel', 'Hủy')}
                        >
                          <Button
                            type="text"
                            size="small"
                            icon={<EyeOutlined />}
                            style={{ opacity: 0.7, transition: 'opacity 0.2s' }}
                          />
                        </Popconfirm>
                      </Tooltip>
                    )}
                    {!isGuest && user.userId && !isMyMessage && (
                      <Tooltip title={t('common.chat.deleteLocalMessage', 'Xoá phía tôi')}>
                        <Popconfirm
                          title={t('common.chat.deleteLocalMessageTitle', 'Xoá phía tôi')}
                          description={t('common.chat.deleteLocalMessageDesc', 'Tin nhắn sẽ chỉ bị ẩn trong cửa sổ chat của bạn.')}
                          onConfirm={() => handleDeleteMessage(item.timestamp)}
                          okText={t('common.confirm', 'Xác nhận')}
                          cancelText={t('common.cancel', 'Hủy')}
                        >
                          <Button
                            type="text"
                            size="small"
                            icon={<DeleteOutlined />}
                            danger
                            style={{ opacity: 0.6, transition: 'opacity 0.2s' }}
                            onMouseEnter={(e) => {
                              if (e.currentTarget) e.currentTarget.style.opacity = '1';
                            }}
                            onMouseLeave={(e) => {
                              if (e.currentTarget) e.currentTarget.style.opacity = '0.6';
                            }}
                          />
                        </Popconfirm>
                      </Tooltip>
                    )}
                  </List.Item>
                );
              }}
            />
          </div>

          {/* Typing Indicator */}
          {typingUsers[roomKey] && typingUsers[roomKey].length > 0 && (
            <div style={{ padding: '6px 12px', background: token.colorBgElevated, borderTop: `1px solid ${token.colorBorder}`, fontSize: 11, color: token.colorTextSecondary, fontStyle: 'italic' }}>
              💬 {typingUsers[roomKey].join(', ')} {t('common.chat.isTyping', 'đang nhập...')}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '8px 12px 0 12px', borderTop: `1px solid ${token.colorBorder}`, background: token.colorBgElevated, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button size="small" icon={<PaperClipOutlined />} onClick={handlePickFiles} disabled={uploadingMedia}>
              Media
            </Button>
            <Button size="small" icon={<CameraOutlined />} onClick={handleCheckinPick} disabled={uploadingMedia || requestingCheckinPermission || checkinCaptureOpen}>
              Check-in
            </Button>
            {uploadingMedia && <Tag color="processing">Dang tai len...</Tag>}
            {requestingCheckinPermission && <Tag color="gold">Dang xin quyen camera + vi tri...</Tag>}
            {pendingFiles.slice(0, 3).map((f, idx) => (
              <Tag key={`${f.name}-${idx}`} closable onClose={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}>
                {f.name}
              </Tag>
            ))}
            {pendingFiles.length > 3 && <Tag>+{pendingFiles.length - 3}</Tag>}
          </div>
          <Input.Group compact style={{ padding: 12, borderTop: `1px solid ${token.colorBorder}`, background: token.colorBgElevated }}>
            <Input
              style={{ width: 'calc(100% - 48px)' }}
              value={input}
              onChange={handleInputChange}
              onPressEnter={sendMessage}
              placeholder={t('common.chat.messagePlaceholder')}
              size="small"
              autoFocus
            />
            <Button type="primary" icon={<SendOutlined />} onClick={sendMessage} size="small" loading={uploadingMedia} />
          </Input.Group>
          <input ref={filePickerRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar" style={{ display: 'none' }} onChange={handleSelectFiles} />
        </div>
      )}

      {checkinCaptureOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 3100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div style={{ width: '100%', maxWidth: 520, background: token.colorBgContainer, borderRadius: 12, overflow: 'hidden', border: `1px solid ${token.colorBorder}` }}>
            <div style={{ padding: '10px 12px', borderBottom: `1px solid ${token.colorBorder}`, fontWeight: 600 }}>
              Check-in Camera
            </div>
            <div style={{ padding: 12 }}>
              <video ref={checkinVideoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 10, background: '#000', minHeight: 220, objectFit: 'cover' }} />
              {checkinGeo && (
                <div style={{ marginTop: 8, fontSize: 12, color: token.colorTextSecondary }}>
                  {`Toa do: ${checkinGeo.latitude.toFixed(6)}, ${checkinGeo.longitude.toFixed(6)}`}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 12px 12px' }}>
              <Button onClick={closeCheckinCapture} disabled={uploadingMedia}>Huy</Button>
              <Button type="primary" onClick={handleCaptureCheckin} loading={uploadingMedia}>Chup va gui</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InternalChatBox;
