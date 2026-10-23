package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.PasskeyView;

import java.util.List;

record PasskeyListResponse(List<PasskeyResponse> items) {

    static PasskeyListResponse from(List<PasskeyView> views) {
        return new PasskeyListResponse(views.stream().map(PasskeyResponse::of).toList());
    }
}
