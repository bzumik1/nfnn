package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.people.Person;
import cz.novanadeje.app.content.domain.people.PersonDetails;
import cz.novanadeje.app.content.domain.people.PersonEmails;
import cz.novanadeje.app.content.domain.people.PersonId;
import cz.novanadeje.app.shared.domain.EmailAddress;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Entity
@Table(name = "content_person")
class PersonJpaEntity {

    @Id
    private UUID id;

    @Column(name = "name", nullable = false, length = PersonDetails.MAX_NAME_LENGTH)
    private String name;

    @Column(name = "role", length = PersonDetails.MAX_ROLE_LENGTH)
    private String role;

    @Column(name = "position", nullable = false)
    private int position;

    @Column(name = "on_board", nullable = false)
    private boolean onBoard;

    @Column(name = "board_note", length = PersonDetails.MAX_BOARD_NOTE_LENGTH)
    private String boardNote;

    @Column(name = "featured", nullable = false)
    private boolean featured;

    @Column(name = "portrait_media_id")
    private UUID portraitMediaId;

    @Column(name = "web_signature_media_id")
    private UUID webSignatureMediaId;

    @Column(name = "personal_email", length = EmailAddress.MAX_LENGTH)
    private String personalEmail;

    @Column(name = "fund_email", length = EmailAddress.MAX_LENGTH)
    private String fundEmail;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected PersonJpaEntity() {
    }

    static PersonJpaEntity fromDomain(Person person) {
        PersonJpaEntity entity = new PersonJpaEntity();
        PersonDetails details = person.details();
        entity.id = person.id().value();
        entity.name = details.name();
        entity.role = details.role().orElse(null);
        entity.position = person.position();
        entity.onBoard = details.onBoard();
        entity.boardNote = details.boardNote().orElse(null);
        entity.featured = details.featured();
        entity.portraitMediaId = details.portrait().map(MediaId::value).orElse(null);
        entity.webSignatureMediaId = person.webSignature().map(MediaId::value).orElse(null);
        entity.personalEmail = details.emails().personal().map(EmailAddress::value).orElse(null);
        entity.fundEmail = details.emails().fund().map(EmailAddress::value).orElse(null);
        entity.createdAt = person.createdAt();
        entity.updatedAt = person.updatedAt();
        return entity;
    }

    Person toDomain() {
        PersonDetails details = new PersonDetails(name, Optional.ofNullable(role), onBoard, Optional.ofNullable(boardNote), featured,
                Optional.ofNullable(portraitMediaId).map(MediaId::new),
                new PersonEmails(Optional.ofNullable(personalEmail).map(EmailAddress::new), Optional.ofNullable(fundEmail).map(EmailAddress::new)));
        return new Person(new PersonId(id), details, position, Optional.ofNullable(webSignatureMediaId).map(MediaId::new), createdAt, updatedAt);
    }
}
