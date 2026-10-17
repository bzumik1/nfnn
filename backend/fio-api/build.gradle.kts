plugins {
	`java-library`
}

group = "cz.novanadeje"
version = "0.1.0-SNAPSHOT"
description = "Java client for the Fio banka REST API"

java {
	toolchain {
		languageVersion = JavaLanguageVersion.of(25)
	}
}

repositories {
	mavenCentral()
}

dependencies {
	implementation("tools.jackson.core:jackson-databind:3.1.2")

	testImplementation(platform("org.junit:junit-bom:6.0.3"))
	testImplementation("org.junit.jupiter:junit-jupiter")
	testImplementation("org.assertj:assertj-core:3.27.7")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.test {
	useJUnitPlatform()
}
