package cz.novanadeje.app.content.application.project;

import java.util.List;

public record ProjectPage(List<ProjectView> items, int page, int size, long total) {

    public ProjectPage {
        items = List.copyOf(items);
    }

    public boolean hasMore() {
        return (long) (page + 1) * size < total;
    }
}
