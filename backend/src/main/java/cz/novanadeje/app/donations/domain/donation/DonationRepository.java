package cz.novanadeje.app.donations.domain.donation;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;

import java.util.List;

public interface DonationRepository {

    void save(Donation donation);

    boolean existsForBankPayment(BankPaymentId bankPayment);

    List<Donation> findByDonorNewestFirst(DonorReference donor);
}
