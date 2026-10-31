package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.people.PeopleFootnote;
import cz.novanadeje.app.content.domain.people.PeopleFootnoteRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(ContentPersistenceTestConfiguration.class)
class JpaPeopleFootnoteRepositoryTest {

    private static final Instant BEFORE = Instant.parse("2026-10-30T10:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-31T10:00:00Z");

    @Autowired
    private PeopleFootnoteRepository footnotes;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given nothing saved, when the footnote is read, then there is none")
    void should_find_nothing_when_read_given_nothing_saved() {
        assertThat(footnotes.find()).isEmpty();
    }

    @Test
    @DisplayName("Given a footnote, when it is saved, emptied and read, then the one row comes back as saved each time")
    void should_keep_one_row_when_saved_twice_given_a_footnote() {
        PeopleFootnote written = new PeopleFootnote(Optional.of("Web zajišťuje Petr Vzor."), BEFORE);
        footnotes.save(written);
        flushAndClear();

        assertThat(footnotes.find()).contains(written);

        footnotes.save(PeopleFootnote.empty(NOW));
        flushAndClear();

        assertThat(footnotes.find()).contains(PeopleFootnote.empty(NOW));
        assertThat(jdbc.sql("select count(*) from content_people_footnote").query(Long.class).single()).isEqualTo(1);
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
