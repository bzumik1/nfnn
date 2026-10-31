package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingChange;
import cz.novanadeje.app.operations.domain.settings.SettingError;
import cz.novanadeje.app.operations.domain.settings.SettingProblem;
import cz.novanadeje.app.operations.domain.settings.SettingsRejected;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.notification.AccountEmails;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionOperations;

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
    static final String TEST_EMAIL_ACTION = "SEND_TEST_EMAIL";

    private static final Logger log = LoggerFactory.getLogger(SettingsService.class);

    private final SettingsWriter writer;
    private final CurrentSettings current;
    private final SecretSealer sealer;
    private final MailServerProbe mailProbe;
    private final AccountEmails accountEmails;
    private final ApplicationRestarter restarter;
    private final ApplicationEventPublisher events;
    private final TransactionOperations transaction;
    private final Clock clock;

    public SettingsService(SettingsWriter writer, CurrentSettings current, SecretSealer sealer, MailServerProbe mailProbe, AccountEmails accountEmails,
                           ApplicationRestarter restarter, ApplicationEventPublisher events, TransactionOperations transaction, Clock clock) {
        this.writer = writer;
        this.current = current;
        this.sealer = sealer;
        this.mailProbe = mailProbe;
        this.accountEmails = accountEmails;
        this.restarter = restarter;
        this.events = events;
        this.transaction = transaction;
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
        List<SettingError> foreign = changes.stream()
                .filter(change -> !change.setting().isAdministered())
                .map(change -> SettingError.of(change.setting(), SettingProblem.NOT_IN_ADMINISTRATION))
                .toList();
        if (!foreign.isEmpty()) {
            throw new SettingsRejected(foreign);
        }
        requirePasswordForAnotherMailServer(changes);
        Instant now = clock.instant();
        List<Setting> changed = writer.apply(changes, List.of(), now);
        if (changed.isEmpty()) {
            return changed;
        }
        String names = changed.stream().map(Enum::name).collect(Collectors.joining(", "));
        events.publishEvent(new AdminActionPerformed(adminId, CHANGE_ACTION, Optional.empty(),
                "Změněna nastavení: " + names + "; backend se restartuje, aby je použil", now));
        restarter.restartAfterCommit();
        log.info("Admin {} changed the settings {}; the backend restarts", adminId, names);
        return changed;
    }

    public TestEmailResult sendTestEmail(UUID adminId, MailServer server, String sender) {
        String recipient = accountEmails.emailOf(adminId).orElseThrow(() -> new IllegalStateException("An administrator without an e-mail"));
        boolean typed = server.password() != null && !server.password().isBlank();
        MailServer probed = !typed && isRunningServer(server)
                ? server.withPassword(current.effectiveValue(Setting.MAIL_PASSWORD).orElse(""))
                : server;
        TestEmail email = new TestEmail(sender, recipient);
        TestEmailOutcome outcome = mailProbe.sendTestEmail(probed, email);
        String details = "Zkušební e-mail na vlastní adresu přes " + server.host() + ":" + server.port() + " od " + email.sender() + ": "
                + (outcome == TestEmailOutcome.SENT ? "odeslán" : "neodeslán (" + outcome + ")");
        transaction.executeWithoutResult(status -> events.publishEvent(
                new AdminActionPerformed(adminId, TEST_EMAIL_ACTION, Optional.empty(), details, clock.instant())));
        log.info("Admin {} sent a test e-mail: {}", adminId, outcome);
        return new TestEmailResult(outcome, recipient);
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
