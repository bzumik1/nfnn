package cz.novanadeje.app.support;

import cz.novanadeje.app.donors.application.CompanyRegistry;
import cz.novanadeje.app.donors.application.CompanyRegistryUnavailable;
import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.RegisteredCompany;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public class FakeCompanyRegistry implements CompanyRegistry {

    private final Map<CompanyIdentifier, RegisteredCompany> companies = new ConcurrentHashMap<>();
    private final AtomicBoolean down = new AtomicBoolean();
    private final AtomicInteger requests = new AtomicInteger();

    @Override
    public Optional<RegisteredCompany> find(CompanyIdentifier identifier) {
        requests.incrementAndGet();
        if (down.get()) {
            throw new CompanyRegistryUnavailable("status 503");
        }
        return Optional.ofNullable(companies.get(identifier));
    }

    public void know(RegisteredCompany company) {
        companies.put(company.identifier(), company);
    }

    public void goDown() {
        down.set(true);
    }

    public void comeBack() {
        down.set(false);
    }

    public int requests() {
        return requests.get();
    }

    public void reset() {
        companies.clear();
        down.set(false);
        requests.set(0);
    }
}
