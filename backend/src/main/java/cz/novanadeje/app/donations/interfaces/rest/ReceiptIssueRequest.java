package cz.novanadeje.app.donations.interfaces.rest;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import static cz.novanadeje.app.donations.interfaces.rest.DonorDonationsController.FIRST_FOUR_DIGIT_YEAR;
import static cz.novanadeje.app.donations.interfaces.rest.DonorDonationsController.LAST_FOUR_DIGIT_YEAR;

record ReceiptIssueRequest(
        @Size(max = 36)
        @Pattern(regexp = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", message = "{problem.validation.invalid-value}")
        String donationId,
        @Min(FIRST_FOUR_DIGIT_YEAR) @Max(LAST_FOUR_DIGIT_YEAR) Integer year
) {

    @JsonIgnore
    @AssertTrue(message = "{donations.receipt.subject.invalid}")
    public boolean isSubject() {
        return (donationId == null) != (year == null);
    }
}
