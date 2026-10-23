package cz.novanadeje.app.content.application.home;

import cz.novanadeje.app.content.application.news.NewsArticleView;
import cz.novanadeje.app.content.application.project.ProjectView;

import java.util.List;

public record HomeContent(List<NewsArticleView> news, List<ProjectView> projects) {

    public HomeContent {
        news = List.copyOf(news);
        projects = List.copyOf(projects);
    }
}
