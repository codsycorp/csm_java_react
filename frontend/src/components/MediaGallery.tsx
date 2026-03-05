import React, { useState } from 'react';
import { Image, Button, Modal } from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';

// Simple SVG placeholder as data URL in case remote URLs fail
const svgPlaceholder = (label: string, w = 1200, h = 800) => {
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>
      <defs>
        <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
          <stop offset='0%' stop-color='#e6f0ff'/>
          <stop offset='100%' stop-color='#f5f7fb'/>
        </linearGradient>
      </defs>
      <rect width='100%' height='100%' fill='url(#g)'/>
      <g fill='#8aa0c7' font-family='system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' text-anchor='middle'>
        <text x='50%' y='48%' font-size='42' font-weight='700'>Hình minh họa</text>
        <text x='50%' y='58%' font-size='26' opacity='0.8'>${label || 'CSM'}</text>
      </g>
    </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

// Helper: detect if URL is video based on extension
const isVideoUrl = (url: string): boolean => {
  return /\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(url);
};

export interface MediaItem {
  url: string;
  type: 'image' | 'video';
}

interface MediaGalleryProps {
  images?: string[];
  videos?: string[];
  alt: string;
  showCount?: boolean;
}

/**
 * MediaGallery: Hiển thị cả ảnh và video trong một gallery thống nhất
 * - Hỗ trợ navigation qua các media items
 * - Preview cho ảnh với zoom/rotate
 * - Video player modal cho videos
 * - Thumbnails cho tất cả media items
 */
const MediaGallery: React.FC<MediaGalleryProps> = ({ images = [], videos = [], alt, showCount = true }) => {
  // Combine images and videos into single media array
  const mediaItems: MediaItem[] = [
    ...images.filter(Boolean).map(url => ({ url, type: 'image' as const })),
    ...videos.filter(Boolean).map(url => ({ url, type: 'video' as const })),
  ];

  const [index, setIndex] = useState(0);
  const [videoModal, setVideoModal] = useState<{ visible: boolean; url: string }>({ visible: false, url: '' });

  const canPrev = mediaItems.length > 1 && index > 0;
  const canNext = mediaItems.length > 1 && index < mediaItems.length - 1;

  const goto = (i: number) => {
    if (mediaItems.length === 0) return;
    const next = Math.max(0, Math.min(i, mediaItems.length - 1));
    setIndex(next);
  };

  const currentItem = mediaItems[index];

  // Handle click on video thumbnail or main video display
  const handleVideoClick = (url: string) => {
    setVideoModal({ visible: true, url });
  };

  if (mediaItems.length === 0) {
    // No media, show placeholder
    return (
      <div style={{ width: '100%' }}>
        <img
          src={svgPlaceholder(alt)}
          alt={alt}
          style={{ width: '100%', borderRadius: 12, objectFit: 'cover', maxHeight: 460, border: '1px solid #eef0f5' }}
        />
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Main Display Area */}
      {currentItem.type === 'image' ? (
        <Image.PreviewGroup
          preview={{
            toolbarRender: (_, { actions: { onRotateLeft, onRotateRight, onZoomOut, onZoomIn } }) => (
              <div style={{ display: 'flex', gap: 12, background: 'rgba(0,0,0,0.7)', padding: '8px 16px', borderRadius: 8 }}>
                <Button type="text" icon={<ZoomOutOutlined />} onClick={onZoomOut} style={{ color: '#fff' }} />
                <Button type="text" icon={<ZoomInOutlined />} onClick={onZoomIn} style={{ color: '#fff' }} />
                <Button type="text" icon={<RotateLeftOutlined />} onClick={onRotateLeft} style={{ color: '#fff' }} />
                <Button type="text" icon={<RotateRightOutlined />} onClick={onRotateRight} style={{ color: '#fff' }} />
              </div>
            ),
          }}
        >
          <div style={{ position: 'relative' }}>
            <Image
              width="100%"
              src={currentItem.url}
              alt={alt}
              fallback={svgPlaceholder(alt)}
              style={{ borderRadius: 12, objectFit: 'cover', maxHeight: 460, border: '1px solid #eef0f5' }}
              preview={{
                src: currentItem.url,
                mask: <div style={{ fontSize: 14, fontWeight: 500 }}>Click để xem ảnh gốc</div>,
              }}
            />
            {showCount && mediaItems.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 10,
                  right: 10,
                  background: 'rgba(0,0,0,0.55)',
                  color: '#fff',
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {images.length} ảnh {videos.length > 0 && `· ${videos.length} video`}
              </div>
            )}
            {mediaItems.length > 1 && (
              <>
                <Button
                  shape="circle"
                  size="large"
                  disabled={!canPrev}
                  onClick={() => goto(index - 1)}
                  icon={<LeftOutlined />}
                  style={{ position: 'absolute', top: '50%', left: 8, transform: 'translateY(-50%)', opacity: 0.9 }}
                />
                <Button
                  shape="circle"
                  size="large"
                  disabled={!canNext}
                  onClick={() => goto(index + 1)}
                  icon={<RightOutlined />}
                  style={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', opacity: 0.9 }}
                />
              </>
            )}
          </div>
          {/* Hidden images for preview group gallery */}
          <div style={{ display: 'none' }}>
            {mediaItems
              .filter(item => item.type === 'image')
              .slice(1)
              .map((item, i) => (
                <Image key={item.url + i} src={item.url} alt={`${alt} ${i + 2}`} />
              ))}
          </div>
        </Image.PreviewGroup>
      ) : (
        // Video main display
        <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => handleVideoClick(currentItem.url)}>
          <video
            src={currentItem.url}
            style={{
              width: '100%',
              borderRadius: 12,
              objectFit: 'cover',
              maxHeight: 460,
              border: '1px solid #eef0f5',
            }}
            poster={svgPlaceholder(alt)}
          />
          {/* Play icon overlay */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: 64,
              color: '#fff',
              background: 'rgba(0,0,0,0.5)',
              borderRadius: '50%',
              width: 96,
              height: 96,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PlayCircleOutlined />
          </div>
          {showCount && mediaItems.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 10,
                right: 10,
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {images.length} ảnh · {videos.length} video
            </div>
          )}
          {mediaItems.length > 1 && (
            <>
              <Button
                shape="circle"
                size="large"
                disabled={!canPrev}
                onClick={(e) => {
                  e.stopPropagation();
                  goto(index - 1);
                }}
                icon={<LeftOutlined />}
                style={{ position: 'absolute', top: '50%', left: 8, transform: 'translateY(-50%)', opacity: 0.9 }}
              />
              <Button
                shape="circle"
                size="large"
                disabled={!canNext}
                onClick={(e) => {
                  e.stopPropagation();
                  goto(index + 1);
                }}
                icon={<RightOutlined />}
                style={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', opacity: 0.9 }}
              />
            </>
          )}
        </div>
      )}

      {/* Thumbnails */}
      {mediaItems.length > 0 && (
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 4,
          }}
          aria-label="media thumbnails"
        >
          {mediaItems.map((item, i) => {
            const isActive = i === index;
            return (
              <div
                key={item.url + i}
                style={{
                  borderRadius: 8,
                  border: isActive ? '2px solid var(--ant-primary-color)' : '1px solid #e5e7eb',
                  padding: 2,
                  background: '#fff',
                  position: 'relative',
                  flexShrink: 0,
                }}
              >
                {item.type === 'image' ? (
                  <Image
                    src={item.url + '?w=480'}
                    alt={`${alt} ${i + 1}`}
                    width={96}
                    height={72}
                    fallback={svgPlaceholder(`${alt} ${i + 1}`, 192, 144)}
                    style={{ objectFit: 'cover', borderRadius: 6, cursor: 'pointer' }}
                    preview={false}
                    onClick={() => goto(i)}
                  />
                ) : (
                  <div
                    style={{
                      width: 96,
                      height: 72,
                      borderRadius: 6,
                      overflow: 'hidden',
                      position: 'relative',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      goto(i);
                      handleVideoClick(item.url);
                    }}
                  >
                    <video
                      src={item.url}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {/* Small play icon on thumbnail */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        fontSize: 24,
                        color: '#fff',
                        background: 'rgba(0,0,0,0.5)',
                        borderRadius: '50%',
                        width: 32,
                        height: 32,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <PlayCircleOutlined />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Video Modal */}
      <Modal
        open={videoModal.visible}
        footer={null}
        onCancel={() => setVideoModal({ visible: false, url: '' })}
        width={800}
        centered
        destroyOnClose
      >
        <video
          src={videoModal.url}
          controls
          autoPlay
          style={{ width: '100%', borderRadius: 8 }}
        />
      </Modal>
    </div>
  );
};

export default MediaGallery;
