import { useTranslation } from "react-i18next";
import { cn } from "#src/utils";

interface LayoutFooterProps {
	className?: string
}
export default function LayoutFooter({ className }: LayoutFooterProps) {
	const { t } = useTranslation();
	const currentYear = new Date().getFullYear();
	
	return (
		<footer
			className={cn(
				"h-10 flex-shrink-0 flex items-center justify-center text-xs md:text-sm",
				className,
			)}
		>
			{t('website.footer.copyright', { year: currentYear })}
		</footer>
	);
}
