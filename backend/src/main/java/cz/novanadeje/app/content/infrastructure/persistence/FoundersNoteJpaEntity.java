package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.people.FoundersNote;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Optional;

@Entity
@Table(name = "content_founders_note")
class FoundersNoteJpaEntity {

    static final short SINGLETON_ID = 1;

    @Id
    private Short id;

    @Column(name = "text", length = FoundersNote.MAX_LENGTH)
    private String text;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected FoundersNoteJpaEntity() {
    }

    static FoundersNoteJpaEntity fromDomain(FoundersNote note) {
        FoundersNoteJpaEntity entity = new FoundersNoteJpaEntity();
        entity.id = SINGLETON_ID;
        entity.text = note.text().orElse(null);
        entity.updatedAt = note.updatedAt();
        return entity;
    }

    FoundersNote toDomain() {
        return new FoundersNote(Optional.ofNullable(text), updatedAt);
    }
}
