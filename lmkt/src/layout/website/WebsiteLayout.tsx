import React from "react";
import { ChatHistoryProvider } from "#src/contexts/ChatHistoryContext";
import WebsiteLayoutInner from "./WebsiteLayoutInner";

interface WebsiteLayoutProps {
  children: React.ReactNode;
  selectedKey?: string;
  menuItems?: Array<{
    key: string;
    label: React.ReactNode;
    path?: string;
    icon?: React.ReactNode;
    children?: Array<{ key: string; label: React.ReactNode; path?: string }>;
  }>;
  title?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}

export default function WebsiteLayout(props: WebsiteLayoutProps) {
  return (
    <ChatHistoryProvider>
      <WebsiteLayoutInner {...props} />
    </ChatHistoryProvider>
  );
}
