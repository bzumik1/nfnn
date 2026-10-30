package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.admin.AdminPaymentList;
import cz.novanadeje.app.donations.application.admin.AdminPaymentView;
import cz.novanadeje.app.donations.application.admin.PairedDonationView;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.DonationStatus;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.shared.domain.Currency;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.UUID;

record AdminPaymentListResponse(Integer year, List<Integer> availableYears, List<AdminPaymentResponse> items, int total) {

    static AdminPaymentListResponse from(AdminPaymentList list) {
        return new AdminPaymentListResponse(list.year().map(Year::getValue).orElse(null),
                list.availableYears().stream().map(Year::getValue).toList(),
                list.items().stream().map(AdminPaymentResponse::from).toList(), list.total());
    }

    record AdminPaymentResponse(UUID id, long bankTransactionId, LocalDate bookedOn, long amountMinor, Currency currency, String variableSymbol,
                                String counterpartyAccount, String counterpartyName, String messageForRecipient, Instant importedAt,
                                Instant unpairedByAdminAt, boolean accountVerification, PairedDonationResponse donation) {

        static AdminPaymentResponse from(AdminPaymentView view) {
            BankPayment payment = view.payment();
            String account = payment.sender().map(SenderAccount::display)
                    .or(() -> payment.counterpartyAccount().map(number -> payment.counterpartyBankCode().map(code -> number + "/" + code).orElse(number)))
                    .orElse(null);
            return new AdminPaymentResponse(payment.id().value(), payment.transactionId().value(), payment.bookedOn(), payment.amount().amountMinor(),
                    payment.amount().currency(), payment.variableSymbol().orElse(null), account, payment.counterpartyName().orElse(null),
                    payment.messageForRecipient().orElse(null), payment.importedAt(), payment.unpairedByAdminAt().orElse(null),
                    view.accountVerification(), view.donation().map(PairedDonationResponse::from).orElse(null));
        }
    }

    record PairedDonationResponse(UUID id, UUID donorId, String donorName, PairingMethod pairedBy, DonationStatus status, Instant recordedAt,
                                  boolean receiptIssued) {

        static PairedDonationResponse from(PairedDonationView view) {
            return new PairedDonationResponse(view.donation().id().value(), view.donation().donor().value(),
                    view.donor().map(DonorRecord::name).orElse(null), view.donation().pairedBy().orElse(null), view.donation().status(),
                    view.donation().recordedAt(), view.receiptIssued());
        }
    }
}
