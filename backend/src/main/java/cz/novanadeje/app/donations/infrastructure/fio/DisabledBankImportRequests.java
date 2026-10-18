package cz.novanadeje.app.donations.infrastructure.fio;

import cz.novanadeje.app.donations.application.importing.BankImportRequests;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

@Component
@Conditional(FioTokenAbsentCondition.class)
class DisabledBankImportRequests implements BankImportRequests {

    @Override
    public void requestImport() {
    }

    @Override
    public boolean inProgress() {
        return false;
    }
}
