package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
class JpaMediaImageRepository implements MediaImageRepository {

    private final MediaImageJpaRepository jpa;

    JpaMediaImageRepository(MediaImageJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(MediaImage image) {
        jpa.save(MediaImageJpaEntity.fromDomain(image));
    }

    @Override
    public Optional<MediaImage> findById(MediaId id) {
        return jpa.findById(id.value()).map(MediaImageJpaEntity::toDomain);
    }

    @Override
    public boolean exists(MediaId id) {
        return jpa.existsById(id.value());
    }

    @Override
    public void delete(MediaId id) {
        jpa.deleteById(id.value());
    }

    @Override
    public boolean deleteIfUnused(MediaId id) {
        return jpa.deleteIfUnused(id.value()) > 0;
    }

    @Override
    public int deleteUnusedUploadedBefore(Instant moment) {
        return jpa.deleteUnusedUploadedBefore(moment);
    }
}
