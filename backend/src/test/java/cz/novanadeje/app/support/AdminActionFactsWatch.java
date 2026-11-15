package cz.novanadeje.app.support;

import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.springframework.context.event.EventListener;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

public class AdminActionFactsWatch {

    private final List<String> disagreements = new CopyOnWriteArrayList<>();

    @EventListener
    public void heard(AdminActionPerformed event) {
        AdminActionFactsAgreement.disagreement(event).ifPresent(disagreements::add);
    }

    public List<String> takeDisagreements() {
        List<String> taken = List.copyOf(disagreements);
        disagreements.removeAll(taken);
        return taken;
    }
}
