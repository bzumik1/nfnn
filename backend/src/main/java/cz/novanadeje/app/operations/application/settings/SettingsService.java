package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.application.restart.ApplicationRestarter;
import cz.novanadeje.app.operations.domain.settings.MailPasswordRouting;
import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingChange;
import cz.novanadeje.app.operations.domain.settings.SettingError;
import cz.novanadeje.app.operations.domain.settings.SecretSettingsInBrowserOnly;
import cz.novanadeje.app.operations.domain.settings.SettingProblem;
import cz.novanadeje.app.operations.domain.settings.SettingsChangedMeanwhile;
import cz.novanadeje.app.operations.domain.settings.SettingsRejected;
import cz.novanadeje.app.shared.application.account.AccountEmails;
import cz.novanadeje.app.shared.application.administration.AdministrationChannel;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import cz.novanadeje.app.shared.application.version.StaleWriteRefusal;
import cz.novanadeje.app.shared.domain.EmailAddress;
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
    private final SettingsVersions versions;
    private final Clock clock;

    public SettingsService(SettingsWriter writer, CurrentSettings current, SecretSealer sealer, MailServerProbe mailProbe, AccountEmails accountEmails,
                           ApplicationRestarter restarter, ApplicationEventPublisher events, TransactionOperations transaction, SettingsVersions versions,
                           Clock clock) {
        this.writer = writer;
        this.current = current;
        this.sealer = sealer;
        this.mailProbe = mailProbe;
        this.accountEmails = accountEmails;
        this.restarter = restarter;
        this.events = events;
        this.transaction = transaction;
        this.versions = versions;
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
        return new SettingsView(views, sealer.available(), versions.of(SettingsVersions.StoredSettings.of(writer.stored())));
    }

    @Transactional
    public SavedSettings change(UUID adminId, List<SettingChange> changes, ExpectedVersion expected) {
        List<SettingError> foreign = changes.stream()
                .filter(change -> !change.setting().isAdministered())
                .map(change -> SettingError.of(change.setting(), SettingProblem.NOT_IN_ADMINISTRATION))
                .toList();
        if (!foreign.isEmpty()) {
            throw new SettingsRejected(foreign);
        }
        Map<Setting, String> checked = writer.storedValues();
        writer.lockForChange();
        SettingsVersions.StoredSettings stored = SettingsVersions.StoredSettings.of(writer.stored());
        String version = versions.of(stored);
        if (!expected.admits(version)) {
            throw new StaleWriteRefusal(new SettingsChangedMeanwhile(version), stored);
        }
        MailPasswordRouting.refuseWhenTheMailServerChangedMeanwhile(checked, writer.storedValues(), changes);
        runningMailServer().refuseAnotherServerWithoutItsPassword(changes, writer.storedValues().containsKey(Setting.MAIL_PASSWORD));
        Instant now = clock.instant();
        List<Setting> changed = writer.apply(changes, List.of(), now);
        if (changed.isEmpty()) {
            return new SavedSettings(changed, version);
        }
        String names = changed.stream().map(Enum::name).collect(Collectors.joining(", "));
        events.publishEvent(new AdminActionPerformed(adminId, CHANGE_ACTION, Optional.empty(),
                "Změněna nastavení: " + names + "; backend se restartuje, aby je použil",
                AdminActionPerformed.Facts.of(CHANGE_ACTION, Map.of("settings", changed.stream().map(Enum::name).collect(Collectors.joining(",")))), now));
        restarter.restartAfterCommitOnceAsyncWorkIsDone();
        log.info("Admin {} changed the settings {}; the backend restarts", adminId, names);
        return new SavedSettings(changed, versions.of(SettingsVersions.StoredSettings.of(writer.stored())));
    }

    public TestEmailResult sendTestEmail(UUID adminId, AdministrationChannel channel, MailServer server, String sender) {
        boolean typed = server.password() != null && !server.password().isBlank();
        MailPasswordRouting routing = runningMailServer();
        if (channel.isConnectedApplication() && !routing.mayBeTestedThroughAConnection(server.address(), server.auth(), sender, typed)) {
            throw new SecretSettingsInBrowserOnly();
        }
        String recipient = accountEmails.emailOf(adminId).map(EmailAddress::value).orElseThrow(() -> new IllegalStateException("An administrator without an e-mail"));
        MailServer probed = routing.lendsTheStoredPasswordTo(server.address(), typed)
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

    private MailPasswordRouting runningMailServer() {
        return MailPasswordRouting.readFrom(current::effectiveValue);
    }
}
