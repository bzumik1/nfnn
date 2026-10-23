package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.shared.domain.UuidV7;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.util.UUID;

@Entity
@Table(name = "content_media_variant")
class MediaVariantJpaEntity {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "media_id", nullable = false)
    private MediaImageJpaEntity media;

    @Column(name = "width", nullable = false)
    private int width;

    @Column(name = "height", nullable = false)
    private int height;

    @Column(name = "data", nullable = false)
    private byte[] data;

    protected MediaVariantJpaEntity() {
    }

    static MediaVariantJpaEntity fromDomain(MediaImageJpaEntity media, MediaVariant variant) {
        MediaVariantJpaEntity entity = new MediaVariantJpaEntity();
        entity.id = UuidV7.generate();
        entity.media = media;
        entity.width = variant.width();
        entity.height = variant.height();
        entity.data = variant.webp();
        return entity;
    }

    MediaVariant toDomain() {
        return new MediaVariant(width, height, data);
    }
}
