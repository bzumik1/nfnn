package cz.novanadeje.app.donations.application.bankcode;

import cz.novanadeje.app.donations.domain.bankcode.BankCodeList;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeListState;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeRepository;
import cz.novanadeje.app.donations.domain.bankcode.CzechBank;

import java.util.List;

class InMemoryBankCodeRepository implements BankCodeRepository {

    private List<CzechBank> banks = List.of();
    private BankCodeListState state = BankCodeListState.none();

    @Override
    public List<CzechBank> findAll() {
        return banks;
    }

    @Override
    public void replaceAll(BankCodeList list) {
        banks = list.banks();
    }

    @Override
    public BankCodeListState state() {
        return state;
    }

    @Override
    public void save(BankCodeListState newState) {
        state = newState;
    }
}
