package cz.novanadeje.app.content.application.project;

import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.project.Project;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;

@Component
public class ProjectViews {

    private final MediaImageRepository media;

    public ProjectViews(MediaImageRepository media) {
        this.media = media;
    }

    public List<ProjectView> of(List<Project> projects, LocalDate today) {
        return ProjectView.all(projects, today, media.findFocalPoints(projects.stream().flatMap(project -> project.content().coverImage().stream()).toList()));
    }

    public ProjectView of(Project project, LocalDate today) {
        return of(List.of(project), today).getFirst();
    }
}
