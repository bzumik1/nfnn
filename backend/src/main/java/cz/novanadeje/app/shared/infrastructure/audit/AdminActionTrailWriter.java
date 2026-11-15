package cz.novanadeje.app.shared.infrastructure.audit;

import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.infrastructure.security.ClientClaim;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.Optional;

@Component
class AdminActionTrailWriter {

    private static final Logger log = LoggerFactory.getLogger(AdminActionTrailWriter.class);

    private final AdminActionJpaRepository actions;

    AdminActionTrailWriter(AdminActionJpaRepository actions) {
        this.actions = actions;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void record(AdminActionPerformed event) {
        Optional<String> client = connectedClient();
        actions.save(AdminActionJpaEntity.of(event, client));
        log.info("Admin {} performed {} on {}{}", event.adminId(), event.action(), event.subjectId().map(Object::toString).orElse("nothing"),
                client.map(name -> " through " + name).orElse(""));
    }

    private static Optional<String> connectedClient() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication instanceof JwtAuthenticationToken token) {
            return ClientClaim.of(token.getToken());
        }
        return Optional.empty();
    }
}
