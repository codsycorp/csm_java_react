import React, { useState, useEffect } from "react";
import WebsiteLayout from "#src/layout/website/WebsiteLayout";
import { useWebsiteMenu } from "#src/layout/website/wu_menu";
import { useSocket } from "#src/hooks/useSocket";
import { useAppStore, useUserStore } from "#src/store";
import { useGuestPhone } from "#src/hooks/useGuestPhone";
import {
  Row,
  Col,
  Card,
  Typography,
  Form,
  Input,
  Button,
  Space,
  message,
  Divider,
} from "antd";
import {
  PhoneOutlined,
  MailOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
  SendOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

interface ContactForm {
  name: string;
  phone: string;
  message?: string;
}


export default function WuContact() {
  const { t } = useTranslation();
  const menuItems = useWebsiteMenu();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // Lấy app_id ưu tiên:
  // 1. Nếu đã đăng nhập (userStore.app_id) => dùng app_id của user
  // 2. Nếu chưa đăng nhập => lấy app_id từ useAppStore (đã đồng bộ từ SSR DATA)
  const userAppId = useUserStore((state) => state.app_id);
  const storeAppId = useAppStore((state) => state.currentAppId);
  const appId = userAppId && userAppId.trim() ? userAppId : storeAppId;
  
  // Guest phone management - đồng bộ với chat
  const { guestPhone, setGuestPhone, isGuest, setChatUrl } = useGuestPhone();

  // Khi SSR DATA có app_id mà store chưa có, đồng bộ vào store
  useEffect(() => {
    if (!storeAppId && typeof window !== 'undefined' && (window as any).__INITIAL_REACT_DATA__?.app_id) {
      useAppStore.getState().setCurrentAppId((window as any).__INITIAL_REACT_DATA__.app_id);
    }
  }, [storeAppId]);

  // Load saved phone into form if guest has saved phone
  useEffect(() => {
    if (guestPhone && guestPhone.trim() && isGuest) {
      form.setFieldsValue({ phone: guestPhone });
    }
  }, [guestPhone, isGuest, form]);

  // Sử dụng socket
  const { socket, connected } = useSocket({ enabled: true });

  const handleSubmit = async (values: ContactForm) => {
    setLoading(true);
    try {
      // Lưu số điện thoại vào localStorage để đồng bộ với chat
      if (isGuest && values.phone && values.phone.trim()) {
        setGuestPhone(values.phone.trim());
        // Save chat URL for first-time chat
        setChatUrl(window.location.href);
      }
      
      // Gửi tin nhắn chat qua socket đến admin/app room với đầy đủ thông tin
      if (socket && connected && appId) {
        const phone = values.phone?.trim() || "";
        const actualRoom = isGuest && phone ? `guest:${appId};${phone}` : `app:${appId}`;
        
        socket.emit("chat", {
          room: actualRoom,
          appId: appId,
          username: isGuest ? phone : values.name,
          userId: undefined,
          avatar: undefined,
          isAdmin: false,
          message: values.message || "(Không có nội dung)",
          guestPhone: isGuest ? phone : undefined,
          to: undefined,
          eventType: "contact_form",
          readBy: [],
          timestamp: Date.now()
        });
      }
      
      message.success(t("website.contact.message_sent", "Tin nhắn đã được gửi thành công!"));
      
      // Mở chat window để khách thấy tin nhắn đã gửi
      setTimeout(() => {
        if (typeof window !== 'undefined' && (window as any).openWebsiteChat) {
          (window as any).openWebsiteChat();
        }
      }, 500);
      
      form.resetFields();
      // Restore phone if guest
      if (isGuest && values.phone) {
        form.setFieldsValue({ phone: values.phone });
      }
    } catch (error) {
      message.error(t("website.contact.message_error", "Có lỗi xảy ra, vui lòng thử lại!"));
    } finally {
      setLoading(false);
    }
  };

  const contactInfo = [
    {
      icon: <PhoneOutlined style={{ fontSize: "24px", color: "#1890ff" }} />,
      title: t("website.contact.phone", "Hotline"),
      content: "0909879885",
      description: "Phòng Kinh Doanh Liên Minh Khu Tây"
    },
    {
      icon: <MailOutlined style={{ fontSize: "24px", color: "#52c41a" }} />,
      title: "Email",
      content: "phongkinhdoanhlmkt@gmail.com",
      description: t("website.contact.email_support", "Hỗ trợ 24/7")
    },
    {
      icon: <EnvironmentOutlined style={{ fontSize: "24px", color: "#fa8c16" }} />,
      title: t("website.contact.address", "Địa Chỉ"),
      content: "1472 Võ Văn Kiệt, Phường Bình Tiên, TPHCM",
      description: "Văn phòng giao dịch bất động sản khu Tây"
    },
    {
      icon: <ClockCircleOutlined style={{ fontSize: "24px", color: "#722ed1" }} />,
      title: t("website.contact.working_hours", "Giờ Làm Việc"),
      content: "8:00 - 18:00",
      description: t("website.contact.monday_friday", "Thứ 2 - Thứ 6")
    }
  ];

  return (
  <WebsiteLayout menuItems={menuItems} selectedKey="/lien-he">
      <div style={{ padding: "24px" }}>
        {/* Header */}
        <Card style={{ marginBottom: "24px", textAlign: "center" }}>
          <Title level={1}>
            {t("website.menu.contact", "Liên Hệ Liên Minh Khu Tây")}
          </Title>
          <Paragraph style={{ fontSize: "18px", color: "#666" }}>
            {t("website.contact.intro", "Liên Minh Khu Tây chuyên cung cấp dịch vụ bất động sản khu vực phía Tây TPHCM. Mọi thông tin giao dịch, tư vấn, hỗ trợ vui lòng liên hệ hotline hoặc đến trực tiếp văn phòng.")}
          </Paragraph>
        </Card>

        <Row gutter={[32, 32]}>
          {/* Contact Information */}
          <Col xs={24} lg={8}>
            <Card>
              <Title level={3} style={{ marginBottom: "24px" }}>
                {t("website.contact.info", "Thông Tin Liên Hệ")}
              </Title>
              <Space direction="vertical" size="large" style={{ width: "100%" }}>
                {contactInfo.map((info, index) => (
                  <div key={index} style={{ display: "flex", alignItems: "flex-start" }}>
                    <div style={{ marginRight: "16px", marginTop: "4px" }}>
                      {info.icon}
                    </div>
                    <div>
                      <Title level={5} style={{ margin: 0, marginBottom: "4px" }}>
                        {info.title}
                      </Title>
                      <Paragraph style={{ margin: 0, fontWeight: "bold" }}>
                        {info.content}
                      </Paragraph>
                      <Paragraph style={{ margin: 0, color: "#666", fontSize: "14px" }}>
                        {info.description}
                      </Paragraph>
                    </div>
                  </div>
                ))}
              </Space>

              <Divider />

              <Title level={4}>
                {t("website.contact.follow_us", "Theo Dõi Chúng Tôi")}
              </Title>
              <Space>
                <Button type="primary" shape="circle" size="large">
                  f
                </Button>
                <Button type="primary" shape="circle" size="large" style={{ backgroundColor: "#1DA1F2" }}>
                  T
                </Button>
                <Button type="primary" shape="circle" size="large" style={{ backgroundColor: "#0077B5" }}>
                  in
                </Button>
                <Button type="primary" shape="circle" size="large" style={{ backgroundColor: "#25D366" }}>
                  W
                </Button>
              </Space>
            </Card>
          </Col>

          {/* Contact Form */}
          <Col xs={24} lg={16}>
            <Card>
              <Title level={3} style={{ marginBottom: "24px" }}>
                {t("website.contact.send_message", "Gửi Tin Nhắn")}
              </Title>
              <Form
                form={form}
                layout="vertical"
                onFinish={handleSubmit}
                size="large"
              >
                <Row gutter={[16, 0]}>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      name="name"
                      label={t("website.contact.full_name", "Họ và Tên")}
                      rules={[
                        { required: true, message: t("website.contact.name_required", "Vui lòng nhập họ tên!") }
                      ]}
                    >
                      <Input prefix={<UserOutlined />} placeholder={t("website.contact.enter_name", "Nhập họ và tên")} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      name="phone"
                      label={t("website.contact.phone", "Số Điện Thoại")}
                      rules={[
                        { required: true, message: t("website.contact.phone_required", "Vui lòng nhập số điện thoại!") }
                      ]}
                    >
                      <Input prefix={<PhoneOutlined />} placeholder={t("website.contact.enter_phone", "Nhập số điện thoại")} />
                    </Form.Item>
                  </Col>
                </Row>



                <Form.Item
                  name="message"
                  label={t("website.contact.message", "Tin Nhắn")}
                >
                  <TextArea
                    rows={6}
                    placeholder={t("website.contact.enter_message", "Nhập tin nhắn của bạn...")}
                  />
                </Form.Item>

                <Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                    icon={<SendOutlined />}
                    size="large"
                    style={{ minWidth: "150px" }}
                  >
                    {loading ? t("website.contact.sending", "Đang gửi...") : t("website.contact.send_message", "Gửi Tin Nhắn")}
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          </Col>
        </Row>

        {/* Map Section */}
        <Card style={{ marginTop: "24px" }}>
          <Title level={3} style={{ marginBottom: "24px" }}>
            {t("website.contact.find_us", "Tìm Chúng Tôi")}
          </Title>
          <div
            style={{
              width: "100%",
              height: "400px",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "18px"
            }}
          >
            🗺️ {t("website.contact.map_placeholder", "Bản đồ sẽ được tích hợp tại đây")}
          </div>
        </Card>
      </div>
    </WebsiteLayout>
  );
}