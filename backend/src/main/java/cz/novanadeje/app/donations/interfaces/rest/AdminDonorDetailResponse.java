package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.admin.AdminDonorView;
import cz.novanadeje.app.donations.application.bankaccount.BankAccountView;
import cz.novanadeje.app.donations.application.receipt.ReceiptYears;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationPurpose;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkStatus;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptWithdrawal;
import cz.novanadeje.app.donations.domain.receipt.ReceiptWithdrawalReason;
import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.DonorType;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;

record AdminDonorDetailResponse(AdminDonorRecordResponse donor, List<AdminBankAccountResponse> bankAccounts,
                                DonationListResponse donations, List<ReceiptItemResponse> receipts, int yearlyReceiptsAvailableThrough,
                                int receiptsAvailableFrom) {

    static AdminDonorDetailResponse from(AdminDonorView view, ReceiptYears receiptYears, Function<DonationPurpose, String> purposeText) {
        return new AdminDonorDetailResponse(AdminDonorRecordResponse.from(view.record()),
                view.bankAccounts().stream().map(account -> AdminBankAccountResponse.from(account, view.versionOf(account.link().id()))).toList(),
                DonationListResponse.from(view.donations(), purposeText),
                view.receipts().stream().map(receipt -> ReceiptItemResponse.from(receipt, view.receivedOn(receipt).orElse(null))).toList(),
                receiptYears.lastCompleted().getValue(), receiptYears.first().getValue());
    }

    record AdminDonorRecordResponse(UUID donorId, String name, DonorType type, String variableSymbol, String companyIdentifier,
                                    AddressResponse address, String preferredLocale, Instant registeredAt, Instant erasedAt) {

        static AdminDonorRecordResponse from(DonorRecord record) {
            return new AdminDonorRecordResponse(record.id().value(), record.name(), record.type(), record.variableSymbol().value(),
                    record.companyIdentifier().orElse(null),
                    new AddressResponse(record.address().street(), record.address().city(), record.address().postalCode()),
                    record.preferredLocale().tag(), record.registeredAt(), record.erasedAt().orElse(null));
        }
    }

    record AdminBankAccountResponse(UUID id, String accountNumber, SenderAccountLinkStatus status, LocalDate verifiedOn, LocalDate connectedFrom,
                                    LocalDate disconnectedOn, int donationCount, long totalAmountMinor, Currency currency, LocalDate lastDonationOn,
                                    boolean shared, boolean pairingExcluded, LocalDate verificationPaymentOn,
                                    BankAccountListResponse.SymbolOfferResponse symbolOffer, List<String> confirmedSymbols, String version) {

        static AdminBankAccountResponse from(BankAccountView view, String version) {
            BankAccountListResponse.BankAccountItemResponse item = BankAccountListResponse.BankAccountItemResponse.from(view);
            return new AdminBankAccountResponse(item.id(), item.accountNumber(), item.status(), item.verifiedOn(), item.connectedFrom(),
                    item.disconnectedOn(), item.donationCount(), item.totalAmountMinor(), item.currency(), item.lastDonationOn(), item.shared(),
                    item.pairingExcluded(), item.verificationPaymentOn(), item.symbolOffer(), item.confirmedSymbols(), version);
        }
    }

    record AddressResponse(String street, String city, String postalCode) {
    }

    record ReceiptItemResponse(UUID id, String number, ReceiptKind kind, UUID donationId, LocalDate donationReceivedOn, Integer year,
                               LocalDate issuedOn, Instant issuedAt, String locale, boolean active, Instant withdrawnAt,
                               ReceiptWithdrawalReason withdrawalReason, String keyId) {

        static ReceiptItemResponse from(DonationReceipt receipt, LocalDate donationReceivedOn) {
            return new ReceiptItemResponse(receipt.id().value(), receipt.number().value(), receipt.kind(),
                    receipt.donation().map(DonationId::value).orElse(null), donationReceivedOn, receipt.year().map(Year::getValue).orElse(null),
                    receipt.issuedOn(), receipt.issuedAt(), receipt.locale().tag(), receipt.isActive(),
                    receipt.withdrawal().map(ReceiptWithdrawal::at).orElse(null), receipt.withdrawal().map(ReceiptWithdrawal::reason).orElse(null),
                    receipt.frozen().verification().keyId().value());
        }
    }
}
