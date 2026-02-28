import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { Upload, Button, message, Tabs, theme } from "antd";
import { PictureOutlined, VideoCameraOutlined, CodeOutlined, EyeOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import "./HtmlEditor.css";

const APP_ID = "wuweb"; // Backend app_id
const UPLOAD_ENDPOINT = "/upload"; // Backend upload API

/**
 * Rich Text Editor using React Quill with WYSIWYG interface
 * Integrates with backend /upload.shtml for media uploads
 * Supports both visual editing and HTML source code view
 * Automatically syncs with Ant Design theme colors
 */
export function HtmlEditor({
  value,
  onChange,
  placeholder = "Nhập nội dung...",
  rows = 12,
}: {
  value?: string;
  onChange?: (val: string) => void;
  placeholder?: string;
  rows?: number;
}) {
    // Ensure value is always a string
    const safeValue = typeof value === 'string' ? value : (value === undefined || value === null ? '' : String(value));

    const [uploading, setUploading] = useState(false);
    const [viewMode, setViewMode] = useState<"editor" | "source" | "preview">("editor");
    const quillRef = useRef<ReactQuill>(null);
    const { token } = theme.useToken();

    const handleChange = useCallback(
      (content: string) => {
        try {
          const newValue = typeof content === 'string' ? content : String(content ?? '');
          if (newValue !== safeValue) {
            onChange?.(newValue);
          }
        } catch (err) {
          // Prevent runtime error from bubbling up
          console.error('HtmlEditor onChange error:', err);
        }
      },
      [onChange, safeValue]
    );

  const handleMediaUpload: UploadProps["customRequest"] = useCallback(
    async (options: any) => {
      const { file, onSuccess, onError } = options;
      setUploading(true);
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const dataUrl = reader.result as string;
            const fileName = (file as File).name;
            const isVideo = /video/.test((file as File).type);
            
            // Upload to backend
            const formData = new URLSearchParams();
            formData.append("app_id", APP_ID);
            formData.append("name", fileName);
            formData.append("src", dataUrl);
            
            const response = await fetch(UPLOAD_ENDPOINT, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: formData.toString(),
            });
            
            if (!response.ok) {
              throw new Error(`Upload failed: ${response.statusText}`);
            }
            
            // Parse response to get actual file path
            const responseText = await response.text();
            
            let viewUrl: string;
            
            // Backend returns: app_images/{app_id}/{filename} (text/plain)
            // We need to convert this to viewing URL
            if (responseText.includes("app_images/")) {
              // Extract the path from response
              const filePath = responseText.trim();
              // Use /images.shtml with app_id and name extracted from path
              const match = filePath.match(/app_images\/([^/]+)\/(.+)$/);
              if (match) {
                const [, appId, name] = match;
                viewUrl = `/images.shtml?app_id=${appId}&name=${name}`;
              } else {
                // Fallback: assume the response is just the filename
                viewUrl = `/images.shtml?app_id=${APP_ID}&name=${fileName}`;
              }
            } else {
              // Try to parse as JSON
              try {
                const responseJson = JSON.parse(responseText);
                viewUrl = responseJson.url || responseJson.path || `/images.shtml?app_id=${APP_ID}&name=${fileName}`;
              } catch {
                // Fallback
                viewUrl = `/images.shtml?app_id=${APP_ID}&name=${fileName}`;
              }
            }
            
            // Insert into Quill editor
            const quill = quillRef.current?.getEditor();
            if (quill) {
              const range = quill.getSelection(true);
              if (isVideo) {
                quill.insertEmbed(range.index, "video", viewUrl);
              } else {
                quill.insertEmbed(range.index, "image", viewUrl);
              }
              quill.setSelection(range.index + 1, 0);
            }
            
            onSuccess?.("ok");
            message.success(`Đã thêm ${isVideo ? "video" : "hình"} vào nội dung`);
          } catch (uploadErr) {
            console.error("Upload error:", uploadErr);
            onError?.(uploadErr as Error);
            message.error("Upload thất bại");
          }
        };
        reader.onerror = () => onError?.(new Error("FileReader failed"));
        reader.readAsDataURL(file as File);
      } catch (err) {
        onError?.(err as Error);
        message.error("Đọc file thất bại");
      } finally {
        setUploading(false);
      }
    },
    []
  );

  // Quill modules configuration
  const modules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [1, 2, 3, 4, 5, 6, false] }],
          [{ font: [] }],
          [{ size: ["small", false, "large", "huge"] }],
          ["bold", "italic", "underline", "strike"],
          [{ color: [] }, { background: [] }],
          [{ script: "sub" }, { script: "super" }],
          [{ list: "ordered" }, { list: "bullet" }],
          [{ indent: "-1" }, { indent: "+1" }],
          [{ align: [] }],
          ["blockquote", "code-block"],
          ["link"],
          ["clean"],
        ],
      },
      clipboard: {
        matchVisual: false,
      },
    }),
    []
  );

  const formats = [
    "header",
    "font",
    "size",
    "bold",
    "italic",
    "underline",
    "strike",
    "color",
    "background",
    "script",
    "list",
    "bullet",
    "indent",
    "align",
    "blockquote",
    "code-block",
    "link",
    "image",
    "video",
  ];

  // Custom toolbar with media upload
  const customToolbar = (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: "8px 12px",
        background: token.colorBgLayout,
        borderBottom: `1px solid ${token.colorBorder}`,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <Upload
        accept="image/*"
        customRequest={handleMediaUpload}
        showUploadList={false}
      >
        <Button
          size="small"
          icon={<PictureOutlined />}
          loading={uploading}
          title="Upload hình ảnh"
        >
          Hình
        </Button>
      </Upload>
      <Upload
        accept="video/*"
        customRequest={handleMediaUpload}
        showUploadList={false}
      >
        <Button
          size="small"
          icon={<VideoCameraOutlined />}
          loading={uploading}
          title="Upload video"
        >
          Video
        </Button>
      </Upload>
    </div>
  );

  return (
    <div className="html-editor-wrapper" style={{ width: "100%" }}>
      <Tabs
        activeKey={viewMode}
        onChange={(key) => setViewMode(key as any)}
        size="small"
        items={[
          {
            key: "editor",
            label: (
              <span>
                <EyeOutlined /> Soạn thảo
              </span>
            ),
          },
          {
            key: "source",
            label: (
              <span>
                <CodeOutlined /> HTML
              </span>
            ),
          },
          {
            key: "preview",
            label: (
              <span>
                <EyeOutlined /> Xem trước
              </span>
            ),
          },
        ]}
      />
      <>
        {viewMode === "editor" && (
          <div>
            {customToolbar}
            <ReactQuill
              ref={quillRef}
              theme="snow"
              value={safeValue}
              onChange={handleChange}
              modules={modules}
              formats={formats}
              placeholder={placeholder}
              style={{
                background: token.colorBgContainer,
                minHeight: `${rows * 24}px`,
              }}
            />
          </div>
        )}

        {viewMode === "source" && (
          <textarea
            value={safeValue}
            onChange={e => {
              try {
                onChange?.(typeof e.target.value === 'string' ? e.target.value : String(e.target.value ?? ''));
              } catch (err) {
                console.error('HtmlEditor textarea onChange error:', err);
              }
            }}
            placeholder="Nhập hoặc chỉnh sửa HTML..."
            rows={rows}
            style={{
              width: "100%",
              fontFamily: "Consolas, Monaco, 'Courier New', monospace",
              fontSize: 13,
              lineHeight: 1.6,
              padding: 12,
              border: `1px solid ${token.colorBorder}`,
              borderRadius: token.borderRadius,
              background: token.colorBgContainer,
              color: token.colorText,
              resize: "vertical",
            }}
          />
        )}

        {viewMode === "preview" && (
          <div
            className="html-preview-content"
            style={{
              padding: 16,
              border: `1px solid ${token.colorBorder}`,
              borderRadius: token.borderRadius,
              background: token.colorBgContainer,
              minHeight: `${rows * 24}px`,
              maxHeight: 600,
              overflow: "auto",
              lineHeight: 1.8,
              whiteSpace: "pre-wrap", // Preserve line breaks and spaces
              wordWrap: "break-word", // Break long words
            }}
            dangerouslySetInnerHTML={{ 
              __html: safeValue || `<p style='color:${token.colorTextDescription}'>Chưa có nội dung</p>` 
            }}
          />
        )}
      </>
    </div>
  );
}

export default HtmlEditor;
