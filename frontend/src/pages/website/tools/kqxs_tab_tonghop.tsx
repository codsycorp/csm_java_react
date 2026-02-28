import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Collapse } from "antd";
import { Card, Row, Col, Space, Select, Input, Checkbox, InputNumber, Button, message, Typography, DatePicker } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { CsmDynamicGrid } from "#src/components";
import { fetchLoaiTim, LoaiTimRow, fetchKQXSTongHop } from "../../../api/kqxs_service";
import { useAppStore } from "#src/store/app";

const { Title } = Typography;

interface SearchFilter {
  operator?: string // "AND" | "OR"
  conditions?: SearchFilter[]
  field?: string
  type?: string // eq, eqignorecase, like, prefix, gte, lte, range
  value?: any
}

interface TongHopResult {
  k2so: string;
  tongCong: number;
  veMienBac: number;
  veMienNam: number;
  veMienTrung: number;
  tLe: string;
}

const KQXSTabTongHop: React.FC<React.PropsWithChildren> = () => {
  // Get database from store
  const database = useAppStore(state => state.database);
  
  // State variables
  const [heSo, setHeSo] = useState("2");
  const [soNhap, setSoNhap] = useState("");
  const [chkNhom, setChkNhom] = useState(false);
  const [chkTriet, setChkTriet] = useState(false);
  const [chkTrietDuoi, setChkTrietDuoi] = useState(false);
  const [ktn, setKtn] = useState(12);
  const [ktd, setKtd] = useState(12);
  const [l2c, setL2c] = useState(12);
  const [loaiTimList, setLoaiTimList] = useState<LoaiTimRow[]>([]);
  const [loaiTim, setLoaiTim] = useState<string>("");
  interface NhomSoGroup {
    nhom: string;
    ten: string;
    children: { value: string; label: string }[];
  }
  const [nhomSoList, setNhomSoList] = useState<NhomSoGroup[]>([]);
  const [selectedNhomSo, setSelectedNhomSo] = useState<string[]>([]);
  const [nhomSoTrietList, setNhomSoTrietList] = useState<NhomSoGroup[]>([]);
  const [selectedNhomSoTriet, setSelectedNhomSoTriet] = useState<string[]>([]);
  const [tuNgay, setTuNgay] = useState<Dayjs>(dayjs().subtract(30, "day"));
  const [denNgayTH, setDenNgayTH] = useState<Dayjs>(dayjs());
  const [soKyTH, setSoKyTH] = useState(52);
  const [soNgay, setSoNgay] = useState(7);
  const [hienTK, setHienTK] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tongHopData, setTongHopData] = useState<TongHopResult[]>([]);
  const [ketQuaFilter, setKetQuaFilter] = useState<string[]>([]);
  const [thuTuTrung, setThuTuTrung] = useState("");

  // Debug log for nhomSoTrietList
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('DEBUG nhomSoTrietList:', nhomSoTrietList);
  }, [nhomSoTrietList]);

  // Cấu hình cho CsmDynamicGrid
  const gridConfig = useMemo(() => ({
    columns: [
      { title: "Số", dataIndex: "k2so", key: "k2so", align: "center" as const },
      { title: "Tổng", dataIndex: "tongCong", key: "tongCong", align: "center" as const },
      { title: "MB", dataIndex: "veMienBac", key: "veMienBac", align: "center" as const },
      { title: "MT", dataIndex: "veMienTrung", key: "veMienTrung", align: "center" as const },
      { title: "MN", dataIndex: "veMienNam", key: "veMienNam", align: "center" as const },
      { title: "TL(%)", dataIndex: "tLe", key: "tLe", align: "center" as const }
    ]
  }), []);

  // Hàm tải dữ liệu tổng hợp
  const loadTongHopData = useCallback(async () => {
    // Validate đầu vào
    if (!heSo) {
      message.warning('Vui lòng chọn hệ số!');
      return;
    }
    if (!loaiTim) {
      message.warning('Vui lòng chọn loại tìm!');
      return;
    }
    if (chkTriet && !selectedNhomSoTriet.length) {
      message.warning('Vui lòng chọn nhóm số triệt!');
      return;
    }
    if (!chkTriet && !selectedNhomSo.length) {
      message.warning('Vui lòng chọn nhóm số!');
      return;
    }
    if (!tuNgay || !denNgayTH) {
      message.warning('Vui lòng chọn đủ ngày!');
      return;
    }
    setLoading(true);
    try {
      // Mapping tham số đúng key backend yêu cầu
      const params: Record<string, string> = {
        maDuoi: heSo,
        tuNgay: tuNgay.format('DD/MM/YYYY'),
        denNgay: denNgayTH.format('DD/MM/YYYY'),
        l2c: String(l2c),
        tky: String(soKyTH),
        ktn: String(ktn),
        ktd: String(ktd),
        tnd: String(soNgay),
        nhomSo: selectedNhomSo.join(','),
        nhomSoTriet: selectedNhomSoTriet.join(','),
        soNhap: soNhap,
        trietTieu: chkTriet ? "1" : "0",
        trietDuoi: chkTrietDuoi ? "1" : "0",
        showNhom: chkNhom ? "1" : "0",
        showTk: hienTK ? "1" : "0",
        loaiTim: loaiTim,
        ketQuaFilter: ketQuaFilter.join(',')
      };
      const result = await fetchKQXSTongHop<TongHopResult>(params);
      if (result && Array.isArray(result)) {
        setTongHopData(result);
        useAppStore.getState().setTableData("tonghop_results", {
          id: "tonghop_results",
          rows: result.map((item: any, index: number) => ({ ...item, id: index, key: index })),
          app_id: "kqxs",
        });
      } else {
        setTongHopData([]);
      }
    } catch (error) {
      console.error('Lỗi khi tải dữ liệu tổng hợp:', error);
      message.error('Có lỗi xảy ra khi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [heSo, loaiTim, tuNgay, denNgayTH, l2c, soKyTH, ktn, ktd, soNgay, 
      selectedNhomSo, selectedNhomSoTriet, soNhap, chkTriet, chkTrietDuoi,
      chkNhom, hienTK, ketQuaFilter]);

  // Function to update data when options change
  const handleUpdateData = () => {
    const params = {
      maDuoi: heSo,
      tuNgay: tuNgay.format("DD/MM/YYYY"),
      denNgay: denNgayTH.format("DD/MM/YYYY"),
      nhomSo: selectedNhomSo.join(","),
      nhomSoTriet: selectedNhomSoTriet.join(","),
      trietTieu: chkTriet ? "1" : "0",
      trietDuoi: chkTrietDuoi ? "1" : "0",
      showNhom: chkNhom ? "1" : "0",
      loaiTim: loaiTim,
    };

    fetchKQXSTongHop(params)
      .then(result => {
        if (result && Array.isArray(result)) {
          setTongHopData(result);
        } else {
          setTongHopData([]);
        }
      })
      .catch(error => {
        console.error("Error updating data:", error);
        message.error("Failed to update data.");
      });
  };

  // Example usage
  useEffect(() => {
    handleUpdateData();
  }, [heSo, tuNgay, denNgayTH, chkTriet, chkNhom, loaiTim]);

  // Load loại tìm khi đổi hệ số
  useEffect(() => {
    let cancelled = false;
    async function fetchLoai() {
      try {
        const rows = await fetchLoaiTim(heSo);
        if (!cancelled) {
          if (Array.isArray(rows) && rows.length > 0) {
            setLoaiTimList(rows);
            setLoaiTim(rows[0].MaLoai);
          } else {
            setLoaiTimList([]);
            setLoaiTim("");
          }
        }
      } catch (e) {
        setLoaiTimList([]);
        setLoaiTim("");
      }
    }
    fetchLoai();
    return () => { cancelled = true; };
  }, [heSo]);

  // Load nhóm số khi đổi hệ số, loại tìm, hoặc Triệt
  useEffect(() => {
    let cancelled = false;
    async function fetchNhomSo() {
      setNhomSoList([]);
      setSelectedNhomSo([]);
      setNhomSoTrietList([]);
      setSelectedNhomSoTriet([]);
      try {
        const { calculateNhomSo, getBoSoTriet } = await import("../../../api/kqxs_service");
        // Lấy nhóm số từ calculateNhomSo (không triệt)
        const nhoms = await calculateNhomSo(heSo, loaiTim);
        const groupMap = new Map<string, { nhom: string, ten: string, children: { value: string, label: string }[] }>();
        (nhoms || []).forEach((n: any) => {
          const nhomKey = n.nhom?.toString() || "other";
          if (!groupMap.has(nhomKey)) {
            groupMap.set(nhomKey, { nhom: nhomKey, ten: n.ten || `Nhóm ${nhomKey} Số`, children: [] });
          }
          if (n.kieu_tim) {
            groupMap.get(nhomKey)!.children.push({ value: n.kieu_tim.toString(), label: n.kieu_tim.toString() });
          }
        });
        const nhomList = Array.from(groupMap.values());
        if (!cancelled) {
          setNhomSoList(nhomList);
          setSelectedNhomSo(nhomList.length && nhomList[0].children.length ? [nhomList[0].children[0].value] : []);
        }
        // Luôn hiển thị panel Nhóm Số Triệt, kể cả khi không có dữ liệu thực tế
        let nhomTrietList: NhomSoGroup[] = [];
        let allBoSoTriet: string | undefined = undefined;
        if (chkTriet) {
          allBoSoTriet = await getBoSoTriet(
            heSo,
            loaiTim,
            tuNgay.format("DD/MM/YYYY"),
            denNgayTH.format("DD/MM/YYYY")
          );
          // eslint-disable-next-line no-console
          console.log("allBoSoTriet:", allBoSoTriet);
          if (allBoSoTriet && allBoSoTriet.trim()) {
            const nhomsTriet = await calculateNhomSo(heSo, allBoSoTriet);
            const groupMapTriet = new Map<string, { nhom: string, ten: string, children: { value: string, label: string }[] }>();
            (nhomsTriet || []).forEach((n: any) => {
              const nhomKey = n.nhom?.toString() || "other";
              if (!groupMapTriet.has(nhomKey)) {
                groupMapTriet.set(nhomKey, { nhom: nhomKey, ten: n.ten || `Nhóm ${nhomKey} Số Triệt`, children: [] });
              }
              if (n.kieu_tim) {
                groupMapTriet.get(nhomKey)!.children.push({ value: n.kieu_tim.toString(), label: n.kieu_tim.toString() });
              }
            });
            nhomTrietList = Array.from(groupMapTriet.values());
          }
        }
        // Nếu không có nhóm triệt nào, vẫn tạo 1 nhóm mặc định để panel luôn hiển thị
        if (!chkTriet || nhomTrietList.length === 0) {
          nhomTrietList = [
            {
              nhom: "default",
              ten: "Không có nhóm triệt",
              children: []
            }
          ];
        }
        if (!cancelled) {
          setNhomSoTrietList(nhomTrietList);
          setSelectedNhomSoTriet(nhomTrietList.length && nhomTrietList[0].children.length ? [nhomTrietList[0].children[0].value] : []);
        }
      } catch (e) {
        setNhomSoList([]);
        setSelectedNhomSo([]);
        // Luôn hiển thị panel Nhóm Số Triệt khi lỗi
        setNhomSoTrietList([
          {
            nhom: "default",
            ten: "Không có nhóm triệt",
            children: []
          }
        ]);
        setSelectedNhomSoTriet([]);
      }
    }
    if (heSo && loaiTim) fetchNhomSo();
    return () => { cancelled = true; };
  }, [heSo, loaiTim, chkTriet, tuNgay, denNgayTH]);

  // Hàm thực hiện Tổng Hợp với logic từ file gốc
  const handleTim = useCallback(async (isTriet: boolean = false) => {
    if (!loaiTim) {
      message.warning("Vui lòng chọn loại tìm!");
      return;
    }
    // Kiểm tra nhóm số hoặc nhóm số triệt
    if (chkTriet) {
      if (!selectedNhomSoTriet.length) {
        message.warning("Vui lòng chọn nhóm số triệt!");
        return;
      }
    } else {
      if (!selectedNhomSo.length) {
        message.warning("Vui lòng chọn nhóm số!");
        return;
      }
    }

    // Thực hiện tìm kiếm với tham số cập nhật
    if (isTriet) {
      setChkTriet(true);
    }
    await loadTongHopData();
  }, [loaiTim, chkTriet, selectedNhomSoTriet, selectedNhomSo, setChkTriet, loadTongHopData]);

  // Function to check duplicate numbers
  const checkDuplicateNumbers = (numbers: string[]): string => {
    const originalNumbers = numbers[0]?.split(" ") || [];
    const duplicateNumbers = numbers[1]?.split(" ") || [];
    const duplicates = originalNumbers.filter(num => duplicateNumbers.includes(num));
    return duplicates.length > 0 ? `Duplicate numbers: ${duplicates.join(", ")}` : "No duplicate numbers found.";
  };

  // Example usage
  useEffect(() => {
    const result = checkDuplicateNumbers(["01 02 03", "02 03 04"]);
    setThuTuTrung(result);
  }, []);

  // Function to initialize UI components
  const initializeUI = () => {
    const calendarTuNgay = document.getElementById("tuNgay") as HTMLInputElement;
    const calendarDenNgay = document.getElementById("denNgayTH") as HTMLInputElement;

    if (calendarTuNgay && calendarDenNgay) {
      calendarTuNgay.value = tuNgay.format("DD/MM/YYYY");
      calendarDenNgay.value = denNgayTH.format("DD/MM/YYYY");
    }
  };

  // Example usage
  useEffect(() => {
    initializeUI();
  }, []);

  // Function to export data to Excel
  const exportToExcel = () => {
    const tableData = tongHopData.map(row => Object.values(row).join(",")).join("\n");
    const blob = new Blob([tableData], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "tonghop_results.csv";
    link.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div key="tonghop-content">
      <Title level={4}>Tổng Hợp</Title>
      <Row gutter={[16, 16]}>
        {/* Panel trái: tham số tìm kiếm, kết quả */}
        <Col span={18}>
          <Card key="header1" title="Tham số tìm kiếm" style={{ marginBottom: 16 }}>
            <Row gutter={[16, 16]}>
              <Col span={4}>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <label>Hệ</label>
                  <Select
                    value={heSo}
                    onChange={setHeSo}
                    style={{ width: "100%" }}
                    options={[
                      { value: "2", label: "2" },
                      { value: "3", label: "3" },
                    ]}
                  />
                </Space>
              </Col>
              <Col span={6}>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <label>Số đuôi - Số</label>
                  <Input
                    value={soNhap}
                    onChange={e => setSoNhap(e.target.value)}
                    placeholder="Nhập số cần tìm"
                    style={{ width: "100%" }}
                  />
                </Space>
              </Col>
              <Col span={6}>
                <Space direction="vertical">
                  <Checkbox checked={chkNhom} onChange={e => setChkNhom(e.target.checked)}>Nhóm</Checkbox>
                  <Checkbox checked={chkTriet} onChange={e => setChkTriet(e.target.checked)}>Triệt</Checkbox>
                  <Checkbox checked={chkTrietDuoi} onChange={e => setChkTrietDuoi(e.target.checked)}>Đuổi</Checkbox>
                </Space>
              </Col>
              <Col span={8}>
                <Row gutter={[8, 8]}>
                  <Col span={8}>
                    <Space direction="vertical" size="small">
                      <label style={{ fontSize: "12px" }}>KTN</label>
                      <InputNumber value={ktn} onChange={v => setKtn(v || 12)} min={1} max={100} size="small" style={{ width: "100%" }} />
                    </Space>
                  </Col>
                  <Col span={8}>
                    <Space direction="vertical" size="small">
                      <label style={{ fontSize: "12px" }}>KTD</label>
                      <InputNumber value={ktd} onChange={v => setKtd(v || 12)} min={1} max={100} size="small" style={{ width: "100%" }} />
                    </Space>
                  </Col>
                  <Col span={8}>
                    <Space direction="vertical" size="small">
                      <label style={{ fontSize: "12px" }}>L2C</label>
                      <InputNumber value={l2c} onChange={v => setL2c(v || 12)} min={1} max={100} size="small" style={{ width: "100%" }} />
                    </Space>
                  </Col>
                </Row>
              </Col>
            </Row>
            <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
              <Col span={6}>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <label>Từ Ngày</label>
                  <DatePicker
                    id="tuNgay"
                    value={tuNgay}
                    onChange={v => v && setTuNgay(v)}
                    format="DD/MM/YYYY"
                    style={{ width: "100%" }}
                  />
                </Space>
              </Col>
              <Col span={6}>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <label>Đến Ngày</label>
                  <DatePicker
                    id="denNgayTH"
                    value={denNgayTH}
                    onChange={v => v && setDenNgayTH(v)}
                    format="DD/MM/YYYY"
                    style={{ width: "100%" }}
                  />
                </Space>
              </Col>
              <Col span={6}>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <label>Hiện TK</label>
                  <Checkbox checked={hienTK} onChange={e => setHienTK(e.target.checked)}>
                    Hiện TK
                  </Checkbox>
                </Space>
              </Col>
            </Row>
          </Card>
          <Card key="header2" title="Thời gian và tùy chọn" style={{ marginBottom: 16 }}>
            <Row gutter={[16, 16]}>
              <Col span={6}>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <label>Loại Tìm</label>
                  <Select
                    value={loaiTim}
                    onChange={setLoaiTim}
                    style={{ width: "100%" }}
                    options={loaiTimList.map(item => ({ value: item.MaLoai, label: item.MoTa }))}
                    loading={loaiTimList.length === 0}
                  />
                </Space>
              </Col>
              <Col span={8}>
                <Space direction="vertical" size="small">
                  <Space size="small">
                    <Button type="primary" onClick={() => handleTim(false)} style={{ fontWeight: "bold" }} loading={loading}>Tìm</Button>
                    <Button onClick={() => handleTim(true)} style={{ fontWeight: "bold" }} loading={loading}>Tìm Triệt</Button>
                  </Space>
                  <Checkbox checked={hienTK} onChange={e => setHienTK(e.target.checked)}>Hiện TK</Checkbox>
                </Space>
              </Col>
              <Col span={10}>
                <Space direction="vertical" size="small">
                  <Space size="small">
                    <label style={{ fontSize: "12px" }}>Số Kỳ</label>
                    <InputNumber value={soKyTH} onChange={v => setSoKyTH(v || 52)} min={1} max={999} size="small" style={{ width: "50px" }} />
                  </Space>
                  <Space size="small">
                    <label style={{ fontSize: "12px" }}>Số ngày</label>
                    <InputNumber value={soNgay} onChange={v => setSoNgay(v || 7)} min={1} max={30} size="small" style={{ width: "50px" }} />
                  </Space>
                </Space>
              </Col>
            </Row>
          </Card>
          <Card key="results-card" title="Kết quả tổng hợp">
            <CsmDynamicGrid
              key="tonghop-grid"
              appId="kqxs"
              database={database}
              permissions={0}
              menusPermissions={{}}
              m_configs={{
                id: "tonghop_results",
                label: "Kết quả tổng hợp",
                table_name: "tonghop_results",
                table: [
                  { f_name: "cach", f_header: "Cách", f_show: 1, f_types: "text", width: 200 },
                  { f_name: "ketqua", f_header: "Kết quả", f_show: 1, f_types: "text", width: 300 },
                  { f_name: "solan", f_header: "Số Lần Ko Xổ", f_show: 1, f_types: "number", width: 80, f_align: "right" },
                  { f_name: "l2c", f_header: `${l2c} L2C`, f_show: 1, f_types: "number", width: 60, f_align: "right" },
                  { f_name: "tong28", f_header: "Tổng 28 ngày", f_show: 1, f_types: "number", width: 80, f_align: "right" },
                  { f_name: "launga", f_header: "Lâu Ngày", f_show: 1, f_types: "number", width: 70, f_align: "right" },
                  { f_name: "lauky", f_header: "Lâu Kỳ", f_show: 1, f_types: "number", width: 60, f_align: "right" },
                  { f_name: "ngaycx", f_header: "Ngày CX", f_show: 1, f_types: "text", width: 70 },
                  { f_name: "kychuaxo", f_header: "Kỳ Chưa Xổ", f_show: 1, f_types: "number", width: 80, f_align: "right" },
                  { f_name: "cacso", f_header: "Các Số", f_show: 1, f_types: "text", width: 600 },
                ],
                trigger: {},
                g_readonly: true,
                table_pagesize: 50,
                type_form: "",
              }}
            />
          </Card>
        </Col>
        {/* Panel phải: nhóm số, lọc kết quả, thứ tự trùng */}
        <Col span={6}>
          <Card key="nhomso-card" title="Nhóm Số" size="small" style={{ marginBottom: 16 }}>
            <div style={{ border: "1px solid #d9d9d9", borderRadius: 4, padding: 8, maxHeight: 200, overflowY: "auto" }}>
              <Collapse bordered={false} defaultActiveKey={nhomSoList.map(g => g.nhom)}>
                {nhomSoList.map((group, idx) => (
                  <Collapse.Panel header={group.ten} key={group.nhom}>
                    <Checkbox.Group
                      options={group.children}
                      value={selectedNhomSo.filter(v => group.children.some((c: { value: string }) => c.value === v))}
                      onChange={list => {
                        const others = selectedNhomSo.filter(v => !group.children.some((c: { value: string }) => c.value === v));
                        setSelectedNhomSo([...others, ...(list as string[])]);
                      }}
                      style={{ width: "100%" }}
                    />
                  </Collapse.Panel>
                ))}
              </Collapse>
            </div>
          </Card>
          <Card key="nhomsotriet-card" title="Nhóm Số Triệt" size="small" style={{ marginBottom: 16 }}>
            <div style={{ border: "1px solid #d9d9d9", borderRadius: 4, padding: 8, maxHeight: 200, overflowY: "auto" }}>
              <Collapse bordered={false} defaultActiveKey={nhomSoTrietList.map(g => g.nhom)}>
                {nhomSoTrietList.map((group, idx) => (
                  <Collapse.Panel header={group.ten} key={group.nhom}>
                    <Checkbox.Group
                      options={group.children}
                      value={selectedNhomSoTriet.filter(v => group.children.some((c: { value: string }) => c.value === v))}
                      onChange={list => {
                        const others = selectedNhomSoTriet.filter(v => !group.children.some((c: { value: string }) => c.value === v));
                        setSelectedNhomSoTriet([...others, ...(list as string[])]);
                      }}
                      style={{ width: "100%" }}
                    />
                  </Collapse.Panel>
                ))}
              </Collapse>
            </div>
          </Card>
          <Card key="filter-card" title="Lọc kết quả" size="small" style={{ marginBottom: 16 }}>
            <div style={{ height: "150px", overflow: "auto", border: "1px solid #d9d9d9", padding: "8px" }}>
              <Space direction="vertical">
                <Checkbox checked={ketQuaFilter.includes("KQT")} onChange={e => setKetQuaFilter(e.target.checked ? [...ketQuaFilter, "KQT"] : ketQuaFilter.filter(k => k !== "KQT"))}>Kết quả Tuần</Checkbox>
                <Checkbox checked={ketQuaFilter.includes("KQN")} onChange={e => setKetQuaFilter(e.target.checked ? [...ketQuaFilter, "KQN"] : ketQuaFilter.filter(k => k !== "KQN"))}>Kết quả Ngày</Checkbox>
                <Checkbox checked={ketQuaFilter.includes("KTD")} onChange={e => setKetQuaFilter(e.target.checked ? [...ketQuaFilter, "KTD"] : ketQuaFilter.filter(k => k !== "KTD"))}>Kết quả Tuần Đài</Checkbox>
                <Checkbox checked={ketQuaFilter.includes("L2C")} onChange={e => setKetQuaFilter(e.target.checked ? [...ketQuaFilter, "L2C"] : ketQuaFilter.filter(k => k !== "L2C"))}>Kết quả ngày Nam Bắc</Checkbox>
              </Space>
            </div>
          </Card>
          <Card key="trung-card" title="Thứ tự trùng" size="small">
            <Input.TextArea value={thuTuTrung} onChange={e => setThuTuTrung(e.target.value)} rows={8} readOnly />
          </Card>
        </Col>
      </Row>
      <Button onClick={exportToExcel} style={{ fontWeight: "bold" }}>Xuất Excel</Button>
    </div>
  );
};

export default KQXSTabTongHop;
