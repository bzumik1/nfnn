package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.media.FocalPoint;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaSize;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.content.domain.media.MediaVariantWidths;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

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
    public Optional<MediaVariant> findVariantAtLeast(MediaId id, int wantedWidth) {
        return variantWidths(id).flatMap(widths -> jpa.findVariant(id.value(), widths.atLeast(wantedWidth)));
    }

    @Override
    public Optional<MediaVariant> findLargestVariant(MediaId id) {
        return variantWidths(id).flatMap(widths -> jpa.findVariant(id.value(), widths.largest()));
    }

    private Optional<MediaVariantWidths> variantWidths(MediaId id) {
        List<Integer> widths = jpa.findVariantWidths(id.value());
        return widths.isEmpty() ? Optional.empty() : Optional.of(new MediaVariantWidths(widths));
    }

    @Override
    public Optional<MediaSize> findSize(MediaId id) {
        return jpa.findSizeById(id.value());
    }

    @Override
    public boolean exists(MediaId id) {
        return jpa.existsById(id.value());
    }

    @Override
    public boolean placeFocalPoint(MediaId id, Optional<FocalPoint> point) {
        Short x = point.map(placed -> (short) placed.x()).orElse(null);
        Short y = point.map(placed -> (short) placed.y()).orElse(null);
        return jpa.placeFocalPoint(id.value(), x, y) > 0;
    }

    @Override
    public Map<MediaId, FocalPoint> findFocalPoints(Collection<MediaId> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return jpa.findFocalPoints(ids.stream().map(MediaId::value).distinct().toList()).stream()
                .collect(Collectors.toUnmodifiableMap(row -> new MediaId(row.getId()), row -> new FocalPoint(row.getX(), row.getY())));
    }

    @Override
    public void delete(MediaId id) {
        jpa.deleteById(id.value());
    }

    @Override
    public boolean deleteIfUnused(MediaId id) {
        jpa.flush();
        return deleteUnusedAmong(jpa.lockIfUnused(id.value())) > 0;
    }

    @Override
    public int deleteUnusedUploadedBefore(Instant moment) {
        jpa.flush();
        return deleteUnusedAmong(jpa.lockUnusedUploadedBefore(moment));
    }

    private int deleteUnusedAmong(List<UUID> locked) {
        return locked.isEmpty() ? 0 : jpa.deleteUnusedAmong(locked);
    }
}
