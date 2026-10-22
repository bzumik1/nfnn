package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AdministratorView;

import java.util.List;

record AdministratorListResponse(List<AdministratorResponse> items) {

    static AdministratorListResponse from(List<AdministratorView> views) {
        return new AdministratorListResponse(views.stream().map(AdministratorResponse::from).toList());
    }
}
