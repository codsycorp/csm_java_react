import type { BuiltinThemeType } from "#src/store";
import { duong_qua_am, jdFromDate } from "#src/utils/lunarCalendar";

export type WuxingElement = "metal" | "water" | "fire" | "wood" | "earth";
export type FengShuiGroup = WuxingElement | "neutral";
export type LunarBranchKey = "rat" | "ox" | "tiger" | "rabbit" | "dragon" | "snake" | "horse" | "goat" | "monkey" | "rooster" | "dog" | "pig";
export type HeavenlySteminese = "jia" | "yi" | "bing" | "ding" | "wu" | "ji" | "geng" | "xin" | "ren" | "gui";

export interface FengShuiThemePreset {
	value: BuiltinThemeType
	color: string
	group: FengShuiGroup
}

export const FENG_SHUI_THEME_PRESETS: FengShuiThemePreset[] = [
	{ value: "metal-gold", color: "#d4af37", group: "metal" },
	{ value: "metal-ivory", color: "#f5f1e8", group: "metal" },
	{ value: "metal-silver", color: "#c9c9c9", group: "metal" },
	{ value: "metal-bronze", color: "#b08d57", group: "metal" },
	{ value: "metal-steel", color: "#8f9aa6", group: "metal" },

	{ value: "water-indigo", color: "#274690", group: "water" },
	{ value: "water-azure", color: "#1e88e5", group: "water" },
	{ value: "water-navy", color: "#0f4c81", group: "water" },
	{ value: "water-river", color: "#3a6ea5", group: "water" },
	{ value: "water-slate", color: "#4f6d7a", group: "water" },

	{ value: "fire-crimson", color: "#dc2626", group: "fire" },
	{ value: "fire-coral", color: "#ff7043", group: "fire" },
	{ value: "fire-brick", color: "#a94438", group: "fire" },
	{ value: "fire-rust", color: "#8f3f2b", group: "fire" },
	{ value: "fire-terracotta", color: "#c65d3a", group: "fire" },

	{ value: "wood-jade", color: "#2e7d32", group: "wood" },
	{ value: "wood-olive", color: "#708238", group: "wood" },
	{ value: "wood-pine", color: "#3f7d5c", group: "wood" },
	{ value: "wood-moss", color: "#5f8f6b", group: "wood" },
	{ value: "wood-sage", color: "#7aa07a", group: "wood" },

	{ value: "earth-amber", color: "#b7791f", group: "earth" },
	{ value: "earth-sand", color: "#a1887f", group: "earth" },
	{ value: "earth-clay", color: "#b08968", group: "earth" },
	{ value: "earth-mocha", color: "#8d6e63", group: "earth" },
	{ value: "earth-khaki", color: "#9c7b5d", group: "earth" },

	{ value: "neutral-graphite", color: "#5f6368", group: "neutral" },
	{ value: "neutral-stone", color: "#7b7f87", group: "neutral" },
	{ value: "neutral-mist", color: "#97a1ab", group: "neutral" },
	{ value: "neutral-sand", color: "#a69b8f", group: "neutral" },
	{ value: "neutral-cloud", color: "#c0c4cb", group: "neutral" },
];

const PRODUCER_MAP: Record<WuxingElement, WuxingElement> = {
	metal: "earth",
	water: "metal",
	fire: "wood",
	wood: "water",
	earth: "fire",
};

const CONTROLLER_MAP: Record<WuxingElement, WuxingElement> = {
	wood: "earth",
	earth: "water",
	water: "fire",
	fire: "metal",
	metal: "wood",
};

const HOUR_CHI_ELEMENT: WuxingElement[] = [
	"water", // Ty
	"earth", // Suu
	"wood", // Dan
	"wood", // Mao
	"earth", // Thin
	"fire", // Ty.
	"fire", // Ngo
	"earth", // Mui
	"metal", // Than
	"metal", // Dau
	"earth", // Tuat
	"water", // Hoi
];

const GIO_HOANG_DAO_PATTERN = [
	"110100101100",
	"001101001011",
	"110011010010",
	"101100110100",
	"001011001101",
	"010010110011",
] as const;

const BRANCH_KEYS: LunarBranchKey[] = [
	"rat",
	"ox",
	"tiger",
	"rabbit",
	"dragon",
	"snake",
	"horse",
	"goat",
	"monkey",
	"rooster",
	"dog",
	"pig",
];

const HOUR_RANGES: Array<{ startHour: number, endHour: number }> = [
	{ startHour: 23, endHour: 1 },
	{ startHour: 1, endHour: 3 },
	{ startHour: 3, endHour: 5 },
	{ startHour: 5, endHour: 7 },
	{ startHour: 7, endHour: 9 },
	{ startHour: 9, endHour: 11 },
	{ startHour: 11, endHour: 13 },
	{ startHour: 13, endHour: 15 },
	{ startHour: 15, endHour: 17 },
	{ startHour: 17, endHour: 19 },
	{ startHour: 19, endHour: 21 },
	{ startHour: 21, endHour: 23 },
];

export interface LunarHourSlot {
	chiIndex: number
	branchKey: LunarBranchKey
	startHour: number
	endHour: number
	isAuspicious: boolean
}

export interface LunarHourAdvisory {
	dayChiIndex: number
	dayBranchKey: LunarBranchKey
	dayCanIndex: number
	dayType: "duong" | "am"
	currentChiIndex: number
	currentBranchKey: LunarBranchKey
	currentSlot: LunarHourSlot
	isCurrentAuspicious: boolean
	auspiciousSlots: LunarHourSlot[]
	inauspiciousSlots: LunarHourSlot[]
}

export function resolveElementByBirthYear(year: number): WuxingElement {
	const stem = year % 10;
	if (stem === 0 || stem === 1) {
		return "metal";
	}
	if (stem === 2 || stem === 3) {
		return "water";
	}
	if (stem === 4 || stem === 5) {
		return "wood";
	}
	if (stem === 6 || stem === 7) {
		return "fire";
	}
	return "earth";
}

export function resolveElementByLunarYear(year: number): WuxingElement {
	return resolveElementByBirthYear(year);
}

export function getSupportingElement(element: WuxingElement): WuxingElement {
	return PRODUCER_MAP[element];
}

export function getPresetsByGroup(group: FengShuiGroup) {
	return FENG_SHUI_THEME_PRESETS.filter(item => item.group === group);
}

export function getPresetsByElement(group: WuxingElement) {
	return getPresetsByGroup(group);
}

export function isElementConflict(a: WuxingElement, b: WuxingElement) {
	return CONTROLLER_MAP[a] === b || CONTROLLER_MAP[b] === a;
}

function resolveDayElement(date: Date): WuxingElement {
	const jd = jdFromDate(date.getDate(), date.getMonth() + 1, date.getFullYear());
	const canIndex = (jd + 9) % 10;
	if (canIndex === 0 || canIndex === 1)
		return "metal";
	if (canIndex === 2 || canIndex === 3)
		return "water";
	if (canIndex === 4 || canIndex === 5)
		return "wood";
	if (canIndex === 6 || canIndex === 7)
		return "fire";
	return "earth";
}

function resolveHourElement(date: Date): WuxingElement {
	const hour = date.getHours();
	const chiIndex = Math.floor(((hour + 1) % 24) / 2);
	return HOUR_CHI_ELEMENT[chiIndex];
}

function resolveDayChiIndex(date: Date) {
	const jd = jdFromDate(date.getDate(), date.getMonth() + 1, date.getFullYear());
	return (jd + 1) % 12;
}

function resolveDayCanIndex(date: Date) {
	const jd = jdFromDate(date.getDate(), date.getMonth() + 1, date.getFullYear());
	return (jd + 9) % 10;
}

function resolveDayType(canIndex: number): "duong" | "am" {
	// Ngày Can Dương (Yang Stem): Giáp(0), Bính(2), Mậu(4), Canh(6), Nhâm(8) — even index
	// Ngày Can Âm  (Yin Stem):   Ất(1), Đinh(3), Kỷ(5), Tân(7), Quý(9)    — odd index
	return canIndex % 2 === 0 ? "duong" : "am";
}

export function getHourRangeLabel(chiIndex: number) {
	const slot = HOUR_RANGES[chiIndex];
	if (!slot) {
		return "";
	}
	const start = String(slot.startHour).padStart(2, "0");
	const endHourDisplay = slot.endHour === 1 ? "00" : String(slot.endHour - 1).padStart(2, "0");
	return `${start}:00-${endHourDisplay}:59`;
}

export function getLunarHourAdvisory(date = new Date()): LunarHourAdvisory {
	const dayChiIndex = resolveDayChiIndex(date);
	const dayCanIndex = resolveDayCanIndex(date);
	const dayType = resolveDayType(dayCanIndex);
	const pattern = GIO_HOANG_DAO_PATTERN[dayChiIndex % 6];
	const currentChiIndex = Math.floor(((date.getHours() + 1) % 24) / 2);

	const allSlots = BRANCH_KEYS.map((branchKey, chiIndex) => {
		const range = HOUR_RANGES[chiIndex];
		const isAuspicious = pattern.charAt(chiIndex) === "1";
		return {
			chiIndex,
			branchKey,
			startHour: range.startHour,
			endHour: range.endHour,
			isAuspicious,
		};
	});

	const currentSlot = allSlots[currentChiIndex];

	return {
		dayChiIndex,
		dayBranchKey: BRANCH_KEYS[dayChiIndex],
		dayCanIndex,
		dayType,
		currentChiIndex,
		currentBranchKey: currentSlot.branchKey,
		currentSlot,
		isCurrentAuspicious: currentSlot.isAuspicious,
		auspiciousSlots: allSlots.filter(slot => slot.isAuspicious),
		inauspiciousSlots: allSlots.filter(slot => !slot.isAuspicious),
	};
}

// ─── Trực (建除十二神) — 12-Officer cycle ───────────────────────────────────
// Formula: tructIndex = (dayChiIndex − monthChiIndex + 12) % 12
// Month chi: Tháng 1=Dần(2), Tháng 2=Mão(3), ..., Tháng 11=Tý(0), Tháng 12=Sửu(1)
// → monthChiIndex = (lunarMonth + 1) % 12
//
// Dương Trạch (living house feng shui) suitability per Trực:
//   Tốt:      Kiến(0), Trừ(1), Bình(3), Định(4), Thành(8), Khai(10)
//   Trung:    Chấp(5), Thu(9)
//   Xấu:      Mãn(2), Phá(6), Nguy(7), Bế(11)
//
// Âm Trạch (tomb/burial feng shui) suitability per Trực:
//   Tốt:      Bình(3), Định(4), Chấp(5), Thành(8), Khai(10)
//   Trung:    Trừ(1), Thu(9)
//   Xấu:      Kiến(0), Mãn(2), Phá(6), Nguy(7), Bế(11)
// ─────────────────────────────────────────────────────────────────────────────

export type TructRating = "tot" | "trung" | "xau";

export interface TructInfo {
	index: number
	nameKey: string  // i18n key suffix: e.g. "kien", "tru", ...
	rating: TructRating
}

const TRUCT_NAMES = ["kien", "tru", "man", "binh", "dinh", "chap", "pha", "nguy", "thanh", "thu", "khai", "be"] as const;

// Dương Trạch suitability by Trực index
const TRUCT_DUONG_TRACH_RATING: TructRating[] = [
	"tot",   // 0  Kiến  — khởi công, đặt móng nhà mới, động thổ
	"tot",   // 1  Trừ  — phá dỡ cũ, dọn dẹp trước xây, bỏ vật xấu
	"xau",   // 2  Mãn  — quá đầy, kỵ động thổ và sửa chữa
	"tot",   // 3  Bình — bình hoà, tốt tu sửa nhỏ, trang hoàng nội thất
	"tot",   // 4  Định — ổn định, lắp đặt cố định, hoàn thiện, lắp cửa
	"trung", // 5  Chấp — giữ nguyên hiện trạng, tránh thay đổi lớn
	"xau",   // 6  Phá  — phá vỡ, đại kỵ mọi việc nhà cửa
	"xau",   // 7  Nguy — nguy hiểm, kỵ khởi công, leo trèo sửa mái
	"tot",   // 8  Thành — nhập trạch, khánh thành, ổn định gia đình
	"trung", // 9  Thu  — thu dọn, chuẩn bị chuyển nhà, dọn kho
	"tot",   // 10 Khai — khai trương, mở cửa nhà mới, nhập trạch
	"xau",   // 11 Bế  — đóng kín, kỵ nhập trạch, mọi việc bị bế tắc
];

// Âm Trạch suitability by Trực index
const TRUCT_AM_TRACH_RATING: TructRating[] = [
	"xau",   // 0  Kiến  — khí sinh mới, kỵ an táng, cải táng
	"trung", // 1  Trừ  — thanh trừ, có thể làm công việc vệ sinh mộ phần
	"xau",   // 2  Mãn  — quá đầy, bất lợi âm trạch
	"tot",   // 3  Bình — bình hoà, thuận lợi chọn huyệt, sửa mộ
	"tot",   // 4  Định — ổn định, tốt lập bia, hoàn thiện mộ phần
	"tot",   // 5  Chấp — thu giữ, đặc biệt tốt cho an táng, nhập quan
	"xau",   // 6  Phá  — phá vỡ, đại kỵ mọi việc âm trạch
	"xau",   // 7  Nguy — nguy hiểm, kỵ động thổ, cải táng
	"tot",   // 8  Thành — thành tựu, đại cát an táng, lập bia, cải táng
	"trung", // 9  Thu  — thu nhận, có thể dùng cho tế lễ, giỗ chạp
	"tot",   // 10 Khai — khai mở, tốt chọn huyệt, động thổ xây mộ
	"xau",   // 11 Bế  — đóng kín, kỵ an táng (âm khí bị bế tắc)
];

function resolveTruct(date: Date) {
	const lunarDate = duong_qua_am(date.getDate(), date.getMonth() + 1, date.getFullYear());
	const dayChiIndex = resolveDayChiIndex(date);
	const monthChiIndex = (lunarDate.month + 1) % 12;
	const tructIndex = (dayChiIndex - monthChiIndex + 12) % 12;
	return { lunarDate, tructIndex };
}

export interface DuongTrachAdvisory {
	lunarDay: number
	lunarMonth: number
	lunarYear: number
	lunarLeap: number
	truct: TructInfo
	isAuspicious: boolean
}

export function getDuongTrachAdvisory(date = new Date()): DuongTrachAdvisory {
	const { lunarDate, tructIndex } = resolveTruct(date);
	const rating = TRUCT_DUONG_TRACH_RATING[tructIndex];
	return {
		lunarDay: lunarDate.day,
		lunarMonth: lunarDate.month,
		lunarYear: lunarDate.year,
		lunarLeap: lunarDate.leap,
		truct: { index: tructIndex, nameKey: TRUCT_NAMES[tructIndex], rating },
		isAuspicious: rating === "tot",
	};
}

export interface AmTrachAdvisory {
	lunarDay: number
	lunarMonth: number
	lunarYear: number
	lunarLeap: number
	truct: TructInfo
	// Whether today is overall auspicious for âm trạch work
	isAuspicious: boolean
}

export function getAmTrachAdvisory(date = new Date()): AmTrachAdvisory {
	const { lunarDate, tructIndex } = resolveTruct(date);
	const rating = TRUCT_AM_TRACH_RATING[tructIndex];
	return {
		lunarDay: lunarDate.day,
		lunarMonth: lunarDate.month,
		lunarYear: lunarDate.year,
		lunarLeap: lunarDate.leap,
		truct: { index: tructIndex, nameKey: TRUCT_NAMES[tructIndex], rating },
		isAuspicious: rating === "tot",
	};
}

// Ming Wu Xing (Life Element) mapping based on Stem-Branch combinations
const MING_WU_XING_MAP: Record<number, Record<number, { element: WuxingElement, description: string }>> = {
	// Stem 4,5 (Mậu, Kỷ - Earth): Thổ
	4: { 0: { element: "water", description: "Hải Trung Kim" }, 1: { element: "earth", description: "Xích Trượng Hỏa" }, 2: { element: "fire", description: "Đại Dạo Mộc" }, 3: { element: "wood", description: "Tháp Thượng Hỏa" }, 4: { element: "fire", description: "Bạch Lạp Kim" }, 5: { element: "metal", description: "Dương Lưu Thủy" }, 6: { element: "water", description: "Thiên Hà Thủy" }, 7: { element: "water", description: "Đạo Biên Hỏa" }, 8: { element: "fire", description: "Thính Uyển Hỏa" }, 9: { element: "fire", description: "Nước suối Thủy" }, 10: { element: "water", description: "Tả Trượng Thủy" }, 11: { element: "water", description: "Bìm Biển Nước" } },
	5: { 0: { element: "wood", description: "Hải Trung Kim" }, 1: { element: "wood", description: "Xích Trượng Hỏa" }, 2: { element: "wood", description: "Đại Dạo Mộc" }, 3: { element: "water", description: "Tháp Thượng Hỏa" }, 4: { element: "metal", description: "Bạch Lạp Kim" }, 5: { element: "metal", description: "Dương Lưu Thủy" }, 6: { element: "water", description: "Thiên Hà Thủy" }, 7: { element: "fire", description: "Đạo Biên Hỏa" }, 8: { element: "fire", description: "Thính Uyển Hỏa" }, 9: { element: "water", description: "Nước suối Thủy" }, 10: { element: "water", description: "Tả Trượng Thủy" }, 11: { element: "wood", description: "Bìm Biển Nước" } },
	6: { 0: { element: "metal", description: "Hải Trung Kim" }, 1: { element: "fire", description: "Xích Trượng Hỏa" }, 2: { element: "earth", description: "Đại Dạo Mộc" }, 3: { element: "wood", description: "Tháp Thượng Hỏa" }, 4: { element: "water", description: "Bạch Lạp Kim" }, 5: { element: "water", description: "Dương Lưu Thủy" }, 6: { element: "metal", description: "Thiên Hà Thủy" }, 7: { element: "fire", description: "Đạo Biên Hỏa" }, 8: { element: "fire", description: "Thính Uyển Hỏa" }, 9: { element: "wood", description: "Nước suối Thủy" }, 10: { element: "earth", description: "Tả Trượng Thủy" }, 11: { element: "water", description: "Bìm Biển Nước" } },
	7: { 0: { element: "water", description: "Hải Trung Kim" }, 1: { element: "earth", description: "Xích Trượng Hỏa" }, 2: { element: "fire", description: "Đại Dạo Mộc" }, 3: { element: "fire", description: "Tháp Thượng Hỏa" }, 4: { element: "metal", description: "Bạch Lạp Kim" }, 5: { element: "metal", description: "Dương Lưu Thủy" }, 6: { element: "water", description: "Thiên Hà Thủy" }, 7: { element: "water", description: "Đạo Biên Hỏa" }, 8: { element: "earth", description: "Thính Uyển Hỏa" }, 9: { element: "fire", description: "Nước suối Thủy" }, 10: { element: "water", description: "Tả Trượng Thủy" }, 11: { element: "wood", description: "Bìm Biển Nước" } },
	8: { 0: { element: "earth", description: "Hải Trung Kim" }, 1: { element: "metal", description: "Xích Trượng Hỏa" }, 2: { element: "wood", description: "Đại Dạo Mộc" }, 3: { element: "earth", description: "Tháp Thượng Hỏa" }, 4: { element: "metal", description: "Bạch Lạp Kim" }, 5: { element: "fire", description: "Dương Lưu Thủy" }, 6: { element: "metal", description: "Thiên Hà Thủy" }, 7: { element: "fire", description: "Đạo Biên Hỏa" }, 8: { element: "earth", description: "Thính Uyển Hỏa" }, 9: { element: "metal", description: "Nước suối Thủy" }, 10: { element: "earth", description: "Tả Trượng Thủy" }, 11: { element: "fire", description: "Bìm Biển Nước" } },
	9: { 0: { element: "wood", description: "Hải Trung Kim" }, 1: { element: "wood", description: "Xích Trượng Hỏa" }, 2: { element: "earth", description: "Đại Dạo Mộc" }, 3: { element: "water", description: "Tháp Thượng Hỏa" }, 4: { element: "fire", description: "Bạch Lạp Kim" }, 5: { element: "earth", description: "Dương Lưu Thủy" }, 6: { element: "fire", description: "Thiên Hà Thủy" }, 7: { element: "metal", description: "Đạo Biên Hỏa" }, 8: { element: "water", description: "Thính Uyển Hỏa" }, 9: { element: "earth", description: "Nước suối Thủy" }, 10: { element: "metal", description: "Tả Trượng Thủy" }, 11: { element: "earth", description: "Bìm Biển Nước" } },
};

export function getHeavenlyStemFromYear(year: number): HeavenlySteminese {
	const stemIndex = year % 10;
	const stems: HeavenlySteminese[] = ["jia", "yi", "bing", "ding", "wu", "ji", "geng", "xin", "ren", "gui"];
	return stems[stemIndex];
}

export function getStemElement(stem: HeavenlySteminese): WuxingElement {
	const map: Record<HeavenlySteminese, WuxingElement> = {
		jia: "wood",
		yi: "wood",
		bing: "fire",
		ding: "fire",
		wu: "earth",
		ji: "earth",
		geng: "metal",
		xin: "metal",
		ren: "water",
		gui: "water",
	};
	return map[stem];
}

export function getBranchElement(branchKey: LunarBranchKey): WuxingElement {
	const map: Record<LunarBranchKey, WuxingElement> = {
		rat: "water",
		ox: "earth",
		tiger: "wood",
		rabbit: "wood",
		dragon: "earth",
		snake: "fire",
		horse: "fire",
		goat: "earth",
		monkey: "metal",
		rooster: "metal",
		dog: "earth",
		pig: "water",
	};
	return map[branchKey];
}

export interface DetailedWuxingReading {
	year: number
	stem: HeavenlySteminese
	stemElement: WuxingElement
	branch: LunarBranchKey
	branchElement: WuxingElement
	mingElement: WuxingElement
	mingDescription: string
	producingElement: WuxingElement
	controllingElement: WuxingElement
}

export function getDetailedWuxingReading(year: number): DetailedWuxingReading {
	const stem = getHeavenlyStemFromYear(year);
	const stemElement = getStemElement(stem);
	const stemIndex = year % 10;
	const branchIndex = (year - 4) % 12; // Lunar cycle
	const branchKey = BRANCH_KEYS[branchIndex];
	const branchElement = getBranchElement(branchKey);

	// Get Ming Wu Xing (life element) from combinations
	const mingData = MING_WU_XING_MAP[stemIndex]?.[branchIndex] || { element: stemElement, description: "Unknown" };

	return {
		year,
		stem,
		stemElement,
		branch: branchKey,
		branchElement,
		mingElement: mingData.element as WuxingElement,
		mingDescription: mingData.description,
		producingElement: PRODUCER_MAP[mingData.element as WuxingElement],
		controllingElement: CONTROLLER_MAP[mingData.element as WuxingElement],
	};
}

export interface LunarCompatibility {
	lunarNow: {
		year: number
		month: number
		day: number
	}
	userElement: WuxingElement
	supportingElement: WuxingElement
	dayElement: WuxingElement
	hourElement: WuxingElement
	isConflict: boolean
	conflictWithDay: boolean
	conflictWithHour: boolean
	recommendedGroup: FengShuiGroup
}

export function evaluateLunarCompatibility(lunarBirthYear: number, date = new Date()): LunarCompatibility {
	const lunarNow = duong_qua_am(date.getDate(), date.getMonth() + 1, date.getFullYear(), 7);
	const userElement = resolveElementByLunarYear(lunarBirthYear);
	const supportingElement = getSupportingElement(userElement);
	const dayElement = resolveDayElement(date);
	const hourElement = resolveHourElement(date);
	const conflictWithDay = isElementConflict(userElement, dayElement);
	const conflictWithHour = isElementConflict(userElement, hourElement);
	const isConflict = conflictWithDay || conflictWithHour;

	return {
		lunarNow: {
			year: lunarNow.year,
			month: lunarNow.month,
			day: lunarNow.day,
		},
		userElement,
		supportingElement,
		dayElement,
		hourElement,
		isConflict,
		conflictWithDay,
		conflictWithHour,
		recommendedGroup: isConflict ? "neutral" : supportingElement,
	};
}

export function pickAutoPresetByDate(presets: FengShuiThemePreset[], date = new Date()) {
	if (presets.length === 0) {
		return null;
	}
	const lunar = duong_qua_am(date.getDate(), date.getMonth() + 1, date.getFullYear(), 7);
	const year = lunar.year;
	const month = lunar.month;
	const day = lunar.day;
	const hour = date.getHours();
	const minute = date.getMinutes();
	const second = date.getSeconds();

	const seed = year * 13 + month * 17 + day * 19 + hour * 23 + minute * 29 + second * 31;
	const index = Math.abs(seed) % presets.length;
	return presets[index];
}
