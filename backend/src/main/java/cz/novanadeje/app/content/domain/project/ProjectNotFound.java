package cz.novanadeje.app.content.domain.project;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class ProjectNotFound extends NotFound {

    public static final String CODE = "content/project-not-found";

    public ProjectNotFound(ProjectId id) {
        super(CODE, "Project " + id + " does not exist");
    }


    public ProjectNotFound() {
        super(CODE, "No published project has the slug asked for");
    }
}
