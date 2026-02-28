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
import { useTranslation } from "react-i18next";

const { Title, Paragraph } = Typography;

export default function WuAbout() {
  const { t } = useTranslation();
  const menuItems = useWebsiteMenu();

  const teamMembers = [
    {
      name: "Nguyễn Văn A",
      role: "CEO & Founder",
      avatar: "https://via.placeholder.com/80",
      description: "10+ năm kinh nghiệm trong lĩnh vực công nghệ"
    },
    {
      name: "Trần Thị B",
      role: "CTO",
      avatar: "https://via.placeholder.com/80",
      description: "Chuyên gia về kiến trúc hệ thống và cloud"
    },
    {
      name: "Lê Văn C",
      role: "Lead Developer",
      avatar: "https://via.placeholder.com/80",
      description: "Full-stack developer với 8+ năm kinh nghiệm"
    },
    {
      name: "Phạm Thị D",
      role: "UI/UX Designer",
      avatar: "https://via.placeholder.com/80",
      description: "Thiết kế trải nghiệm người dùng sáng tạo"
    }
  ];

  const skills = [
    { name: "Frontend Development", percent: 95 },
    { name: "Backend Development", percent: 90 },
    { name: "Mobile Development", percent: 85 },
    { name: "Cloud Solutions", percent: 88 },
    { name: "UI/UX Design", percent: 92 },
    { name: "DevOps", percent: 80 }
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
            {t("website.about.intro", "Chúng tôi là đội ngũ đam mê công nghệ, luôn nỗ lực mang đến những giải pháp tốt nhất cho khách hàng.")}
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
                {t("website.about.mission_desc", "Tạo ra những sản phẩm công nghệ đột phá, giúp doanh nghiệp chuyển đổi số thành công và nâng cao hiệu quả hoạt động.")}
              </Paragraph>
              
              <Title level={3} style={{ marginTop: "32px" }}>
                <StarOutlined style={{ marginRight: 8, color: "#52c41a" }} />
                {t("website.about.our_vision", "Tầm Nhìn")}
              </Title>
              <Paragraph>
                {t("website.about.vision_desc", "Trở thành công ty công nghệ hàng đầu Việt Nam, được khách hàng tin tưởng và đối tác quốc tế công nhận.")}
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
                        <strong>2020</strong> - {t("website.about.founded", "Thành lập công ty")}
                        <br />
                        <small>Bắt đầu với 3 thành viên sáng lập</small>
                      </div>
                    ),
                  },
                  {
                    color: 'blue',
                    children: (
                      <div>
                        <strong>2021</strong> - {t("website.about.first_projects", "Dự án đầu tiên")}
                        <br />
                        <small>Hoàn thành 10+ dự án cho SME</small>
                      </div>
                    ),
                  },
                  {
                    color: 'red',
                    children: (
                      <div>
                        <strong>2022</strong> - {t("website.about.team_expansion", "Mở rộng đội ngũ")}
                        <br />
                        <small>Phát triển lên 15+ nhân viên</small>
                      </div>
                    ),
                  },
                  {
                    color: 'gold',
                    children: (
                      <div>
                        <strong>2023</strong> - {t("website.about.enterprise_clients", "Khách hàng doanh nghiệp")}
                        <br />
                        <small>Hợp tác với các tập đoàn lớn</small>
                      </div>
                    ),
                  },
                  {
                    children: (
                      <div>
                        <strong>2024-2025</strong> - {t("website.about.current_growth", "Phát triển mạnh mẽ")}
                        <br />
                        <small>150+ dự án thành công</small>
                      </div>
                    ),
                  },
                ]}
              />
            </Card>
          </Col>
        </Row>

        {/* Team Section */}
        <Card style={{ marginTop: "32px" }}>
          <Title level={2} style={{ textAlign: "center", marginBottom: "32px" }}>
            <TeamOutlined style={{ marginRight: 8 }} />
            {t("website.about.our_team", "Đội Ngũ Của Chúng Tôi")}
          </Title>
          <Row gutter={[24, 24]}>
            {teamMembers.map((member, index) => (
              <Col xs={24} sm={12} md={6} key={index}>
                <Card hoverable style={{ textAlign: "center" }}>
                  <Avatar size={80} src={member.avatar} style={{ marginBottom: "16px" }} />
                  <Title level={4} style={{ marginBottom: "8px" }}>
                    {member.name}
                  </Title>
                  <Paragraph style={{ color: "#1890ff", fontWeight: "bold", marginBottom: "8px" }}>
                    {member.role}
                  </Paragraph>
                  <Paragraph style={{ fontSize: "14px" }}>
                    {member.description}
                  </Paragraph>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>

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
                    <span style={{ fontWeight: "bold" }}>{skill.name}</span>
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
                  {t("website.about.quality_desc", "Cam kết mang đến sản phẩm chất lượng cao nhất")}
                </Paragraph>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small" style={{ textAlign: "center" }}>
                <TeamOutlined style={{ fontSize: "48px", color: "#1890ff", marginBottom: "16px" }} />
                <Title level={4}>{t("website.about.teamwork", "Hợp Tác")}</Title>
                <Paragraph>
                  {t("website.about.teamwork_desc", "Làm việc nhóm hiệu quả và hỗ trợ lẫn nhau")}
                </Paragraph>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small" style={{ textAlign: "center" }}>
                <BulbOutlined style={{ fontSize: "48px", color: "#fa8c16", marginBottom: "16px" }} />
                <Title level={4}>{t("website.about.innovation", "Đổi Mới")}</Title>
                <Paragraph>
                  {t("website.about.innovation_desc", "Luôn tìm kiếm và áp dụng công nghệ mới nhất")}
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
            {t("website.about.join_desc", "Cùng nhau xây dựng những sản phẩm công nghệ tuyệt vời!")}
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