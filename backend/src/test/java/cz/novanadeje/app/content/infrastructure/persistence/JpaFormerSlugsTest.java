package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.FormerSlugs;
import cz.novanadeje.app.content.domain.Slug;
import cz.novanadeje.app.content.domain.news.NewsArticle;
import cz.novanadeje.app.content.domain.news.NewsArticleId;
import cz.novanadeje.app.content.domain.news.NewsArticleRepository;
import cz.novanadeje.app.content.domain.news.NewsContent;
import cz.novanadeje.app.content.domain.project.Project;
import cz.novanadeje.app.content.domain.project.ProjectContent;
import cz.novanadeje.app.content.domain.project.ProjectId;
import cz.novanadeje.app.content.domain.project.ProjectRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(ContentPersistenceTestConfiguration.class)
class JpaFormerSlugsTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");

    @Autowired
    private FormerSlugs formerSlugs;
    @Autowired
    private NewsArticleRepository news;
    @Autowired
    private ProjectRepository projects;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given a former address of an article and one of a project, when they are looked up, then each leads only to its own kind")
    void should_lead_to_its_own_kind_when_looked_up_given_former_slugs_of_both() {
        NewsArticle article = article("koncert-v-kostele");
        Project project = project("dominik-8-let");
        formerSlugs.rememberNews(new Slug("beneficni-koncert"), article.id(), NOW);
        formerSlugs.rememberProject(new Slug("dominik-7-let"), project.id(), NOW);
        flushAndClear();

        assertThat(formerSlugs.newsArticle(new Slug("beneficni-koncert"))).contains(article.id());
        assertThat(formerSlugs.project(new Slug("beneficni-koncert"))).isEmpty();
        assertThat(formerSlugs.project(new Slug("dominik-7-let"))).contains(project.id());
        assertThat(formerSlugs.newsArticle(new Slug("dominik-7-let"))).isEmpty();
        assertThat(formerSlugs.newsArticle(new Slug("nikdy-nebyla"))).isEmpty();
    }

    @Test
    @DisplayName("Given a former address, when it is forgotten or its article deleted, then it leads nowhere")
    void should_lead_nowhere_when_forgotten_or_deleted_given_former_slugs() {
        NewsArticle forgotten = article("koncert-v-kostele");
        NewsArticle deleted = article("jarni-koncert");
        formerSlugs.rememberNews(new Slug("beneficni-koncert"), forgotten.id(), NOW);
        formerSlugs.rememberNews(new Slug("koncert"), deleted.id(), NOW);
        flushAndClear();

        formerSlugs.forget(new Slug("beneficni-koncert"));
        formerSlugs.forget(new Slug("nikdy-nebyla"));
        news.delete(deleted.id());
        flushAndClear();

        assertThat(formerSlugs.newsArticle(new Slug("beneficni-koncert"))).isEmpty();
        assertThat(formerSlugs.newsArticle(new Slug("koncert"))).isEmpty();
    }

    private NewsArticle article(String slug) {
        NewsArticle article = NewsArticle.create(NewsArticleId.newId(NOW),
                new NewsContent(new Slug(slug), slug, Optional.empty(), "Perex", "Text", Optional.empty()), NOW);
        news.save(article);
        return article;
    }

    private Project project(String slug) {
        Project project = Project.create(ProjectId.newId(NOW),
                new ProjectContent(new Slug(slug), slug, 2024, Optional.empty(), "Perex", "Text", Optional.empty()), NOW);
        projects.save(project);
        return project;
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
