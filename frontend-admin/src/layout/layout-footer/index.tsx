import { cn } from "#src/utils";

interface LayoutFooterProps {
	className?: string
}
export default function LayoutFooter({ className }: LayoutFooterProps) {
	const currentYear = new Date().getFullYear();
	
	return (
		<footer
			className={cn(
				"h-10 flex-shrink-0 flex items-center justify-center text-xs md:text-sm",
				className,
			)}
		>
			{`Copyright © 2006-${currentYear} CSM. All rights reserved.`}
		</footer>
	);
}
