package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatory;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record ReceiptSignatoryRequest(
        @NotNull @Pattern(regexp = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}") String personId,
        @NotBlank @Size(max = ReceiptSignatory.MAX_ROLE_LENGTH) String receiptRole) {
}
