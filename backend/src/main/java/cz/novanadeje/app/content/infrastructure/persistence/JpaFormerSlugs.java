package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.FormerSlugs;
import cz.novanadeje.app.content.domain.Slug;
import cz.novanadeje.app.content.domain.news.NewsArticleId;
import cz.novanadeje.app.content.domain.project.ProjectId;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
class JpaFormerSlugs implements FormerSlugs {

    private final FormerSlugJpaRepository jpa;

    JpaFormerSlugs(FormerSlugJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void rememberNews(Slug slug, NewsArticleId article, Instant replacedAt) {
        jpa.save(FormerSlugJpaEntity.ofNews(slug.value(), article.value(), replacedAt));
    }

    @Override
    public void rememberProject(Slug slug, ProjectId project, Instant replacedAt) {
        jpa.save(FormerSlugJpaEntity.ofProject(slug.value(), project.value(), replacedAt));
    }

    @Override
    public void forget(Slug slug) {
        jpa.deleteById(slug.value());
    }

    @Override
    public Optional<NewsArticleId> newsArticle(Slug slug) {
        return jpa.findById(slug.value()).flatMap(FormerSlugJpaEntity::newsId).map(NewsArticleId::new);
    }

    @Override
    public Optional<ProjectId> project(Slug slug) {
        return jpa.findById(slug.value()).flatMap(FormerSlugJpaEntity::projectId).map(ProjectId::new);
    }
}
