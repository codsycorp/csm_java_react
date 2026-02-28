import React from 'react';

interface PrizeRowProps {
  label: string;
  numbers: string[];
}

const PrizeRow: React.FC<PrizeRowProps> = ({ label, numbers }) => {
  const list = (numbers || []).filter(Boolean);
  const containerStyle = { display: "flex", alignItems: "center", marginBottom: "8px" } as React.CSSProperties;
  const labelStyle = {
    width: "100px",
    fontWeight: "bold",
    color: "#1890ff"
  } as React.CSSProperties;
  const numberStyle = {
    padding: "2px 8px",
    margin: "0 4px",
    backgroundColor: "#f6ffed",
    border: "1px solid #b7eb8f",
    borderRadius: "4px",
    fontFamily: "monospace",
    fontSize: "14px"
  } as React.CSSProperties;

  return (
    <div style={containerStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}>
        {list.length
          ? list.map((num, idx) => (
              <span key={num + '-' + idx} style={numberStyle}>{num}</span>
            ))
          : <span style={{ color: "#999" }}>---</span>}
      </div>
    </div>
  );
};

export default PrizeRow;
