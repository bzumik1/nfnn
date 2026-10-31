package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.project.ProjectOrder;
import cz.novanadeje.app.content.domain.project.ProjectOrderRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(ContentPersistenceTestConfiguration.class)
class JpaProjectOrderRepositoryTest {

    private static final Instant BEFORE = Instant.parse("2026-10-29T10:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-30T10:00:00Z");

    @Autowired
    private ProjectOrderRepository orders;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given no order chosen yet, when the order is read, then it is the year, then the category")
    void should_be_the_default_when_read_given_nothing_chosen() {
        assertThat(orders.current()).isEqualTo(ProjectOrder.YEAR_THEN_CATEGORY);
    }

    @Test
    @DisplayName("Given an order chosen twice, when the order is read, then it is the last one chosen, kept in the one row with its time")
    void should_keep_the_last_choice_when_chosen_twice() {
        orders.save(ProjectOrder.CATEGORY_THEN_YEAR, BEFORE);
        flushAndClear();
        orders.save(ProjectOrder.YEAR, NOW);
        flushAndClear();

        assertThat(orders.current()).isEqualTo(ProjectOrder.YEAR);
        assertThat(jdbc.sql("select count(*) from content_project_order").query(Long.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("select updated_at from content_project_order").query(Instant.class).single()).isEqualTo(NOW);
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
