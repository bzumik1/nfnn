package cz.novanadeje.app.donations.domain.donation;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;

import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Optional;

public interface DonationRepository {

    void save(Donation donation);

    boolean existsForBankPayment(BankPaymentId bankPayment);

    Optional<Donation> findByBankPayment(BankPaymentId bankPayment);

    void delete(DonationId id);

    List<Donation> findByDonorNewestFirst(DonorReference donor);

    Optional<Donation> findByIdForDonor(DonationId id, DonorReference donor);

    List<Donation> findReceivedOnBetween(LocalDate firstDay, LocalDate lastDay);

    List<Year> findReceivedYearsNewestFirst();
}
