package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.ConnectedAppView;

import java.util.List;

record ConnectedAppListResponse(List<ConnectedAppResponse> items) {

    static ConnectedAppListResponse of(List<ConnectedAppView> views) {
        return new ConnectedAppListResponse(views.stream().map(ConnectedAppResponse::of).toList());
    }
}
