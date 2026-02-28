/**
 * Development Console Suppression Utility
 * Suppresses common warnings that are expected during development
 */

export const suppressDevelopmentWarnings = () => {
	if (process.env.NODE_ENV !== 'development') {
		return;
	}

	// Save original console methods
	const originalWarn = console.warn;
	const originalError = console.error;
	const originalLog = console.log;

	// List of warning patterns to suppress
	const suppressPatterns = [
		// React warnings
		'findDOMNode is deprecated',
		'React.findDOMNode',
		'ReactDOM.findDOMNode',
		'componentWillReceiveProps has been renamed',
		'componentWillMount has been renamed',
		'componentWillUpdate has been renamed',
		
		// Ant Design warnings
		'Warning: [antd:',
		'rc-resize-observer',
		'ResizeObserver',
		
		// Browser API warnings
		'Feature Policy',
		'Permissions Policy',
		'accelerometer',
		'gyroscope',
		'magnetometer',
		
		// Performance warnings that are expected in dev
		'Download the React DevTools',
		'Consider adding an error boundary',
		
		// HMR warnings
		'[HMR]',
		'Hot Module Replacement',
	];

	// Function to check if message should be suppressed
	const shouldSuppress = (message: string): boolean => {
		return suppressPatterns.some(pattern => 
			message.includes(pattern)
		);
	};

	// Override console.warn
	console.warn = (...args) => {
		const message = args[0]?.toString?.() || '';
		if (!shouldSuppress(message)) {
			originalWarn.apply(console, args);
		}
	};

	// Override console.error for warnings that appear as errors
	console.error = (...args) => {
		const message = args[0]?.toString?.() || '';
		if (!shouldSuppress(message)) {
			originalError.apply(console, args);
		}
	};

	// Keep console.log unchanged for debugging
	console.log = originalLog;

	// Suppress unhandled promise rejections for known issues
	window.addEventListener('unhandledrejection', (event) => {
		const message = event.reason?.message || event.reason || '';
		if (shouldSuppress(message.toString())) {
			event.preventDefault();
		}
	});

	// [PROD] Removed debug log: Development warning suppression activated
};

export default suppressDevelopmentWarnings;