import type { BuiltinThemeType } from "#src/store";
import type { ColorPickerProps } from "antd";
import type { ReactNode } from "react";

import { usePreferencesStore } from "#src/store";
import { cn } from "#src/utils";
import { type DetailedWuxingReading, evaluateLunarCompatibility, getAmTrachAdvisory, getDetailedWuxingReading, getDuongTrachAdvisory, getHourRangeLabel, getLunarHourAdvisory, getPresetsByGroup, type LunarBranchKey, type WuxingElement } from "#src/utils/feng-shui-theme";

import { Button, ColorPicker, InputNumber, Tooltip } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

interface ThemePresetItem {
	label: ReactNode
	value: BuiltinThemeType
	color: string
	group: "classic" | "metal" | "water" | "fire" | "wood" | "earth" | "neutral"
}

export function BuiltinTheme() {
	const {
		builtinTheme,
		themeColorPrimary,
		birthYear,
		fengShuiManualColorSelected,
		setPreferences,
	} = usePreferencesStore();
	const [color, setColor] = useState(builtinTheme === "custom" ? themeColorPrimary : "#1677ff");
	const { t } = useTranslation();
	const currentYear = new Date().getFullYear();

	const compatibility = useMemo(() => {
		if (!birthYear) {
			return null;
		}
		return evaluateLunarCompatibility(birthYear, new Date());
	}, [birthYear]);

	const detailedWuxingReading = useMemo<DetailedWuxingReading | null>(() => {
		if (!birthYear) {
			return null;
		}
		return getDetailedWuxingReading(birthYear);
	}, [birthYear]);

	const currentYearElement = useMemo<WuxingElement>(() => {
		return evaluateLunarCompatibility(currentYear, new Date()).userElement;
	}, [currentYear]);

	const userElement = compatibility?.userElement ?? null;
	const supportingElement = compatibility?.supportingElement ?? null;
	const favoredElements = useMemo<WuxingElement[]>(() => {
		if (!userElement || !supportingElement) {
			return [];
		}
		return [supportingElement, userElement];
	}, [supportingElement, userElement]);
	const isConflict = compatibility?.isConflict ?? false;
	const hourAdvisory = useMemo(() => getLunarHourAdvisory(new Date()), []);
	const amTrachAdvisory = useMemo(() => getAmTrachAdvisory(new Date()), []);
	const duongTrachAdvisory = useMemo(() => getDuongTrachAdvisory(new Date()), []);

	const branchLabelMap: Record<LunarBranchKey, string> = {
		rat: t("preferences.theme.builtin.branchRat"),
		ox: t("preferences.theme.builtin.branchOx"),
		tiger: t("preferences.theme.builtin.branchTiger"),
		rabbit: t("preferences.theme.builtin.branchRabbit"),
		dragon: t("preferences.theme.builtin.branchDragon"),
		snake: t("preferences.theme.builtin.branchSnake"),
		horse: t("preferences.theme.builtin.branchHorse"),
		goat: t("preferences.theme.builtin.branchGoat"),
		monkey: t("preferences.theme.builtin.branchMonkey"),
		rooster: t("preferences.theme.builtin.branchRooster"),
		dog: t("preferences.theme.builtin.branchDog"),
		pig: t("preferences.theme.builtin.branchPig"),
	};

	const recommendedActions = useMemo(() => {
		return [
			t("preferences.theme.builtin.auspiciousDo1"),
			t("preferences.theme.builtin.auspiciousDo2"),
			t("preferences.theme.builtin.auspiciousDo3"),
			t("preferences.theme.builtin.auspiciousDo4"),
			t("preferences.theme.builtin.auspiciousDo5"),
			t("preferences.theme.builtin.auspiciousDo6"),
		];
	}, [t]);

	const avoidActions = useMemo(() => {
		return [
			t("preferences.theme.builtin.inauspiciousAvoid1"),
			t("preferences.theme.builtin.inauspiciousAvoid2"),
			t("preferences.theme.builtin.inauspiciousAvoid3"),
			t("preferences.theme.builtin.inauspiciousAvoid4"),
			t("preferences.theme.builtin.inauspiciousAvoid5"),
			t("preferences.theme.builtin.inauspiciousAvoid6"),
		];
	}, [t]);

	const getElementLabel = (element: WuxingElement) => {
		const map: Record<WuxingElement, string> = {
			metal: t("preferences.theme.builtin.groupMetal"),
			water: t("preferences.theme.builtin.groupWater"),
			fire: t("preferences.theme.builtin.groupFire"),
			wood: t("preferences.theme.builtin.groupWood"),
			earth: t("preferences.theme.builtin.groupEarth"),
		};
		return map[element];
	};

	const builtinThemePresets: ThemePresetItem[] = [
		{
			label: t("preferences.theme.builtin.red"),
			value: "red",
			color: "#f5222d",
			group: "classic",
		},
		{
			label: t("preferences.theme.builtin.volcano"),
			value: "volcano",
			color: "#fa541c",
			group: "classic",
		},
		{
			label: t("preferences.theme.builtin.orange"),
			value: "orange",
			color: "#fa8c16",
			group: "classic",
		},
		{
			label: t("preferences.theme.builtin.gold"),
			value: "gold",
			color: "#faad14",
			group: "classic",
		},
		{
			label: t("preferences.theme.builtin.yellow"),
			value: "yellow",
			color: "#fadb14",
			group: "classic",
		},
		{
			label: t("preferences.theme.builtin.lime"),
			value: "lime",
			color: "#a0d911",
			group: "classic",
		},
		{
			label: t("preferences.theme.builtin.green"),
			value: "green",
			color: "#52c41a",
			group: "classic",
		},
		{
			label: t("preferences.theme.builtin.cyan"),
			value: "cyan",
			color: "#13c2c2",
			group: "classic",
		},
		{
			label: (
				<>
					<span>{t("preferences.theme.builtin.blue")}</span>
					<br className="zh-CN:hidden" />
					<span>
						(
						{t("preferences.theme.builtin.title")}
						)
					</span>
				</>
			),
			value: "blue",
			color: "#1677ff",
			group: "classic",
		},
		{
			label: t("preferences.theme.builtin.geekblue"),
			value: "geekblue",
			color: "#2f54eb",
			group: "classic",
		},
		{
			label: t("preferences.theme.builtin.purple"),
			value: "purple",
			color: "#722ed1",
			group: "classic",
		},
		{
			label: t("preferences.theme.builtin.magenta"),
			value: "magenta",
			color: "#eb2f96",
			group: "classic",
		},
		{
			label: t("preferences.theme.builtin.gray"),
			value: "gray",
			color: "#bfbfbf",
			group: "classic",
		},
		{
			label: t("preferences.theme.builtin.metalGold"),
			value: "metal-gold",
			color: "#d4af37",
			group: "metal",
		},
		{
			label: t("preferences.theme.builtin.metalIvory"),
			value: "metal-ivory",
			color: "#f5f1e8",
			group: "metal",
		},
		{
			label: t("preferences.theme.builtin.metalSilver"),
			value: "metal-silver",
			color: "#c9c9c9",
			group: "metal",
		},
		{
			label: t("preferences.theme.builtin.metalBronze"),
			value: "metal-bronze",
			color: "#b08d57",
			group: "metal",
		},
		{
			label: t("preferences.theme.builtin.metalSteel"),
			value: "metal-steel",
			color: "#8f9aa6",
			group: "metal",
		},
		{
			label: t("preferences.theme.builtin.waterIndigo"),
			value: "water-indigo",
			color: "#274690",
			group: "water",
		},
		{
			label: t("preferences.theme.builtin.waterAzure"),
			value: "water-azure",
			color: "#1e88e5",
			group: "water",
		},
		{
			label: t("preferences.theme.builtin.waterNavy"),
			value: "water-navy",
			color: "#0f4c81",
			group: "water",
		},
		{
			label: t("preferences.theme.builtin.waterRiver"),
			value: "water-river",
			color: "#3a6ea5",
			group: "water",
		},
		{
			label: t("preferences.theme.builtin.waterSlate"),
			value: "water-slate",
			color: "#4f6d7a",
			group: "water",
		},
		{
			label: t("preferences.theme.builtin.fireCrimson"),
			value: "fire-crimson",
			color: "#dc2626",
			group: "fire",
		},
		{
			label: t("preferences.theme.builtin.fireCoral"),
			value: "fire-coral",
			color: "#ff7043",
			group: "fire",
		},
		{
			label: t("preferences.theme.builtin.fireBrick"),
			value: "fire-brick",
			color: "#a94438",
			group: "fire",
		},
		{
			label: t("preferences.theme.builtin.fireRust"),
			value: "fire-rust",
			color: "#8f3f2b",
			group: "fire",
		},
		{
			label: t("preferences.theme.builtin.fireTerracotta"),
			value: "fire-terracotta",
			color: "#c65d3a",
			group: "fire",
		},
		{
			label: t("preferences.theme.builtin.woodJade"),
			value: "wood-jade",
			color: "#2e7d32",
			group: "wood",
		},
		{
			label: t("preferences.theme.builtin.woodOlive"),
			value: "wood-olive",
			color: "#708238",
			group: "wood",
		},
		{
			label: t("preferences.theme.builtin.woodPine"),
			value: "wood-pine",
			color: "#3f7d5c",
			group: "wood",
		},
		{
			label: t("preferences.theme.builtin.woodMoss"),
			value: "wood-moss",
			color: "#5f8f6b",
			group: "wood",
		},
		{
			label: t("preferences.theme.builtin.woodSage"),
			value: "wood-sage",
			color: "#7aa07a",
			group: "wood",
		},
		{
			label: t("preferences.theme.builtin.earthAmber"),
			value: "earth-amber",
			color: "#b7791f",
			group: "earth",
		},
		{
			label: t("preferences.theme.builtin.earthSand"),
			value: "earth-sand",
			color: "#a1887f",
			group: "earth",
		},
		{
			label: t("preferences.theme.builtin.earthClay"),
			value: "earth-clay",
			color: "#b08968",
			group: "earth",
		},
		{
			label: t("preferences.theme.builtin.earthMocha"),
			value: "earth-mocha",
			color: "#8d6e63",
			group: "earth",
		},
		{
			label: t("preferences.theme.builtin.earthKhaki"),
			value: "earth-khaki",
			color: "#9c7b5d",
			group: "earth",
		},
		{
			label: t("preferences.theme.builtin.neutralGraphite"),
			value: "neutral-graphite",
			color: "#5f6368",
			group: "neutral",
		},
		{
			label: t("preferences.theme.builtin.neutralStone"),
			value: "neutral-stone",
			color: "#7b7f87",
			group: "neutral",
		},
		{
			label: t("preferences.theme.builtin.neutralMist"),
			value: "neutral-mist",
			color: "#97a1ab",
			group: "neutral",
		},
		{
			label: t("preferences.theme.builtin.neutralSand"),
			value: "neutral-sand",
			color: "#a69b8f",
			group: "neutral",
		},
		{
			label: t("preferences.theme.builtin.neutralCloud"),
			value: "neutral-cloud",
			color: "#c0c4cb",
			group: "neutral",
		},
		{
			label: t("preferences.theme.builtin.custom"),
			value: "custom",
			color: "#1677ff",
			group: "classic",
		},
	];

	const groupedPresetConfig = [
		{ key: "metal", title: t("preferences.theme.builtin.groupMetal"), tooltip: t("preferences.theme.builtin.groupMetalTip") },
		{ key: "water", title: t("preferences.theme.builtin.groupWater"), tooltip: t("preferences.theme.builtin.groupWaterTip") },
		{ key: "fire", title: t("preferences.theme.builtin.groupFire"), tooltip: t("preferences.theme.builtin.groupFireTip") },
		{ key: "wood", title: t("preferences.theme.builtin.groupWood"), tooltip: t("preferences.theme.builtin.groupWoodTip") },
		{ key: "earth", title: t("preferences.theme.builtin.groupEarth"), tooltip: t("preferences.theme.builtin.groupEarthTip") },
		{ key: "neutral", title: t("preferences.theme.builtin.groupNeutral"), tooltip: t("preferences.theme.builtin.groupNeutralTip") },
	] as const;

	const visibleGroupConfig = useMemo(() => {
		if (!birthYear || !supportingElement) {
			return groupedPresetConfig.filter(item => item.key !== "neutral");
		}
		if (isConflict) {
			return groupedPresetConfig.filter(item => item.key === "neutral");
		}
		return groupedPresetConfig.filter(item => item.key === supportingElement);
	}, [birthYear, groupedPresetConfig, isConflict, supportingElement]);

	const handleColorChange: ColorPickerProps["onChangeComplete"] = (aggregationColor) => {
		const newColor = `#${aggregationColor.toHex()}`;
		setColor(newColor);
		setPreferences({
			builtinTheme: "custom",
			themeColorPrimary: newColor,
			fengShuiManualColorSelected: true,
		});
	};

	function handleClick(value: BuiltinThemeType) {
		const selectedPreset = builtinThemePresets.find(item => item.value === value);
		if (!selectedPreset) {
			return;
		}
		setPreferences({
			builtinTheme: value,
			themeColorPrimary: selectedPreset.color,
			fengShuiManualColorSelected: true,
		});
	}

	function handleBirthYearChange(value: number | null) {
		setPreferences({
			birthYear: value,
			fengShuiManualColorSelected: false,
		});
	}

	function pickPreferredColorByGroup(targetGroup: Exclude<ThemePresetItem["group"], "classic">) {
		const preset = getPresetsByGroup(targetGroup)[0] || builtinThemePresets.find(item => item.group === targetGroup);
		if (!preset) {
			return;
		}
		handleClick(preset.value);
	}

	const renderPresetItem = (item: ThemePresetItem) => {
		const innerBlock = (
			<li
				key={item.value}
				onClick={() => handleClick(item.value)}
			>
				<dl className="mb-0">
					<dd
						className={cn(
							"relative py-4 px-9 outline outline-1 outline-gray-300 dark:outline-gray-700 rounded-md cursor-pointer",
							"before:content-[''] before:absolute before:left-1/2 before:top-1/2 before:h-0 before:w-0 before:rounded-sm before:opacity-0 before:outline before:outline-2 before:outline-transparent",
							item.value === builtinTheme ? "" : "before:transition-all before:duration-300",
							item.value === builtinTheme ? "" : "before:hover:outline-blue-600 dark:before:hover:outline-blue-700 before:hover:left-0 before:hover:top-0 before:hover:h-full before:hover:w-full before:hover:p-1 before:hover:opacity-100",
							{ "outline-2 outline-blue-600 dark:outline-blue-700": item.value === builtinTheme },
						)}
					>
						<div
							className="rounded-md size-5"
							style={{ backgroundColor: item.value === "custom" ? color : item.color }}
						>
							<span className="hidden">{item.label}</span>
							<span className="hidden">{item.color}</span>
						</div>
					</dd>

					<dt className="mt-2.5 flex gap-1 justify-center text-xs opacity-90 text-center leading-4 max-w-[92px]">
						<span>{item.label}</span>
					</dt>
				</dl>
			</li>
		);

		if (item.value === "custom") {
			return (
				<ColorPicker key={item.value} value={color} onChangeComplete={handleColorChange}>
					{innerBlock}
				</ColorPicker>
			);
		}

		return innerBlock;
	};

	return (
		<>
			<div className="w-full mb-3 px-1">
				<div className="text-xs font-medium opacity-80 mb-2">
					{t("preferences.theme.builtin.birthYearLabel")}
				</div>
				<div className="flex items-center gap-2 flex-wrap">
					<InputNumber
						min={1900}
						max={currentYear}
						value={birthYear}
						onChange={v => handleBirthYearChange(typeof v === "number" ? v : null)}
						placeholder={t("preferences.theme.builtin.birthYearPlaceholder")}
					/>
					<Tooltip title={t("preferences.theme.builtin.birthYearTip")}>
						<span className="text-xs opacity-70 cursor-help">{t("preferences.theme.builtin.birthYearHelp")}</span>
					</Tooltip>
				</div>
				<div className="text-xs opacity-75 mt-2">
					{t("preferences.theme.builtin.currentYearElement", {
						year: currentYear,
						element: getElementLabel(currentYearElement),
					})}
				</div>
				{compatibility
					? (
						<div className="text-xs opacity-75 mt-1">
							{t("preferences.theme.builtin.lunarNowInfo", {
								year: compatibility.lunarNow.year,
								month: compatibility.lunarNow.month,
								day: compatibility.lunarNow.day,
							})}
						</div>
					)
					: null}
				{userElement
					? (
						<>
							<div className="text-xs opacity-85 mt-1">
								{t("preferences.theme.builtin.userElementResult", {
									year: birthYear,
									element: getElementLabel(userElement),
								})}
							</div>
							{supportingElement
								? (
									<div className="text-xs opacity-90 mt-1">
										{isConflict
											? t("preferences.theme.builtin.conflictRecommendation", {
												dayElement: getElementLabel(compatibility?.dayElement ?? userElement),
												hourElement: getElementLabel(compatibility?.hourElement ?? userElement),
											})
											: t("preferences.theme.builtin.recommendation", {
												supportElement: getElementLabel(supportingElement),
												selfElement: getElementLabel(userElement),
											})}
									</div>
								)
								: null}
							<div className="flex gap-2 mt-2 flex-wrap">
								{supportingElement && !isConflict
									? (
										<Button size="small" type="primary" onClick={() => pickPreferredColorByGroup(supportingElement)}>
											{t("preferences.theme.builtin.applySupportingColor")}
										</Button>
									)
									: null}
								{isConflict
									? (
										<Button size="small" type="primary" danger onClick={() => pickPreferredColorByGroup("neutral")}>
											{t("preferences.theme.builtin.applyNeutralColor")}
										</Button>
									)
									: null}
							</div>
							<div className="text-xs opacity-70 mt-2">
								{isConflict
									? t("preferences.theme.builtin.onlyNeutralGroupWhenConflict")
									: t("preferences.theme.builtin.onlySupportingGroup")}
							</div>
						</>
					)
					: (
						<div className="text-xs opacity-70 mt-1">
							{t("preferences.theme.builtin.userElementEmpty")}
						</div>
					)}
			</div>

			{/* Detailed Wu Xing Reading Section */}
			{detailedWuxingReading
				? (
					<div className="w-full mb-4 px-2 py-3 rounded-lg border border-slate-300 bg-slate-100">
						<div className="text-sm font-bold text-slate-700 mb-3">
							🔷
							{" "}
							{t("preferences.theme.builtin.detailedWuxingTitle")}
						</div>
						<div className="space-y-2">
							<div className="text-xs">
							<span className="font-semibold text-slate-700">Mệnh Ngũ Hành:</span>
							{" "}
							<span className="text-slate-800 font-medium">
								{getElementLabel(detailedWuxingReading.mingElement)}
								{" "}
								(
								{detailedWuxingReading.mingDescription}
								)
							</span>
						</div>
						<div className="text-xs">
							<span className="font-semibold text-slate-700">Thiên Can:</span>
								{" "}
								<span className="text-slate-900 font-medium">
									{t(`preferences.theme.builtin.stem${detailedWuxingReading.stem.charAt(0).toUpperCase()}${detailedWuxingReading.stem.slice(1)}`)}
									{" "}
									(
									{t("preferences.theme.builtin.stemsPrefix")}
									{" "}
									-
									{" "}
									{getElementLabel(detailedWuxingReading.stemElement)}
									)
								</span>
							</div>
							<div className="text-xs">
								<span className="font-semibold text-slate-700">Địa Chi:</span>
								{" "}
							<span className="text-slate-900 font-medium">
									{branchLabelMap[detailedWuxingReading.branch]}
									{" "}
									(
									{getElementLabel(detailedWuxingReading.branchElement)}
									)
								</span>
							</div>
							<div className="text-xs mt-3 pt-2 border-t border-slate-300">
							<span className="font-semibold text-emerald-700">
									✓ Tương Sinh (Hỗ trợ):
								</span>
								{" "}
								<span className="text-slate-900 font-medium">
									{getElementLabel(detailedWuxingReading.producingElement)}
									{" "}
									sinh
									{" "}
									{getElementLabel(detailedWuxingReading.mingElement)}
								</span>
							</div>
							<div className="text-xs">
							<span className="font-semibold text-rose-700">
									✗ Tương Khắc (Tương Chế):
								</span>
								{" "}
								<span className="text-slate-900 font-medium">
									{getElementLabel(detailedWuxingReading.controllingElement)}
									{" "}
									khắc
									{" "}
									{getElementLabel(detailedWuxingReading.mingElement)}
								</span>
							</div>
						</div>
					</div>
				)
				: null}

			<div className="w-full mb-2 text-xs opacity-75 px-1">
				{t("preferences.theme.builtin.fengShuiTitle")}
			</div>
			<div className="w-full mb-3 text-xs opacity-65 px-1">
				{t("preferences.theme.builtin.fengShuiTip")}
			</div>

			{/* Lunar Hour Advisory Section */}
			<div className="w-full mb-4 px-3 py-4 rounded-lg border border-colorBorderSecondary bg-colorBgContainer">
				{/* Title */}
				<div className="text-sm font-bold opacity-95 mb-2">
					🌙
					{" "}
					{t("preferences.theme.builtin.lunarHourTitle")}
				</div>
				<div className="text-xs opacity-70 mb-3">
					{t("preferences.theme.builtin.lunarHourTip")}
				</div>

				{/* Day Type and Current Hour Info */}
				<div className="flex items-center justify-between gap-2 mb-3">
					<div className="text-xs opacity-80">
						📅
						{" "}
						{t("preferences.theme.builtin.dayBranchInfo", {
							branch: branchLabelMap[hourAdvisory.dayBranchKey],
						})}
					</div>
					<div className={cn("text-xs font-bold px-2 py-1 rounded", hourAdvisory.dayType === "duong" ? "bg-amber-100 text-amber-900 border border-amber-400" : "bg-indigo-100 text-indigo-900 border border-indigo-400")}>
						{hourAdvisory.dayType === "duong" ? "☀️ " : "🌙 "}
						{hourAdvisory.dayType === "duong" ? t("preferences.theme.builtin.duongTrach") : t("preferences.theme.builtin.amTrach")}
					</div>
				</div>

				{/* Current Hour Status */}
				<div className={cn("text-sm font-semibold rounded-md px-3 py-2 mb-4 border-2", hourAdvisory.isCurrentAuspicious ? "bg-emerald-100 text-emerald-900 border-emerald-500" : "bg-rose-100 text-rose-900 border-rose-500")}>
					{hourAdvisory.isCurrentAuspicious
						? `☀️ ${t("preferences.theme.builtin.auspiciousNow", {
							branch: branchLabelMap[hourAdvisory.currentBranchKey],
							range: getHourRangeLabel(hourAdvisory.currentChiIndex),
						})}`
						: `🌙 ${t("preferences.theme.builtin.inauspiciousNow", {
							branch: branchLabelMap[hourAdvisory.currentBranchKey],
							range: getHourRangeLabel(hourAdvisory.currentChiIndex),
						})}`}
				</div>

				{/* Two Column Layout: Auspicious and Inauspicious Hours */}
				<div className="grid grid-cols-2 gap-3 mb-4">
					{/* Auspicious Hours */}
					<div className="rounded-lg bg-emerald-50 border border-emerald-200 overflow-hidden">
						<div className="text-sm font-bold text-emerald-900 px-3 py-2 bg-emerald-100 border-b border-emerald-200">
							☀️
							{" "}
							{t("preferences.theme.builtin.todayAuspiciousHours")}
						</div>
						<div className="divide-y divide-emerald-100">
							{hourAdvisory.auspiciousSlots.map(slot => (
								<div
									key={`auspicious-${slot.chiIndex}`}
									className={cn(
										"flex items-center justify-between px-3 py-1.5 text-xs font-medium transition-all",
										hourAdvisory.currentChiIndex === slot.chiIndex
											? "bg-emerald-500 text-white font-bold"
											: "text-emerald-900 hover:bg-emerald-100",
									)}
								>
									<span className="font-semibold">{branchLabelMap[slot.branchKey]}</span>
									<span className={cn("text-[10px]", hourAdvisory.currentChiIndex === slot.chiIndex ? "text-emerald-100" : "text-emerald-600")}>{getHourRangeLabel(slot.chiIndex)}</span>
								</div>
							))}
						</div>
					</div>

					{/* Inauspicious Hours */}
					<div className="rounded-lg bg-rose-50 border border-rose-200 overflow-hidden">
						<div className="text-sm font-bold text-rose-900 px-3 py-2 bg-rose-100 border-b border-rose-200">
							🌙
							{" "}
							{t("preferences.theme.builtin.todayInauspiciousHours")}
						</div>
						<div className="divide-y divide-rose-100">
							{hourAdvisory.inauspiciousSlots.map(slot => (
								<div
									key={`inauspicious-${slot.chiIndex}`}
									className={cn(
										"flex items-center justify-between px-3 py-1.5 text-xs font-medium transition-all",
										hourAdvisory.currentChiIndex === slot.chiIndex
											? "bg-rose-500 text-white font-bold"
											: "text-rose-900 hover:bg-rose-100",
									)}
								>
									<span className="font-semibold">{branchLabelMap[slot.branchKey]}</span>
									<span className={cn("text-[10px]", hourAdvisory.currentChiIndex === slot.chiIndex ? "text-rose-100" : "text-rose-600")}>{getHourRangeLabel(slot.chiIndex)}</span>
								</div>
							))}
						</div>
					</div>
				</div>

				{/* Hourly Recommendations */}
				<div className="mb-4 pb-3 border-b border-colorBorderSecondary">
					<div className={cn("text-xs font-semibold mb-3 px-1 py-1 rounded", hourAdvisory.isCurrentAuspicious ? "text-emerald-900" : "text-rose-900")}>
						{hourAdvisory.isCurrentAuspicious ? "☀️" : "🌙"}
						{" "}
						{hourAdvisory.isCurrentAuspicious
							? t("preferences.theme.builtin.recommendedActionsTitle")
							: t("preferences.theme.builtin.avoidActionsTitle")}
					</div>
					<div className="grid grid-cols-2 gap-3">
						{/* Should Do */}
						<div className={cn("p-3 rounded-lg border", hourAdvisory.isCurrentAuspicious ? "bg-emerald-50 border-emerald-300" : "bg-slate-50 border-slate-300")}>
							<div className={cn("text-sm font-semibold mb-2", hourAdvisory.isCurrentAuspicious ? "text-emerald-900" : "text-slate-700")}>
								{hourAdvisory.isCurrentAuspicious ? "✅ Nên Làm" : "✅ Vẫn nên làm"}
							</div>
							<ul className={cn("text-xs space-y-1", hourAdvisory.isCurrentAuspicious ? "text-emerald-900" : "text-slate-800")}>
								{recommendedActions.map(action => (
									<li key={`action-${action.substring(0, 10)}`} className="flex gap-1.5">
										<span className={cn("font-bold flex-shrink-0", hourAdvisory.isCurrentAuspicious ? "text-emerald-700" : "text-slate-500")}>•</span>
										<span>{action}</span>
									</li>
								))}
							</ul>
						</div>

						{/* Should Avoid */}
						<div className={cn("p-3 rounded-lg border", hourAdvisory.isCurrentAuspicious ? "bg-slate-50 border-slate-300" : "bg-rose-50 border-rose-300")}>
							<div className={cn("text-sm font-semibold mb-2", hourAdvisory.isCurrentAuspicious ? "text-slate-700" : "text-rose-900")}>
								{hourAdvisory.isCurrentAuspicious ? "⛔ Không Nên" : "⛔ Đặc biệt tránh"}
							</div>
							<ul className={cn("text-xs space-y-1", hourAdvisory.isCurrentAuspicious ? "text-slate-800" : "text-rose-900")}>
								{avoidActions.map(action => (
									<li key={`avoid-${action.substring(0, 10)}`} className="flex gap-1.5">
										<span className={cn("font-bold flex-shrink-0", hourAdvisory.isCurrentAuspicious ? "text-slate-500" : "text-rose-700")}>•</span>
										<span>{action}</span>
									</li>
								))}
							</ul>
						</div>
					</div>
				</div>

				{/* Ngày Can Chi — always show single card, content based on dayType */}
				<div className={cn(
					"rounded-lg border overflow-hidden",
					hourAdvisory.dayType === "duong" ? "border-amber-400 dark:border-amber-600" : "border-indigo-400 dark:border-indigo-600",
				)}>
					{/* header */}
					<div className={cn(
						"px-3 py-2 flex items-center gap-2",
						hourAdvisory.dayType === "duong" ? "bg-amber-500" : "bg-indigo-600",
					)}>
						<span className="text-sm font-bold">🌑</span>
						<span className="text-sm font-bold text-white">
							{hourAdvisory.dayType === "duong"
								? t("preferences.theme.builtin.duongTrach")
								: t("preferences.theme.builtin.amTrach")}
						</span>
						<span className="text-[10px] font-medium bg-white/25 text-white px-1.5 py-0.5 rounded-full ml-auto">
							{t("preferences.theme.builtin.dayCanChiLabel", {
								can: t(`preferences.theme.builtin.stem${(["Jia","Yi","Bing","Ding","Wu","Ji","Geng","Xin","Ren","Gui"])[hourAdvisory.dayCanIndex]}`),
								chi: branchLabelMap[hourAdvisory.dayBranchKey],
							})}
						</span>
					</div>
					{/* description */}
					<div className={cn(
						"px-3 py-2 text-xs italic border-b",
						hourAdvisory.dayType === "duong"
							? "bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800/40"
							: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800/40",
					)}>
						{hourAdvisory.dayType === "duong"
							? t("preferences.theme.builtin.canDuongDesc")
							: t("preferences.theme.builtin.canAmDesc")}
					</div>
					{/* nên */}
					<div className="px-3 pt-2 pb-1 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
						<p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1">✓ {t("preferences.theme.builtin.duongTrachShouldTitle") || "Nên"}</p>
						<ul className="text-xs space-y-0.5 text-slate-800 dark:text-slate-200">
							{hourAdvisory.dayType === "duong"
								? (
									<>
										<li>• {t("preferences.theme.builtin.duongTrachDo1")}</li>
										<li>• {t("preferences.theme.builtin.duongTrachDo2")}</li>
										<li>• {t("preferences.theme.builtin.duongTrachDo3")}</li>
										<li>• {t("preferences.theme.builtin.duongTrachDo4")}</li>
									</>
								)
								: (
									<>
										<li>• {t("preferences.theme.builtin.amTrachDo1")}</li>
										<li>• {t("preferences.theme.builtin.amTrachDo2")}</li>
										<li>• {t("preferences.theme.builtin.amTrachDo3")}</li>
										<li>• {t("preferences.theme.builtin.amTrachDo4")}</li>
									</>
								)}
						</ul>
					</div>
					{/* tránh */}
					<div className="px-3 pt-2 pb-2 bg-white dark:bg-slate-800">
						<p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wide mb-1">✗ {t("preferences.theme.builtin.amTrachAvoidTitle") || "Tránh"}</p>
						<ul className="text-xs space-y-0.5 text-slate-800 dark:text-slate-200">
							{hourAdvisory.dayType === "duong"
								? (
									<>
										<li>• {t("preferences.theme.builtin.duongTrachAvoid1")}</li>
										<li>• {t("preferences.theme.builtin.duongTrachAvoid2")}</li>
									</>
								)
								: (
									<>
										<li>• {t("preferences.theme.builtin.amTrachAvoid1")}</li>
										<li>• {t("preferences.theme.builtin.amTrachAvoid2")}</li>
										<li>• {t("preferences.theme.builtin.amTrachAvoid3")}</li>
										<li>• {t("preferences.theme.builtin.amTrachAvoid4")}</li>
									</>
								)}
						</ul>
					</div>
				</div>

				{/* Dương Trạch Phong Thủy — Trực (建除十二神) */}
				<div className="mt-2">
					<div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
						🏠
						{" "}
						{t("preferences.theme.builtin.duongTrachSectionTitle")}
						<span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 ml-auto">
							{t("preferences.theme.builtin.amTrachLunarDate", {
								day: duongTrachAdvisory.lunarDay,
								month: duongTrachAdvisory.lunarMonth,
							})}
						</span>
					</div>
					<div className={cn(
						"rounded-lg border overflow-hidden",
						duongTrachAdvisory.truct.rating === "tot" && "border-emerald-400",
						duongTrachAdvisory.truct.rating === "trung" && "border-amber-300",
						duongTrachAdvisory.truct.rating === "xau" && "border-rose-300",
					)}
					>
						{/* header */}
						<div className={cn(
							"px-3 py-2 flex items-center gap-2",
							duongTrachAdvisory.truct.rating === "tot" && "bg-emerald-500",
							duongTrachAdvisory.truct.rating === "trung" && "bg-amber-400",
							duongTrachAdvisory.truct.rating === "xau" && "bg-rose-500",
						)}
						>
							<span className="text-sm font-bold text-white">
								{t(`preferences.theme.builtin.truct${duongTrachAdvisory.truct.nameKey.charAt(0).toUpperCase()}${duongTrachAdvisory.truct.nameKey.slice(1)}`)}
							</span>
							<span className="ml-auto text-[10px] font-semibold bg-white/25 text-white px-2 py-0.5 rounded-full">
								{t(`preferences.theme.builtin.duongTrachRating${duongTrachAdvisory.truct.rating.charAt(0).toUpperCase()}${duongTrachAdvisory.truct.rating.slice(1)}`)}
							</span>
						</div>
						{/* description */}
						<div className="px-3 py-2 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-700 italic">
							{t(`preferences.theme.builtin.duongTrachTruct${duongTrachAdvisory.truct.nameKey.charAt(0).toUpperCase()}${duongTrachAdvisory.truct.nameKey.slice(1)}Desc`)}
						</div>
						{/* activity guidance */}
						<div className="px-3 py-2 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700">
							<span className={cn(
								"font-bold text-[10px] uppercase tracking-wide mr-1",
								duongTrachAdvisory.truct.rating === "xau" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
							)}
							>
								{duongTrachAdvisory.truct.rating === "xau"
									? t("preferences.theme.builtin.duongTrachAvoidTitle")
									: t("preferences.theme.builtin.duongTrachShouldTitle")}
								{":"}
							</span>
							{t(`preferences.theme.builtin.duongTrachDo_${duongTrachAdvisory.truct.nameKey}`)}
						</div>
						{/* auspicious hours */}
						{duongTrachAdvisory.truct.rating !== "xau" && (
							<div className="px-3 py-2 bg-slate-50 dark:bg-slate-900 text-[10px] text-slate-500 dark:text-slate-400">
								<span className="font-semibold text-slate-600 dark:text-slate-300 mr-1.5">⏰ Giờ tốt:</span>
								<span className="flex flex-wrap gap-1 mt-1">
									{hourAdvisory.auspiciousSlots.map(slot => (
										<span
											key={slot.chiIndex}
											className={cn(
												"inline-flex flex-col items-center px-1.5 py-0.5 rounded text-[9px] leading-tight",
												hourAdvisory.currentChiIndex === slot.chiIndex
													? "bg-emerald-500 text-white font-bold"
													: "bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200",
											)}
										>
											<span className="font-semibold">{branchLabelMap[slot.branchKey]}</span>
											<span className="opacity-80">{getHourRangeLabel(slot.chiIndex)}</span>
										</span>
									))}
								</span>
							</div>
						)}
					</div>
				</div>

				{/* Âm Trạch Phong Thủy — Trực (建除十二神) */}
				<div className="mt-2">
					<div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
						🪦
						{" "}
						{t("preferences.theme.builtin.amTrachSectionTitle")}
						<span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 ml-auto">
							{t("preferences.theme.builtin.amTrachLunarDate", {
								day: amTrachAdvisory.lunarDay,
								month: amTrachAdvisory.lunarMonth,
							})}
						</span>
					</div>
					<div className={cn(
						"rounded-lg border overflow-hidden",
						amTrachAdvisory.truct.rating === "tot" && "border-emerald-400",
						amTrachAdvisory.truct.rating === "trung" && "border-amber-300",
						amTrachAdvisory.truct.rating === "xau" && "border-rose-300",
					)}
					>
						{/* header */}
						<div className={cn(
							"px-3 py-2 flex items-center gap-2",
							amTrachAdvisory.truct.rating === "tot" && "bg-emerald-500",
							amTrachAdvisory.truct.rating === "trung" && "bg-amber-400",
							amTrachAdvisory.truct.rating === "xau" && "bg-rose-500",
						)}
						>
							<span className="text-sm font-bold text-white">
								{t(`preferences.theme.builtin.truct${amTrachAdvisory.truct.nameKey.charAt(0).toUpperCase()}${amTrachAdvisory.truct.nameKey.slice(1)}`)}
							</span>
							<span className="ml-auto text-[10px] font-semibold bg-white/25 text-white px-2 py-0.5 rounded-full">
								{t(`preferences.theme.builtin.amTrachRating${amTrachAdvisory.truct.rating.charAt(0).toUpperCase()}${amTrachAdvisory.truct.rating.slice(1)}`)}
							</span>
						</div>
						{/* description */}
						<div className="px-3 py-2 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-700 italic">
							{t(`preferences.theme.builtin.truct${amTrachAdvisory.truct.nameKey.charAt(0).toUpperCase()}${amTrachAdvisory.truct.nameKey.slice(1)}Desc`)}
						</div>
						{/* activity guidance */}
						<div className="px-3 py-2 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700">
							<span className={cn(
								"font-bold text-[10px] uppercase tracking-wide mr-1",
								amTrachAdvisory.truct.rating === "xau" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
							)}
							>
								{amTrachAdvisory.truct.rating === "xau"
									? t("preferences.theme.builtin.amTrachAvoidTitle")
									: t("preferences.theme.builtin.amTrachShouldTitle")}
								{":"}
							</span>
							{t(`preferences.theme.builtin.amTrachDo_${amTrachAdvisory.truct.nameKey}`)}
						</div>
						{/* auspicious hours */}
						{amTrachAdvisory.truct.rating !== "xau" && (
							<div className="px-3 py-2 bg-slate-50 dark:bg-slate-900 text-[10px] text-slate-500 dark:text-slate-400">
								<span className="font-semibold text-slate-600 dark:text-slate-300 mr-1.5">⏰ Giờ tốt:</span>
								<span className="flex flex-wrap gap-1 mt-1">
									{hourAdvisory.auspiciousSlots.map(slot => (
										<span
											key={slot.chiIndex}
											className={cn(
												"inline-flex flex-col items-center px-1.5 py-0.5 rounded text-[9px] leading-tight",
												hourAdvisory.currentChiIndex === slot.chiIndex
													? "bg-emerald-500 text-white font-bold"
													: "bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200",
											)}
										>
											<span className="font-semibold">{branchLabelMap[slot.branchKey]}</span>
											<span className="opacity-80">{getHourRangeLabel(slot.chiIndex)}</span>
										</span>
									))}
								</span>
							</div>
						)}
					</div>
				</div>
			</div>
			{birthYear && !fengShuiManualColorSelected
				? (
					<div className="w-full mb-3 text-xs opacity-70 px-1">
						{t("preferences.theme.builtin.autoColorByDateTime")}
					</div>
				)
				: null}

			{visibleGroupConfig.map((groupItem) => {
				const presets = builtinThemePresets.filter(item => item.group === groupItem.key);
				if (!presets.length) {
					return null;
				}

				return (
					<div key={groupItem.key} className="w-full mb-4">
						<div className="text-xs font-medium opacity-80 mb-2 px-1 flex items-center gap-1">
							<span>{groupItem.title}</span>
							<Tooltip title={groupItem.tooltip}>
								<span className="opacity-60 cursor-help">?</span>
							</Tooltip>
							{favoredElements.includes(groupItem.key as WuxingElement)
								? <span className="text-[10px] rounded-full px-2 py-0.5 bg-colorPrimaryBg text-colorPrimary">{t("preferences.theme.builtin.compatibleBadge")}</span>
								: null}
							{groupItem.key === "neutral" && isConflict
								? <span className="text-[10px] rounded-full px-2 py-0.5 bg-colorWarningBg text-colorWarning">{t("preferences.theme.builtin.neutralBadge")}</span>
								: null}
						</div>
						<ul className="flex justify-start flex-wrap w-full gap-3 p-0 m-0 list-none">
							{presets.map(renderPresetItem)}
						</ul>
					</div>
				);
			})}
		</>
	);
}
