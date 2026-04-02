import React, { useState, useEffect } from 'react';
import { MessageOutlined, CloseOutlined } from '@ant-design/icons';

export interface FloatingChatButtonProps {
  onClick: () => void;
  label?: string;
  visible?: boolean;
  badge?: number;
  isLarge?: boolean;
}

const FloatingChatButton: React.FC<FloatingChatButtonProps> = ({ 
  onClick, 
  label = 'Nhắn tin',
  visible = true,
  badge = 0,
  isLarge = false 
}) => {
  const [showAnimation, setShowAnimation] = useState(false);

  useEffect(() => {
    if (visible) {
      // Trigger animation khi component mount
      setShowAnimation(true);
    }
  }, [visible]);

  if (!visible) return null;

  const baseSize = isLarge ? 64 : 56;
  const iconSize = isLarge ? 32 : 24;

  return (
    <>
      <style>{`
      @keyframes float-pulse {
        0%, 100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.05);
        }
      }
      
      @keyframes slide-up {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .floating-chat-btn {
        position: fixed;
        bottom: 100px;
        right: 20px;
        width: ${baseSize}px;
        height: ${baseSize}px;
        border-radius: 50%;
        background: linear-gradient(135deg, #1890ff 0%, #0050b3 100%);
        color: white;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${iconSize}px;
        box-shadow: 0 8px 24px rgba(24, 144, 255, 0.35), 0 2px 8px rgba(0, 0, 0, 0.15);
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        z-index: 1999;
        animation: slide-up 0.5s ease-out;
      }
      
      .floating-chat-btn:hover {
        transform: translateY(-4px) scale(1.08);
        box-shadow: 0 12px 32px rgba(24, 144, 255, 0.45), 0 4px 12px rgba(0, 0, 0, 0.2);
      }
      
      .floating-chat-btn:active {
        transform: translateY(-2px) scale(1.04);
      }
      
      .floating-chat-btn.pulse {
        animation: float-pulse 2s ease-in-out infinite;
      }
      
      .floating-chat-btn .badge {
        position: absolute;
        top: -8px;
        right: -8px;
        background: #ff4d4f;
        color: white;
        border-radius: 50%;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 700;
        box-shadow: 0 2px 8px rgba(255, 77, 79, 0.35);
      }
      
      .floating-chat-label {
        position: absolute;
        bottom: -30px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.85);
        color: white;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
      }
      
      .floating-chat-btn:hover .floating-chat-label {
        opacity: 1;
      }
      
      /* Mobile specific */
      @media (max-width: 576px) {
        .floating-chat-btn {
          width: ${isLarge ? 56 : 48}px;
          height: ${isLarge ? 56 : 48}px;
          font-size: ${isLarge ? 24 : 20}px;
          bottom: 85px;
          right: 16px;
        }
        
        .floating-chat-label {
          display: none;
        }
      }
      
      @media (max-width: 360px) {
        .floating-chat-btn {
          width: 48px;
          height: 48px;
          font-size: 20px;
          bottom: 80px;
          right: 12px;
        }
      }
    `}</style>
    <button
      className={`floating-chat-btn ${showAnimation ? 'pulse' : ''}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <MessageOutlined />
      {badge > 0 && <div className="badge">{badge > 99 ? '99+' : badge}</div>}
      <div className="floating-chat-label">{label}</div>
    </button>
    </>
  );
};

export default FloatingChatButton;
