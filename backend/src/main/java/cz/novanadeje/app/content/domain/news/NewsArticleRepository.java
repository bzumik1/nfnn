package cz.novanadeje.app.content.domain.news;

import cz.novanadeje.app.content.domain.Slug;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface NewsArticleRepository {

    void save(NewsArticle article);

    Optional<NewsArticle> findById(NewsArticleId id);

    Optional<NewsArticle> findBySlug(Slug slug);

    boolean isSlugTakenByAnother(Slug slug, NewsArticleId except);

    List<NewsArticle> findAllDraftsFirst();

    List<NewsArticle> findVisibleNewestFirst(LocalDate today, int offset, int limit);

    long countVisible(LocalDate today);

    void delete(NewsArticleId id);
}
