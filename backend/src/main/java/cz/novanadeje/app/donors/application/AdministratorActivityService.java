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
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

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

    public AdministratorActivity list(Optional<AdminActionCursor> before, int limit) {
        if (limit < 1 || limit > MAX_PAGE_SIZE) {
            throw new IllegalArgumentException("The page size is between 1 and " + MAX_PAGE_SIZE);
        }
        List<AdminActionEntry> entries = before
                .map(cursor -> cursor.beforeId()
                        .map(id -> trail.findPerformedBefore(cursor.before(), id, limit + 1))
                        .orElseGet(() -> trail.findPerformedBefore(cursor.before(), limit + 1)))
                .orElseGet(() -> trail.findPerformedBefore(clock.instant().plusSeconds(1), limit + 1));
        List<AdminActionEntry> page = entries.size() > limit ? entries.subList(0, limit) : entries;
        Map<UUID, Optional<AdminActionFacts>> factsById = page.stream()
                .collect(Collectors.toMap(AdminActionEntry::id, entry -> AdminActionFacts.read(entry.action(), entry.details())));
        List<DonorId> named = Stream.concat(page.stream().map(AdminActionEntry::adminId),
                        factsById.values().stream().flatMap(Optional::stream).map(AdminActionFacts::donor).flatMap(Optional::stream))
                .distinct()
                .map(DonorId::new)
                .toList();
        Map<UUID, Donor> donorsById = donors.findByIds(named).stream().collect(Collectors.toMap(donor -> donor.id().value(), Function.identity()));
        List<AdminActionView> items = page.stream()
                .map(entry -> AdminActionView.of(entry, factsById.get(entry.id()), donorsById))
                .toList();
        return new AdministratorActivity(items, entries.size() > limit);
    }
}
