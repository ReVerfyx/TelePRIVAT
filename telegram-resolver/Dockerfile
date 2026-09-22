FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libssl3 zlib1g ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/telegram-resolver-0.1.0.jar /app/app.jar
RUN mkdir -p /data/tdlib /data/downloads
EXPOSE 8090
ENTRYPOINT ["java","-jar","/app/app.jar"]
