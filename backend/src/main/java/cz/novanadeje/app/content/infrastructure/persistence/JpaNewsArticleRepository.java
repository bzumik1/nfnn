package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.news.LookBackYearTaken;
import cz.novanadeje.app.content.domain.news.NewsArticle;
import cz.novanadeje.app.content.domain.news.NewsArticleId;
import cz.novanadeje.app.content.domain.news.NewsArticleRepository;
import cz.novanadeje.app.content.domain.Slug;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
class JpaNewsArticleRepository implements NewsArticleRepository {

    private static final String LOOK_BACK_YEAR_INDEX = "uq_content_news_look_back_year";

    private final NewsArticleJpaRepository jpa;

    JpaNewsArticleRepository(NewsArticleJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(NewsArticle article) {
        Optional<Integer> year = article.lookBackYear();
        if (year.isEmpty()) {
            jpa.save(NewsArticleJpaEntity.fromDomain(article));
            return;
        }
        try {
            jpa.saveAndFlush(NewsArticleJpaEntity.fromDomain(article));
        } catch (DataIntegrityViolationException refused) {
            if (refusedByIndex(refused, LOOK_BACK_YEAR_INDEX)) {
                throw new LookBackYearTaken(year.get());
            }
            throw refused;
        }
    }

    private static boolean refusedByIndex(DataIntegrityViolationException refused, String index) {
        String reason = refused.getMostSpecificCause().getMessage();
        return reason != null && reason.contains(index);
    }

    @Override
    public Optional<NewsArticle> findById(NewsArticleId id) {
        return jpa.findById(id.value()).map(NewsArticleJpaEntity::toDomain);
    }

    @Override
    public Optional<NewsArticle> findByIdForUpdate(NewsArticleId id) {
        return jpa.findByIdForUpdate(id.value()).map(NewsArticleJpaEntity::toDomain);
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
    public boolean isLookBackYearTakenByAnother(int year, NewsArticleId except) {
        return jpa.existsByLookBackYearAndIdNot((short) year, except.value());
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
