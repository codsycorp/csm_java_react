#!/bin/bash

# Load configuration from config file
source config.env

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
          "timeout": 900
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
          "timeout": 900
        }'
    fi
else
    echo "Error: JAR file with dependencies not found!"
    exit 1
fi
echo "=== Xoá file alifc_jbackend.jar trên OSS sau khi deploy ==="
ossutil rm oss://$OSS_BUCKET_NAME/alifc_jbackend.jar --config-file $OSSUTIL_CONFIG_PATH --force
echo "=== Hoàn thành! ==="
