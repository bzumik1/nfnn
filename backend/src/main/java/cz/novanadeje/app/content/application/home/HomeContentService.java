package cz.novanadeje.app.content.application.home;

import cz.novanadeje.app.content.application.about.AboutService;
import cz.novanadeje.app.content.application.news.NewsArticleView;
import cz.novanadeje.app.content.application.people.PublicPeopleService;
import cz.novanadeje.app.content.application.project.ProjectView;
import cz.novanadeje.app.content.domain.news.NewsArticleRepository;
import cz.novanadeje.app.content.domain.project.ProjectOrderRepository;
import cz.novanadeje.app.content.domain.project.ProjectRepository;
import cz.novanadeje.app.shared.domain.FoundationZone;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;

@Service
@Transactional(readOnly = true)
public class HomeContentService {

    public static final int NEWS_ON_HOME = 3;
    public static final int PROJECTS_ON_HOME = 3;

    private final NewsArticleRepository news;
    private final ProjectRepository projects;
    private final ProjectOrderRepository projectOrders;
    private final AboutService about;
    private final PublicPeopleService people;
    private final Clock clock;

    public HomeContentService(NewsArticleRepository news, ProjectRepository projects, ProjectOrderRepository projectOrders, AboutService about,
                              PublicPeopleService people, Clock clock) {
        this.news = news;
        this.projects = projects;
        this.projectOrders = projectOrders;
        this.about = about;
        this.people = people;
        this.clock = clock;
    }

    public HomeContent read() {
        LocalDate today = LocalDate.ofInstant(clock.instant(), FoundationZone.ZONE);
        return new HomeContent(
                news.findVisibleNewestFirst(today, 0, NEWS_ON_HOME).stream().map(article -> NewsArticleView.from(article, today)).toList(),
                projects.findVisible(today, projectOrders.current(), 0, PROJECTS_ON_HOME).stream().map(project -> ProjectView.from(project, today)).toList(),
                about.read(),
                people.read());
    }
}
