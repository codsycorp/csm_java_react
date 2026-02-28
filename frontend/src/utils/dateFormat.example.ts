/**
 * Demo sử dụng dateFormat utility
 */

import { dateFormat, chuyenNgay, TruNgayRaSoNgay, CongNgay, CongGio, toDate } from "#src/utils/dateFormat";

export function useDateFormatExamples() {
	// 1. Format ngày hiện tại
	const now = dateFormat(); // "Wed Oct 16 2025 12:34:56"
	const shortDate = dateFormat(new Date(), "shortDate"); // "10/16/25"
	const isoDate = dateFormat(new Date(), "isoDate"); // "2025-10-16"
	const customFormat = dateFormat(new Date(), "dd/mm/yyyy"); // "16/10/2025"

	// 2. Format từ chuỗi ngày
	const fromString = dateFormat("16/10/2025", "dd/mm/yyyy HH:MM:ss"); // "16/10/2025 00:00:00"

	// 3. Chuyển chuỗi sang Date
	const dateObj = chuyenNgay("16/10/2025", "dd/mm/yyyy");
	if (dateObj) {
		console.log(dateObj.toISOString());
	}

	// 4. Tính số ngày chênh lệch
	const soNgay = TruNgayRaSoNgay("20/10/2025", "16/10/2025", "dd/mm/yyyy"); // 4

	// 5. Cộng ngày
	const ngaySau = CongNgay("16/10/2025", 7, "dd/mm/yyyy"); // "23/10/2025"

	// 6. Cộng giờ
	const giờSau = CongGio("16/10/2025 12:00:00", 3, "dd/mm/yyyy HH:MM:ss"); // "16/10/2025 15:00:00"

	// 7. toDate với nhiều format
	const date1 = toDate("16-10-2025", "dd-mm-yyyy");
	const date2 = toDate("2025/10/16", "yyyy/mm/dd");

	return {
		now,
		shortDate,
		isoDate,
		customFormat,
		fromString,
		dateObj,
		soNgay,
		ngaySau,
		giờSau,
		date1,
		date2,
	};
}

// Sử dụng trong component React:
/*
import { dateFormat, CongNgay } from "#src/utils";

function MyComponent() {
  const today = dateFormat(new Date(), "dd/mm/yyyy");
  const nextWeek = CongNgay(today, 7, "dd/mm/yyyy");
  
  return (
    <div>
      <p>Hôm nay: {today}</p>
      <p>Tuần sau: {nextWeek}</p>
    </div>
  );
}
*/
