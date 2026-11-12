package cz.novanadeje.app.content.application;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.news.NewsArticle;
import cz.novanadeje.app.content.domain.people.FoundersNote;
import cz.novanadeje.app.content.domain.people.PeopleFootnote;
import cz.novanadeje.app.content.domain.people.PersonId;
import cz.novanadeje.app.content.domain.project.Project;
import cz.novanadeje.app.content.domain.project.ProjectCategory;
import cz.novanadeje.app.shared.application.version.RowVersions;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Component
public class ContentVersions {

    private final RowVersions versions;

    public ContentVersions(RowVersions versions) {
        this.versions = versions;
    }

    public String of(NewsArticle article) {
        return versions.versionOf(List.of(StoredNewsArticle.of(article)));
    }

    public String of(Project project) {
        return versions.versionOf(List.of(StoredProject.of(project)));
    }

    public String ofFoundersNote(Optional<FoundersNote> note) {
        return versions.versionOf(List.of(StoredPageText.ofNote(note)));
    }

    public String ofFootnote(Optional<PeopleFootnote> footnote) {
        return versions.versionOf(List.of(StoredPageText.ofFootnote(footnote)));
    }

    public record StoredPageText(String text, Instant updatedAt) {

        public static StoredPageText ofNote(Optional<FoundersNote> note) {
            return new StoredPageText(note.flatMap(FoundersNote::text).orElse(null), note.map(FoundersNote::updatedAt).orElse(null));
        }

        public static StoredPageText ofFootnote(Optional<PeopleFootnote> footnote) {
            return new StoredPageText(footnote.flatMap(PeopleFootnote::text).orElse(null), footnote.map(PeopleFootnote::updatedAt).orElse(null));
        }
    }

    public record StoredNewsArticle(UUID id, String slug, String title, String tag, String perex, String body, UUID coverImage,
                                    String coverImageAlt, UUID signer, LocalDate publishedOn, Integer lookBackYear, Instant createdAt,
                                    Instant updatedAt) {

        public static StoredNewsArticle of(NewsArticle article) {
            return new StoredNewsArticle(article.id().value(), article.slug().value(), article.content().title(),
                    article.content().tag().orElse(null), article.content().perex(), article.content().body(),
                    article.content().coverImage().map(MediaId::value).orElse(null), article.content().coverImageAlt().orElse(null),
                    article.content().signer().map(PersonId::value).orElse(null), article.publishedOn().orElse(null),
                    article.lookBackYear().orElse(null), article.createdAt(), article.updatedAt());
        }
    }

    public record StoredProject(UUID id, String slug, String title, int year, ProjectCategory category, String tag, String perex, String body,
                                UUID coverImage, String coverImageAlt, LocalDate publishedOn, Instant createdAt, Instant updatedAt) {

        public static StoredProject of(Project project) {
            return new StoredProject(project.id().value(), project.slug().value(), project.content().title(), project.content().year(),
                    project.content().category(), project.content().tag().orElse(null), project.content().perex(), project.content().body(),
                    project.content().coverImage().map(MediaId::value).orElse(null), project.content().coverImageAlt().orElse(null),
                    project.publishedOn().orElse(null), project.createdAt(), project.updatedAt());
        }
    }
}
