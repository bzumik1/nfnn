package cz.novanadeje.app.content.application.home;

import cz.novanadeje.app.content.application.about.AboutView;
import cz.novanadeje.app.content.application.news.NewsArticleView;
import cz.novanadeje.app.content.application.project.ProjectView;

import java.util.List;

public record HomeContent(List<NewsArticleView> news, List<ProjectView> projects, AboutView about) {

    public HomeContent {
        if (about == null) {
            throw new IllegalArgumentException("The home content carries the About section");
        }
        news = List.copyOf(news);
        projects = List.copyOf(projects);
    }
}
