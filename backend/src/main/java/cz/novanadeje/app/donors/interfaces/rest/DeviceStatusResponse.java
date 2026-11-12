package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DeviceStatusService.DeviceStatusView;

record DeviceStatusResponse(String status, boolean administrator) {

    static DeviceStatusResponse of(DeviceStatusView view) {
        String status = switch (view.status()) {
            case SIGNED_IN -> "signed-in";
            case SIGNED_OUT -> "signed-out";
            case WIPE_ADMINISTRATION -> "wipe-admin";
            case WIPE_ALL -> "wipe-all";
            case UNKNOWN -> "unknown";
        };
        return new DeviceStatusResponse(status, view.administrator());
    }
}
