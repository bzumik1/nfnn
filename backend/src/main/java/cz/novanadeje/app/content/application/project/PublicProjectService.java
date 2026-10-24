package cz.novanadeje.app.content.application.project;

import cz.novanadeje.app.content.domain.project.Project;
import cz.novanadeje.app.content.domain.project.ProjectNotFound;
import cz.novanadeje.app.content.domain.project.ProjectRepository;
import cz.novanadeje.app.content.domain.FormerSlugs;
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

    public static final int MAX_PAGE_SIZE = 50;

    private final ProjectRepository projects;
    private final FormerSlugs formerSlugs;
    private final Clock clock;

    public PublicProjectService(ProjectRepository projects, FormerSlugs formerSlugs, Clock clock) {
        this.projects = projects;
        this.formerSlugs = formerSlugs;
        this.clock = clock;
    }

    public ProjectPage list(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new IllegalArgumentException("The page is 0 or more and the size 1 to " + MAX_PAGE_SIZE);
        }
        LocalDate today = today();
        List<ProjectView> items = projects.findVisibleNewestFirst(today, page * size, size).stream().map(ProjectView::from).toList();
        return new ProjectPage(items, page, size, projects.countVisible(today));
    }

    public ProjectView bySlug(Slug slug) {
        Project article = projects.findBySlug(slug)
                .or(() -> formerSlugs.project(slug).flatMap(projects::findById))
                .filter(found -> found.isVisibleOn(today()))
                .orElseThrow(() -> new ProjectNotFound(slug));
        return ProjectView.from(article);
    }

    private LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), FoundationZone.ZONE);
    }
}
