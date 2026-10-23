package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.news.NewsArticle;
import cz.novanadeje.app.content.domain.news.NewsArticleId;
import cz.novanadeje.app.content.domain.news.NewsContent;
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
@Table(name = "content_news")
class NewsArticleJpaEntity {

    @Id
    private UUID id;

    @Column(name = "slug", nullable = false, length = Slug.MAX_LENGTH)
    private String slug;

    @Column(name = "title", nullable = false, length = NewsContent.MAX_TITLE_LENGTH)
    private String title;

    @Column(name = "tag", length = NewsContent.MAX_TAG_LENGTH)
    private String tag;

    @Column(name = "perex", nullable = false, length = NewsContent.MAX_PEREX_LENGTH)
    private String perex;

    @Column(name = "body", nullable = false, length = NewsContent.MAX_BODY_LENGTH)
    private String body;

    @Column(name = "cover_media_id")
    private UUID coverMediaId;

    @Column(name = "published_on")
    private LocalDate publishedOn;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected NewsArticleJpaEntity() {
    }

    static NewsArticleJpaEntity fromDomain(NewsArticle article) {
        NewsArticleJpaEntity entity = new NewsArticleJpaEntity();
        entity.id = article.id().value();
        entity.slug = article.slug().value();
        entity.title = article.content().title();
        entity.tag = article.content().tag().orElse(null);
        entity.perex = article.content().perex();
        entity.body = article.content().body();
        entity.coverMediaId = article.content().coverImage().map(MediaId::value).orElse(null);
        entity.publishedOn = article.publishedOn().orElse(null);
        entity.createdAt = article.createdAt();
        entity.updatedAt = article.updatedAt();
        return entity;
    }

    NewsArticle toDomain() {
        NewsContent content = new NewsContent(new Slug(slug), title, Optional.ofNullable(tag), perex, body,
                Optional.ofNullable(coverMediaId).map(MediaId::new));
        return new NewsArticle(new NewsArticleId(id), content, Optional.ofNullable(publishedOn), createdAt, updatedAt);
    }
}
