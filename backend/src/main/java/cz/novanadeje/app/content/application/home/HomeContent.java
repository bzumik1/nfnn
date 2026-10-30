package cz.novanadeje.app.content.application.home;

import cz.novanadeje.app.content.application.about.AboutView;
import cz.novanadeje.app.content.application.news.NewsArticleView;
import cz.novanadeje.app.content.application.people.PublicPeopleView;
import cz.novanadeje.app.content.application.project.ProjectView;

import java.util.List;
import java.util.Optional;

public record HomeContent(List<NewsArticleView> news, List<ProjectView> projects, AboutView about, Optional<PublicPeopleView> people) {

    public HomeContent {
        if (about == null || people == null) {
            throw new IllegalArgumentException("The home content carries the About section and the people of the foundation, even when absent");
        }
        news = List.copyOf(news);
        projects = List.copyOf(projects);
    }
}
