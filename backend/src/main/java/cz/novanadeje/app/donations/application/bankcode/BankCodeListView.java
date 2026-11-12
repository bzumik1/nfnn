package cz.novanadeje.app.donations.application.bankcode;

import cz.novanadeje.app.donations.domain.bankcode.CzechBank;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public record BankCodeListView(Optional<Instant> fetchedAt, List<CzechBank> banks) {
}
