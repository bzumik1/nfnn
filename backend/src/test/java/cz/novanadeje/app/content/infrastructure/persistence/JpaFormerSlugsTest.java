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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
    @Autowired
    private JdbcClient jdbc;

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

        formerSlugs.forgetNews(new Slug("beneficni-koncert"));
        formerSlugs.forgetNews(new Slug("nikdy-nebyla"));
        news.delete(deleted.id());
        flushAndClear();

        assertThat(formerSlugs.newsArticle(new Slug("beneficni-koncert"))).isEmpty();
        assertThat(formerSlugs.newsArticle(new Slug("koncert"))).isEmpty();
    }

    @Test
    @DisplayName("Given a former address of an article, when a project leaves the same address, then the address leads to each of them by its kind")
    void should_lead_to_each_by_kind_when_a_project_leaves_the_address_given_an_article_left_it_before() {
        NewsArticle article = article("letni-tabor-2026");
        Project project = project("letni-tabor-pro-deti");
        formerSlugs.rememberNews(new Slug("letni-tabor"), article.id(), NOW);
        flushAndClear();

        formerSlugs.rememberProject(new Slug("letni-tabor"), project.id(), NOW);
        flushAndClear();

        assertThat(formerSlugs.newsArticle(new Slug("letni-tabor"))).contains(article.id());
        assertThat(formerSlugs.project(new Slug("letni-tabor"))).contains(project.id());
    }

    @Test
    @DisplayName("Given one former address of an article and of a project, when the project's is forgotten, then it still leads to the article")
    void should_still_lead_to_the_article_when_the_projects_is_forgotten_given_both_kinds_at_one_address() {
        NewsArticle article = article("letni-tabor-2026");
        Project project = project("letni-tabor-pro-deti");
        formerSlugs.rememberNews(new Slug("letni-tabor"), article.id(), NOW);
        formerSlugs.rememberProject(new Slug("letni-tabor"), project.id(), NOW);
        flushAndClear();

        formerSlugs.forgetProject(new Slug("letni-tabor"));
        flushAndClear();

        assertThat(formerSlugs.newsArticle(new Slug("letni-tabor"))).contains(article.id());
        assertThat(formerSlugs.project(new Slug("letni-tabor"))).isEmpty();

        formerSlugs.rememberProject(new Slug("letni-tabor"), project.id(), NOW);
        flushAndClear();
        formerSlugs.forgetNews(new Slug("letni-tabor"));
        flushAndClear();

        assertThat(formerSlugs.newsArticle(new Slug("letni-tabor"))).isEmpty();
        assertThat(formerSlugs.project(new Slug("letni-tabor"))).contains(project.id());
    }

    @Test
    @DisplayName("Given a former address of an article, when another article leaves the same address, then it leads to the other article")
    void should_lead_to_the_other_article_when_it_leaves_the_address_given_a_former_address_of_an_article() {
        NewsArticle first = article("letni-tabor-2025");
        NewsArticle second = article("letni-tabor-2026");
        formerSlugs.rememberNews(new Slug("letni-tabor"), first.id(), NOW);
        flushAndClear();

        formerSlugs.rememberNews(new Slug("letni-tabor"), second.id(), NOW.plusSeconds(60));
        flushAndClear();

        assertThat(formerSlugs.newsArticle(new Slug("letni-tabor"))).contains(second.id());
        assertThat(jdbc.sql("select count(*) from content_former_slug where slug = 'letni-tabor'").query(Long.class).single()).isOne();
    }

    @Test
    @DisplayName("Given a former address written without an id as the previous image writes it, when it is looked up and forgotten, then it is found and goes")
    void should_find_and_forget_it_when_looked_up_given_a_row_written_without_an_id() {
        Project project = project("dominik-8-let");
        flushAndClear();
        jdbc.sql("insert into content_former_slug (slug, project_id, replaced_at) values ('dominik-7-let', ?, ?)")
                .param(project.id().value()).param(Timestamp.from(NOW)).update();

        assertThat(formerSlugs.project(new Slug("dominik-7-let"))).contains(project.id());

        formerSlugs.forgetProject(new Slug("dominik-7-let"));
        flushAndClear();

        assertThat(formerSlugs.project(new Slug("dominik-7-let"))).isEmpty();
    }

    @Test
    @DisplayName("Given a former address of an article, when a second row of the same kind and address is written directly, then the database refuses it")
    void should_refuse_it_when_a_second_row_of_one_kind_is_written_given_a_former_address() {
        NewsArticle first = article("letni-tabor-2025");
        NewsArticle second = article("letni-tabor-2026");
        formerSlugs.rememberNews(new Slug("letni-tabor"), first.id(), NOW);
        flushAndClear();

        assertThatThrownBy(() -> jdbc.sql("insert into content_former_slug (slug, news_id, replaced_at) values ('letni-tabor', ?, ?)")
                .param(second.id().value()).param(Timestamp.from(NOW)).update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_content_former_slug_news");
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
