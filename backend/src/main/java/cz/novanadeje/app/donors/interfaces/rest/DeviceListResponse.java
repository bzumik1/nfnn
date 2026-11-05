package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DeviceView;

import java.util.List;

record DeviceListResponse(List<DeviceResponse> items) {

    static DeviceListResponse of(List<DeviceView> views) {
        return new DeviceListResponse(views.stream().map(DeviceResponse::of).toList());
    }
}
