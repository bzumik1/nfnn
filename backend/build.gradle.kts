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
extra["webpImageioVersion"] = "0.3.3"
extra["webauthn4jVersion"] = "0.31.11.RELEASE"

val mockitoAgent: Configuration = configurations.create("mockitoAgent")

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

	implementation("com.github.ben-manes.caffeine:caffeine")

	implementation("io.github.openhtmltopdf:openhtmltopdf-core:${property("openhtmltopdfVersion")}")
	implementation("io.github.openhtmltopdf:openhtmltopdf-pdfbox:${property("openhtmltopdfVersion")}")

	implementation("com.google.zxing:core:${property("zxingVersion")}")

	implementation("io.github.darkxanter:webp-imageio:${property("webpImageioVersion")}")

	implementation("com.webauthn4j:webauthn4j-core:${property("webauthn4jVersion")}")

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

	testImplementation("com.google.zxing:javase:${property("zxingVersion")}")
	testImplementation("org.assertj:assertj-core")
	testImplementation("org.awaitility:awaitility")
	testImplementation("org.mockito:mockito-core")
	testImplementation("org.mockito:mockito-junit-jupiter")
	mockitoAgent("org.mockito:mockito-core") { isTransitive = false }

	testImplementation("io.cucumber:cucumber-java:${property("cucumberVersion")}")
	testImplementation("io.cucumber:cucumber-spring:${property("cucumberVersion")}")
	testImplementation("io.cucumber:cucumber-junit-platform-engine:${property("cucumberVersion")}")

	testImplementation("com.tngtech.archunit:archunit-junit5:${property("archunitVersion")}")

	testImplementation("org.junit.platform:junit-platform-suite")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

class JavaAgent(@get:Classpath val jar: FileCollection) : CommandLineArgumentProvider {
	override fun asArguments() = listOf("-javaagent:${jar.singleFile.absolutePath}")
}

val runsCucumber = !project.hasProperty("noCucumber")

tasks.withType<Test> {
	systemProperty("cucumber.junit-platform.naming-strategy", "long")
	System.getenv("CUCUMBER_FILTER_TAGS")?.let { systemProperty("cucumber.filter.tags", it) }
	maxHeapSize = "1g"
	maxParallelForks = 2
	jvmArgs("--enable-native-access=ALL-UNNAMED", "-Xshare:off")
	jvmArgumentProviders.add(JavaAgent(mockitoAgent))
	environment("TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE", "/var/run/docker.sock")
	inputs.file("../frontend/src/themes/nova-nadeje/_theme.scss").withPropertyName("siteTheme").withPathSensitivity(PathSensitivity.NONE)
}

val acceptanceTest = tasks.register<Test>("acceptanceTest") {
	description = "Runs the Cucumber acceptance scenarios, one suite per fork."
	group = LifecycleBasePlugin.VERIFICATION_GROUP
	testClassesDirs = sourceSets.test.get().output.classesDirs
	classpath = sourceSets.test.get().runtimeClasspath
	useJUnitPlatform {
		includeEngines("junit-platform-suite")
	}
	include("**/*AcceptanceTests.class")
	enabled = runsCucumber
}

tasks.test {
	useJUnitPlatform {
		excludeEngines("cucumber", "junit-platform-suite")
	}
	filter {
		isFailOnNoMatchingTests = !runsCucumber
	}
	finalizedBy(acceptanceTest)
}
