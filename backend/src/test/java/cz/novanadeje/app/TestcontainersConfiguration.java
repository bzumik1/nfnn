package cz.novanadeje.app;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

	public static final String INITDB_ARGS = "--locale-provider=builtin --builtin-locale=C.UTF-8";

	@Bean
	@ServiceConnection
	public PostgreSQLContainer postgresContainer() {
		return newPostgres();
	}

	public static PostgreSQLContainer newPostgres() {
		return new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine")).withEnv("POSTGRES_INITDB_ARGS", INITDB_ARGS);
	}

}
