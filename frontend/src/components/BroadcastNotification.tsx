/**
 * BroadcastNotification Component
 * 
 * CSM Admin gửi thông báo broadcast đến tất cả users của một appId
 * - Load danh sách apps từ sys_apps table
 * - Chọn app target
 * - Gửi thông báo one-way (không nhận phản hồi)
 * - Xem và xóa các thông báo đã gửi
 * - Hỗ trợ đa ngôn ngữ (vi-VN, en-US, zh-CN)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useChatHistory } from '#src/contexts/ChatHistoryContext';
import { useUserStore } from '#src/store/user';
import { useAppStore } from '#src/store/app';
import { message as antMessage, Button, Input, Select, Card, Space, theme, List, Typography, Popconfirm, Empty, Tag } from 'antd';
import { SendOutlined, AppstoreOutlined, InfoCircleOutlined, DeleteOutlined, HistoryOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { deleteChatMessage } from '#src/components/csm-grid/CsmApi';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';

dayjs.extend(relativeTime);
dayjs.locale('vi');

const { TextArea, Search } = Input;
const { Option } = Select;
const { Text, Paragraph } = Typography;

interface App {
  app_id: string;
  app_name?: string;
  description?: string;
}

interface BroadcastMessage {
  timestamp: number;
  to: string; // target appId
  message: string;
  username: string;
  appId: string; // sender appId (csm)
}

export const BroadcastNotification: React.FC = () => {
  const { t } = useTranslation();
  const [apps, setApps] = useState<App[]>([]);
  const [targetAppId, setTargetAppId] = useState<string>('');
  const [notificationMessage, setNotificationMessage] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [searchText, setSearchText] = useState<string>('');
  
  const { broadcastNotification, messages } = useChatHistory();
  const user = useUserStore();
  const { database } = useAppStore();
  
  // Check if user is CSM admin
  const { token } = theme.useToken();
  const isCSMAdmin = user.app_id === 'csm' && (user.dev || user.roles?.includes('admin'));
  
  // Load apps list from database (already loaded when menu is rendered)
  useEffect(() => {
    if (isCSMAdmin) {
      const sysAppsData = database['sys_apps']?.rows || [];
      if (Array.isArray(sysAppsData) && sysAppsData.length > 0) {
        setApps(sysAppsData as App[]);
        console.log('✅ Loaded apps from database (sys_apps):', sysAppsData.length, 'apps');
      } else {
        console.warn('⚠️ No sys_apps data found in database');
      }
    }
  }, [isCSMAdmin, database]);
  
  // Load ALL sent broadcast messages from context (for all apps)
  const allBroadcasts = useMemo(() => {
    if (!messages) return [];
    
    const broadcasts = Object.values(messages)
      .flat()
      .filter((msg: any) => 
        msg.eventType === 'broadcast_notification' &&
        msg.appId === 'csm'
      )
      .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
    
    return broadcasts as BroadcastMessage[];
  }, [messages]);
  
  // Filter broadcasts by search text (app name, app_id, or message content)
  const filteredBroadcasts = useMemo(() => {
    if (!searchText.trim()) return allBroadcasts;
    
    const searchLower = searchText.toLowerCase();
    return allBroadcasts.filter(msg => {
      const targetApp = apps.find(app => app.app_id === msg.to);
      const appName = targetApp?.app_name || msg.to;
      
      return (
        msg.to.toLowerCase().includes(searchLower) ||
        appName.toLowerCase().includes(searchLower) ||
        msg.message.toLowerCase().includes(searchLower) ||
        msg.username.toLowerCase().includes(searchLower)
      );
    });
  }, [allBroadcasts, searchText, apps]);
  
  const handleSendBroadcast = async () => {
    if (!targetAppId) {
      antMessage.warning(t('system.broadcast.select_app_required'));
      return;
    }
    
    if (!notificationMessage.trim()) {
      antMessage.warning(t('system.broadcast.message_required'));
      return;
    }
    
    setSending(true);
    try {
      await broadcastNotification(targetAppId, notificationMessage);
      antMessage.success(t('system.broadcast.success', { appId: targetAppId }));
      setNotificationMessage('');
      setTargetAppId('');
    } catch (error: any) {
      antMessage.error(t('system.broadcast.error', { error: error.message }));
    } finally {
      setSending(false);
    }
  };
  
  const handleDeleteBroadcast = async (timestamp: number, targetApp: string) => {
    try {
      const response = await deleteChatMessage(timestamp, targetApp);
      if (response.success) {
        antMessage.success(t('system.broadcast.delete_success', 'Đã xóa thông báo'));
      } else {
        antMessage.error(t('system.broadcast.delete_error', { error: response.message }));
      }
    } catch (error: any) {
      antMessage.error(t('system.broadcast.delete_error', { error: error.message }));
    }
  };
  
  // Get app name from app_id
  const getAppName = (appId: string) => {
    const app = apps.find(a => a.app_id === appId);
    return app?.app_name || appId;
  };
  
  if (!isCSMAdmin) {
    return (
      <Card title={t('system.broadcast.title')}>
        <p>{t('system.broadcast.admin_only')}</p>
      </Card>
    );
  }
  
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card 
        title={
          <span>
            <AppstoreOutlined /> {t('system.broadcast.title')}
          </span>
        }
        style={{ maxWidth: 900 }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              🎯 {t('system.broadcast.select_app')}
            </label>
            <Select
              style={{ width: '100%' }}
              placeholder={t('system.broadcast.select_app_placeholder')}
              value={targetAppId || undefined}
              onChange={setTargetAppId}
              showSearch
              optionFilterProp="children"
            >
              {apps.map(app => (
                <Option key={app.app_id} value={app.app_id}>
                  {app.app_name || app.app_id} {app.description ? `- ${app.description}` : ''}
                </Option>
              ))}
            </Select>
            {apps.length === 0 && (
              <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
                {t('system.broadcast.no_apps')}
              </div>
            )}
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              💬 {t('system.broadcast.message_label')}
            </label>
            <TextArea
              rows={6}
              placeholder={t('system.broadcast.message_placeholder')}
              value={notificationMessage}
              onChange={e => setNotificationMessage(e.target.value)}
              maxLength={2000}
              showCount
            />
          </div>
          
          <Button
            type="primary"
            size="large"
            block
            icon={<SendOutlined />}
            loading={sending}
            disabled={!targetAppId || !notificationMessage.trim()}
            onClick={handleSendBroadcast}
          >
            {sending ? t('system.broadcast.sending') : t('system.broadcast.send_button')}
          </Button>
          
          <div style={{ 
            padding: '12px 16px', 
            background: token.colorBgElevated,
            border: `1px solid ${token.colorBorder}`,
            borderRadius: token.borderRadius,
            fontSize: 13,
            lineHeight: '1.6'
          }}>
            <div style={{ fontWeight: 500, marginBottom: 8, color: token.colorText, display: 'flex', alignItems: 'center', gap: 6 }}>
              <InfoCircleOutlined style={{ color: token.colorInfo }} />
              {t('system.broadcast.note_title')}
            </div>
            <ul style={{ margin: '4px 0', paddingLeft: 20, color: token.colorTextSecondary }}>
              <li>{t('system.broadcast.note_all_users')}</li>
              <li>{t('system.broadcast.note_one_way')}</li>
              <li>{t('system.broadcast.note_persistent')}</li>
              <li>{t('system.broadcast.note_realtime')}</li>
            </ul>
          </div>
        </Space>
      </Card>
      
      {/* Sent Messages History */}
      <Card
        title={
          <Space>
            <HistoryOutlined />
            <span>{t('system.broadcast.history_title', 'Lịch sử thông báo đã gửi')}</span>
            <Tag color="blue">{allBroadcasts.length} {t('system.broadcast.total_messages', 'thông báo')}</Tag>
          </Space>
        }
        style={{ maxWidth: 900 }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Search
            placeholder={t('system.broadcast.search_placeholder', 'Tìm theo app, nội dung hoặc người gửi...')}
            allowClear
            enterButton={<SearchOutlined />}
            size="large"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
          
          <List
            dataSource={filteredBroadcasts}
            locale={{
              emptyText: (
                <Empty
                  description={
                    searchText 
                      ? t('system.broadcast.no_search_results', 'Không tìm thấy kết quả')
                      : t('system.broadcast.no_messages', 'Chưa có thông báo nào')
                  }
                />
              )
            }}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Popconfirm
                    title={t('system.broadcast.delete_confirm', 'Xác nhận xóa thông báo này?')}
                    onConfirm={() => handleDeleteBroadcast(item.timestamp, item.to)}
                    okText={t('common.confirm', 'Xác nhận')}
                    cancelText={t('common.cancel', 'Hủy')}
                  >
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                    >
                      {t('common.delete', 'Xóa')}
                    </Button>
                  </Popconfirm>
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Space wrap>
                        <Tag color="green" icon={<AppstoreOutlined />}>
                          {getAppName(item.to)}
                        </Tag>
                        <Text strong>{item.username}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {dayjs(item.timestamp).format('DD/MM/YYYY HH:mm')} ({dayjs(item.timestamp).fromNow()})
                        </Text>
                      </Space>
                    </Space>
                  }
                  description={
                    <Paragraph
                      ellipsis={{ rows: 2, expandable: true, symbol: t('common.more', 'Xem thêm') }}
                      style={{ marginBottom: 0, marginTop: 8, whiteSpace: 'pre-wrap' }}
                    >
                      {item.message}
                    </Paragraph>
                  }
                />
              </List.Item>
            )}
            pagination={
              filteredBroadcasts.length > 10
                ? {
                    pageSize: 10,
                    showSizeChanger: true,
                    showTotal: (total) => t('system.broadcast.pagination_total', `Tổng ${total} thông báo`),
                  }
                : false
            }
          />
        </Space>
      </Card>
    </Space>
  );
};
