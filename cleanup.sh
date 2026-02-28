#!/bin/bash

# =========================================================================
# Script dọn dẹp hệ thống Linux - Tập trung vào /usr và /var
# Tác giả: Gemini
# Phiên bản: 3.0
# Ngày tạo: 10-09-2025
# =========================================================================

# Kiểm tra quyền root
if [ "$EUID" -ne 0 ]; then
  echo "Vui lòng chạy script này với quyền root hoặc sử dụng sudo."
  exit 1
fi

echo "Bắt đầu quá trình dọn dẹp hệ thống..."
echo "----------------------------------------"

# 1. Dọn dẹp bộ nhớ cache của APT
echo "1. Dọn dẹp APT cache và các gói không cần thiết..."
apt-get clean
apt-get autoremove --purge -y
echo "   -> Đã hoàn tất."
echo ""

# 2. Xóa các phiên bản kernel cũ không còn sử dụng
echo "2. Xóa các phiên bản kernel cũ..."
dpkg --list | grep 'linux-image' | awk '{print $2}' | grep -v `uname -r` | grep -E 'linux-image-[0-9]+\.[0-9]+\.[0-9]+' | xargs apt-get -y purge
echo "   -> Đã hoàn tất."
echo ""

# 3. Dọn dẹp tệp nhật ký trong /var
echo "3. Dọn dẹp tệp nhật ký trong /var/log..."
find /var/log/ -type f -name "*.gz" -delete
find /var/log/ -type f -name "*.log-*" -delete
find /var/log/ -type f -name "*.[0-9]" -delete
find /var/log/ -type f -name "*.[0-9].gz" -delete
journalctl --vacuum-size=100M
echo "   -> Đã hoàn tất."
echo ""

# 4. Xóa tệp và thư mục tạm thời lớn
echo "4. Dọn dẹp các tệp tạm thời trong /tmp và /var/tmp..."
rm -rf /tmp/*
rm -rf /var/tmp/*
echo "   -> Đã hoàn tất."
echo ""

# 5. Dọn dẹp các gói ứng dụng không còn sử dụng (ví dụ: các gói đã gỡ cài đặt)
echo "5. Dọn dẹp các gói debian không còn cần thiết..."
apt-get autoclean
echo "   -> Đã hoàn tất."
echo ""

# 6. Dọn dẹp Docker (nếu có)
echo "6. Dọn dẹp Docker images, containers, và cache..."
if command -v docker &>/dev/null; then
  docker system prune -a -f
  echo "   -> Đã hoàn tất Docker."
else
  echo "   -> Docker không được cài đặt, bỏ qua."
fi
echo ""

# 7. Kiểm tra dung lượng ổ đĩa sau khi dọn dẹp
echo "7. Kiểm tra dung lượng ổ đĩa sau khi dọn dẹp:"
df -h /
echo ""

echo "Quá trình dọn dẹp đã hoàn tất!"