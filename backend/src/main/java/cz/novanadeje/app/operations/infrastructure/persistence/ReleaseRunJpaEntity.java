package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.release.Release;
import cz.novanadeje.app.operations.domain.release.ReleaseRun;
import cz.novanadeje.app.operations.domain.release.ReleaseRunId;
import cz.novanadeje.app.operations.domain.release.Revision;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Entity
@Table(name = "operations_release_run")
class ReleaseRunJpaEntity {

    @Id
    @Column(name = "id")
    private UUID id;

    @Column(name = "revision", nullable = false, updatable = false, length = Revision.MAX_LENGTH)
    private String revision;

    @Column(name = "release", updatable = false, length = Release.MAX_LENGTH)
    private String release;

    @Column(name = "started_at", nullable = false, updatable = false)
    private Instant startedAt;

    @Column(name = "last_started_at", nullable = false)
    private Instant lastStartedAt;

    protected ReleaseRunJpaEntity() {
    }

    static ReleaseRunJpaEntity fromDomain(ReleaseRun run) {
        ReleaseRunJpaEntity entity = new ReleaseRunJpaEntity();
        entity.id = run.id().value();
        entity.revision = run.revision().value();
        entity.release = run.release().map(Release::toString).orElse(null);
        entity.startedAt = run.startedAt();
        entity.lastStartedAt = run.lastStartedAt();
        return entity;
    }

    ReleaseRun toDomain() {
        return new ReleaseRun(new ReleaseRunId(id), new Revision(revision), storedRelease(), startedAt, lastStartedAt);
    }

    private Optional<Release> storedRelease() {
        return Optional.ofNullable(release)
                .map(text -> Release.parse(text).orElseThrow(() -> new IllegalStateException("A stored release run names a release of no release's shape")));
    }
}
