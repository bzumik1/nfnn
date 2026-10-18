package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.bankaccount.BankAccountView;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkStatus;
import cz.novanadeje.app.shared.domain.Currency;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

record BankAccountListResponse(List<BankAccountItemResponse> items) {

    static BankAccountListResponse from(List<BankAccountView> views) {
        return new BankAccountListResponse(views.stream().map(BankAccountItemResponse::from).toList());
    }

    record BankAccountItemResponse(UUID id, String accountNumber, SenderAccountLinkStatus status, LocalDate verifiedOn, LocalDate connectedFrom,
                                   LocalDate disconnectedOn, int donationCount, long totalAmountMinor, Currency currency,
                                   LocalDate lastDonationOn, boolean shared) {

        static BankAccountItemResponse from(BankAccountView view) {
            return new BankAccountItemResponse(view.link().id().value(), view.link().account().display(), view.link().status(),
                    view.verifiedOn().orElse(null), view.link().validFrom().orElse(null), view.link().validTo().orElse(null),
                    view.donationCount(), view.total().amountMinor(), view.total().currency(), view.lastDonationOn().orElse(null),
                    view.shared());
        }
    }
}
