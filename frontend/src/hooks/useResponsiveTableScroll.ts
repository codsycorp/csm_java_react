import { useEffect, useState } from 'react';

/**
 * Hook để xử lý responsive scroll cho tables
 * Trên mobile (< 768px): sử dụng auto scroll
 * Trên desktop: sử dụng max-content scroll
 */
export function useResponsiveTableScroll(baseScrollX: 'auto' | 'max-content' = 'max-content') {
	const [isMobile, setIsMobile] = useState(false);

	useEffect(() => {
		// Detect initial screen size
		setIsMobile(window.innerWidth < 768);

		const handleResize = () => {
			setIsMobile(window.innerWidth < 768);
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	return {
		isMobile,
		scrollX: isMobile ? 'auto' : baseScrollX,
	};
}

/**
 * Helper để lấy responsive scroll config cho table
 */
export function getResponsiveTableScroll(isMobile: boolean, yValue: string | number = 'calc(100vh - 400px)') {
	return {
		x: isMobile ? 'auto' : 'max-content',
		y: yValue,
	};
}
