import React from "react";
import { Row, Col, Typography } from "antd";
import styles from "./KQXS.module.css";

const { Text } = Typography;

interface PrizeRowProps {
	label: string;
	numbers: string[];
	isSpecial?: boolean;
	isFirst?: boolean;
	isSecond?: boolean;
	bgGray?: boolean;
}

const PrizeRow: React.FC<PrizeRowProps> = ({ 
	label, 
	numbers, 
	isSpecial = false, 
	isFirst = false,
	isSecond = false,
	bgGray = false 
}) => {
	const getRowClass = () => {
		let className = styles["giai-row"];
		if (bgGray) className += ` ${styles["bg-gray"]}`;
		if (isSpecial) className += ` ${styles.giaidb}`;
		if (isFirst) className += ` ${styles.giai1}`;
		if (isSecond) className += ` ${styles.giai2}`;
		return className;
	};

	const numberElements = numbers.filter(num => num && num.trim()).map(number =>
		React.createElement("div", {
			key: `${label}-${number}`,
			className: styles["giai-so"],
		},
		isSpecial
			? React.createElement(Text, {
				strong: true,
				style: { fontSize: 18, color: "white" },
			}, number)
			: number));

	return React.createElement(Row, { className: getRowClass() }, 
		React.createElement(Col, { span: 8, className: styles["giai-label"] }, label), 
		React.createElement(Col, { span: 16, className: styles["giai-content"] }, ...numberElements));
};

export default PrizeRow;