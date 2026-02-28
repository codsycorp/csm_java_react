import { 
	type EnrichedKQXSRow, 
	type DisplayKQXSRow, 
	ds_thu 
} from "./kqxs_types";

// Lấy tên ngày trong tuần từ mã (T2, T3,...)
export const getDayName = (thuCode: string): string => {
	const found = ds_thu.find(t => t.ma === thuCode);
	return found ? found.ten : '';
};

// Định dạng ngày từ YYYYMMDD sang DD/MM/YYYY
export const formatDisplayDate = (dateStr?: string): string => {
	if (!dateStr || dateStr.length !== 8) return dateStr || '';
	const year = dateStr.substr(0, 4);
	const month = dateStr.substr(4, 2);
	const day = dateStr.substr(6, 2);
	return `${day}/${month}/${year}`;
};

// Chuyển đổi dữ liệu kết quả từ API sang cấu trúc hiển thị Vue-style
export const transformToVueStructure = (rows: EnrichedKQXSRow[]): DisplayKQXSRow[] => {
	const result: DisplayKQXSRow[] = rows.map(row => {
		const data: Record<string, any> = {};
		Object.entries(row).forEach(([key, value]) => {
			if (key.startsWith('field_')) {
				data[key] = value;
			}
		});
		return {
			ten_dai: row.ten_dai ?? '',
			thu: row.thu ?? '',
			mien: row.mien ?? '',
			du_lieu_dai: row.du_lieu_dai ?? '',
			stt: row.stt ?? '',
			ngay: row.ngay ?? '',
			field_ngay: row.field_ngay ?? '',
			uniqueKey: row.uniqueKey ?? '',
			data
		};
	});
	return result;
};

// Tạo bảng "Kết quả theo hàng chục và đơn vị"
export const createHangChucDonViTable = (transformedData: DisplayKQXSRow[]): any[] => {
	const xuLyKetQua: any[] = [];
	for (let s = 0; s < 10; s++) {
		const objS: any = {
			id: `kqxs_${s}_${Date.now()}`,
			chuc: s, // Hàng chục
		};
		xuLyKetQua.push(objS);
	}
	
	transformedData.forEach((dai) => {
		const stt = dai.stt;
		const kq = dai.data;

		// Khởi tạo cột cho đài này
		for (let s = 0; s < 10; s++) {
			xuLyKetQua[s][`dai_${stt}`] = '';
		}

		// Duyệt qua tất cả field kết quả
		Object.keys(kq).forEach((tk) => {
			if (tk !== '_id' && tk !== 'id' && tk !== 'thu' && tk !== 'field_ngay' && kq[tk]) {
				const soKQ = kq[tk].toString().trim();
				if (soKQ && soKQ.length >= 2) {
					const chuc = parseInt(soKQ.substr(soKQ.length - 2, 1));
					const donvi = soKQ.substr(soKQ.length - 1, 1);

					if (!isNaN(chuc) && chuc >= 0 && chuc <= 9) {
						const fIdxDong = xuLyKetQua.findIndex(idx => idx.chuc === chuc);
						if (fIdxDong !== -1) {
							let currentValue = xuLyKetQua[fIdxDong][`dai_${stt}`];
							if (currentValue === '') {
								xuLyKetQua[fIdxDong][`dai_${stt}`] = donvi;
							} else {
								xuLyKetQua[fIdxDong][`dai_${stt}`] = currentValue + ',' + donvi;
							}
						}
					}
				}
			}
		});
	});

	return xuLyKetQua;
};