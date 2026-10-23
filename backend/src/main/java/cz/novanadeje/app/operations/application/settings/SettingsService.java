package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingChange;
import cz.novanadeje.app.operations.domain.settings.SettingError;
import cz.novanadeje.app.operations.domain.settings.SettingProblem;
import cz.novanadeje.app.operations.domain.settings.SettingsRejected;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class SettingsService {

    static final String CHANGE_ACTION = "CHANGE_SETTINGS";

    private static final Logger log = LoggerFactory.getLogger(SettingsService.class);

    private final SettingsWriter writer;
    private final CurrentSettings current;
    private final SecretSealer sealer;
    private final MailServerProbe mailProbe;
    private final ApplicationRestarter restarter;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public SettingsService(SettingsWriter writer, CurrentSettings current, SecretSealer sealer, MailServerProbe mailProbe,
                           ApplicationRestarter restarter, ApplicationEventPublisher events, Clock clock) {
        this.writer = writer;
        this.current = current;
        this.sealer = sealer;
        this.mailProbe = mailProbe;
        this.restarter = restarter;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public SettingsView view() {
        Map<Setting, String> stored = writer.storedValues();
        List<Setting> unreadable = writer.unreadable();
        List<SettingView> views = Setting.inAdministration().stream()
                .map(setting -> {
                    Optional<String> effective = current.effectiveValue(setting).filter(value -> !value.isBlank());
                    return new SettingView(setting, setting.secret() ? Optional.empty() : effective, effective.isPresent(),
                            stored.containsKey(setting), unreadable.contains(setting));
                })
                .toList();
        return new SettingsView(views, sealer.available());
    }

    @Transactional
    public List<Setting> change(UUID adminId, List<SettingChange> changes) {
        if (changes.stream().anyMatch(change -> !change.setting().isAdministered())) {
            throw new IllegalArgumentException("Only settings of the administration change here");
        }
        requirePasswordForAnotherMailServer(changes);
        Instant now = clock.instant();
        List<Setting> changed = writer.apply(changes, List.of(), now);
        if (changed.isEmpty()) {
            return changed;
        }
        String names = changed.stream().map(Enum::name).collect(Collectors.joining(", "));
        events.publishEvent(new AdminActionPerformed(adminId, CHANGE_ACTION, Optional.empty(),
                "Settings changed: " + names + "; the backend restarts to apply them", now));
        restarter.restartAfterCommit();
        log.info("Admin {} changed the settings {}; the backend restarts", adminId, names);
        return changed;
    }

    @Transactional(readOnly = true)
    public boolean testMail(MailServer server) {
        boolean typed = server.password() != null && !server.password().isBlank();
        MailServer probed = !typed && isRunningServer(server)
                ? server.withPassword(current.effectiveValue(Setting.MAIL_PASSWORD).orElse(""))
                : server;
        return mailProbe.canSignIn(probed);
    }

    private void requirePasswordForAnotherMailServer(List<SettingChange> changes) {
        boolean passwordChanges = changes.stream().anyMatch(change -> change.setting() == Setting.MAIL_PASSWORD);
        boolean passwordRuns = running(Setting.MAIL_PASSWORD).isPresent() || writer.storedValues().containsKey(Setting.MAIL_PASSWORD);
        boolean serverMoves = changes.stream()
                .filter(change -> change.setting().decidesWhereMailPasswordGoes())
                .anyMatch(change -> !sameValue(change.value(), running(change.setting()).orElse(null)));
        if (serverMoves && passwordRuns && !passwordChanges) {
            throw new SettingsRejected(List.of(SettingError.of(Setting.MAIL_PASSWORD, SettingProblem.PASSWORD_FOR_NEW_MAIL_SERVER)));
        }
    }

    private boolean isRunningServer(MailServer server) {
        return sameValue(server.host(), running(Setting.MAIL_HOST).orElse(null))
                && sameValue(String.valueOf(server.port()), running(Setting.MAIL_PORT).orElse(null))
                && sameValue(server.username(), running(Setting.MAIL_USERNAME).orElse(null))
                && sameValue(String.valueOf(server.startTls()), running(Setting.MAIL_STARTTLS).orElse("false"));
    }

    private Optional<String> running(Setting setting) {
        return current.effectiveValue(setting).map(String::strip).filter(value -> !value.isEmpty());
    }

    private static boolean sameValue(String given, String running) {
        String normalized = given == null || given.isBlank() ? null : given.strip();
        return normalized == null ? running == null : normalized.equalsIgnoreCase(running);
    }
}
