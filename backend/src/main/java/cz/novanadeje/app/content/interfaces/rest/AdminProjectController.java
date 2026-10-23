package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.project.ProjectAdminService;
import cz.novanadeje.app.content.domain.project.ProjectId;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/content/projects")
class AdminProjectController {

    private final ProjectAdminService projects;

    AdminProjectController(ProjectAdminService projects) {
        this.projects = projects;
    }

    @GetMapping
    ProjectListResponse list() {
        return ProjectListResponse.from(projects.list());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    ProjectResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProjectRequest request) {
        return ProjectResponse.from(projects.create(admin(jwt), request.toCommand()));
    }

    @GetMapping("/{id}")
    ProjectResponse get(@PathVariable UUID id) {
        return ProjectResponse.from(projects.get(new ProjectId(id)));
    }

    @PutMapping("/{id}")
    ProjectResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ProjectRequest request) {
        return ProjectResponse.from(projects.update(admin(jwt), new ProjectId(id), request.toCommand()));
    }

    @PostMapping("/{id}/publish")
    ProjectResponse publish(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody PublishRequest request) {
        return ProjectResponse.from(projects.publish(admin(jwt), new ProjectId(id), request.publishedOn()));
    }

    @PostMapping("/{id}/unpublish")
    ProjectResponse unpublish(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return ProjectResponse.from(projects.unpublish(admin(jwt), new ProjectId(id)));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        projects.delete(admin(jwt), new ProjectId(id));
    }

    private static UUID admin(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
