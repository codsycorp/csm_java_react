#!/bin/bash
# Script kiểm tra và tạo thư mục cache cho nginx

CACHE_DIR="/var/cache/nginx/proxy"

echo "🔍 Checking nginx cache directory..."

if [ ! -d "$CACHE_DIR" ]; then
    echo "📁 Creating cache directory: $CACHE_DIR"
    sudo mkdir -p "$CACHE_DIR"
    sudo chown -R www-data:www-data "$CACHE_DIR"
    sudo chmod -R 755 "$CACHE_DIR"
    echo "✅ Cache directory created"
else
    echo "✅ Cache directory exists"
fi

echo ""
echo "🧪 Testing nginx configuration..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo ""
    echo "🔄 Reloading nginx..."
    sudo systemctl reload nginx
    echo "✅ Nginx reloaded successfully"
    echo ""
    echo "📊 Nginx status:"
    sudo systemctl status nginx --no-pager -l
else
    echo "❌ Nginx configuration test failed"
    exit 1
fi
