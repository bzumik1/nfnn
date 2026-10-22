plugins {
	java
	id("org.springframework.boot") version "4.1.2"
	id("io.spring.dependency-management") version "1.1.7"
}

group = "cz.novanadeje"
version = "0.0.1-SNAPSHOT"
description = "Nadační fond Nová naděje – backend"

java {
	toolchain {
		languageVersion = JavaLanguageVersion.of(25)
	}
}

repositories {
	mavenCentral()
}

extra["cucumberVersion"] = "7.34.9"
extra["archunitVersion"] = "1.5.1"
extra["openhtmltopdfVersion"] = "1.1.100"
extra["zxingVersion"] = "3.5.4"
extra["fioApiVersion"] = "1.0.0"

dependencies {
	implementation("io.github.bzumik1:fio-api:${property("fioApiVersion")}")

	implementation("org.springframework.boot:spring-boot-starter-actuator")
	implementation("org.springframework.boot:spring-boot-starter-data-jpa")
	implementation("org.springframework.boot:spring-boot-starter-liquibase")
	implementation("org.springframework.boot:spring-boot-starter-mail")
	implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server")
	implementation("org.springframework.boot:spring-boot-starter-security")
	implementation("org.springframework.boot:spring-boot-starter-thymeleaf")
	implementation("org.springframework.boot:spring-boot-starter-validation")
	implementation("org.springframework.boot:spring-boot-starter-webmvc")
	implementation("org.thymeleaf.extras:thymeleaf-extras-springsecurity6")

	implementation("com.github.ben-manes.caffeine:caffeine")

	implementation("io.github.openhtmltopdf:openhtmltopdf-core:${property("openhtmltopdfVersion")}")
	implementation("io.github.openhtmltopdf:openhtmltopdf-pdfbox:${property("openhtmltopdfVersion")}")

	implementation("com.google.zxing:core:${property("zxingVersion")}")
	implementation("com.google.zxing:javase:${property("zxingVersion")}")

	runtimeOnly("org.postgresql:postgresql")
	annotationProcessor("org.springframework.boot:spring-boot-configuration-processor")

	testImplementation("org.springframework.boot:spring-boot-starter-actuator-test")
	testImplementation("org.springframework.boot:spring-boot-starter-data-jpa-test")
	testImplementation("org.springframework.boot:spring-boot-starter-liquibase-test")
	testImplementation("org.springframework.boot:spring-boot-starter-mail-test")
	testImplementation("org.springframework.boot:spring-boot-starter-security-test")
	testImplementation("org.springframework.boot:spring-boot-starter-thymeleaf-test")
	testImplementation("org.springframework.boot:spring-boot-starter-validation-test")
	testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
	testImplementation("org.springframework.boot:spring-boot-testcontainers")
	testImplementation("org.testcontainers:testcontainers-junit-jupiter")
	testImplementation("org.testcontainers:testcontainers-postgresql")

	testImplementation("org.assertj:assertj-core")
	testImplementation("org.awaitility:awaitility")
	testImplementation("org.mockito:mockito-core")
	testImplementation("org.mockito:mockito-junit-jupiter")

	testImplementation("io.cucumber:cucumber-java:${property("cucumberVersion")}")
	testImplementation("io.cucumber:cucumber-spring:${property("cucumberVersion")}")
	testImplementation("io.cucumber:cucumber-junit-platform-engine:${property("cucumberVersion")}")

	testImplementation("com.tngtech.archunit:archunit-junit5:${property("archunitVersion")}")

	testImplementation("org.junit.platform:junit-platform-suite")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<Test> {
	useJUnitPlatform {
		if (project.hasProperty("noCucumber")) {
			excludeEngines("cucumber", "junit-platform-suite")
		}
	}
	systemProperty("cucumber.junit-platform.naming-strategy", "long")
	environment("TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE", "/var/run/docker.sock")
	inputs.file("../frontend/src/styles/themes/_nova-nadeje.scss").withPropertyName("siteTheme").withPathSensitivity(PathSensitivity.NONE)
}
