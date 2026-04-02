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
			// Determine primary key field (email, username, or phoneNumber)
			const pkField = currentUser.email ? "email" : (currentUser.username ? "username" : "phoneNumber");
			const pkValue = currentUser.email || currentUser.username || currentUser.phoneNumber;
			
			// Build update object with PK included (required by CsmApi)
			const updateData: any = {
				[pkField]: pkValue, // Include PK in obj_update
				email: values.email,
				phoneNumber: values.phoneNumber,
				full_name: values.full_name,
				avatar: values.avatar,
				description: values.description,
			};
			
			const response = await updateTableData({
				app_id: "csm",
				obj_name: "csm_accounts",
				command: "update",
				obj_update: updateData,
				pk_fields: [pkField], // CsmApi will build e_where from this
			});
			
			if (isUpdateSuccess(response)) {
				message.success(t('personal-center.updateSuccess'));
				// Update user store
				useUserStore.setState({
					email: values.email,
					phoneNumber: values.phoneNumber,
					full_name: values.full_name,
					avatar: values.avatar,
					description: values.description,
				});
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
			// Determine primary key
			const pkField = currentUser.email ? "email" : (currentUser.username ? "username" : "phoneNumber");
			const pkValue = currentUser.email || currentUser.username || currentUser.phoneNumber;
			
			// Send oldPassword and newPassword to backend for verification and encryption
			// Include PK in obj_update as required by CsmApi
			const response = await updateTableData({
				app_id: "csm",
				obj_name: "csm_accounts",
				command: "update",
				obj_update: {
					[pkField]: pkValue, // Include PK in obj_update
					_oldPassword: values.oldPassword,
					_newPassword: values.newPassword,
					_changePassword: true, // Flag to indicate password change
				},
				pk_fields: [pkField], // CsmApi will build e_where from this
			});
			
			if (isUpdateSuccess(response)) {
				message.success(t('personal-center.passwordChangeSuccess'));
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
