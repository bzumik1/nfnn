package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.util.List;
import java.util.Optional;

public interface DonorRecordRepository {

    void save(DonorRecord record);

    void addSenderAccount(DonorReference donor, LearnedSenderAccount account);

    Optional<DonorRecord> findById(DonorReference id);

    Optional<DonorRecord> findByVariableSymbol(VariableSymbol symbol);

    List<DonorRecord> findBySenderAccount(SenderAccount account);
}
