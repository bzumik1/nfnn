package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DonorSearchResult;

import java.util.List;

record DonorAccountListResponse(List<DonorAccountResponse> items, boolean hasMore) {

    static DonorAccountListResponse from(DonorSearchResult result) {
        return new DonorAccountListResponse(result.items().stream().map(DonorAccountResponse::from).toList(), result.hasMore());
    }
}
