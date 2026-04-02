import React from 'react';
import { Button } from 'antd';
import { Icon } from '@iconify/react';

interface IconButtonProps {
	onClick: () => void;
	children: React.ReactNode;
}

interface IconifyProps {
	icon: string;
	size?: number;
}

export const IconButton = ({ onClick, children }: IconButtonProps) => (
	<Button type="text" onClick={onClick}>
		{children}
	</Button>
);

export const Iconify = ({ icon, size = 24 }: IconifyProps) => (
	<Icon icon={icon} width={size} height={size} />
);
