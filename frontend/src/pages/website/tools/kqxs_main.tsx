

import React, { useState } from "react";
import { Button, Card, Space, Tabs, Typography } from "antd";
import WebsiteLayout from "#src/layout/website/WebsiteLayout";
import { useWebsiteMenu } from "#src/layout/website/wu_menu";
import { setupKQXSStyles } from "./kqxs_styles";
import KQXSTabKetQua from "./kqxs_tab_ketqua";
import { KQXSTabThongKe } from "./kqxs_tab_thongke";
// Đã gộp logic Thống Kê Mới vào KQXSTabThongKe
import KQXSTabTongHop from "./kqxs_tab_tonghop";
const { Title } = Typography;

if (typeof window !== "undefined") setupKQXSStyles();

const KQXSMain: React.FC = () => {
  const menuItems = useWebsiteMenu();
  const [mainTab, setMainTab] = useState("ketqua");
  const [subTab, setSubTab] = useState("ketqua");
  return (
    <WebsiteLayout menuItems={menuItems} selectedKey="/kqxs" title="Kết Quả Xổ Số">
      <div className="kqxs-responsive">
        <Title level={2}>Kết Quả Xổ Số</Title>
        <Card style={{ marginBottom: 16 }}>
          <Space size="small" wrap>
            <Button type={mainTab === "ketqua" ? "primary" : "default"} onClick={() => setMainTab("ketqua")}>Kết Quả</Button>
            <Button type={mainTab === "tonghop" ? "primary" : "default"} onClick={() => setMainTab("tonghop")}>Tổng Hợp</Button>
          </Space>
        </Card>
        {mainTab === "ketqua" && (
          <Tabs
            activeKey={subTab}
            onChange={setSubTab}
            items={[
              { key: "ketqua", label: "Kết Quả", children: <KQXSTabKetQua /> },
              { key: "thongke", label: "Thống Kê", children: <KQXSTabThongKe /> },
// Đã gộp logic Thống Kê Mới vào KQXSTabThongKe
            ]}
          />
        )}
        {mainTab === "tonghop" && <KQXSTabTongHop />}
      </div>
    </WebsiteLayout>
  );
};

export default KQXSMain;