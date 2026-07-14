package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/jung-kurt/gofpdf"
)

type ProductItem struct {
	GroupTitle string  `json:"group_title"`
	GroupDesc  string  `json:"group_desc"`
	VatRate    float64 `json:"vat_rate"`
	Name       string  `json:"name"`
	Unit       string  `json:"unit"`
	Width      float64 `json:"width"`
	Length     float64 `json:"length"`
	Quantity   int     `json:"quantity"`
	UnitPrice  float64 `json:"unit_price"`
	Weight     float64 `json:"weight"`
}

type ClientInfo struct {
	Company string `json:"company"`
	Address string `json:"address"`
	Contact string `json:"contact"`
}

type SalesRep struct {
	Name  string `json:"name"`
	Phone string `json:"phone"`
}

type QuotationRawPayload struct {
	QuotationNo string        `json:"quotation_no"`
	Date        string        `json:"date"`
	ValidUntil  string        `json:"valid_until"`
	Client      ClientInfo    `json:"client"`
	Sales       SalesRep      `json:"sales"`
	Items       []ProductItem `json:"items"`
}

func main() {
	http.HandleFunc("/api/generate-raw-quotation", handleRawQuotationPDF)
	fmt.Println("Backend Server đang chạy tại port :8080...")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func handleRawQuotationPDF(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload QuotationRawPayload
	err := json.NewDecoder(r.Body).Decode(&payload)
	if err != nil || len(payload.Items) == 0 {
		payload = getRawMockData()
	}

	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(10, 10, 10)

	pdf.AddUTF8Font("Arial", "", "fonts/Arial.ttf")
	pdf.AddUTF8Font("Arial", "B", "fonts/Arial-Bold.ttf")
	pdf.AddUTF8Font("Arial", "I", "fonts/Arial-Italic.ttf")
	pdf.AddUTF8Font("Arial", "BI", "fonts/Arial-BoldItalic.ttf")

	pdf.SetHeaderFunc(func() {
		// pdf.ImageOptions("fonts/logo.png", 10, 8, 15, 0, false, gofpdf.ImageOptions{ImageType: "PNG", ReadFromMods: false}, 0, "")

		pdf.SetFont("Arial", "B", 10)
		pdf.CellFormat(130, 5, "CÔNG TY TNHH CÔNG NGHỆ CÔNG NGHIỆP PHÚ SƠN", "", 0, "L", false, 0, "")
		pdf.SetFont("Arial", "", 9)
		pdf.CellFormat(60, 5, "MST: 0104113174", "", 1, "R", false, 0, "")

		pdf.SetFont("Arial", "I", 8)
		pdf.CellFormat(190, 4, "Địa chỉ: Lô 7 CN5, Cụm công nghiệp Ngọc Hồi, xã Ngọc Hồi, Thành phố Hà Nội", "", 1, "L", false, 0, "")

		pdf.SetFont("Arial", "", 8)
		pdf.CellFormat(190, 4, "Website: panelphuson.vn | javta.vn", "", 1, "L", false, 0, "")

		currX, currY := pdf.GetX(), pdf.GetY()
		pdf.Line(currX, currY+1, 200, currY+1)
		pdf.Ln(4)
	})

	pdf.SetFooterFunc(func() {
		pdf.SetY(-15)
		pdf.SetFont("Arial", "", 8)
		pageStr := fmt.Sprintf("Trang %d / {nb}", pdf.PageNo())
		pdf.CellFormat(190, 10, pageStr, "", 0, "R", false, 0, "")
	})

	pdf.AliasNbPages("")
	pdf.AddPage()

	pdf.Ln(2)
	pdf.SetFont("Arial", "B", 13)
	pdf.CellFormat(190, 7, "BẢNG BÁO GIÁ SẢN PHẨM - KIÊM XÁC NHẬN ĐƠN HÀNG", "", 1, "CENTER", false, 0, "")
	pdf.Ln(3)

	pdf.SetFont("Arial", "B", 9)
	pdf.CellFormat(120, 5, "Kính gửi: "+payload.Client.Company, "", 0, "L", false, 0, "")
	pdf.CellFormat(70, 5, "Số: "+payload.QuotationNo, "", 1, "R", false, 0, "")

	pdf.SetFont("Arial", "", 9)
	pdf.CellFormat(120, 5, "Địa chỉ: "+payload.Client.Address, "", 0, "L", false, 0, "")
	pdf.CellFormat(70, 5, "Ngày: "+payload.Date, "", 1, "R", false, 0, "")

	pdf.CellFormat(120, 5, "Người liên hệ: "+payload.Client.Contact, "", 0, "L", false, 0, "")
	pdf.CellFormat(70, 5, "Hiệu lực đến: "+payload.ValidUntil, "", 1, "R", false, 0, "")

	pdf.SetFont("Arial", "B", 9)
	pdf.CellFormat(190, 5, fmt.Sprintf("NVKD: %s", payload.Sales.Name), "", 1, "L", false, 0, "")
	pdf.Ln(2)

	pdf.SetFont("Arial", "", 8.5)
	introText := "Cảm ơn Quý khách hàng đã quan tâm tới sản phẩm do Công ty TNHH Công nghệ Công nghiệp Phú Sơn sản xuất. Chúng tôi xin gửi Báo giá sản phẩm theo yêu cầu Quý khách đã cung cấp với nội dung như sau:"
	pdf.MultiCell(190, 4, introText, "", "L", false)
	pdf.Ln(3)

	pdf.SetFont("Arial", "B", 8)
	pdf.CellFormat(7, 8, "TT", "1", 0, "C", false, 0, "")
	pdf.CellFormat(63, 8, "Tên sản phẩm / Quy cách", "1", 0, "C", false, 0, "")
	pdf.CellFormat(10, 8, "Đơn vị", "1", 0, "C", false, 0, "")
	pdf.CellFormat(15, 8, "C.Rộng", "1", 0, "C", false, 0, "")
	pdf.CellFormat(15, 8, "C.Dài", "1", 0, "C", false, 0, "")
	pdf.CellFormat(15, 8, "Số tấm", "1", 0, "C", false, 0, "")
	pdf.CellFormat(17, 8, "K.Lượng", "1", 0, "C", false, 0, "")
	pdf.CellFormat(23, 8, "Đơn giá (VNĐ)", "1", 0, "C", false, 0, "")
	pdf.CellFormat(25, 8, "Thành tiền (VNĐ)", "1", 1, "C", false, 0, "")

	groupsOrder := []string{}
	groupsData := make(map[string][]ProductItem)
	groupsMeta := make(map[string]string)

	for _, item := range payload.Items {
		if _, exists := groupsData[item.GroupTitle]; !exists {
			groupsOrder = append(groupsOrder, item.GroupTitle)
			groupsMeta[item.GroupTitle] = item.GroupDesc
		}
		groupsData[item.GroupTitle] = append(groupsData[item.GroupTitle], item)
	}

	var totalBeforeVat float64 = 0
	vatAmounts := make(map[float64]float64)

	for gIdx, gTitle := range groupsOrder {
		gItems := groupsData[gTitle]
		gDesc := groupsMeta[gTitle]
		romanLabel := getRomanNumeral(gIdx + 1)

		pdf.SetFont("Arial", "B", 8.5)
		pdf.CellFormat(7, 6, romanLabel+".", "1", 0, "C", false, 0, "")
		pdf.CellFormat(183, 6, " "+gTitle, "1", 1, "L", false, 0, "")

		if gDesc != "" {
			pdf.SetFont("Arial", "I", 7.5)
			pdf.CellFormat(7, 4, "", "1", 0, "C", false, 0, "")
			pdf.CellFormat(183, 4, "   "+gDesc, "1", 1, "L", false, 0, "")
		}

		var groupQty int = 0
		var groupWeight float64 = 0
		var groupAmount float64 = 0
		var currentVatRate float64 = 0

		pdf.SetFont("Arial", "", 8)
		for pIdx, pItem := range gItems {
			var calculatedWeight float64
			if pItem.Width > 0 && pItem.Length > 0 && pItem.Quantity > 0 {
				calculatedWeight = pItem.Width * pItem.Length * float64(pItem.Quantity)
			} else if pItem.Length > 0 && pItem.Quantity > 0 && pItem.Unit == "m" {
				calculatedWeight = pItem.Length * float64(pItem.Quantity)
			} else {
				calculatedWeight = pItem.Weight
			}

			itemAmount := calculatedWeight * pItem.UnitPrice

			groupQty += pItem.Quantity
			groupWeight += calculatedWeight
			groupAmount += itemAmount
			currentVatRate = pItem.VatRate

			startX := pdf.GetX()
			startY := pdf.GetY()

			pdf.CellFormat(7, 5, strconv.Itoa(pIdx+1), "1", 0, "C", false, 0, "")
			pdf.SetX(startX + 7)
			pdf.MultiCell(63, 5, pItem.Name, "1", "L", false)
			endY := pdf.GetY()

			pdf.SetXY(startX+70, startY)
			pdf.CellFormat(10, 5, pItem.Unit, "1", 0, "C", false, 0, "")

			if pItem.Width > 0 {
				pdf.CellFormat(15, 5, fmt.Sprintf("%.2f", pItem.Width), "1", 0, "C", false, 0, "")
			} else {
				pdf.CellFormat(15, 5, "", "1", 0, "C", false, 0, "")
			}

			if pItem.Length > 0 {
				pdf.CellFormat(15, 5, fmt.Sprintf("%.3f", pItem.Length), "1", 0, "C", false, 0, "")
			} else {
				pdf.CellFormat(15, 5, "", "1", 0, "C", false, 0, "")
			}

			if pItem.Quantity > 0 {
				pdf.CellFormat(15, 5, strconv.Itoa(pItem.Quantity), "1", 0, "C", false, 0, "")
			} else {
				pdf.CellFormat(15, 5, "", "1", 0, "C", false, 0, "")
			}

			pdf.CellFormat(17, 5, fmt.Sprintf("%.2f", calculatedWeight), "1", 0, "R", false, 0, "")
			pdf.CellFormat(23, 5, formatMoney(pItem.UnitPrice), "1", 0, "R", false, 0, "")
			pdf.CellFormat(25, 5, formatMoney(itemAmount), "1", 1, "R", false, 0, "")

			if endY > pdf.GetY() {
				pdf.SetY(endY)
			}
		}

		pdf.SetFont("Arial", "B", 8)
		pdf.CellFormat(70, 6, fmt.Sprintf("Cộng nhóm %s - chưa VAT %.0f%%", romanLabel, currentVatRate), "1", 0, "L", false, 0, "")
		pdf.CellFormat(10, 6, "", "1", 0, "C", false, 0, "")
		pdf.CellFormat(15, 6, "", "1", 0, "C", false, 0, "")
		pdf.CellFormat(15, 6, "", "1", 0, "C", false, 0, "")
		pdf.CellFormat(15, 6, strconv.Itoa(groupQty), "1", 0, "C", false, 0, "")
		pdf.CellFormat(17, 6, fmt.Sprintf("%.2f", groupWeight), "1", 0, "R", false, 0, "")
		pdf.CellFormat(23, 6, "", "1", 0, "R", false, 0, "")
		pdf.CellFormat(25, 6, formatMoney(groupAmount), "1", 1, "R", false, 0, "")

		totalBeforeVat += groupAmount
		vatAmounts[currentVatRate] += (groupAmount * currentVatRate / 100)
	}

	pdf.Ln(2)
	pdf.SetFont("Arial", "B", 8.5)
	pdf.CellFormat(165, 5, "A. Tổng giá trị hàng hóa chưa VAT:", "", 0, "R", false, 0, "")
	pdf.CellFormat(25, 5, formatMoney(totalBeforeVat), "", 1, "R", false, 0, "")

	var totalVat float64 = 0
	pdf.SetFont("Arial", "", 8.5)

	amt8 := vatAmounts[8]
	totalVat += amt8
	pdf.CellFormat(165, 5, "B. Tiền VAT 8%:", "", 0, "R", false, 0, "")
	pdf.CellFormat(25, 5, formatMoney(amt8), "", 1, "R", false, 0, "")

	amt10 := vatAmounts[10]
	totalVat += amt10
	pdf.CellFormat(165, 5, "C. Tiền VAT 10%:", "", 0, "R", false, 0, "")
	pdf.CellFormat(25, 5, formatMoney(amt10), "", 1, "R", false, 0, "")

	totalPayment := totalBeforeVat + totalVat
	pdf.SetFont("Arial", "B", 9)
	pdf.CellFormat(165, 6, "D. Tổng giá trị thanh toán, đã bao gồm VAT: D = (A)+(B)+(C)", "", 0, "R", false, 0, "")
	pdf.CellFormat(25, 6, formatMoney(totalPayment), "", 1, "R", false, 0, "")

	pdf.Ln(2)
	pdf.SetFont("Arial", "B", 8.5)
	pdf.CellFormat(190, 5, "Bằng chữ: Một trăm mười bảy triệu, không trăm ba mươi tám nghìn, một trăm bảy mươi đồng ./.", "", 1, "L", false, 0, "")

	pdf.Ln(2)
	pdf.SetFont("Arial", "B", 8)
	pdf.CellFormat(190, 4, "Ghi chú:", "", 1, "L", false, 0, "")
	pdf.SetFont("Arial", "", 7.5)
	pdf.CellFormat(190, 4, "1. Đơn giá đã bao gồm VAT: Tấm lợp PU, EPS, RW, GW, Vận chuyển thuế 8%; Phụ kiện tôn, inox, 1 lớp thuế 10%", "", 1, "L", false, 0, "")
	pdf.CellFormat(190, 4, "2. Dung sai kích thước chiều dài ±5mm, chiều rộng ±4mm | 3. Dung sai độ dày PU/EPS ±2mm", "", 1, "L", false, 0, "")
	pdf.CellFormat(190, 4, "4. Giá trên chưa bao gồm chi phí vận chuyển đến chân công trình.", "", 1, "L", false, 0, "")

	pdf.Ln(1)
	pdf.SetFont("Arial", "B", 8)
	pdf.CellFormat(190, 4, "Thông tin tài khoản nhận đơn đặt hàng:", "", 1, "L", false, 0, "")
	pdf.SetFont("Arial", "", 8)
	pdf.CellFormat(190, 4, "Tên TK: Công ty TNHH Công Nghệ Công Nghiệp Phú Sơn. Số TK: 7999989399 mở tại MB Bank - CN Hai Bà Trưng", "", 1, "L", false, 0, "")
	pdf.Ln(4)

	pdf.SetFont("Arial", "B", 9)
	pdf.CellFormat(95, 5, "ĐẠI DIỆN BÊN MUA", "", 0, "C", false, 0, "")
	pdf.CellFormat(95, 5, "ĐẠI DIỆN BÊN BÁN", "", 1, "C", false, 0, "")

	pdf.Ln(15)

	pdf.CellFormat(95, 5, "", "", 0, "C", false, 0, "")
	pdf.CellFormat(95, 5, payload.Sales.Name, "", 1, "C", false, 0, "")

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", "inline; filename=quotation.pdf")
	err = pdf.Output(w)
	if err != nil {
		http.Error(w, "Không thể xuất luồng PDF dữ liệu", http.StatusInternalServerError)
	}
}

func formatMoney(value float64) string {
	if value == 0 {
		return "0"
	}
	s := fmt.Sprintf("%.0f", value)
	res := ""
	cnt := 0
	for i := len(s) - 1; i >= 0; i-- {
		res = string(s[i]) + res
		cnt++
		if cnt == 3 && i > 0 {
			res = "." + res
			cnt = 0
		}
	}
	return res
}

func getRomanNumeral(num int) string {
	romans := []string{"I", "II", "III", "IV", "V", "VI", "VII"}
	if num > 0 && num <= len(romans) {
		return romans[num-1]
	}
	return strconv.Itoa(num)
}

func getRawMockData() QuotationRawPayload {
	return QuotationRawPayload{
		QuotationNo: "090626.01",
		Date:        "09/06/2026",
		ValidUntil:  "14/06/2026",
		Client: ClientInfo{
			Company: "Công ty CP Giải pháp Cách nhiệt Việt Nam",
			Address: "Lô 7 CN6 - Cụm công nghiệp Ngọc Hồi",
			Contact: "Mr Thành - 0982476556",
		},
		Sales: SalesRep{
			Name:  "Mr Long - 0978349917",
			Phone: "0978349917",
		},
		Items: []ProductItem{},
	}
}
