package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "content_media")
class MediaImageJpaEntity {

    @Id
    private UUID id;

    @Column(name = "width", nullable = false)
    private int width;

    @Column(name = "height", nullable = false)
    private int height;

    @Column(name = "uploaded_at", nullable = false)
    private Instant uploadedAt;

    @OneToMany(mappedBy = "media", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("width asc")
    private List<MediaVariantJpaEntity> variants = new ArrayList<>();

    protected MediaImageJpaEntity() {
    }

    static MediaImageJpaEntity fromDomain(MediaImage image) {
        MediaImageJpaEntity entity = new MediaImageJpaEntity();
        entity.id = image.id().value();
        entity.width = image.width();
        entity.height = image.height();
        entity.uploadedAt = image.uploadedAt();
        image.variants().forEach(variant -> entity.variants.add(MediaVariantJpaEntity.fromDomain(entity, variant)));
        return entity;
    }

    MediaImage toDomain() {
        List<MediaVariant> domainVariants = variants.stream().map(MediaVariantJpaEntity::toDomain).toList();
        return new MediaImage(new MediaId(id), width, height, domainVariants, uploadedAt);
    }
}
