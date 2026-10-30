package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface DonorRecordRepository {

    void save(DonorRecord record);

    boolean saveSenderAccountLink(DonorReference donor, SenderAccountLink link);

    void deleteSenderAccountLink(DonorReference donor, SenderAccountLinkId link);

    void deleteSenderAccountLinksOf(DonorReference donor);

    Optional<DonorRecord> findById(DonorReference id);

    Optional<DonorRecord> findByVariableSymbol(VariableSymbol symbol);

    List<DonorRecord> findBySenderAccount(SenderAccount account);

    List<DonorRecord> findByIds(Collection<DonorReference> ids);

    List<DonorRecord> searchByNameOrSymbol(String query, int limit);

    long countRegisteredBefore(Instant end);

    long countRegisteredSince(Instant from);
}
