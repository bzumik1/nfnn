package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bankcode.BankCodeList;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeListState;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeRepository;
import cz.novanadeje.app.donations.domain.bankcode.CzechBank;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
class JpaBankCodeRepository implements BankCodeRepository {

    private final BankCodeJpaRepository codes;
    private final BankCodeListStateJpaRepository states;

    JpaBankCodeRepository(BankCodeJpaRepository codes, BankCodeListStateJpaRepository states) {
        this.codes = codes;
        this.states = states;
    }

    @Override
    public List<CzechBank> findAll() {
        return codes.findAllByOrderByCodeAsc().stream().map(BankCodeJpaEntity::toDomain).toList();
    }

    @Override
    public BankCodeListState state() {
        return states.findById(BankCodeListStateJpaEntity.SINGLETON_ID).map(BankCodeListStateJpaEntity::toDomain).orElseGet(BankCodeListState::none);
    }

    @Override
    public void store(BankCodeList list, BankCodeListState state) {
        codes.deleteAllInBatch();
        codes.saveAll(list.banks().stream().map(BankCodeJpaEntity::fromDomain).toList());
        save(state);
    }

    @Override
    public void save(BankCodeListState state) {
        states.save(BankCodeListStateJpaEntity.fromDomain(state));
    }
}
