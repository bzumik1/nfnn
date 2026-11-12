package cz.novanadeje.app.donations.domain.bankcode;

import java.util.List;

public interface BankCodeRepository {

    List<CzechBank> findAll();

    BankCodeListState state();

    void store(BankCodeList list, BankCodeListState state);

    void save(BankCodeListState state);
}
