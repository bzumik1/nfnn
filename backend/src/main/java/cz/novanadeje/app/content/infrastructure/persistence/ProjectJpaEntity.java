package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.project.Project;
import cz.novanadeje.app.content.domain.project.ProjectId;
import cz.novanadeje.app.content.domain.project.ProjectContent;
import cz.novanadeje.app.content.domain.Slug;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

@Entity
@Table(name = "content_project")
class ProjectJpaEntity {

    @Id
    private UUID id;

    @Column(name = "slug", nullable = false, length = Slug.MAX_LENGTH)
    private String slug;

    @Column(name = "title", nullable = false, length = ProjectContent.MAX_TITLE_LENGTH)
    private String title;

    @Column(name = "year", nullable = false)
    private int year;

    @Column(name = "tag", length = ProjectContent.MAX_TAG_LENGTH)
    private String tag;

    @Column(name = "perex", nullable = false, length = ProjectContent.MAX_PEREX_LENGTH)
    private String perex;

    @Column(name = "body", nullable = false, length = ProjectContent.MAX_BODY_LENGTH)
    private String body;

    @Column(name = "cover_media_id")
    private UUID coverMediaId;

    @Column(name = "cover_image_alt", length = ProjectContent.MAX_COVER_IMAGE_ALT_LENGTH)
    private String coverImageAlt;

    @Column(name = "published_on")
    private LocalDate publishedOn;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ProjectJpaEntity() {
    }

    static ProjectJpaEntity fromDomain(Project article) {
        ProjectJpaEntity entity = new ProjectJpaEntity();
        entity.id = article.id().value();
        entity.slug = article.slug().value();
        entity.title = article.content().title();
        entity.year = article.content().year();
        entity.tag = article.content().tag().orElse(null);
        entity.perex = article.content().perex();
        entity.body = article.content().body();
        entity.coverMediaId = article.content().coverImage().map(MediaId::value).orElse(null);
        entity.coverImageAlt = article.content().coverImageAlt().orElse(null);
        entity.publishedOn = article.publishedOn().orElse(null);
        entity.createdAt = article.createdAt();
        entity.updatedAt = article.updatedAt();
        return entity;
    }

    Project toDomain() {
        ProjectContent content = new ProjectContent(new Slug(slug), title, year, Optional.ofNullable(tag), perex, body,
                Optional.ofNullable(coverMediaId).map(MediaId::new), Optional.ofNullable(coverImageAlt));
        return new Project(new ProjectId(id), content, Optional.ofNullable(publishedOn), createdAt, updatedAt);
    }
}
