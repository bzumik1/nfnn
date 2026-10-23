package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DonorAccountView;

import java.util.List;

record DonorAccountListResponse(List<DonorAccountResponse> items) {

    static DonorAccountListResponse from(List<DonorAccountView> views) {
        return new DonorAccountListResponse(views.stream().map(DonorAccountResponse::from).toList());
    }
}
