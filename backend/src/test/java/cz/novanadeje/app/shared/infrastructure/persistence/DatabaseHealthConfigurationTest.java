package cz.novanadeje.app.shared.infrastructure.persistence;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import javax.sql.DataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class DatabaseHealthConfigurationTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withBean(DataSource.class, () -> mock(DataSource.class))
            .withUserConfiguration(DatabaseHealthConfiguration.class);

    @Test
    @DisplayName("Given no health setting, when the context starts, then the database contributor checks the pool")
    void should_declare_database_contributor_when_started_given_no_health_setting() {
        contexts.run(context -> assertThat(context).hasBean("dbHealthContributor"));
    }

    @Test
    @DisplayName("Given the database health indicator turned off, when the context starts, then no database contributor is declared")
    void should_declare_no_database_contributor_when_started_given_database_indicator_off() {
        contexts.withPropertyValues("management.health.db.enabled=false")
                .run(context -> assertThat(context).doesNotHaveBean("dbHealthContributor"));
    }
}
