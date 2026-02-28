#!/bin/bash

# Load configuration from config file
source config.env

echo "=== Clean Backend Build Directory ==="
cd backend
if [ -d "target" ]; then
    rm -rf target
fi
cd ..

echo "=== Build Backend Maven Project ==="
cd backend
if [ -f "pom.xml" ]; then
    mvn clean install -Pprod
else
    echo "Error: pom.xml not found!"
    exit 1
fi
cd ..

if [ -f "./backend/target/alifc_jbackend-1.0.0-jar-with-dependencies.jar" ]; then
    # Upload the JAR file to OSS first
    echo "Uploading JAR file to OSS..."
    ossutil cp ./backend/target/alifc_jbackend-1.0.0-jar-with-dependencies.jar oss://$OSS_BUCKET_NAME/alifc_jbackend.jar --config-file $OSSUTIL_CONFIG_PATH --force
    if [ $? -ne 0 ]; then
        echo "Error: Failed to upload JAR file to OSS."
        exit 1
    fi

    # Now update or create the function
    FUNCTION_INFO=$(aliyun fc GET /2023-03-30/functions/alifc_jbackend --region $REGION --header "Content-Type=application/json;" 2>&1)
    FUNCTION_NOT_FOUND=$(echo "$FUNCTION_INFO" | grep -c 'ErrorCode: FunctionNotFound')

    if [ $FUNCTION_NOT_FOUND -eq 0 ]; then
        echo "Function already exists. Updating the function..."
        aliyun fc PUT /2023-03-30/functions/alifc_jbackend \
        --header "Content-Type=application/json;" \
        --body '{
          "runtime": "java11",
          "handler": "net.phanmemmottrieu.MainAFC::handleRequest",
          "code": {
            "ossBucketName": "'"$OSS_BUCKET_NAME"'",
            "ossObjectName": "alifc_jbackend.jar"
          },
          "timeout": 60
        }'
    else
        echo "Creating a new function..."
        aliyun fc POST /2023-03-30/functions \
        --header "Content-Type=application/json;" \
        --body '{
          "functionName": "alifc_jbackend",
          "runtime": "java11",
          "handler": "net.phanmemmottrieu.MainAFC::handleRequest",
          "code": {
            "ossBucketName": "'"$OSS_BUCKET_NAME"'",
            "ossObjectName": "alifc_jbackend.jar"
          },
          "timeout": 60
        }'
    fi
else
    echo "Error: JAR file with dependencies not found!"
    exit 1
fi
echo "=== Xoá file alifc_jbackend.jar trên OSS sau khi deploy ==="
ossutil rm oss://$OSS_BUCKET_NAME/alifc_jbackend.jar --config-file $OSSUTIL_CONFIG_PATH --force
echo "=== Clean Frontend Build Directory ==="
cd frontend
if [ -d "dist" ]; then
    rm -rf dist
fi
pnpm clean

echo "=== Build ==="
if [ -f "package.json" ]; then
    pnpm build
    if [ $? -ne 0 ]; then
        echo "Error: Gatsby build failed!"
        exit 1
    fi
else
    echo "Error: package.json not found!"
    exit 1
fi

# Ensure Gatsby build completes successfully
if [ ! -d "dist" ]; then
    echo "Error: Gatsby build did not generate the Dist directory!"
    exit 1
fi

cd ..

echo "=== Configure OSSUtil ==="
if command -v ossutil > /dev/null; then
    echo -e "[Credentials]\nendpoint=oss-$REGION.aliyuncs.com\naccessKeyID=$ACCESS_KEY_ID\naccessKeySecret=$ACCESS_KEY_SECRET\nregion=$REGION" > $OSSUTIL_CONFIG_PATH
else
    echo "Error: ossutil not installed!"
    exit 1
fi

echo "=== Xóa thư mục frontend trên OSS ==="
ossutil rm -r oss://$OSS_BUCKET_NAME/frontend/ --config-file $OSSUTIL_CONFIG_PATH --force

# Kiểm tra xem thư mục public có tồn tại không
if [ -d "frontend/dist" ]; then
    echo "=== Creating version.json ==="
    echo '{"version": "'$(date +%Y%m%d%H%M%S)'"}' > frontend/dist/version.json

    echo "=== Upload Frontend lên OSS ==="
    ossutil cp -r frontend/dist/ oss://$OSS_BUCKET_NAME --config-file $OSSUTIL_CONFIG_PATH --force
    if [ $? -eq 0 ]; then
        echo "Frontend uploaded successfully."

        # Tạo sitemap.xml
        echo '<?xml version="1.0" encoding="UTF-8"?>' > frontend/dist/sitemap.xml
        echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' >> frontend/dist/sitemap.xml
        echo '  <url>' >> frontend/dist/sitemap.xml
        echo '    <loc>https://www.vn369.net/</loc>' >> frontend/dist/sitemap.xml
        echo '  </url>' >> frontend/dist/sitemap.xml
        echo '</urlset>' >> frontend/dist/sitemap.xml

        # Tạo robots.txt
        echo 'User-agent: *' > frontend/dist/robots.txt
        echo 'Allow: /' >> frontend/dist/robots.txt
        echo 'Sitemap: https://www.vn369.net/sitemap.xml' >> frontend/dist/robots.txt

        # Tải lên các tệp index.html, sitemap.xml và robots.txt
        ossutil cp frontend/dist/index.html oss://$OSS_BUCKET_NAME/frontend/index.html --config-file $OSSUTIL_CONFIG_PATH --force
        ossutil cp frontend/dist/sitemap.xml oss://$OSS_BUCKET_NAME/frontend/sitemap.xml --config-file $OSSUTIL_CONFIG_PATH --force
        ossutil cp frontend/dist/robots.txt oss://$OSS_BUCKET_NAME/frontend/robots.txt --config-file $OSSUTIL_CONFIG_PATH --force
        ossutil cp frontend/dist/version.json oss://$OSS_BUCKET_NAME/version.json --config-file $OSSUTIL_CONFIG_PATH --force

        # Tạo symbolic link cho index.html ở thư mục gốc
        ossutil cp frontend/dist/index.html oss://$OSS_BUCKET_NAME/index.html --config-file $OSSUTIL_CONFIG_PATH --force

        if [ $? -eq 0 ]; then
            echo "index.html, sitemap.xml, and robots.txt uploaded successfully."
        else
            echo "Error: Failed to upload index.html, sitemap.xml, or robots.txt."
            echo "Please check your domain: https://www.vn369.net"
            exit 1
        fi
    else
        echo "Error: Failed to upload frontend."
        exit 1
    fi
else
    echo "Error: frontend/dist/ directory not found!"
    exit 1
fi

echo "=== Hoàn thành! ==="
