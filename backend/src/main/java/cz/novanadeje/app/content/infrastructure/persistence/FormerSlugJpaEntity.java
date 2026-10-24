package cz.novanadeje.app.content.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Entity
@Table(name = "content_former_slug")
class FormerSlugJpaEntity {

    @Id
    private String slug;

    @Column(name = "news_id")
    private UUID newsId;

    @Column(name = "project_id")
    private UUID projectId;

    @Column(name = "replaced_at", nullable = false)
    private Instant replacedAt;

    protected FormerSlugJpaEntity() {
    }

    private FormerSlugJpaEntity(String slug, UUID newsId, UUID projectId, Instant replacedAt) {
        this.slug = slug;
        this.newsId = newsId;
        this.projectId = projectId;
        this.replacedAt = replacedAt;
    }

    static FormerSlugJpaEntity ofNews(String slug, UUID newsId, Instant replacedAt) {
        return new FormerSlugJpaEntity(slug, newsId, null, replacedAt);
    }

    static FormerSlugJpaEntity ofProject(String slug, UUID projectId, Instant replacedAt) {
        return new FormerSlugJpaEntity(slug, null, projectId, replacedAt);
    }

    Optional<UUID> newsId() {
        return Optional.ofNullable(newsId);
    }

    Optional<UUID> projectId() {
        return Optional.ofNullable(projectId);
    }
}
