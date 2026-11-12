package cz.novanadeje.app.content.cucumber;

import cz.novanadeje.app.content.application.ContentVersions;
import cz.novanadeje.app.content.domain.news.NewsArticleId;
import cz.novanadeje.app.content.domain.news.NewsArticleRepository;
import cz.novanadeje.app.content.domain.people.FoundersNoteRepository;
import cz.novanadeje.app.content.domain.people.PeopleFootnoteRepository;
import cz.novanadeje.app.content.domain.project.ProjectId;
import cz.novanadeje.app.content.domain.project.ProjectRepository;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class ContentRowVersions {

    public static final String MATCHING_NOTHING = "0000000000000000";

    private final NewsArticleRepository news;
    private final ProjectRepository projects;
    private final FoundersNoteRepository foundersNotes;
    private final PeopleFootnoteRepository footnotes;
    private final ContentVersions versions;

    public ContentRowVersions(NewsArticleRepository news, ProjectRepository projects, FoundersNoteRepository foundersNotes,
                              PeopleFootnoteRepository footnotes, ContentVersions versions) {
        this.news = news;
        this.projects = projects;
        this.foundersNotes = foundersNotes;
        this.footnotes = footnotes;
        this.versions = versions;
    }

    public String ofArticle(String id) {
        return news.findById(new NewsArticleId(UUID.fromString(id))).map(versions::of).orElse(MATCHING_NOTHING);
    }

    public String ofProject(String id) {
        return projects.findById(new ProjectId(UUID.fromString(id))).map(versions::of).orElse(MATCHING_NOTHING);
    }

    public String ofFoundersNote() {
        return versions.ofFoundersNote(foundersNotes.find());
    }

    public String ofFootnote() {
        return versions.ofFootnote(footnotes.find());
    }
}
