import React from "react";
import WebsiteLayout from "#src/layout/website/WebsiteLayout";
import { useWebsiteMenu } from "#src/layout/website/wu_menu";
import {
  Row,
  Col,
  Card,
  Typography,
  Timeline,
  Space,
  Avatar,
  Progress,
  Button,
} from "antd";
import {
  TeamOutlined,
  TrophyOutlined,
  RocketOutlined,
  BulbOutlined,
  HeartOutlined,
  StarOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
 import { IdcardOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

const { Title, Paragraph } = Typography;

export default function WuAbout() {
  const { t } = useTranslation();
  const menuItems = useWebsiteMenu();

  const skills = [
    { key: "legal_transparency", percent: 95, fallback: "Pháp lý minh bạch & chuẩn" },
    { key: "bank_support", percent: 92, fallback: "Hỗ trợ vay ngân hàng 70% lãi ưu đãi" },
    { key: "west_market_analysis", percent: 90, fallback: "Phân tích thị trường khu Tây" },
    { key: "project_management", percent: 88, fallback: "Quản lý tiến độ & bàn giao" },
    { key: "customer_care", percent: 93, fallback: "Chăm sóc khách hàng 24/7" },
    { key: "negotiation", percent: 89, fallback: "Đàm phán giá trị tối ưu" }
  ];

  return (
  <WebsiteLayout menuItems={menuItems} selectedKey="/ve-chung-toi">
      <div style={{ padding: "24px" }}>
        {/* Header */}
        <Card style={{ marginBottom: "24px", textAlign: "center" }}>
          <Title level={1}>
            {t("website.menu.about", "Về Chúng Tôi")}
          </Title>
          <Paragraph style={{ fontSize: "18px", color: "#666" }}>
            {t("website.about.intro", "Liên Minh Khu Tây chuyên tư vấn, phân phối và kết nối đầu tư bất động sản khu vực phía Tây TPHCM với đội ngũ am hiểu thị trường, pháp lý minh bạch.")}
          </Paragraph>
        </Card>

        <Row gutter={[32, 32]}>
          {/* Mission & Vision */}
          <Col xs={24} lg={12}>
            <Card>
              <Title level={3}>
                <BulbOutlined style={{ marginRight: 8, color: "#1890ff" }} />
                {t("website.about.our_mission", "Sứ Mệnh")}
              </Title>
              <Paragraph>
                {t("website.about.mission_desc", "Kết nối cơ hội đầu tư an toàn, minh bạch; tối ưu giá trị tài sản cho khách hàng tại khu Tây Sài Gòn.")}
              </Paragraph>
              
              <Title level={3} style={{ marginTop: "32px" }}>
                <StarOutlined style={{ marginRight: 8, color: "#52c41a" }} />
                {t("website.about.our_vision", "Tầm Nhìn")}
              </Title>
              <Paragraph>
                {t("website.about.vision_desc", "Trở thành liên minh bất động sản uy tín, dẫn đầu thị trường khu Tây với danh mục dự án chất lượng và dịch vụ trọn gói.")}
              </Paragraph>

              {/* Founder inside Mission & Vision */}
              <Title level={3} style={{ marginTop: "32px" }}>
                <IdcardOutlined style={{ marginRight: 8, color: "#1890ff" }} />
                {t("website.about.founder_title", "Người Sáng Lập & Chủ Sàn")}
              </Title>
              <Paragraph style={{ marginBottom: 8, fontWeight: 600 }}>
                {t("website.about.founder_name", "Nguyễn Viết Hùng")}
              </Paragraph>
              <Paragraph style={{ color: "#1890ff", fontWeight: 600 }}>
                {t("website.about.founder_role", "Chủ sàn giao dịch & Chủ công ty")}
              </Paragraph>
              <Paragraph>
                {t("website.about.founder_bank_experience", "Từng nhiều năm làm Giám đốc khu vực tại các ngân hàng lớn tại Việt Nam.")}
              </Paragraph>
              <Paragraph>
                {t("website.about.founder_exchange_success", "Đã mở và vận hành nhiều sàn giao dịch bất động sản thành công.")}
              </Paragraph>
              <Paragraph style={{ color: "var(--text-secondary)" }}>
                {t("website.about.founder_bio", "Kinh nghiệm tài chính - ngân hàng giúp kết nối vốn, quản trị rủi ro và đàm phán hiệu quả, mang lại lợi ích tối đa cho khách hàng.")}
              </Paragraph>
            </Card>
          </Col>

          {/* Company Timeline */}
          <Col xs={24} lg={12}>
            <Card>
              <Title level={3}>
                <RocketOutlined style={{ marginRight: 8, color: "#fa8c16" }} />
                {t("website.about.our_journey", "Hành Trình Phát Triển")}
              </Title>
              <Timeline
                items={[
                  {
                    color: 'green',
                    children: (
                      <div>
                        <strong>2020</strong> - {t("website.about.founded", "Thành lập sàn giao dịch LMKT")}
                        <br />
                        <small>{t("website.about.founded_desc", "Nguyễn Viết Hùng khởi lập LMKT, đặt nền tảng pháp lý & vận hành")}</small>
                      </div>
                    ),
                  },
                  {
                    color: 'blue',
                    children: (
                      <div>
                        <strong>2021</strong> - {t("website.about.first_projects", "Những dự án đầu tay")}
                        <br />
                        <small>{t("website.about.first_projects_desc", "Ký kết phân phối, hoàn tất 10+ giao dịch cho khách hàng SME")}</small>
                      </div>
                    ),
                  },
                  {
                    color: 'red',
                    children: (
                      <div>
                        <strong>2022</strong> - {t("website.about.team_expansion", "Mở rộng đội ngũ môi giới")}
                        <br />
                        <small>{t("website.about.team_expansion_desc", "Xây dựng 15+ chuyên viên tư vấn giàu kinh nghiệm")}</small>
                      </div>
                    ),
                  },
                  {
                    color: 'gold',
                    children: (
                      <div>
                        <strong>2023</strong> - {t("website.about.enterprise_clients", "Hợp tác ngân hàng & chủ đầu tư")}
                        <br />
                        <small>{t("website.about.enterprise_clients_desc", "Thiết lập liên kết vốn, phân phối với các tập đoàn lớn")}</small>
                      </div>
                    ),
                  },
                  {
                    children: (
                      <div>
                        <strong>2024-2025</strong> - {t("website.about.current_growth", "Phát triển sàn & thương hiệu cá nhân")}
                        <br />
                        <small>{t("website.about.current_growth_desc", "150+ giao dịch thành công, mở rộng hệ sinh thái dự án")}</small>
                      </div>
                    ),
                  },
                ]}
              />
            </Card>
          </Col>
        </Row>

        


        {/* Skills Section */}
        <Card style={{ marginTop: "32px" }}>
          <Title level={2} style={{ textAlign: "center", marginBottom: "32px" }}>
            <TrophyOutlined style={{ marginRight: 8 }} />
            {t("website.about.our_expertise", "Chuyên Môn")}
          </Title>
          <Row gutter={[32, 24]}>
            {skills.map((skill, index) => (
              <Col xs={24} md={12} key={index}>
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontWeight: "bold" }}>
                      {t(`website.about.skills.${skill.key}`, skill.fallback)}
                    </span>
                    <span>{skill.percent}%</span>
                  </div>
                  <Progress percent={skill.percent} strokeColor="#1890ff" />
                </div>
              </Col>
            ))}
          </Row>
        </Card>

        {/* Values Section */}
        <Card style={{ marginTop: "32px" }}>
          <Title level={2} style={{ textAlign: "center", marginBottom: "32px" }}>
            <HeartOutlined style={{ marginRight: 8 }} />
            {t("website.about.our_values", "Giá Trị Cốt Lõi")}
          </Title>
          <Row gutter={[24, 24]}>
            <Col xs={24} md={8}>
              <Card size="small" style={{ textAlign: "center" }}>
                <CheckCircleOutlined style={{ fontSize: "48px", color: "#52c41a", marginBottom: "16px" }} />
                <Title level={4}>{t("website.about.quality", "Chất Lượng")}</Title>
                <Paragraph>
                  {t("website.about.quality_desc", "Pháp lý minh bạch, đối tác dự án uy tín, bàn giao đúng hạn")}
                </Paragraph>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small" style={{ textAlign: "center" }}>
                <TeamOutlined style={{ fontSize: "48px", color: "#1890ff", marginBottom: "16px" }} />
                <Title level={4}>{t("website.about.teamwork", "Hợp Tác")}</Title>
                <Paragraph>
                  {t("website.about.teamwork_desc", "Lấy khách hàng làm trung tâm, đồng hành từ tư vấn đến bàn giao")}
                </Paragraph>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small" style={{ textAlign: "center" }}>
                <BulbOutlined style={{ fontSize: "48px", color: "#fa8c16", marginBottom: "16px" }} />
                <Title level={4}>{t("website.about.innovation", "Đổi Mới")}</Title>
                <Paragraph>
                  {t("website.about.innovation_desc", "Cập nhật xu hướng thị trường, đề xuất giải pháp đầu tư hiệu quả")}
                </Paragraph>
              </Card>
            </Col>
          </Row>
        </Card>

        {/* Call to Action */}
        <Card style={{ marginTop: "32px", textAlign: "center" }}>
          <Title level={3}>
            {t("website.about.join_us", "Tham Gia Cùng Chúng Tôi")}
          </Title>
          <Paragraph style={{ fontSize: "16px", color: "#666" }}>
            {t("website.about.join_desc", "Liên hệ để nhận tư vấn miễn phí, chọn dự án phù hợp và tối ưu hóa đầu tư BĐS khu Tây.")}
          </Paragraph>
          <Space>
            <Button type="primary" size="large" icon={<TeamOutlined />}>
              {t("website.about.careers", "Cơ Hội Nghề Nghiệp")}
            </Button>
            <Button size="large" icon={<HeartOutlined />}>
              {t("website.about.partnership", "Hợp Tác")}
            </Button>
          </Space>
        </Card>
      </div>
    </WebsiteLayout>
  );
}