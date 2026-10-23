package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.settings.SetupStatusView;

record SetupStatusResponse(boolean required, boolean codeRequired) {

    static SetupStatusResponse from(SetupStatusView view) {
        return new SetupStatusResponse(view.required(), view.codeRequired());
    }
}
