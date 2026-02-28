FROM openjdk:17-jdk-slim

# Set working directory
WORKDIR /app

# Copy source code
COPY backend/src /app/src
COPY backend/pom.xml /app/pom.xml

# Install Maven
RUN apt-get update && apt-get install -y maven

# Expose port
EXPOSE 8080

# Set environment variables
ENV CONFIG_PATH=/app/src/main/resources/application.properties
ENV RUNTIME_ENV=docker

# Run the application
CMD ["mvn", "spring-boot:run"]
