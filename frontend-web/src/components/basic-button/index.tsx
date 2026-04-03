import type { ButtonProps } from "antd";

import { Button } from "antd";
import { forwardRef } from "react";

export const BasicButton = forwardRef<any, ButtonProps>((props, ref) => {
  return <Button ref={ref} {...props} />;
});

BasicButton.displayName = "BasicButton";
