package cz.novanadeje.app.content.application.home;

import cz.novanadeje.app.content.application.news.NewsArticleView;
import cz.novanadeje.app.content.application.project.ProjectView;
import cz.novanadeje.app.content.domain.news.NewsArticleRepository;
import cz.novanadeje.app.content.domain.project.ProjectRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

@Service
@Transactional(readOnly = true)
public class HomeContentService {

    public static final int NEWS_ON_HOME = 3;
    public static final int PROJECTS_ON_HOME = 50;
    private static final ZoneId PRAGUE = ZoneId.of("Europe/Prague");

    private final NewsArticleRepository news;
    private final ProjectRepository projects;
    private final Clock clock;

    public HomeContentService(NewsArticleRepository news, ProjectRepository projects, Clock clock) {
        this.news = news;
        this.projects = projects;
        this.clock = clock;
    }

    public HomeContent read() {
        LocalDate today = LocalDate.ofInstant(clock.instant(), PRAGUE);
        return new HomeContent(
                news.findVisibleNewestFirst(today, 0, NEWS_ON_HOME).stream().map(NewsArticleView::from).toList(),
                projects.findVisibleNewestFirst(today, 0, PROJECTS_ON_HOME).stream().map(ProjectView::from).toList());
    }
}
