package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.ClientDescription;

record ClientDescriptionResponse(String host, String name, boolean loopback) {

    static ClientDescriptionResponse of(ClientDescription description) {
        return new ClientDescriptionResponse(description.host(), description.name(), description.loopback());
    }
}
