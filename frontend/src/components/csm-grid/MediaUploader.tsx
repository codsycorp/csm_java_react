import React, { useState, useCallback } from "react";
import { Upload, Button, message, Image, Modal } from "antd";
import { PictureOutlined, VideoCameraOutlined, DeleteOutlined, CloudUploadOutlined } from "@ant-design/icons";
import type { UploadFile, UploadProps } from "antd";
import { useUserStore } from "#src/store/user";

const APP_ID = "wuweb"; // Backend app_id
const UPLOAD_ENDPOINT = "/upload"; // Backend upload API

/**
 * MediaUploader: Upload và quản lý images + videos
 * Supports single/multiple upload với preview grid
 * Integrates with backend /upload.shtml and /images.shtml
 */
export function MediaUploader({
  value,
  onChange,
  type = "image",
  multiple = true,
  maxCount = 10,
  size = 140,
}: {
  value?: string | string[];
  onChange?: (urls: string | string[]) => void;
  type?: "image" | "video" | "both";
  multiple?: boolean;
  maxCount?: number;
  size?: number; // thumbnail size (square)
}) {
  const user = useUserStore();
  
  // Parse value thành array URLs
  const urls = React.useMemo(() => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [value];
      } catch {
        return [value];
      }
    }
    return [];
  }, [value]);

  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewType, setPreviewType] = useState<"image" | "video">("image");

  const handleUpload: UploadProps["customRequest"] = useCallback(
    async (options: any) => {
      const { file, onSuccess, onError } = options;
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const dataUrl = reader.result as string;
            const originalName = (file as File).name;
            
            // Chuẩn hóa tên file: chữ thường, thay khoảng trắng bằng dấu gạch ngang
            const normalizedName = originalName
              .toLowerCase()
              .replace(/\s+/g, '-') // Thay khoảng trắng bằng -
              .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
              .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
              .replace(/[ìíịỉĩ]/g, 'i')
              .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
              .replace(/[ùúụủũưừứựửữ]/g, 'u')
              .replace(/[ỳýỵỷỹ]/g, 'y')
              .replace(/đ/g, 'd')
              .replace(/[^a-z0-9.\-]/g, ''); // Chỉ giữ chữ, số, dấu . và -
            
            // Upload to backend /upload.shtml với JSON format
            const uploadData = {
              app_id: APP_ID,
              name: normalizedName,
              src: dataUrl // base64 data URL
            };
            
            
            const response = await fetch(UPLOAD_ENDPOINT, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": user.app_token || "",
              },
              body: JSON.stringify(uploadData),
            });
            
            if (!response.ok) {
              throw new Error(`Upload failed: ${response.statusText}`);
            }
            
            // Backend returns: /app_images/{app_id}/{filename}
            const imagePath = await response.text();
            
            // Ensure path starts with /
            const finalPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
            
            const newUrls = multiple ? [...urls, finalPath] : [finalPath];
            onChange?.(multiple ? newUrls : newUrls[0]);
            onSuccess?.("ok");
            message.success(`Đã upload ${normalizedName}`);
          } catch (uploadErr) {
            console.error("Upload error:", uploadErr);
            onError?.(uploadErr as Error);
            message.error("Upload thất bại");
          }
        };
        reader.onerror = () => {
          onError?.(new Error("FileReader failed"));
        };
        reader.readAsDataURL(file as File);
      } catch (err) {
        onError?.(err as Error);
        message.error("Đọc file thất bại");
      }
    },
    [urls, multiple, onChange]
  );

  const handleRemove = useCallback(
    async (url: string) => {
      try {
        // Extract filename from /images.shtml?app_id=xxx&name=filename
        const urlObj = new URL(url, window.location.origin);
        const fileName = urlObj.searchParams.get("name");
        
        if (fileName) {
          // Call backend to delete file
          const formData = new URLSearchParams();
          formData.append("app_id", APP_ID);
          formData.append("cmd", "removeimg");
          formData.append("name", fileName);
          
          const response = await fetch(UPLOAD_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Authorization": user.app_token || "",
            },
            body: formData.toString(),
          });
          
          if (!response.ok) {
            console.warn("Backend delete failed, removing from UI anyway");
          }
        }
      } catch (err) {
        console.error("Delete error:", err);
        // Continue to remove from UI even if backend call fails
      }
      
      const newUrls = urls.filter((u) => u !== url);
      onChange?.(multiple ? newUrls : newUrls[0] || "");
      message.success("Đã xóa");
    },
    [urls, multiple, onChange]
  );

  const handlePreview = useCallback((url: string, mediaType: "image" | "video") => {
    setPreviewUrl(url);
    setPreviewType(mediaType);
  }, []);

  const accept =
    type === "image"
      ? "image/*"
      : type === "video"
      ? "video/*"
      : "image/*,video/*";

  return (
    <div>
      <Upload
        accept={accept}
        customRequest={handleUpload}
        showUploadList={false}
        multiple={multiple}
        disabled={!multiple && urls.length >= 1}
      >
        <Button
          icon={type === "video" ? <VideoCameraOutlined /> : <PictureOutlined />}
          disabled={!multiple && urls.length >= maxCount}
        >
          {type === "video" ? "Thêm Video" : type === "image" ? "Thêm Hình" : "Thêm Media"}
        </Button>
      </Upload>

      {/* Preview area */}
      {urls.length > 0 && (
        multiple ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(auto-fit, ${size}px)`,
              gap: 12,
              marginTop: 12,
              justifyContent: "flex-start",
            }}
          >
            {urls.map((url, idx) => {
              const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(url) || url.includes("video");
              return (
                <div
                  key={idx}
                  style={{
                    position: "relative",
                    width: size,
                    height: size,
                    border: "1px solid #d9d9d9",
                    borderRadius: 6,
                    overflow: "hidden",
                    background: "#fafafa",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  {isVideo ? (
                    <video
                      src={url}
                      style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }}
                      onClick={() => handlePreview(url, "video")}
                    />
                  ) : (
                    <img
                      src={url}
                      alt={`media-${idx}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }}
                      onClick={() => handlePreview(url, "image")}
                    />
                  )}
                  <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    style={{ position: "absolute", top: 4, right: 4 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(url);
                    }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          // Single media: fixed box centered
          <div
            style={{
              marginTop: 12,
              width: size * 1.5,
              maxWidth: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 16
            }}
          >
            <div
              style={{
                flexShrink: 0,
                width: size * 1.2,
                height: size * 0.9,
                border: '1px solid #d9d9d9',
                borderRadius: 8,
                background: '#fafafa',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {(() => {
                const url = urls[0];
                const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(url) || url.includes('video');
                return isVideo ? (
                  <video src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onClick={() => handlePreview(url, 'video')} />
                ) : (
                  <img src={url} alt="media-single" style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} onClick={() => handlePreview(url, 'image')} />
                );
              })()}
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                style={{ position: 'absolute', top: 6, right: 6 }}
                onClick={(e) => { e.stopPropagation(); handleRemove(urls[0]); }}
              />
            </div>
            <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 500 }}>Tên: {urls[0].split('/').pop()}</div>
              <div>Đã chọn 1 file</div>
            </div>
          </div>
        )
      )}

      {/* Preview modal */}
      <Modal
        open={!!previewUrl}
        footer={null}
        onCancel={() => setPreviewUrl("")}
        width={800}
        centered
      >
        {previewType === "video" ? (
          <video src={previewUrl} controls style={{ width: "100%" }} />
        ) : (
          <Image src={previewUrl} alt="preview" style={{ width: "100%" }} preview={false} />
        )}
      </Modal>

      <div style={{ marginTop: 8, fontSize: 12, color: "#999" }}>
        {multiple
          ? `Đã chọn ${urls.length}/${maxCount} file`
          : urls.length > 0
          ? "1 file đã chọn"
          : "Chưa có file"}
      </div>
    </div>
  );
}

export default MediaUploader;
