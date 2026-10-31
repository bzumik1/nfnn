package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.domain.project.ProjectOrder;

public record ProjectOrderResponse(String order) {

    static ProjectOrderResponse from(ProjectOrder order) {
        return new ProjectOrderResponse(order.name());
    }
}
