import React, { useState, useCallback } from "react";
import { Upload, Button, message, Image, Spin } from "antd";
import { PictureOutlined, DeleteOutlined, CloudUploadOutlined } from "@ant-design/icons";
import type { UploadProps, UploadFile } from "antd";

const APP_ID = "wuweb"; // Backend app_id
const UPLOAD_ENDPOINT = "/upload"; // Backend upload API

/**
 * InlineImageUploader: Compact image uploader for inline table cell editing
 * Supports single image upload with preview
 * Used in table cells with image_inline or album_inline types
 */
export function InlineImageUploader({
  value,
  onChange,
  multiple = false,
  size = 48,
}: {
  value?: string | string[];
  onChange?: (url: string | string[]) => void;
  multiple?: boolean;
  size?: number; // thumbnail size (square)
}) {
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
              app_id: APP_ID,
              name: normalizedName,
              src: dataUrl // base64 data URL
            };
            
            const response = await fetch(UPLOAD_ENDPOINT, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(uploadData),
            });
            
            if (!response.ok) {
              throw new Error(`Upload failed: ${response.statusText}`);
            }
            
            // Backend returns: /app_images/{app_id}/{filename}
            const imagePath = await response.text();
            const finalPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
            
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
    [urls, multiple, onChange]
  );

  const handleRemove = useCallback(
    async (url: string) => {
      try {
        const fileName = url;
        if (fileName) {
          const formData = new URLSearchParams();
          formData.append("app_id", APP_ID);
          formData.append("cmd", "removeimg");
          formData.append("name", fileName);
          
          await fetch(UPLOAD_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
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
    [urls, multiple, onChange]
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
              }}
            >
              <img
                src={url}
                alt="thumbnail"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  cursor: "pointer",
                }}
                onClick={() => setPreviewUrl(url)}
              />
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
          accept="image/*"
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
            {uploading ? "..." : <PictureOutlined />}
          </Button>
        </Upload>
      </Spin>

      {/* Preview modal */}
      {previewUrl && (
        <Image
          src={previewUrl}
          preview={{
            mask: "Xem",
            onVisibleChange: (v) => !v && setPreviewUrl(""),
          }}
          style={{ display: "none" }}
        />
      )}
    </div>
  );
}
