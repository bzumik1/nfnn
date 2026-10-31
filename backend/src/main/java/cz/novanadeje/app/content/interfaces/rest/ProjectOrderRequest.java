package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.domain.project.ProjectOrder;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ProjectOrderRequest(@NotNull @Size(max = 32) @Pattern(regexp = ProjectOrder.NAMES_PATTERN) String order) {

    ProjectOrder toOrder() {
        return ProjectOrder.valueOf(order);
    }
}
