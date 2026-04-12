/**
 * Broadcast Notification Page - CSM Admin Only
 * 
 * Page để CSM admin gửi thông báo broadcast đến users của các apps
 * Hỗ trợ đa ngôn ngữ: vi-VN, en-US, zh-CN
 */

import { PageContainer } from '@ant-design/pro-components';
import { BroadcastNotification } from '#src/components/BroadcastNotification';
import { useTranslation } from 'react-i18next';

export default function BroadcastPage() {
  const { t } = useTranslation();
  
  return (
    <PageContainer
      header={{
        title: '📢 ' + t('system.broadcast.title'),
        subTitle: t('system.broadcast.note_all_users'),
      }}
    >
      <BroadcastNotification />
    </PageContainer>
  );
}
