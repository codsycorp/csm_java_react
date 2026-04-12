import { BasicContent, FormAvatarItem } from "#src/components";
import { useUserStore } from "#src/store";
import { updateTableData } from "#src/components/csm-grid/CsmApi";

import {
	ProForm,
	ProFormText,
	ProFormTextArea,
} from "@ant-design/pro-components";
import { Form, Input, Button, Card, Divider, message } from "antd";
import { useTranslation } from "react-i18next";
import { useState } from "react";

export default function Profile() {
	const { t } = useTranslation();
	const currentUser = useUserStore();
	const [loading, setLoading] = useState(false);
	const [passwordForm] = Form.useForm();

	const hasRole = (role: string) =>
		(currentUser.roles || []).some(r => String(r || "").toLowerCase() === role.toLowerCase());

	const resolveProfileTarget = () => {
		const isDevOrAdminAccount = Boolean(currentUser.dev) || hasRole("admin") || hasRole("dev");
		const objName = isDevOrAdminAccount ? "csm_accounts" : "csm_group_members";

		const pkField = currentUser.userId
			? "id"
			: (currentUser.email ? "email" : (currentUser.username ? "username" : "phoneNumber"));
		const pkValue = currentUser.userId || currentUser.email || currentUser.username || currentUser.phoneNumber;

		return { objName, pkField, pkValue };
	};

	const isUpdateSuccess = (response: any) => {
		if (!response) return false;
		if (response.success === true) return true;
		if (Number(response.code) === 200) return true;
		if (response.data === "success") return true;
		if (String(response.message || "").toLowerCase() === "ok") return true;
		return false;
	};
	
	const getAvatarURL = () => {
		if (currentUser) {
			if (currentUser.avatar) {
				return currentUser.avatar;
			}
			const url = "https://avatar.vercel.sh/blur.svg?text=U";
			return url;
		}
		return "";
	};


	const handleFinish = async (values: any) => {
		setLoading(true);
		try {
			const { objName, pkField, pkValue } = resolveProfileTarget();
			if (!pkField || !pkValue) {
				message.error(t('personal-center.updateFailed'));
				return;
			}

			// Đảm bảo luôn gửi đủ các trường định danh
			const updateData: any = {
				id: currentUser.userId || pkValue,
				email: values.email,
				username: currentUser.username,
				phoneNumber: values.phoneNumber,
				full_name: values.full_name,
				avatar: values.avatar,
				description: values.description,
			};
			// Nếu pkField không phải là id/email/username/phoneNumber thì vẫn thêm vào
			if (!['id','email','username','phoneNumber','phone_number'].includes(pkField)) {
				updateData[pkField] = pkValue;
			}
			// Đảm bảo các trường định danh luôn có mặt nếu có giá trị
			if (currentUser.email) updateData.email = currentUser.email;
			if (currentUser.username) updateData.username = currentUser.username;
			if (currentUser.phoneNumber) updateData.phoneNumber = currentUser.phoneNumber;

			const response = await updateTableData({
				app_id: "csm",
				obj_name: objName,
				command: "update",
				obj_update: updateData,
				pk_fields: [pkField],
			});

			if (isUpdateSuccess(response)) {
				message.success(t('personal-center.updateSuccess'));
				// Update user store với đúng trường định danh backend trả về
				const updatedRow = response?.updated_row || {};
				useUserStore.setState({
					userId: updatedRow.id ?? currentUser.userId,
					email: updatedRow.email ?? currentUser.email,
					username: updatedRow.username ?? currentUser.username,
					phoneNumber: updatedRow.phoneNumber ?? updatedRow.phone_number ?? currentUser.phoneNumber,
					full_name: updatedRow.full_name ?? values.full_name,
					avatar: updatedRow.avatar ?? values.avatar,
					description: updatedRow.description ?? values.description,
				});
				// Đảm bảo tab profile luôn mở và active sau khi cập nhật
				const { addTab, setActiveKey } = require('#src/store').useTabsStore.getState();
				addTab('/personal-center/my-profile', {
					key: '/personal-center/my-profile',
					label: t('common.menu.profile'),
					closable: true,
					draggable: true,
				});
				setActiveKey('/personal-center/my-profile');
			} else {
				message.error(response?.message || t('personal-center.updateFailed'));
			}
		} catch (error: any) {
			message.error(error.message || t('personal-center.updateFailed'));
		} finally {
			setLoading(false);
		}
	};


	const handleChangePassword = async (values: any) => {
		if (values.newPassword !== values.confirmPassword) {
			message.error(t('personal-center.passwordNotMatch'));
			return;
		}

		setLoading(true);
		try {
			const { objName, pkField, pkValue } = resolveProfileTarget();
			if (!pkField || !pkValue) {
				message.error(t('personal-center.passwordChangeFailed'));
				return;
			}

			// Đảm bảo luôn gửi đủ các trường định danh
			const updateData: any = {
				id: currentUser.userId || pkValue,
				email: currentUser.email,
				username: currentUser.username,
				phoneNumber: currentUser.phoneNumber,
				[pkField]: pkValue,
				_oldPassword: values.oldPassword,
				_newPassword: values.newPassword,
				_changePassword: true,
			};
			// Nếu pkField không phải là id/email/username/phoneNumber thì vẫn thêm vào
			if (!['id','email','username','phoneNumber','phone_number'].includes(pkField)) {
				updateData[pkField] = pkValue;
			}
			// Đảm bảo các trường định danh luôn có mặt nếu có giá trị
			if (currentUser.email) updateData.email = currentUser.email;
			if (currentUser.username) updateData.username = currentUser.username;
			if (currentUser.phoneNumber) updateData.phoneNumber = currentUser.phoneNumber;

			const response = await updateTableData({
				app_id: "csm",
				obj_name: objName,
				command: "update",
				obj_update: updateData,
				pk_fields: [pkField],
			});

			if (isUpdateSuccess(response)) {
				message.success(t('personal-center.passwordChangeSuccess'));
				// Update user store với đúng trường định danh backend trả về (nếu có)
				const updatedRow = response?.updated_row || {};
				useUserStore.setState({
					userId: updatedRow.id ?? currentUser.userId,
					email: updatedRow.email ?? currentUser.email,
					username: updatedRow.username ?? currentUser.username,
					phoneNumber: updatedRow.phoneNumber ?? updatedRow.phone_number ?? currentUser.phoneNumber,
				});
				passwordForm.resetFields();
			} else {
				message.error(response?.message || t('personal-center.passwordChangeFailed'));
			}
		} catch (error: any) {
			message.error(error.message || t('personal-center.passwordChangeFailed'));
		} finally {
			setLoading(false);
		}
	};

	return (
		<BasicContent className="max-w-4xl mx-auto p-6">
			<Card title={<h2 className="text-2xl font-bold m-0">{t('personal-center.myProfile')}</h2>} bordered={false}>
				<ProForm
					layout="vertical"
					onFinish={handleFinish}
					initialValues={{
						...currentUser,
						avatar: getAvatarURL(),
					}}
					submitter={{
						searchConfig: {
							submitText: t('personal-center.save'),
							resetText: t('personal-center.cancel'),
						},
						submitButtonProps: {
							loading,
						},
					}}
					requiredMark
				>
					<ProForm.Item
						name="avatar"
						label={t('personal-center.avatar')}
					>
						<FormAvatarItem />
					</ProForm.Item>
					
				{currentUser.username && (
					<ProFormText
						name="username"
						label={t('personal-center.username')}
						disabled
						tooltip={t('personal-center.username') + " không thể thay đổi"}
					/>
				)}
				
				{currentUser.email && (
					<ProFormText
						name="email"
						label={t('personal-center.email')}
						rules={[
							{
								type: 'email',
								message: 'Email không hợp lệ!',
							},
						]}
					/>
				)}
				
				{currentUser.phoneNumber && (
					<ProFormText
						name="phoneNumber"
						label={t('personal-center.phoneNumber')}
					/>
				)}
				
				<ProFormText
					name="full_name"
					label={t('personal-center.fullName')}
				/>
				
				<ProFormTextArea
					allowClear
					name="description"
					label={t('personal-center.description')}
					placeholder={t('personal-center.description')}
				/>
				</ProForm>
			</Card>

			<Divider />

			<Card title={<h2 className="text-2xl font-bold m-0">{t('personal-center.changePassword')}</h2>} bordered={false} className="mt-6">
				<Form
					form={passwordForm}
					layout="vertical"
					onFinish={handleChangePassword}
				>
					<Form.Item
						name="oldPassword"
						label={t('personal-center.oldPassword')}
						rules={[
							{
								required: true,
								message: t('personal-center.pleaseEnterOldPassword'),
							},
						]}
					>
						<Input.Password placeholder={t('personal-center.oldPassword')} />
					</Form.Item>
					
					<Form.Item
						name="newPassword"
						label={t('personal-center.newPassword')}
						rules={[
							{
								required: true,
								message: t('personal-center.pleaseEnterNewPassword'),
							},
							{
								min: 6,
								message: 'Mật khẩu phải có ít nhất 6 ký tự',
							},
						]}
					>
						<Input.Password placeholder={t('personal-center.newPassword')} />
					</Form.Item>
					
					<Form.Item
						name="confirmPassword"
						label={t('personal-center.confirmPassword')}
						dependencies={['newPassword']}
						rules={[
							{
								required: true,
								message: t('personal-center.pleaseEnterConfirmPassword'),
							},
							({ getFieldValue }) => ({
								validator(_, value) {
									if (!value || getFieldValue('newPassword') === value) {
										return Promise.resolve();
									}
									return Promise.reject(new Error(t('personal-center.passwordNotMatch')));
								},
							}),
						]}
					>
						<Input.Password placeholder={t('personal-center.confirmPassword')} />
					</Form.Item>
					
					<Form.Item>
						<Button type="primary" htmlType="submit" loading={loading}>
							{t('personal-center.save')}
						</Button>
						<Button style={{ marginLeft: 8 }} onClick={() => passwordForm.resetFields()}>
							{t('personal-center.cancel')}
						</Button>
					</Form.Item>
				</Form>
			</Card>
		</BasicContent>
	);
}
