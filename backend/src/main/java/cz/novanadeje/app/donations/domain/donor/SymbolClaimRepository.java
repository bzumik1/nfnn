package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;

import java.util.List;
import java.util.Optional;

public interface SymbolClaimRepository {

    boolean saveIfAbsent(SymbolClaim claim);

    List<SymbolClaim> findByDonor(DonorReference donor);

    List<SymbolClaim> findByAccount(SenderAccount account);

    List<SymbolClaim> findConfirmed();

    Optional<SymbolClaim> findById(SymbolClaimId id);

    List<SymbolClaim> findAllNewestFirst();

    void save(SymbolClaim claim);

    void delete(SymbolClaimId id);
}
