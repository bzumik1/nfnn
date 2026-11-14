package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.shared.domain.CompanyIdentifier;
import cz.novanadeje.app.shared.domain.DonorType;

import java.util.List;
import java.util.UUID;

record AdminDonorSearchResponse(List<AdminDonorResponse> items) {

    static AdminDonorSearchResponse from(List<DonorRecord> records) {
        return new AdminDonorSearchResponse(records.stream().map(AdminDonorResponse::from).toList());
    }

    record AdminDonorResponse(UUID donorId, String name, DonorType type, String variableSymbol, String companyIdentifier) {

        static AdminDonorResponse from(DonorRecord record) {
            return new AdminDonorResponse(record.id().value(), record.name().value(), record.type(), record.variableSymbol().value(),
                    record.companyIdentifier().map(CompanyIdentifier::value).orElse(null));
        }
    }
}
