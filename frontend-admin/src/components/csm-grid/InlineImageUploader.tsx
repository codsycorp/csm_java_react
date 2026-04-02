import React, { useState, useCallback } from "react";
import { Upload, Button, message, Image, Spin, Modal } from "antd";
import { PictureOutlined, DeleteOutlined, CloudUploadOutlined } from "@ant-design/icons";
import type { UploadProps, UploadFile } from "antd";
import { useUserStore } from "#src/store/user";

const UPLOAD_ENDPOINT = "/upload.shtml";

/** Resolve a stored path to a URL usable as img/video src */
function resolveMediaUrl(pathValue: string): string {
  if (!pathValue) return "";
  if (/^https?:\/\//i.test(pathValue)) return pathValue;
  return pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
}

/** Extract { appId, fileName } from a stored URL or path */
function extractUploadTarget(url: string, fallbackAppId: string): { appId: string; fileName: string } | null {
  if (!url) return null;
  try {
    const urlObj = new URL(url, window.location.origin);
    const fileName = urlObj.searchParams.get("name");
    const appId = urlObj.searchParams.get("app_id") || fallbackAppId;
    if (fileName) return { appId, fileName };
  } catch { /* */ }
  const normalized = url.replace(/^https?:\/\/[^/]+/i, "").replace(/^\//, "");
  const match = normalized.match(/^app_images\/([^/]+)\/(.+)$/);
  if (match) return { appId: match[1], fileName: match[2] };
  return null;
}

/**
 * InlineImageUploader: Compact image/video uploader for inline table cell editing
 * Supports single image or video upload with preview
 * Used in table cells with image_inline, album_inline, video_inline or album_video_inline types
 */
export function InlineImageUploader({
  value,
  onChange,
  multiple = false,
  acceptVideo = false,
  size = 48,
  appId,
}: {
  value?: string | string[];
  onChange?: (url: string | string[]) => void;
  multiple?: boolean;
  acceptVideo?: boolean;
  size?: number; // thumbnail size (square)
  appId?: string;
}) {
  const user = useUserStore();
  const currentAppId = appId || user.app_id || "csm";
  // Parse value thành array URLs
  const urls = React.useMemo(() => {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(v => v);
    if (typeof value === "string" && value) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [value];
      } catch {
        return [value];
      }
    }
    return [];
  }, [value]);

  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const handleUpload: UploadProps["customRequest"] = useCallback(
    async (options: any) => {
      const { file, onSuccess, onError } = options;
      setUploading(true);
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const dataUrl = reader.result as string;
            const originalName = (file as File).name;
            
            // Chuẩn hóa tên file: chữ thường, thay khoảng trắng bằng dấu gạch ngang
            const normalizedName = originalName
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
              .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
              .replace(/[ìíịỉĩ]/g, 'i')
              .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
              .replace(/[ùúụủũưừứựửữ]/g, 'u')
              .replace(/[ỳýỵỷỹ]/g, 'y')
              .replace(/đ/g, 'd')
              .replace(/[^a-z0-9.\-]/g, '');
            
            // Upload to backend /upload.shtml với JSON format
            const uploadData = {
              app_id: currentAppId,
              name: normalizedName,
              src: dataUrl // base64 data URL
            };
            
            const response = await fetch(UPLOAD_ENDPOINT, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(uploadData),
            });
            
            if (!response.ok) {
              throw new Error(`Upload failed: ${response.statusText}`);
            }
            
            const responseText = await response.text();
            let parsed: any = null;
            try {
              const trimmed = responseText.trim();
              if (trimmed.startsWith('{')) parsed = JSON.parse(trimmed);
            } catch { /* */ }
            
            const rawPath = (parsed?.path || parsed?.url || responseText).trim();
            const finalPath = resolveMediaUrl(rawPath);
            
            const newUrls = multiple ? [...urls, finalPath] : [finalPath];
            onChange?.(multiple ? newUrls : newUrls[0]);
            onSuccess?.("ok");
            message.success("✅ Upload thành công");
          } catch (uploadErr) {
            console.error("Upload error:", uploadErr);
            onError?.(uploadErr as Error);
            message.error("❌ Upload thất bại");
          } finally {
            setUploading(false);
          }
        };
        reader.onerror = () => {
          setUploading(false);
          onError?.(new Error("FileReader failed"));
        };
        reader.readAsDataURL(file as File);
      } catch (err) {
        setUploading(false);
        onError?.(err as Error);
        message.error("❌ Đọc file thất bại");
      }
    },
    [urls, multiple, onChange, currentAppId]
  );

  const handleRemove = useCallback(
    async (url: string) => {
      try {
        const target = extractUploadTarget(url, currentAppId);
        if (target) {
          const formData = new URLSearchParams();
          formData.append("app_id", target.appId);
          formData.append("cmd", "removeimg");
          formData.append("name", target.fileName);
          await fetch(UPLOAD_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString(),
          }).catch(err => console.error("Delete error:", err));
        }
      } catch (err) {
        console.error("Delete error:", err);
      }
      const newUrls = urls.filter((u) => u !== url);
      onChange?.(multiple ? newUrls : newUrls[0] || "");
      message.success("✅ Đã xóa");
    },
    [urls, multiple, onChange, currentAppId]
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {/* Preview thumbnail(s) */}
      {urls.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {urls.slice(0, multiple ? undefined : 1).map((url, i) => (
            <div
              key={i}
              style={{
                position: "relative",
                width: size,
                height: size,
                borderRadius: 4,
                overflow: "hidden",
                border: "1px solid #ddd",
                backgroundColor: acceptVideo ? "#000" : undefined,
              }}
            >
              {acceptVideo ? (
                <video
                  src={resolveMediaUrl(url)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    cursor: "pointer",
                  }}
                  onClick={() => setPreviewUrl(url)}
                />
              ) : (
                <img
                  src={resolveMediaUrl(url)}
                  alt="thumbnail"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    cursor: "pointer",
                  }}
                  onClick={() => setPreviewUrl(url)}
                />
              )}
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => handleRemove(url)}
                danger
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0,
                  background: "rgba(0,0,0,0.45)",
                  transition: "opacity 0.3s",
                }}
                onMouseEnter={(e) => {
                  const btn = e.currentTarget as HTMLElement;
                  btn.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  const btn = e.currentTarget as HTMLElement;
                  btn.style.opacity = "0";
                }}
              />
            </div>
          ))}
          {multiple && urls.length > 1 && (
            <span style={{ fontSize: 12, color: "#999" }}>+{urls.length - 1}</span>
          )}
        </div>
      )}

      {/* Upload button */}
      <Spin spinning={uploading}>
        <Upload
          accept={acceptVideo ? "video/*" : "image/*"}
          customRequest={handleUpload}
          showUploadList={false}
          multiple={multiple}
          disabled={!multiple && urls.length >= 1}
        >
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            size="small"
            disabled={!multiple && urls.length >= 1 || uploading}
            style={{ minWidth: 0 }}
          >
            {uploading ? "..." : acceptVideo ? "🎬" : <PictureOutlined />}
          </Button>
        </Upload>
      </Spin>

      {/* Preview modal */}
      {previewUrl && acceptVideo ? (
        <Modal
          title="Xem Video"
          open={!!previewUrl}
          onCancel={() => setPreviewUrl("")}
          footer={null}
          width={600}
        >
          <video src={previewUrl} controls autoPlay style={{ width: "100%", borderRadius: 8 }} />
        </Modal>
      ) : (
        previewUrl && (
          <Image
            src={previewUrl}
            preview={{
              mask: "Xem",
              onVisibleChange: (v) => !v && setPreviewUrl(""),
            }}
            style={{ display: "none" }}
          />
        )
      )}
    </div>
  );
}
