package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.bankaccount.BankAccountView;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationPurpose;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.donation.DonationStatus;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkStatus;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.interfaces.rest.BankAccountListResponse.SymbolOfferResponse;
import cz.novanadeje.app.shared.domain.Currency;

import java.time.LocalDate;
import java.util.UUID;

final class SyncRows {

    private SyncRows() {
    }

    record DonationRow(UUID id, LocalDate receivedAt, long amountMinor, Currency currency, DonationStatus status, DonationSource source,
                       DonationPurpose purpose, PairingMethod pairedBy, UUID bankAccountId, UUID symbolClaimId) {

        static DonationRow from(Donation donation) {
            return new DonationRow(donation.id().value(), donation.receivedOn(), donation.amount().amountMinor(), donation.amount().currency(),
                    donation.status(), donation.source(), donation.purpose(), donation.pairedBy().orElse(null),
                    donation.pairedThrough().map(SenderAccountLinkId::value).orElse(null),
                    donation.confirmedClaim().map(SymbolClaimId::value).orElse(null));
        }
    }

    record BankAccountRow(UUID id, String accountNumber, SenderAccountLinkStatus status, LocalDate verifiedOn, LocalDate connectedFrom,
                          LocalDate disconnectedOn, boolean shared, boolean pairingExcluded, LocalDate verificationPaymentOn,
                          SymbolOfferResponse symbolOffer) {

        static BankAccountRow from(BankAccountView view) {
            return new BankAccountRow(view.link().id().value(), view.link().account().display(), view.link().status(),
                    view.verifiedOn().orElse(null), view.link().validFrom().orElse(null), view.link().validTo().orElse(null), view.shared(),
                    view.pairingExcluded(), view.verificationPaymentOn().orElse(null), view.symbolOffer().map(SymbolOfferResponse::from).orElse(null));
        }
    }

    record SymbolClaimRow(UUID id, String accountNumber, String variableSymbol, SymbolClaimAnswer answer) {

        static SymbolClaimRow from(SymbolClaim claim) {
            return new SymbolClaimRow(claim.id().value(), claim.account().display(), claim.symbol().value(), claim.answer());
        }
    }
}
