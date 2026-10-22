package cz.novanadeje.app.donations.application.admin;

import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;

import java.util.Optional;

public record SymbolClaimView(SymbolClaim claim, Optional<DonorRecord> donor, long donationCount) {
}
