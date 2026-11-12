package cz.novanadeje.app.content.application.sync;

import cz.novanadeje.app.content.application.Versioned;
import cz.novanadeje.app.content.application.about.AboutView;
import cz.novanadeje.app.content.application.donateband.DonateBandView;
import cz.novanadeje.app.content.application.news.NewsArticleView;
import cz.novanadeje.app.content.application.people.PersonView;
import cz.novanadeje.app.content.application.project.ProjectView;
import cz.novanadeje.app.content.domain.project.ProjectOrder;

import java.util.List;
import java.util.Optional;

public record AdminContent(List<Versioned<NewsArticleView>> news, List<Versioned<ProjectView>> projects, ProjectOrder projectOrder, AboutView about,
                           DonateBandView donateBand, List<PersonView> people, Versioned<Optional<String>> foundersNote,
                           Versioned<Optional<String>> peopleFootnote) {

    public AdminContent {
        if (news == null || projects == null || projectOrder == null || about == null || donateBand == null || people == null || foundersNote == null
                || peopleFootnote == null) {
            throw new IllegalArgumentException("The administration's content names every list and every section, empty or not");
        }
        news = List.copyOf(news);
        projects = List.copyOf(projects);
        people = List.copyOf(people);
    }
}
