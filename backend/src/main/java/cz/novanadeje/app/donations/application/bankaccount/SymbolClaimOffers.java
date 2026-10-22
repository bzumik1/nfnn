package cz.novanadeje.app.donations.application.bankaccount;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationPurpose;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.donations.domain.pairing.SymbolClaimOffer;
import cz.novanadeje.app.donations.domain.pairing.SymbolClaimOfferPolicy;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public class SymbolClaimOffers {

    private final BankPaymentRepository payments;
    private final DonorRecordRepository donorRecords;
    private final SymbolClaimRepository claims;
    private final SymbolClaimOfferPolicy policy;

    public SymbolClaimOffers(BankPaymentRepository payments, DonorRecordRepository donorRecords, SymbolClaimRepository claims,
                             ExcludedSenderAccounts excluded) {
        this.payments = payments;
        this.donorRecords = donorRecords;
        this.claims = claims;
        this.policy = new SymbolClaimOfferPolicy(excluded);
    }

    public Optional<SymbolClaimOffer> offerAt(DonorRecord record, SenderAccountLink link, List<Donation> donorDonations, List<DonorRecord> owners,
                                              LocalDate today) {
        Set<BankPaymentId> verifications = verificationPayments(donorDonations);
        if (verifications.isEmpty()) {
            return Optional.empty();
        }
        SenderAccount account = link.account();
        return policy.candidate(record, link, payments.findBySenderAccount(account), verifications, owners, claims.findByAccount(account), today)
                .filter(symbol -> donorRecords.findByVariableSymbol(symbol).isEmpty())
                .flatMap(symbol -> policy.offer(record, account, symbol,
                        payments.findUnpairedBySenderAccountAndMatchingVariableSymbol(account, symbol), owners));
    }

    static Set<BankPaymentId> verificationPayments(List<Donation> donorDonations) {
        return donorDonations.stream()
                .filter(Donation::isReceived)
                .filter(donation -> donation.purpose() == DonationPurpose.ACCOUNT_VERIFICATION)
                .filter(donation -> donation.pairedBy().filter(PairingMethod.VARIABLE_SYMBOL::equals).isPresent())
                .flatMap(donation -> donation.bankPayment().stream())
                .collect(Collectors.toUnmodifiableSet());
    }
}
