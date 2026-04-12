import type { LanguageType } from "#src/locales";
import type { ButtonProps } from "antd";
import { useRef, useState } from "react";
import { BasicButton } from "#src/components";
import { useLanguage } from "#src/hooks";
import { TranslationOutlined } from "@ant-design/icons";
import { Button, Popover } from "antd";

export function LanguageButton({ ...restProps }: ButtonProps) {
	const { language, setLanguage } = useLanguage();
	const buttonRef = useRef<HTMLButtonElement>(null);
	const [open, setOpen] = useState(false);

	const languages = [
		{ label: "简体中文", key: "zh-CN" as LanguageType },
		{ label: "English", key: "en-US" as LanguageType },
		{ label: "Tiếng Việt", key: "vi-VN" as LanguageType },
	];

	const handleLanguageChange = (langKey: LanguageType) => {
		setLanguage(langKey);
		setOpen(false);
	};

	const content = (
		<div style={{ padding: '4px 0', minWidth: '120px' }}>
			{languages.map((lang) => (
				<Button
					key={lang.key}
					type={language === lang.key ? "primary" : "text"}
					block
					size="small"
					onClick={() => handleLanguageChange(lang.key)}
					style={{ 
						marginBottom: '4px',
						textAlign: 'left',
						justifyContent: 'flex-start'
					}}
				>
					{lang.label}
				</Button>
			))}
		</div>
	);

	return (
		<Popover
			content={content}
			trigger="click"
			placement="bottom"
			arrow={false}
			open={open}
			onOpenChange={setOpen}
		>
			<BasicButton
				ref={buttonRef}
				type="text"
				{...restProps}
			>
				<TranslationOutlined />
			</BasicButton>
		</Popover>
	);
}
