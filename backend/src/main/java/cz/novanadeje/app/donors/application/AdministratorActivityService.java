package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.shared.application.audit.AdminActionEntry;
import cz.novanadeje.app.shared.application.audit.AdminActionTrail;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class AdministratorActivityService {

    public static final int DEFAULT_PAGE_SIZE = 50;
    public static final int MAX_PAGE_SIZE = 200;

    private final AdminActionTrail trail;
    private final DonorRepository donors;
    private final Clock clock;

    public AdministratorActivityService(AdminActionTrail trail, DonorRepository donors, Clock clock) {
        this.trail = trail;
        this.donors = donors;
        this.clock = clock;
    }

    public AdministratorActivity list(Optional<Instant> before, int limit) {
        if (limit < 1 || limit > MAX_PAGE_SIZE) {
            throw new IllegalArgumentException("The page size is between 1 and " + MAX_PAGE_SIZE);
        }
        List<AdminActionEntry> entries = trail.findPerformedBefore(before.orElseGet(() -> clock.instant().plusSeconds(1)), limit + 1);
        List<AdminActionEntry> page = entries.size() > limit ? entries.subList(0, limit) : entries;
        Map<DonorId, Donor> adminsById = donors.findByIds(page.stream().map(entry -> new DonorId(entry.adminId())).distinct().toList()).stream()
                .collect(Collectors.toMap(Donor::id, Function.identity()));
        List<AdminActionView> items = page.stream()
                .map(entry -> new AdminActionView(entry.id(), entry.adminId(), Optional.ofNullable(adminsById.get(new DonorId(entry.adminId()))),
                        entry.action(), entry.subjectId(), entry.details(), entry.performedAt()))
                .toList();
        return new AdministratorActivity(items, entries.size() > limit);
    }
}
