package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record BankLogoSourceRequest(@NotBlank @Size(max = BankLogoSource.MAX_LENGTH) String sourceUrl) {
}
