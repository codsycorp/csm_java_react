import { BasicContent, FormAvatarItem } from "#src/components";
import { updateTableData } from "#src/components/csm-grid/CsmApi";
import { useUserStore } from "#src/store";
import { useTabsStore } from "#src/store/tabs";

import {
	ProForm,
	ProFormText,
	ProFormTextArea,
} from "@ant-design/pro-components";
import { Button, Card, Divider, Form, Input, message } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function Profile() {
	const { t } = useTranslation();
	const currentUser = useUserStore();
	const [loading, setLoading] = useState(false);
	const [passwordForm] = Form.useForm();

	const resolvePrimaryIdentity = () => {
		const username = String(currentUser.username || "").trim();
		if (username)
			return { field: "username", value: username };
		const email = String(currentUser.email || "").trim();
		if (email)
			return { field: "email", value: email };
		const phoneNumber = String(currentUser.phoneNumber || "").trim();
		if (phoneNumber)
			return { field: "phoneNumber", value: phoneNumber };
		return { field: "", value: "" };
	};

	const resolveProfileTarget = () => {
		const accountType = String((currentUser as any).account_type || "").trim().toLowerCase();
		const isSubUserByFlag = Boolean((currentUser as any).is_sub_user) || accountType === "sub-user";
		// Sub-user can still have admin permission; account table must follow identity type, not role alone.
		const objName = isSubUserByFlag ? "csm_group_members" : "csm_accounts";
		const userId = String(currentUser.userId || "").trim();
		const identity = resolvePrimaryIdentity();
		const loginIdentifier = String((currentUser as any).login_identifier || "").trim() || identity.value;

		const pkFields = objName === "csm_group_members"
			? (userId ? ["id", "login_identifier"] : ["login_identifier"])
			: (userId ? ["id"] : (identity.field ? [identity.field] : []));

		const where: Record<string, any> = {};
		if (userId)
			where.id = userId;
		if (objName === "csm_group_members" && loginIdentifier) {
			where.login_identifier = loginIdentifier;
		}
		if (!userId && objName === "csm_accounts" && identity.field && identity.value) {
			where[identity.field] = identity.value;
		}

		return { objName, pkFields, where, loginIdentifier, userId, identityField: identity.field };
	};

	const isUpdateSuccess = (response: any) => {
		if (!response)
			return false;
		if (response.success === true)
			return true;
		if (Number(response.code) === 200)
			return true;
		if (response.data === "success")
			return true;
		if (String(response.message || "").toLowerCase() === "ok")
			return true;
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
			const { objName, pkFields, where } = resolveProfileTarget();
			if (!pkFields?.length || Object.keys(where).length === 0) {
				message.error(t("personal-center.updateFailed"));
				return;
			}

			// Chỉ gửi các trường được phép chỉnh sửa trong profile
			const updateData: any = {
				full_name: values.full_name,
				avatar: values.avatar,
				description: values.description,
			};

			const response = await updateTableData({
				app_id: "csm",
				obj_name: objName,
				command: "update",
				obj_update: updateData,
				pk_fields: pkFields,
				where,
			});

			if (isUpdateSuccess(response)) {
				message.success(t("personal-center.updateSuccess"));
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
				try {
					await useUserStore.getState().getUserInfo();
				}
				catch (syncErr) {
					console.warn("[Profile] Sync user-info after update failed:", syncErr);
				}
				// Đảm bảo tab profile luôn mở và active sau khi cập nhật
				const { addTab, setActiveKey } = useTabsStore.getState();
				addTab("/personal-center/my-profile", {
					key: "/personal-center/my-profile",
					label: t("common.menu.profile"),
					closable: true,
					draggable: true,
				});
				setActiveKey("/personal-center/my-profile");
			}
			else {
				message.error(response?.message || t("personal-center.updateFailed"));
			}
		}
		catch (error: any) {
			message.error(error.message || t("personal-center.updateFailed"));
		}
		finally {
			setLoading(false);
		}
	};

	const handleChangePassword = async (values: any) => {
		if (values.newPassword !== values.confirmPassword) {
			message.error(t("personal-center.passwordNotMatch"));
			return;
		}

		setLoading(true);
		try {
			const { objName, pkFields, where, loginIdentifier } = resolveProfileTarget();
			if (!pkFields?.length || Object.keys(where).length === 0) {
				message.error(t("personal-center.passwordChangeFailed"));
				return;
			}

			const updateData: any = {
				_oldPassword: values.oldPassword,
				_newPassword: values.newPassword,
				_changePassword: true,
			};
			if (objName === "csm_group_members" && loginIdentifier) {
				updateData.login_identifier = loginIdentifier;
			}

			const response = await updateTableData({
				app_id: "csm",
				obj_name: objName,
				command: "update",
				obj_update: updateData,
				pk_fields: pkFields,
				where,
			});

			if (isUpdateSuccess(response)) {
				message.success(t("personal-center.passwordChangeSuccess"));
				// Update user store với đúng trường định danh backend trả về (nếu có)
				const updatedRow = response?.updated_row || {};
				useUserStore.setState({
					userId: updatedRow.id ?? currentUser.userId,
					email: updatedRow.email ?? currentUser.email,
					username: updatedRow.username ?? currentUser.username,
					phoneNumber: updatedRow.phoneNumber ?? updatedRow.phone_number ?? currentUser.phoneNumber,
				});
				passwordForm.resetFields();
			}
			else {
				message.error(response?.message || t("personal-center.passwordChangeFailed"));
			}
		}
		catch (error: any) {
			message.error(error.message || t("personal-center.passwordChangeFailed"));
		}
		finally {
			setLoading(false);
		}
	};

	return (
		<BasicContent className="max-w-4xl mx-auto p-6">
			<Card title={<h2 className="text-2xl font-bold m-0">{t("personal-center.myProfile")}</h2>} bordered={false}>
				<ProForm
					layout="vertical"
					onFinish={handleFinish}
					initialValues={{
						...currentUser,
						avatar: getAvatarURL(),
					}}
					submitter={{
						searchConfig: {
							submitText: t("personal-center.save"),
							resetText: t("personal-center.cancel"),
						},
						submitButtonProps: {
							loading,
						},
					}}
					requiredMark
				>
					<ProForm.Item
						name="avatar"
						label={t("personal-center.avatar")}
					>
						<FormAvatarItem />
					</ProForm.Item>

					{currentUser.username && (
						<ProFormText
							name="username"
							label={t("personal-center.username")}
							disabled
							tooltip={`${t("personal-center.username")} không thể thay đổi`}
						/>
					)}

					<ProFormText
						name="full_name"
						label={t("personal-center.fullName")}
					/>

					<ProFormTextArea
						allowClear
						name="description"
						label={t("personal-center.description")}
						placeholder={t("personal-center.description")}
					/>
				</ProForm>
			</Card>

			<Divider />

			<Card title={<h2 className="text-2xl font-bold m-0">{t("personal-center.changePassword")}</h2>} bordered={false} className="mt-6">
				<Form
					form={passwordForm}
					layout="vertical"
					onFinish={handleChangePassword}
				>
					<Form.Item
						name="oldPassword"
						label={t("personal-center.oldPassword")}
						rules={[
							{
								required: true,
								message: t("personal-center.pleaseEnterOldPassword"),
							},
						]}
					>
						<Input.Password placeholder={t("personal-center.oldPassword")} />
					</Form.Item>

					<Form.Item
						name="newPassword"
						label={t("personal-center.newPassword")}
						rules={[
							{
								required: true,
								message: t("personal-center.pleaseEnterNewPassword"),
							},
							{
								min: 6,
								message: "Mật khẩu phải có ít nhất 6 ký tự",
							},
						]}
					>
						<Input.Password placeholder={t("personal-center.newPassword")} />
					</Form.Item>

					<Form.Item
						name="confirmPassword"
						label={t("personal-center.confirmPassword")}
						dependencies={["newPassword"]}
						rules={[
							{
								required: true,
								message: t("personal-center.pleaseEnterConfirmPassword"),
							},
							({ getFieldValue }) => ({
								validator(_, value) {
									if (!value || getFieldValue("newPassword") === value) {
										return Promise.resolve();
									}
									return Promise.reject(new Error(t("personal-center.passwordNotMatch")));
								},
							}),
						]}
					>
						<Input.Password placeholder={t("personal-center.confirmPassword")} />
					</Form.Item>

					<Form.Item>
						<Button type="primary" htmlType="submit" loading={loading}>
							{t("personal-center.save")}
						</Button>
						<Button style={{ marginLeft: 8 }} onClick={() => passwordForm.resetFields()}>
							{t("personal-center.cancel")}
						</Button>
					</Form.Item>
				</Form>
			</Card>
		</BasicContent>
	);
}
