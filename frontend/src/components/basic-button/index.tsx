import type { ButtonProps } from "antd";
import type { ReactNode } from "react";
import { forwardRef } from "react";
import { Button } from "antd";

interface BasicButtonProps extends ButtonProps {
	children?: ReactNode
}

export const BasicButton = forwardRef<HTMLButtonElement, BasicButtonProps>(
	   (props, ref) => {
		   const { children, className, ...rest } = props;
		   return (
			   <Button
				   ref={ref}
				   type="primary"
				   className={className}
				   {...rest}
			   >
				   {children}
			   </Button>
		   );
	   }
);

BasicButton.displayName = 'BasicButton';
