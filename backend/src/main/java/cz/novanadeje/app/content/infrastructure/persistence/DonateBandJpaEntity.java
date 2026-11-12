package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.donateband.DonateBand;
import cz.novanadeje.app.content.domain.donateband.DonateBandPhoto;
import cz.novanadeje.app.content.domain.media.MediaId;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Entity
@Table(name = "content_donate_band")
class DonateBandJpaEntity {

    static final short SINGLETON_ID = 1;

    @Id
    private Short id;

    @Column(name = "photo_media_id")
    private UUID photoMediaId;

    @Column(name = "photo_alt", length = DonateBandPhoto.MAX_ALT_LENGTH)
    private String photoAlt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected DonateBandJpaEntity() {
    }

    static DonateBandJpaEntity fromDomain(DonateBand band) {
        DonateBandJpaEntity entity = new DonateBandJpaEntity();
        entity.id = SINGLETON_ID;
        entity.photoMediaId = band.image().map(MediaId::value).orElse(null);
        entity.photoAlt = band.photo().flatMap(DonateBandPhoto::alt).orElse(null);
        entity.updatedAt = band.updatedAt();
        return entity;
    }

    DonateBand toDomain() {
        Optional<DonateBandPhoto> photo = Optional.ofNullable(photoMediaId)
                .map(image -> new DonateBandPhoto(new MediaId(image), Optional.ofNullable(photoAlt)));
        return new DonateBand(photo, updatedAt);
    }
}
