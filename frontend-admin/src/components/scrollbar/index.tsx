import { cn } from "#src/utils";

import { forwardRef } from "react";
import SimpleBar, { type Props as SimplebarProps } from "simplebar-react";

/**
 * @see https://github.com/Grsmto/simplebar/tree/master/packages/simplebar-react
 */
export const Scrollbar = forwardRef<HTMLElement, SimplebarProps>(({ children, autoHide = false, ...other }, ref) => {
	return (
		<SimpleBar
			autoHide={autoHide}
			// Prevent layout jitter in flex containers (master-detail)
			// Using min-h-0 ensures the scrollbar container can shrink inside flex
			scrollableNodeProps={{ ref }}
			clickOnTrack={false}
			{...other}
			className={cn("h-full min-h-0 overflow-auto", other.className)}
		>
			{children}
		</SimpleBar>
	);
});
