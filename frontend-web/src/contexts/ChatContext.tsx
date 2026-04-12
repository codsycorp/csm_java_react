import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ChatContextType {
  chatOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [chatOpen, setChatOpen] = useState(false);

  const openChat = () => setChatOpen(true);
  const closeChat = () => setChatOpen(false);

  return (
    <ChatContext.Provider value={{ chatOpen, openChat, closeChat }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within ChatProvider');
  }
  return context;
};
