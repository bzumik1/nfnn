package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.people.PeopleFootnote;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Optional;

@Entity
@Table(name = "content_people_footnote")
class PeopleFootnoteJpaEntity {

    static final short SINGLETON_ID = 1;

    @Id
    private Short id;

    @Column(name = "text", length = PeopleFootnote.MAX_LENGTH)
    private String text;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected PeopleFootnoteJpaEntity() {
    }

    static PeopleFootnoteJpaEntity fromDomain(PeopleFootnote footnote) {
        PeopleFootnoteJpaEntity entity = new PeopleFootnoteJpaEntity();
        entity.id = SINGLETON_ID;
        entity.text = footnote.text().orElse(null);
        entity.updatedAt = footnote.updatedAt();
        return entity;
    }

    PeopleFootnote toDomain() {
        return new PeopleFootnote(Optional.ofNullable(text), updatedAt);
    }
}
