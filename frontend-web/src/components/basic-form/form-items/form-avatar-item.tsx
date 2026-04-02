import { UploadOutlined } from "@ant-design/icons";

import { Avatar, Button, Upload, message } from "antd";
import type { UploadProps } from "antd";
import ImgCrop from "antd-img-crop";
import { useTranslation } from "react-i18next";
import { useUserStore } from "#src/store/user";

const APP_ID = "wuweb";
const UPLOAD_ENDPOINT = "/upload";

interface FormAvatarItemProps {
	value?: string
	onChange?: (value: any) => void
}

export function FormAvatarItem({ value, onChange }: FormAvatarItemProps) {
	const { t } = useTranslation();
	const user = useUserStore();

	const handleUpload: UploadProps["customRequest"] = async (options: any) => {
		const { file, onSuccess, onError } = options;
		try {
			const reader = new FileReader();
			reader.onload = async () => {
				try {
					const dataUrl = reader.result as string;
					const originalName = (file as File).name;
					
					// Chuẩn hóa tên file
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
					
					const uploadData = {
						app_id: APP_ID,
						name: normalizedName,
						src: dataUrl
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
					
					const imagePath = await response.text();
					const finalPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
					
					onChange?.(finalPath);
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
	};

	return (
		<>
			<div className="flex items-center gap-5">
				<Avatar size={100} src={value} />
				<ImgCrop
					rotationSlider
					aspectSlider
					showReset
					showGrid
					cropShape="rect"
				>
					<Upload
						accept="image/*"
						showUploadList={false}
						customRequest={handleUpload}
					>
						<Button icon={<UploadOutlined />}>
							{t('personal-center.changeAvatar')}
						</Button>
					</Upload>
				</ImgCrop>
			</div>
		</>
	);
}
