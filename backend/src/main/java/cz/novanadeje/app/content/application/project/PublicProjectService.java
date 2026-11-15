package cz.novanadeje.app.content.application.project;

import cz.novanadeje.app.content.domain.PublicListPage;
import cz.novanadeje.app.content.domain.project.Project;
import cz.novanadeje.app.content.domain.project.ProjectNotFound;
import cz.novanadeje.app.content.domain.project.ProjectOrderRepository;
import cz.novanadeje.app.content.domain.project.ProjectRepository;
import cz.novanadeje.app.content.domain.project.FormerProjectSlugs;
import cz.novanadeje.app.content.domain.Slug;
import cz.novanadeje.app.shared.domain.FoundationZone;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class PublicProjectService {

    private final ProjectRepository projects;
    private final ProjectOrderRepository orders;
    private final FormerProjectSlugs formerSlugs;
    private final ProjectViews views;
    private final Clock clock;

    public PublicProjectService(ProjectRepository projects, ProjectOrderRepository orders, FormerProjectSlugs formerSlugs, ProjectViews views, Clock clock) {
        this.projects = projects;
        this.orders = orders;
        this.formerSlugs = formerSlugs;
        this.views = views;
        this.clock = clock;
    }

    public ProjectPage list(int page, int size) {
        PublicListPage.check(page, size);
        LocalDate today = today();
        if (beyondEveryOffset(page, size)) {
            return new ProjectPage(List.of(), page, size, projects.countVisible(today));
        }
        List<ProjectView> items = views.of(projects.findVisible(today, orders.current(), page * size, size), today);
        return new ProjectPage(items, page, size, projects.countVisible(today));
    }

    public ProjectView bySlug(Slug slug) {
        LocalDate today = today();
        Project project = projects.findBySlug(slug)
                .or(() -> formerSlugs.project(slug).flatMap(projects::findById))
                .filter(found -> found.isVisibleOn(today))
                .orElseThrow(ProjectNotFound::new);
        return views.of(project, today);
    }

    private static boolean beyondEveryOffset(int page, int size) {
        return (long) page * size > Integer.MAX_VALUE;
    }

    private LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), FoundationZone.ZONE);
    }
}
