import type { BuiltinThemeType } from "#src/store";
import type { ColorPickerProps } from "antd";
import type { ReactNode } from "react";

import { usePreferencesStore } from "#src/store";
import { cn } from "#src/utils";
import { type DetailedWuxingReading, evaluateLunarCompatibility, getDetailedWuxingReading, getHourRangeLabel, getLunarHourAdvisory, getPresetsByGroup, type LunarBranchKey, type WuxingElement } from "#src/utils/feng-shui-theme";

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
					<div className="w-full mb-4 px-2 py-3 rounded-lg border border-blue-200 bg-blue-50">
						<div className="text-sm font-bold text-blue-900 mb-3">
							🔷
							{" "}
							{t("preferences.theme.builtin.detailedWuxingTitle")}
						</div>
						<div className="space-y-2">
							<div className="text-xs">
								<span className="font-semibold text-blue-800">Mệnh Ngũ Hành:</span>
								{" "}
								<span className="text-gray-700">
									{getElementLabel(detailedWuxingReading.mingElement)}
									{" "}
									(
									{detailedWuxingReading.mingDescription}
									)
								</span>
							</div>
							<div className="text-xs">
								<span className="font-semibold text-blue-800">Thiên Can:</span>
								{" "}
								<span className="text-gray-700">
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
								<span className="font-semibold text-blue-800">Địa Chi:</span>
								{" "}
								<span className="text-gray-700">
									{branchLabelMap[detailedWuxingReading.branch]}
									{" "}
									(
									{getElementLabel(detailedWuxingReading.branchElement)}
									)
								</span>
							</div>
							<div className="text-xs mt-3 pt-2 border-t border-blue-200">
								<span className="font-semibold text-green-700">
									✓ Tương Sinh (Hỗ trợ):
								</span>
								{" "}
								<span className="text-gray-700">
									{getElementLabel(detailedWuxingReading.producingElement)}
									{" "}
									sinh
									{" "}
									{getElementLabel(detailedWuxingReading.mingElement)}
								</span>
							</div>
							<div className="text-xs">
								<span className="font-semibold text-red-700">
									✗ Tương Khắc (Tương Chế):
								</span>
								{" "}
								<span className="text-gray-700">
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
					<div className={cn("text-xs font-bold px-2 py-1 rounded", hourAdvisory.dayType === "duong" ? "bg-orange-100 text-orange-800" : "bg-purple-100 text-purple-800")}>
						{hourAdvisory.dayType === "duong" ? "☀️ " : "🌙 "}
						{hourAdvisory.dayType === "duong" ? t("preferences.theme.builtin.duongTrach") : t("preferences.theme.builtin.amTrach")}
					</div>
				</div>

				{/* Current Hour Status */}
				<div className={cn("text-sm font-semibold rounded-md px-3 py-2 mb-4 border-2", hourAdvisory.isCurrentAuspicious ? "bg-green-600 text-white border-green-700" : "bg-red-600 text-white border-red-700")}>
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
					<div className="p-3 rounded-lg bg-green-50 border-2 border-green-200">
						<div className="text-sm font-bold text-green-800 mb-2">
							☀️
							{" "}
							{t("preferences.theme.builtin.todayAuspiciousHours")}
						</div>
						<div className="flex flex-wrap gap-1.5">
							{hourAdvisory.auspiciousSlots.map(slot => (
								<div
									key={`auspicious-${slot.chiIndex}`}
									className={cn(
										"text-xs px-2.5 py-1.5 rounded-full font-medium transition-all border",
										hourAdvisory.currentChiIndex === slot.chiIndex
											? "bg-green-600 text-white border-green-700 shadow-md scale-110"
											: "bg-white text-green-700 border-green-300 opacity-85 hover:opacity-100",
									)}
								>
									<span className="font-semibold">{branchLabelMap[slot.branchKey]}</span>
									<br />
									<span className="text-[9px]">{getHourRangeLabel(slot.chiIndex)}</span>
								</div>
							))}
						</div>
					</div>

					{/* Inauspicious Hours */}
					<div className="p-3 rounded-lg bg-red-50 border-2 border-red-200">
						<div className="text-sm font-bold text-red-800 mb-2">
							🌙
							{" "}
							{t("preferences.theme.builtin.todayInauspiciousHours")}
						</div>
						<div className="flex flex-wrap gap-1.5">
							{hourAdvisory.inauspiciousSlots.map(slot => (
								<div
									key={`inauspicious-${slot.chiIndex}`}
									className={cn(
										"text-xs px-2.5 py-1.5 rounded-full font-medium transition-all border",
										hourAdvisory.currentChiIndex === slot.chiIndex
											? "bg-red-600 text-white border-red-700 shadow-md scale-110"
											: "bg-white text-red-700 border-red-300 opacity-85 hover:opacity-100",
									)}
								>
									<span className="font-semibold">{branchLabelMap[slot.branchKey]}</span>
									<br />
									<span className="text-[9px]">{getHourRangeLabel(slot.chiIndex)}</span>
								</div>
							))}
						</div>
					</div>
				</div>

				{/* Hourly Recommendations */}
				<div className="mb-4 pb-3 border-b border-colorBorderSecondary">
					<div className="text-xs font-semibold text-gray-700 mb-3">
						⏰
						{" "}
						{t("preferences.theme.builtin.recommendedActionsTitle")}
					</div>
					<div className="grid grid-cols-2 gap-3">
						{/* Should Do */}
						<div className="p-3 rounded-lg bg-green-50 border border-green-200">
							<div className="text-sm font-bold text-green-800 mb-2">
								✅ Nên Làm
							</div>
							<ul className="text-xs text-gray-700 space-y-1">
								{recommendedActions.map(action => (
									<li key={`action-${action.substring(0, 10)}`} className="flex gap-1.5">
										<span className="text-green-700 font-bold flex-shrink-0">•</span>
										<span>{action}</span>
									</li>
								))}
							</ul>
						</div>

						{/* Should Avoid */}
						<div className="p-3 rounded-lg bg-red-50 border border-red-200">
							<div className="text-sm font-bold text-red-800 mb-2">
								⛔ Không Nên
							</div>
							<ul className="text-xs text-gray-700 space-y-1">
								{avoidActions.map(action => (
									<li key={`avoid-${action.substring(0, 10)}`} className="flex gap-1.5">
										<span className="text-red-700 font-bold flex-shrink-0">•</span>
										<span>{action}</span>
									</li>
								))}
							</ul>
						</div>
					</div>
				</div>

				{/* Day-Based Recommendations */}
				<div className={cn("p-3 rounded-lg border-2", hourAdvisory.dayType === "duong"
					? "bg-orange-50 border-orange-200"
					: "bg-purple-50 border-purple-200")}
				>
					<div className={cn("text-sm font-bold mb-2", hourAdvisory.dayType === "duong"
						? "text-orange-800"
						: "text-purple-800")}
					>
						{hourAdvisory.dayType === "duong"
							? "☀️ Dương Trạch - Nên làm"
							: "🌙 Âm Trạch - Nên tránh"}
					</div>
					<div className={cn("text-xs space-y-1", hourAdvisory.dayType === "duong"
						? "text-orange-700"
						: "text-purple-700")}
					>
						{hourAdvisory.dayType === "duong"
							? (
								<>
									<p>• Ngày dương (Dương Trạch) tốt để bắt đầu việc mới, giao dịch, mở rộng</p>
									<p>• Nên ký kết, công bố, khởi động dự án lớn</p>
									<p>• Thích hợp cho hoạt động bên ngoài, gặp gỡ, đàm phán</p>
								</>
							)
							: (
								<>
									<p>• Ngày âm (Âm Trạch) thích hợp cho công việc tĩnh, học tập, tư vấn nội bộ</p>
									<p>• Nên tránh các quyết định lớn, công bố công khai</p>
									<p>• Thích hợp cho công việc chi tiết, lên kế hoạch, chuẩn bị nội bộ</p>
								</>
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
