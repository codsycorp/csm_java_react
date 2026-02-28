#!/bin/bash

# Load configuration from config file
source config.env

echo "=== Build Backend Maven Project ==="
cd backend
if [ -f "pom.xml" ]; then
    mvn clean package
else
    echo "Error: pom.xml not found!"
    exit 1
fi
cd ..

echo "=== Deploy Backend lên Alibaba Function Compute ==="
if command -v aliyun > /dev/null; then
    if [ -f "./backend/target/os-nitrite-backend-1.0.0.jar" ]; then
        FUNCTION_EXISTS=$(aliyun fc-open GET /2021-04-06/services/os-nitrite-service/functions/os-nitrite-function --region $REGION 2>&1 | grep -c 'Function not found')
        if [ $FUNCTION_EXISTS -eq 0 ]; then
            echo "Function already exists. Updating the function..."
            aliyun fc-open PUT /2021-04-06/services/os-nitrite-service/functions/os-nitrite-function \
            --region $REGION \
            --body '{
              "runtime": "java11",
              "handler": "net.phongthuyphattam.Main::handleRequest",
              "code": {
                "zipFile": "'"$(base64 -i ./backend/target/os-nitrite-backend-1.0.0.jar)"'"
              },
              "timeout": 60
            }'
        else
            echo "Creating a new function..."
            aliyun fc-open POST /2021-04-06/services/os-nitrite-service/functions \
            --region $REGION \
            --body '{
              "functionName": "os-nitrite-function",
              "runtime": "java11",
              "handler": "net.phongthuyphattam.Main::handleRequest",
              "code": {
                "zipFile": "'"$(base64 -i ./backend/target/os-nitrite-backend-1.0.0.jar)"'"
              },
              "timeout": 60
            }'
        fi
    else
        echo "Error: JAR file not found!"
        exit 1
    fi
else
    echo "Error: aliyun CLI not installed!"
    exit 1
fi

echo "=== Build Frontend React.js ==="
cd frontend
if [ -f "package.json" ]; then
    npm install
    npm run build
else
    echo "Error: package.json not found!"
    exit 1
fi

# Create sitemap.xml
echo "=== Creating sitemap.xml ==="
cat <<EOL > build/sitemap.xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>https://phongthuyphattam.net/</loc>
        <lastmod>$(date +%Y-%m-%d)</lastmod>
        <changefreq>monthly</changefreq>
        <priority>1.0</priority>
    </url>
</urlset>
EOL

# Create robots.txt
echo "=== Creating robots.txt ==="
cat <<EOL > build/robots.txt
User-agent: *
Disallow:

Sitemap: https://phongthuyphattam.net/sitemap.xml
EOL

cd ..

echo "=== Configure OSSUtil ==="
if command -v ossutil > /dev/null; then
    echo -e "[Credentials]\nendpoint=oss-$REGION.aliyuncs.com\naccessKeyID=$ACCESS_KEY_ID\naccessKeySecret=$ACCESS_KEY_SECRET\nregion=$REGION" > $OSSUTIL_CONFIG_PATH
else
    echo "Error: ossutil not installed!"
    exit 1
fi

if [ -d "frontend/build" ]; then
    echo "=== Creating version.json ==="
    echo '{"version": "'$(date +%Y%m%d%H%M%S)'"}' > frontend/build/version.json

    echo "=== Upload Frontend lên OSS ==="
    ossutil cp -r frontend/build/ oss://$OSS_BUCKET_NAME/frontend/ --config-file $OSSUTIL_CONFIG_PATH --force
    if [ $? -eq 0 ]; then
        echo "Frontend uploaded successfully."
        ossutil cp frontend/build/index.html oss://$OSS_BUCKET_NAME/index.html --config-file $OSSUTIL_CONFIG_PATH --force
        ossutil cp frontend/build/sitemap.xml oss://$OSS_BUCKET_NAME/sitemap.xml --config-file $OSSUTIL_CONFIG_PATH --force
        ossutil cp frontend/build/robots.txt oss://$OSS_BUCKET_NAME/robots.txt --config-file $OSSUTIL_CONFIG_PATH --force
        ossutil cp frontend/build/version.json oss://$OSS_BUCKET_NAME/version.json --config-file $OSSUTIL_CONFIG_PATH --force
        if [ $? -eq 0 ]; then
            echo "index.html, sitemap.xml, robots.txt, and version.json uploaded successfully."
        else
            echo "Error: Failed to upload index.html, sitemap.xml, robots.txt, or version.json."
            exit 1
        fi
    else
        echo "Error: Failed to upload frontend."
        exit 1
    fi
else
    echo "Error: frontend/build/ directory not found!"
    exit 1
fi

echo "=== Hoàn thành! ==="