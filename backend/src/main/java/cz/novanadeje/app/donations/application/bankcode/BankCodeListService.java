package cz.novanadeje.app.donations.application.bankcode;

import cz.novanadeje.app.donations.domain.bankcode.BankCodeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BankCodeListService {

    private final BankCodeRepository repository;

    public BankCodeListService(BankCodeRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public BankCodeListView list() {
        return new BankCodeListView(repository.state().fetchedAt(), repository.findAll());
    }
}
