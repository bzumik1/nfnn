package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;

import java.util.List;

public interface SymbolClaimRepository {

    boolean saveIfAbsent(SymbolClaim claim);

    List<SymbolClaim> findByDonor(DonorReference donor);

    List<SymbolClaim> findByAccount(SenderAccount account);

    List<SymbolClaim> findConfirmed();
}
