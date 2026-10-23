package cz.novanadeje.app.content.domain.news;

import cz.novanadeje.app.content.domain.media.MediaId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NewsArticleTest {

    private static final Instant CREATED = Instant.parse("2026-10-23T08:00:00Z");
    private static final Instant LATER = Instant.parse("2026-10-23T09:00:00Z");

    @Test
    @DisplayName("Given a new article, when it is created, then it is a draft with the content and both times equal")
    void should_be_a_draft_when_created() {
        NewsArticle article = NewsArticle.create(NewsArticleId.newId(CREATED), content(), CREATED);

        assertThat(article.isPublished()).isFalse();
        assertThat(article.publishedOn()).isEmpty();
        assertThat(article.createdAt()).isEqualTo(CREATED);
        assertThat(article.updatedAt()).isEqualTo(CREATED);
        assertThat(article.slug()).isEqualTo(new Slug("dominik"));
    }

    @Test
    @DisplayName("Given a draft, when it is published on a day, then it is visible from that day on and the update time moves")
    void should_be_visible_from_the_day_when_published_given_a_draft() {
        NewsArticle published = NewsArticle.create(NewsArticleId.newId(CREATED), content(), CREATED).publish(LocalDate.parse("2026-10-25"), LATER);

        assertThat(published.isPublished()).isTrue();
        assertThat(published.isVisibleOn(LocalDate.parse("2026-10-24"))).isFalse();
        assertThat(published.isVisibleOn(LocalDate.parse("2026-10-25"))).isTrue();
        assertThat(published.updatedAt()).isEqualTo(LATER);
        assertThat(published.createdAt()).isEqualTo(CREATED);
    }

    @Test
    @DisplayName("Given a published article, when it is unpublished, then it is a draft again")
    void should_become_a_draft_when_unpublished_given_a_published_article() {
        NewsArticle article = NewsArticle.create(NewsArticleId.newId(CREATED), content(), CREATED).publish(LocalDate.parse("2026-10-23"), CREATED);

        NewsArticle draft = article.unpublish(LATER);

        assertThat(draft.isPublished()).isFalse();
        assertThat(draft.isVisibleOn(LocalDate.parse("2026-12-01"))).isFalse();
    }

    @Test
    @DisplayName("Given a published article, when its content is edited, then the publication day stays")
    void should_keep_the_publication_day_when_edited_given_a_published_article() {
        NewsArticle article = NewsArticle.create(NewsArticleId.newId(CREATED), content(), CREATED).publish(LocalDate.parse("2026-10-23"), CREATED);
        NewsContent changed = new NewsContent(new Slug("dominik-vozik"), "Nový titulek", Optional.empty(), "Perex", "Text", Optional.of(MediaId.newId(CREATED)));

        NewsArticle edited = article.edit(changed, LATER);

        assertThat(edited.content()).isEqualTo(changed);
        assertThat(edited.publishedOn()).contains(LocalDate.parse("2026-10-23"));
        assertThat(edited.updatedAt()).isEqualTo(LATER);
    }

    @Test
    @DisplayName("Given content with blank or overlong fields, when it is built, then it is refused")
    void should_refuse_when_built_given_invalid_content() {
        assertThatThrownBy(() -> new NewsContent(new Slug("a"), " ", Optional.empty(), "p", "b", Optional.empty())).hasMessageContaining("title");
        assertThatThrownBy(() -> new NewsContent(new Slug("a"), "t", Optional.empty(), "p".repeat(301), "b", Optional.empty())).hasMessageContaining("perex");
        assertThatThrownBy(() -> new NewsContent(new Slug("a"), "t", Optional.empty(), "p", "b".repeat(20_001), Optional.empty())).hasMessageContaining("body");
        assertThatThrownBy(() -> new NewsContent(new Slug("a"), "t", Optional.of("x".repeat(41)), "p", "b", Optional.empty())).hasMessageContaining("tag");
    }

    @Test
    @DisplayName("Given a blank tag, when content is built, then the tag is absent and the texts are stripped")
    void should_drop_blank_tag_when_built() {
        NewsContent content = new NewsContent(new Slug("a"), "  Titulek ", Optional.of("  "), " Perex ", " Text ", Optional.empty());

        assertThat(content.tag()).isEmpty();
        assertThat(content.title()).isEqualTo("Titulek");
        assertThat(content.perex()).isEqualTo("Perex");
        assertThat(content.body()).isEqualTo("Text");
    }

    private static NewsContent content() {
        return new NewsContent(new Slug("dominik"), "Pomohli jsme Dominikovi", Optional.of("Projekt"), "Perex o Dominikovi.", "Celý text.", Optional.empty());
    }
}
