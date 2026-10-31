package cz.novanadeje.app.content.domain.project;

import java.time.Instant;

public interface ProjectOrderRepository {

    ProjectOrder current();

    void save(ProjectOrder order, Instant at);
}
