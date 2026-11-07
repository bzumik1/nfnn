package cz.novanadeje.app.donations.domain.bankcode;

import java.util.List;

public interface BankCodeRepository {

    List<CzechBank> findAll();

    void replaceAll(BankCodeList list);

    BankCodeListState state();

    void save(BankCodeListState state);
}
