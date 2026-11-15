package cz.novanadeje.app.shared.infrastructure.persistence;

import cz.novanadeje.app.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.health.contributor.HealthContributor;
import org.springframework.boot.health.registry.HealthContributorRegistry;
import org.springframework.boot.jdbc.health.DataSourceHealthIndicator;

import javax.sql.DataSource;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
class DatabaseHealthCheckTest {

    @Autowired
    private HealthContributorRegistry registry;
    @Autowired
    private DataSource dataSource;

    @Test
    @DisplayName("Given the application's pool and the migrations' connection, when the health check's database contributor is read, then it is one indicator of the pool alone")
    void should_check_only_pool_when_database_contributor_read_given_pool_and_migration_connection() {
        HealthContributor database = registry.getContributor("db");

        assertThat(database).isInstanceOf(DataSourceHealthIndicator.class);
        assertThat(database).extracting("dataSource").isSameAs(dataSource);
    }
}
