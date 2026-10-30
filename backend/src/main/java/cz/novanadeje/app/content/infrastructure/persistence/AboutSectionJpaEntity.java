package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.about.AboutPhoto;
import cz.novanadeje.app.content.domain.about.AboutSection;
import cz.novanadeje.app.content.domain.media.MediaId;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Entity
@Table(name = "content_about")
class AboutSectionJpaEntity {

    static final short SINGLETON_ID = 1;

    @Id
    private Short id;

    @Column(name = "photo_media_id")
    private UUID photoMediaId;

    @Column(name = "photo_alt", length = AboutPhoto.MAX_ALT_LENGTH)
    private String photoAlt;

    @Column(name = "photo_caption", length = AboutPhoto.MAX_CAPTION_LENGTH)
    private String photoCaption;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected AboutSectionJpaEntity() {
    }

    static AboutSectionJpaEntity fromDomain(AboutSection section) {
        AboutSectionJpaEntity entity = new AboutSectionJpaEntity();
        entity.id = SINGLETON_ID;
        entity.photoMediaId = section.image().map(MediaId::value).orElse(null);
        entity.photoAlt = section.photo().flatMap(AboutPhoto::alt).orElse(null);
        entity.photoCaption = section.photo().flatMap(AboutPhoto::caption).orElse(null);
        entity.updatedAt = section.updatedAt();
        return entity;
    }

    AboutSection toDomain() {
        Optional<AboutPhoto> photo = Optional.ofNullable(photoMediaId)
                .map(image -> new AboutPhoto(new MediaId(image), Optional.ofNullable(photoAlt), Optional.ofNullable(photoCaption)));
        return new AboutSection(photo, updatedAt);
    }
}
