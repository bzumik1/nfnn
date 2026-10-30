package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.people.FoundersNote;
import cz.novanadeje.app.content.domain.people.FoundersNoteRepository;
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
class JpaFoundersNoteRepositoryTest {

    private static final Instant BEFORE = Instant.parse("2026-10-29T10:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-30T10:00:00Z");

    @Autowired
    private FoundersNoteRepository notes;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given nothing saved, when the note is read, then there is none")
    void should_find_nothing_when_read_given_nothing_saved() {
        assertThat(notes.find()).isEmpty();
    }

    @Test
    @DisplayName("Given a note with paragraphs, when it is saved, emptied and read, then the one row comes back as saved each time")
    void should_keep_one_row_when_saved_twice_given_a_note_with_paragraphs() {
        FoundersNote written = new FoundersNote(Optional.of("První odstavec.\n\nDruhý odstavec."), BEFORE);
        notes.save(written);
        flushAndClear();

        assertThat(notes.find()).contains(written);

        notes.save(FoundersNote.empty(NOW));
        flushAndClear();

        assertThat(notes.find()).contains(FoundersNote.empty(NOW));
        assertThat(jdbc.sql("select count(*) from content_founders_note").query(Long.class).single()).isEqualTo(1);
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
