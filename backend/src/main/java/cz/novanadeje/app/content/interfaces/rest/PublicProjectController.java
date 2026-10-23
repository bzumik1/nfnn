package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.project.PublicProjectService;
import cz.novanadeje.app.content.domain.project.ProjectNotFound;
import cz.novanadeje.app.content.domain.Slug;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/content/projects")
class PublicProjectController {

    private static final int DEFAULT_PAGE_SIZE = 10;

    private final PublicProjectService projects;

    PublicProjectController(PublicProjectService projects) {
        this.projects = projects;
    }

    @GetMapping
    ProjectPageResponse list(@RequestParam(defaultValue = "0") @Min(0) int page,
                          @RequestParam(defaultValue = "" + DEFAULT_PAGE_SIZE) @Min(1) @Max(PublicProjectService.MAX_PAGE_SIZE) int size) {
        return ProjectPageResponse.from(projects.list(page, size));
    }

    @GetMapping("/{slug}")
    ProjectResponse bySlug(@PathVariable String slug) {
        Slug parsed;
        try {
            parsed = new Slug(slug);
        } catch (IllegalArgumentException malformed) {
            throw new ProjectNotFound(slug);
        }
        return ProjectResponse.from(projects.bySlug(parsed));
    }
}
