package cz.novanadeje.app.donations.interfaces.rest;

import com.fasterxml.jackson.annotation.JsonIgnore;
import cz.novanadeje.app.donations.application.receipt.YearlyReceiptsService;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.HashSet;
import java.util.List;
import java.util.UUID;

import static cz.novanadeje.app.donations.interfaces.rest.DonorDonationsController.FIRST_FOUR_DIGIT_YEAR;
import static cz.novanadeje.app.donations.interfaces.rest.DonorDonationsController.LAST_FOUR_DIGIT_YEAR;

record YearlyReceiptsRequest(
        @NotNull @Min(FIRST_FOUR_DIGIT_YEAR) @Max(LAST_FOUR_DIGIT_YEAR) Integer year,
        @NotNull @Size(min = 1, max = YearlyReceiptsService.MAX_DONORS_PER_RUN) List<@NotNull UUID> donorIds
) {

    @JsonIgnore
    @AssertTrue(message = "{donations.yearly-receipts.donors.repeated}")
    public boolean isEachDonorOnce() {
        return donorIds == null || new HashSet<>(donorIds).size() == donorIds.size();
    }
}
