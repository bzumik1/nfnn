package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.news.NewsArticle;
import cz.novanadeje.app.content.domain.news.NewsArticleId;
import cz.novanadeje.app.content.domain.news.NewsArticleRepository;
import cz.novanadeje.app.content.domain.Slug;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
class JpaNewsArticleRepository implements NewsArticleRepository {

    private final NewsArticleJpaRepository jpa;

    JpaNewsArticleRepository(NewsArticleJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(NewsArticle article) {
        jpa.save(NewsArticleJpaEntity.fromDomain(article));
    }

    @Override
    public Optional<NewsArticle> findById(NewsArticleId id) {
        return jpa.findById(id.value()).map(NewsArticleJpaEntity::toDomain);
    }

    @Override
    public Optional<NewsArticle> findBySlug(Slug slug) {
        return jpa.findBySlug(slug.value()).map(NewsArticleJpaEntity::toDomain);
    }

    @Override
    public boolean isSlugTakenByAnother(Slug slug, NewsArticleId except) {
        return jpa.existsBySlugAndIdNot(slug.value(), except.value());
    }

    @Override
    public boolean isImageUsed(MediaId image) {
        return jpa.existsByCoverMediaId(image.value());
    }

    @Override
    public List<NewsArticle> findAllDraftsFirst() {
        return jpa.findAllDraftsFirst().stream().map(NewsArticleJpaEntity::toDomain).toList();
    }

    @Override
    public List<NewsArticle> findVisibleNewestFirst(LocalDate today, int offset, int limit) {
        if (offset % limit != 0) {
            throw new IllegalArgumentException("The offset is a multiple of the limit");
        }
        return jpa.findVisible(today, PageRequest.of(offset / limit, limit)).stream().map(NewsArticleJpaEntity::toDomain).toList();
    }

    @Override
    public long countVisible(LocalDate today) {
        return jpa.countByPublishedOnLessThanEqual(today);
    }

    @Override
    public void delete(NewsArticleId id) {
        jpa.deleteById(id.value());
    }
}
