package cz.novanadeje.app.content.application.project;

import cz.novanadeje.app.content.domain.project.ProjectOrder;
import cz.novanadeje.app.content.domain.project.ProjectOrderRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class ProjectOrderService {

    static final String CHANGE_ACTION = "CHANGE_PROJECT_ORDER";

    private final ProjectOrderRepository orders;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public ProjectOrderService(ProjectOrderRepository orders, ApplicationEventPublisher events, Clock clock) {
        this.orders = orders;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ProjectOrder current() {
        return orders.current();
    }

    public ProjectOrder change(UUID adminId, ProjectOrder chosen) {
        ProjectOrder previous = orders.current();
        if (previous == chosen) {
            return chosen;
        }
        Instant now = clock.instant();
        orders.save(chosen, now);
        events.publishEvent(new AdminActionPerformed(adminId, CHANGE_ACTION, Optional.empty(),
                "Řazení projektů na webu změněno z " + previous + " na " + chosen, now));
        return chosen;
    }
}
