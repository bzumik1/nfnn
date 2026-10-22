package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AdministratorView;

import java.util.UUID;

record AdministratorResponse(UUID donorId, String name, String email, boolean secondFactorEnabled) {

    static AdministratorResponse from(AdministratorView view) {
        return new AdministratorResponse(view.id().value(), view.name(), view.email().value(), view.secondFactorEnabled());
    }
}
