import React, { useState, useEffect, useCallback } from "react";
import { Card, Row, Col, Select, DatePicker, Button, Space, message, theme } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { fetchKQXSByStation, fetchKQXSStationsWithFilter } from "#src/api/kqxs_service";

interface DaiInfo {
  du_lieu_dai: string;
  ten_dai: string;
  mien: string;
  thu: string;
  stt: number;
}

interface KQXSResult {
  ten_dai: string;
  ngay: string;
  mien: string;
  uniqueKey: string;
  field_duoi: string;  // Giải ĐB
  field_so17: string;  // Giải nhất
  field_so16: string;  // Giải nhì
  field_so15: string;  // Giải ba
  field_so14: string;  // Giải ba
  field_so13: string;  // Giải tư
  field_so12: string;
  field_so11: string;
  field_so10: string;
  field_so9: string;
  field_so8: string;
  field_so7: string;
  field_so6: string;   // Giải năm
  field_so5: string;   // Giải sáu
  field_so4: string;
  field_so3: string;
  field_so2: string;   // Giải bảy
  field_dau: string;   // Giải 8
  [key: string]: string;  // Allow string indexing
}

const KQXSTabKetQua: React.FC = () => {
  const { token } = theme.useToken();
  const [mien, setMien] = useState<string>("MN");
  const [thuTuan, setThuTuan] = useState<string>("");
  const [denNgay, setDenNgay] = useState<Dayjs>(dayjs());
  const [danhSachDai, setDanhSachDai] = useState<DaiInfo[]>([]);
  const [dsDaiChonXemKetQua, setDsDaiChonXemKetQua] = useState<string[]>([]);
  const [displayedResults, setDisplayedResults] = useState<KQXSResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Style chung cho kết quả
  const resultStyles = {
    wrapper: {
      maxWidth: 1400,
      margin: '0 auto',
      padding: '0 16px'
    },
    resultsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      gap: '16px',
      width: '100%'
    },
    resultCard: {
      background: token.colorBgContainer,
      borderRadius: token.borderRadiusLG,
      boxShadow: `0 2px 8px ${token.colorBgElevated}15`,
      padding: token.padding,
      border: `1px solid ${token.colorBorderSecondary}`,
      height: '100%'
    },
    resultHeader: {
      textAlign: 'center' as const,
      fontWeight: 700,
      fontSize: token.fontSizeHeading4,
      marginBottom: token.margin,
      color: token.colorText
    },
    resultTable: {
      width: '100%',
      borderCollapse: 'collapse' as const
    },
    resultRow: (isEven: boolean) => ({
      background: isEven ? token.colorFillQuaternary : 'transparent'
    }),
    resultLabel: {
      padding: token.paddingSM,
      fontWeight: 600,
      fontSize: token.fontSize,
      width: '100px',
      verticalAlign: 'middle',
      color: token.colorTextSecondary
    },
    resultValue: {
      padding: token.paddingSM
    },
    resultNumbers: {
      display: 'flex',
      justifyContent: 'center',
      gap: token.marginXS,
      flexWrap: 'wrap' as const
    }
  };

  // Hàm tải danh sách đài theo thứ
  const loadStations = useCallback(async (thu: string) => {
    try {
      const allStations = await fetchKQXSStationsWithFilter({ thu });
      setDanhSachDai(allStations || []);
      setThuTuan(thu);
    } catch (e) {
      console.error("Không tải được danh sách đài (SSR):", e);
      message.error("Không tải được danh sách đài. Vui lòng thử lại.");
      setDanhSachDai([]);
    }
  }, []);

  // Tải danh sách đài khi mount và khi ngày đổi
  useEffect(() => {
    const dayMap = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    const thu = dayMap[denNgay.day()];
    loadStations(thu);
  }, [denNgay, loadStations]);

  const daiFiltered = danhSachDai.filter(dai => dai.mien === mien && (!thuTuan || dai.thu === thuTuan));

  const xemKetQua = useCallback(async () => {
    if (dsDaiChonXemKetQua.length === 0) {
      message.warning("Vui lòng chọn ít nhất một đài!");
      return;
    }
    setLoading(true);
    try {
      console.log("Bắt đầu lấy kết quả cho các đài:", dsDaiChonXemKetQua);
      const results: KQXSResult[] = [];
      for (const du_lieu_dai of dsDaiChonXemKetQua) {
        const dai = danhSachDai.find(d => d.du_lieu_dai === du_lieu_dai);
        console.log("Đang xử lý đài:", dai?.ten_dai);
        if (!dai) {
          console.log("Không tìm thấy thông tin đài:", du_lieu_dai);
          continue;
        }

        console.log("Gọi API cho đài:", dai.du_lieu_dai, "ngày:", denNgay.format("DD/MM/YYYY"));
        let rows: any[] = [];
        try {
          rows = await fetchKQXSByStation(dai.du_lieu_dai, denNgay.format("DD/MM/YYYY"));
        } catch (err) {
          console.warn("Lỗi khi gọi API cho đài", dai.ten_dai, err);
          message.warning(`Không lấy được kết quả cho đài ${dai.ten_dai}`);
          continue; // tiếp tục với các đài khác
        }
        console.log("Kết quả API:", rows);
        if (Array.isArray(rows) && rows.length) {
          const daiResult = {
            ten_dai: dai.ten_dai,
            ngay: denNgay.format("DD/MM/YYYY"),
            mien: dai.mien,
            uniqueKey: `${dai.du_lieu_dai}-${denNgay.format("YYYYMMDD")}`,
            // Các giải đặc biệt
            field_duoi: '', // Giải ĐB
            field_so17: '', // Giải nhất
            field_so16: '', // Giải nhì
            // Giải ba
            field_so15: '',
            field_so14: '',
            // Giải tư
            field_so13: '',
            field_so12: '',
            field_so11: '',
            field_so10: '',
            field_so9: '',
            field_so8: '',
            field_so7: '',
            // Giải năm
            field_so6: '',
            // Giải sáu
            field_so5: '',
            field_so4: '',
            field_so3: '',
            // Giải bảy
            field_so2: '',
            // Giải tám
            field_dau: ''
          };

          const row = rows[0];
          if (row) {
            daiResult.field_dau = row.field_dau || '';      // Giải 8
            daiResult.field_so2 = row.field_so2 || '';      // Giải 7
            daiResult.field_so3 = row.field_so3 || '';      // Giải 6
            daiResult.field_so4 = row.field_so4 || '';      // Giải 6
            daiResult.field_so5 = row.field_so5 || '';      // Giải 6
            daiResult.field_so6 = row.field_so6 || '';      // Giải 5
            daiResult.field_so7 = row.field_so7 || '';      // Giải 4
            daiResult.field_so8 = row.field_so8 || '';      // Giải 4
            daiResult.field_so9 = row.field_so9 || '';      // Giải 4
            daiResult.field_so10 = row.field_so10 || '';    // Giải 4
            daiResult.field_so11 = row.field_so11 || '';    // Giải 4
            daiResult.field_so12 = row.field_so12 || '';    // Giải 4
            daiResult.field_so13 = row.field_so13 || '';    // Giải 4
            daiResult.field_so14 = row.field_so14 || '';    // Giải 3
            daiResult.field_so15 = row.field_so15 || '';    // Giải 3
            daiResult.field_so16 = row.field_so16 || '';    // Giải 2
            daiResult.field_so17 = row.field_so17 || '';    // Giải 1
            daiResult.field_duoi = row.field_duoi || '';    // Giải ĐB
          }

          results.push(daiResult);
        }
      }
      console.log("Kết quả cuối cùng:", results);
      setDisplayedResults(results);
    } catch (error) {
      console.error("Lỗi khi lấy kết quả:", error);
      message.error("Có lỗi xảy ra khi lấy kết quả xổ số");
    } finally {
      setLoading(false);
    }
  }, [dsDaiChonXemKetQua, danhSachDai, denNgay]);

  // Tự động gọi lại xemKetQua khi đổi ngày hoặc danh sách đài
  useEffect(() => {
    if (dsDaiChonXemKetQua.length > 0) {
      xemKetQua();
    }
  }, [denNgay, dsDaiChonXemKetQua]);

  return (
    <div style={resultStyles.wrapper}>
      <Card title="Chọn đài và ngày">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Space direction="vertical" style={{ width: "100%" }}>
              <label>Miền:</label>
              <Select
                value={mien}
                onChange={value => {
                  setMien(value);
                  setDsDaiChonXemKetQua([]);
                  setDisplayedResults([]);
                  const dayMap = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
                  setThuTuan(dayMap[denNgay.day()]);
                }}
                style={{ width: "100%" }}
                options={[{ value: "MN", label: "Miền Nam" }, { value: "MT", label: "Miền Trung" }, { value: "MB", label: "Miền Bắc" }]}
              />
            </Space>
          </Col>
          <Col xs={24} md={8}>
            <Space direction="vertical" style={{ width: "100%" }}>
              <label>Thứ:</label>
              <Select value={thuTuan} disabled style={{ width: "100%" }}
                options={[{ value: "T2", label: "Thứ 2" }, { value: "T3", label: "Thứ 3" }, { value: "T4", label: "Thứ 4" }, { value: "T5", label: "Thứ 5" }, { value: "T6", label: "Thứ 6" }, { value: "T7", label: "Thứ 7" }, { value: "CN", label: "Chủ Nhật" }]} />
            </Space>
          </Col>
          <Col xs={24} md={8}>
            <Space direction="vertical" style={{ width: "100%" }}>
              <label>Ngày xem:</label>
              <DatePicker
                value={denNgay}
                onChange={date => {
                  if (date) {
                    setDenNgay(date);
                    setDsDaiChonXemKetQua([]);
                    setDisplayedResults([]);
                    // loadStations sẽ tự động gọi lại qua useEffect
                  }
                }}
                style={{ width: "100%" }}
                format="DD/MM/YYYY"
              />
            </Space>
          </Col>
          <Col span={24}>
            <Space direction="vertical" style={{ width: "100%" }}>
              <label>Chọn đài:</label>
              <Select mode="multiple"
                value={dsDaiChonXemKetQua}
                onChange={val => {
                  setDsDaiChonXemKetQua(val);
                  setDisplayedResults([]);
                  // xemKetQua sẽ tự động gọi lại qua useEffect
                }}
                style={{ width: "100%" }}
                options={daiFiltered.map(dai => ({ value: dai.du_lieu_dai, label: dai.ten_dai }))} 
              />
            </Space>
          </Col>
          <Col span={24}>
            <Button type="primary" onClick={xemKetQua} loading={loading} disabled={dsDaiChonXemKetQua.length === 0}>
              Xem kết quả
            </Button>
          </Col>
        </Row>
      </Card>

      {displayedResults.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <div style={resultStyles.resultsGrid}>
            {displayedResults.map((dai, idx) => {
              const giaiConfig = [
                { label: 'Giải ĐB', field: 'field_duoi', style: { fontSize: 40, fontWeight: 900, color: token.colorError } },
                { label: 'Giải nhất', field: 'field_so17', style: { fontSize: 32, fontWeight: 700 } },
                { label: 'Giải nhì', field: 'field_so16', style: { fontSize: 28, fontWeight: 700 } },
                { 
                  label: 'Giải ba', 
                  fields: ['field_so15', 'field_so14'], 
                  style: { fontSize: 24, fontWeight: 700 }
                },
                {
                  label: 'Giải tư',
                  fields: ['field_so13', 'field_so12', 'field_so11', 'field_so10', 'field_so9', 'field_so8', 'field_so7'],
                  style: { fontSize: 20, fontWeight: 700 }
                },
                { label: 'Giải năm', field: 'field_so6', style: { fontSize: 20, fontWeight: 700 } },
                {
                  label: 'Giải sáu',
                  fields: ['field_so5', 'field_so4', 'field_so3'],
                  style: { fontSize: 20, fontWeight: 700 }
                },
                { label: 'Giải bảy', field: 'field_so2', style: { fontSize: 20, fontWeight: 700 } },
                { label: 'Giải tám', field: 'field_dau', style: { fontSize: 36, fontWeight: 900 } }
              ];

              return (
                <div key={dai.uniqueKey || idx} style={resultStyles.resultCard}>
                  <div style={resultStyles.resultHeader}>
                    {dai.ten_dai} - {dai.ngay}
                  </div>

                  <table style={resultStyles.resultTable}>
                    <tbody>
                      {giaiConfig.map((giai, gidx) => (
                        <tr key={giai.label} style={resultStyles.resultRow(gidx % 2 === 1)}>
                          <td style={resultStyles.resultLabel}>
                            {giai.label}
                          </td>
                          <td style={resultStyles.resultValue}>
                            <div style={resultStyles.resultNumbers}>
                              {giai.fields ? (
                                giai.fields.map((field, i) => (
                                  dai[field] && (
                                    <span key={i} style={giai.style}>
                                      {dai[field]}
                                    </span>
                                  )
                                ))
                              ) : (
                                dai[giai.field] && (
                                  <span style={giai.style}>
                                    {dai[giai.field]}
                                  </span>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

export default KQXSTabKetQua;