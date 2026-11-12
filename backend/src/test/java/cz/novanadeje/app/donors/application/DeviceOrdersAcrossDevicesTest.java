package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donations.DonationRowsContext;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DeviceStatus;
import cz.novanadeje.app.donors.domain.DeviceStatusSecret;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.InvalidRefreshToken;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.SessionKind;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.support.AsyncTaskTracker;
import cz.novanadeje.app.support.DatabaseCleaner;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DonationRowsContext
class DeviceOrdersAcrossDevicesTest {

    private static final String SEEDS_VARIABLE = "DEVICE_ORDERS_SEEDS";
    private static final int DEFAULT_SEEDS = 30;
    private static final int STEPS = 60;
    private static final Instant START = Instant.parse("2026-11-06T08:00:00Z");
    private static final Duration REPLAY_AFTER = Duration.ofSeconds(61);
    private static final Duration REPLAY_WITHIN = Duration.ofDays(1);
    private static final Duration ENDED_DEVICE_RETENTION = Duration.ofDays(400);
    private static final Duration BROWSER_IDLE = Duration.ofHours(12);
    private static final Duration REMEMBERED = Duration.ofDays(14);
    private static final Duration APP = Duration.ofDays(400);
    private static final Set<DeviceStatus> WIPES = EnumSet.of(DeviceStatus.WIPE_ADMINISTRATION, DeviceStatus.WIPE_ALL);
    private static final Set<Transition> PROMISED_TRANSITIONS = Set.of(
            new Transition(DeviceStatus.SIGNED_IN, StepKind.SIGN_OUT_HERE, DeviceStatus.SIGNED_OUT),
            new Transition(DeviceStatus.SIGNED_IN, StepKind.REPLAY, DeviceStatus.SIGNED_OUT),
            new Transition(DeviceStatus.SIGNED_IN, StepKind.TIME_PASSES, DeviceStatus.SIGNED_OUT),
            new Transition(DeviceStatus.SIGNED_IN, StepKind.TIME_PASSES, DeviceStatus.SIGNED_IN),
            new Transition(DeviceStatus.SIGNED_IN, StepKind.SIGN_OUT_ELSEWHERE, DeviceStatus.WIPE_ALL),
            new Transition(DeviceStatus.SIGNED_IN, StepKind.SIGN_OUT_EVERY_OTHER, DeviceStatus.WIPE_ALL),
            new Transition(DeviceStatus.SIGNED_IN, StepKind.REMOVE_ROLE, DeviceStatus.WIPE_ADMINISTRATION),
            new Transition(DeviceStatus.SIGNED_OUT, StepKind.REMOVE_ROLE, DeviceStatus.WIPE_ADMINISTRATION),
            new Transition(DeviceStatus.SIGNED_IN, StepKind.ERASE, DeviceStatus.WIPE_ALL),
            new Transition(DeviceStatus.SIGNED_OUT, StepKind.ERASE, DeviceStatus.WIPE_ALL),
            new Transition(DeviceStatus.WIPE_ADMINISTRATION, StepKind.ERASE, DeviceStatus.WIPE_ALL),
            new Transition(DeviceStatus.WIPE_ADMINISTRATION, StepKind.GRANT_ROLE, DeviceStatus.WIPE_ADMINISTRATION),
            new Transition(DeviceStatus.WIPE_ADMINISTRATION, StepKind.SIGN_IN, DeviceStatus.WIPE_ADMINISTRATION),
            new Transition(DeviceStatus.WIPE_ALL, StepKind.SIGN_IN, DeviceStatus.WIPE_ALL),
            new Transition(DeviceStatus.WIPE_ALL, StepKind.PRESENT_ENDED_TOKEN, DeviceStatus.WIPE_ALL),
            new Transition(DeviceStatus.WIPE_ADMINISTRATION, StepKind.PRESENT_ENDED_TOKEN, DeviceStatus.WIPE_ADMINISTRATION),
            new Transition(DeviceStatus.SIGNED_OUT, StepKind.PRESENT_ENDED_TOKEN, DeviceStatus.SIGNED_OUT),
            new Transition(DeviceStatus.WIPE_ALL, StepKind.TIME_PASSES, DeviceStatus.WIPE_ALL),
            new Transition(DeviceStatus.WIPE_ADMINISTRATION, StepKind.TIME_PASSES, DeviceStatus.WIPE_ADMINISTRATION),
            new Transition(DeviceStatus.SIGNED_OUT, StepKind.TIME_PASSES, DeviceStatus.UNKNOWN),
            new Transition(DeviceStatus.WIPE_ALL, StepKind.TIME_PASSES, DeviceStatus.UNKNOWN),
            new Transition(DeviceStatus.WIPE_ADMINISTRATION, StepKind.TIME_PASSES, DeviceStatus.UNKNOWN));
    private static final TotpSecret AUTHENTICATOR_SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    private static final List<SessionKind> KINDS_THAT_KEEP_A_COPY = List.of(SessionKind.BROWSER, SessionKind.REMEMBERED, SessionKind.APP);

    @Autowired
    private DonorSessionService sessions;
    @Autowired
    private DonorDevicesService deviceList;
    @Autowired
    private DeviceStatusService statuses;
    @Autowired
    private AdministratorService administrators;
    @Autowired
    private DonorErasureService erasures;
    @Autowired
    private DonorSessionCleanupService cleanup;
    @Autowired
    private AsyncTaskTracker asyncTasks;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private DonorDeviceRepository devices;
    @Autowired
    private SecondFactorRepository secondFactors;
    @Autowired
    private MutableClock clock;
    @Autowired
    private JdbcClient jdbc;

    private Instant clockBefore;

    @BeforeEach
    void startFromEmptyTables() {
        clockBefore = clock.instant();
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @AfterEach
    void emptyTablesAndPutTheClockBack() {
        asyncTasks.awaitIdleAfter("the device orders across devices");
        new DatabaseCleaner(jdbc).emptyAllTables();
        clock.set(clockBefore);
    }

    @TestFactory
    @DisplayName("Given seeded random sign-ins, refreshes, sign-outs here and elsewhere, replays, weeks and months without a connection, role changes and an erasure across the devices of two donors, when every device asks its status after each step, then each answer is what the orders written so far give and no order is ever lowered, lifted or written by a step that may not write it")
    Stream<DynamicTest> should_answer_what_the_orders_written_so_far_give_when_every_device_asks_after_each_step_given_seeded_random_steps() {
        int seeds = Math.max(DEFAULT_SEEDS, Optional.ofNullable(System.getenv(SEEDS_VARIABLE)).map(Integer::parseInt).orElse(DEFAULT_SEEDS));
        Set<StepKind> taken = EnumSet.noneOf(StepKind.class);
        Set<DeviceStatus> answered = EnumSet.noneOf(DeviceStatus.class);
        Set<Transition> seen = new HashSet<>();
        Stream<DynamicTest> runs = IntStream.rangeClosed(1, seeds).mapToObj(seed -> DynamicTest.dynamicTest(
                "Given seed " + seed + ", when every device asks its status after each random step, then the answers keep the invariants",
                () -> {
                    new Run(new Random(seed), taken, answered, seen).play();
                    asyncTasks.awaitIdleAfter("seed " + seed + " of the device orders");
                }));
        DynamicTest coverage = DynamicTest.dynamicTest(
                "Given every seed has run, when the steps and answers are counted, then every kind of step ran, every status was answered and every transition the slice promises was seen",
                () -> {
                    assertThat(taken).as("the kinds of step the seeds took").containsExactlyInAnyOrder(StepKind.values());
                    assertThat(answered).as("the statuses the devices were answered").containsExactlyInAnyOrder(DeviceStatus.values());
                    assertThat(seen).as("the transitions of a device's answer the seeds went through").containsAll(PROMISED_TRANSITIONS);
                });
        return Stream.concat(runs, Stream.of(coverage));
    }

    private final class Run {

        private final Random random;
        private final Set<StepKind> taken;
        private final Set<DeviceStatus> answered;
        private final Set<Transition> seen;
        private final List<String> trail = new ArrayList<>();
        private final Account jana;
        private final Account petr;
        private final DonorId acting;
        private final List<ModelDevice> held = new ArrayList<>();
        private Map<ModelDevice, Answer> lastAnswers = new LinkedHashMap<>();

        Run(Random random, Set<StepKind> taken, Set<DeviceStatus> answered, Set<Transition> seen) {
            this.random = random;
            this.taken = taken;
            this.answered = answered;
            this.seen = seen;
            new DatabaseCleaner(jdbc).emptyAllTables();
            clock.set(START.plusSeconds(random.nextInt(86_400)));
            this.jana = new Account(register("Jana Nováková", "jana@example.cz", "4821937561"));
            this.petr = new Account(register("Petr Svoboda", "petr@example.cz", "5931048672"));
            this.acting = register("Eva Správcová", "eva@example.cz", "6041159783");
            Donor administrator = donors.findById(acting).orElseThrow();
            administrator.grantAdministration();
            donors.save(administrator);
        }

        void play() {
            for (int count = 0; count < STEPS; count++) {
                Step step = takeRandomStep();
                trail.add(step.description());
                Map<ModelDevice, Answer> answers = askEveryDevice();
                checkAgainstTheModel(answers);
                checkTransitions(step, answers);
                taken.add(step.kind());
                answers.values().forEach(answer -> answered.add(answer.status()));
                answers.forEach((device, answer) -> Optional.ofNullable(lastAnswers.get(device))
                        .ifPresent(before -> seen.add(new Transition(before.status(), step.kind(), answer.status()))));
                lastAnswers = answers;
            }
        }

        private Step takeRandomStep() {
            List<Step> possible = new ArrayList<>();
            for (Account account : List.of(jana, petr)) {
                if (!account.erased) {
                    possible.add(signIn(account));
                    active(account).forEach(device -> possible.add(refresh(device)));
                    active(account).forEach(device -> possible.add(signOutHere(device)));
                    active(account).forEach(device -> possible.add(signOutElsewhere(device)));
                    active(account).forEach(device -> possible.add(signOutEveryOther(device)));
                    active(account).filter(this::mayReplay).forEach(device -> possible.add(replay(device)));
                    possible.add(account.administrator ? removeRole(account) : grantRole(account));
                }
            }
            held.stream().filter(device -> !device.active && !device.deleted).forEach(device -> possible.add(presentEndedToken(device)));
            if (!jana.erased && !jana.administrator) {
                possible.add(erase(jana));
            }
            possible.add(timePasses());
            possible.add(timePasses());
            possible.add(timePasses());
            Step chosen = possible.get(random.nextInt(possible.size()));
            if (chosen.precondition().test(this)) {
                chosen.action().run();
                return chosen;
            }
            Step instead = timePasses();
            instead.action().run();
            return instead;
        }

        private Step signIn(Account account) {
            SessionKind kind = KINDS_THAT_KEEP_A_COPY.get(random.nextInt(KINDS_THAT_KEEP_A_COPY.size()));
            return new Step(StepKind.SIGN_IN, account, "sign-in of " + account.name() + " as " + kind, run -> true, () -> {
                Instant now = clock.instant();
                IssuedTokens tokens = sessions.signIn(donor(account), true, DeviceDescription.UNKNOWN, kind);
                assertThat(tokens.deviceSecret()).as("a sign-in that may keep a copy gets a device secret").isPresent();
                ModelDevice device = new ModelDevice(account, kind, tokens.deviceSecret().orElseThrow().value(), now);
                device.issued(tokens.refreshToken(), expiryOf(kind, now, now));
                held.add(device);
            });
        }

        private Step refresh(ModelDevice device) {
            return new Step(StepKind.REFRESH, device.account, "refresh of " + device, run -> device.tokenUsableAt(clock.instant()), () -> {
                Instant now = clock.instant();
                RefreshedSession refreshed = sessions.refresh(device.refreshToken, SessionCookie.of(device.kind), DeviceDescription.UNKNOWN);
                assertThat(refreshed.tokens().deviceSecret()).as("a refresh gets no device secret").isEmpty();
                device.rotated(refreshed.tokens().refreshToken(), now, expiryOf(device.kind, device.signedInAt, now));
            });
        }

        private Step signOutHere(ModelDevice device) {
            return new Step(StepKind.SIGN_OUT_HERE, device.account, "own sign-out of " + device, run -> device.active, () -> {
                sessions.close(device.refreshToken);
                device.ended(clock.instant(), Order.NONE);
            });
        }

        private Step signOutElsewhere(ModelDevice target) {
            return new Step(StepKind.SIGN_OUT_ELSEWHERE, target.account, "remote sign-out of " + target, run -> target.active, () -> {
                deviceList.signOut(donor(target.account).id(), deviceIdOf(target));
                target.ended(clock.instant(), Order.ALL);
            });
        }

        private Step signOutEveryOther(ModelDevice kept) {
            return new Step(StepKind.SIGN_OUT_EVERY_OTHER, kept.account, "every other device signed out from " + kept, run -> kept.active, () -> {
                deviceList.signOutOthers(donor(kept.account).id(), Optional.of(deviceIdOf(kept)));
                Instant now = clock.instant();
                active(kept.account).filter(device -> device != kept).toList().forEach(device -> device.ended(now, Order.ALL));
            });
        }

        private Step replay(ModelDevice device) {
            return new Step(StepKind.REPLAY, device.account, "replay of the spent refresh token of " + device, run -> mayReplay(device), () -> {
                assertThatThrownBy(() -> sessions.refresh(device.spentRefreshToken, SessionCookie.of(device.kind), DeviceDescription.UNKNOWN))
                        .isInstanceOf(InvalidRefreshToken.class);
                Instant now = clock.instant();
                active(device.account).toList().forEach(each -> each.ended(now, Order.NONE));
            });
        }

        private Step presentEndedToken(ModelDevice device) {
            return new Step(StepKind.PRESENT_ENDED_TOKEN, device.account, "the last refresh token of the ended " + device + " presented again",
                    run -> !device.active && !device.deleted, () -> assertThatThrownBy(
                            () -> sessions.refresh(device.refreshToken, SessionCookie.of(device.kind), DeviceDescription.UNKNOWN))
                            .isInstanceOf(InvalidRefreshToken.class));
        }

        private Step grantRole(Account account) {
            return new Step(StepKind.GRANT_ROLE, account, "administrator role granted to " + account.name(), run -> !account.administrator, () -> {
                administrators.grant(acting, donor(account).email());
                account.administrator = true;
            });
        }

        private Step removeRole(Account account) {
            return new Step(StepKind.REMOVE_ROLE, account, "administrator role removed from " + account.name(), run -> account.administrator, () -> {
                administrators.revoke(acting, account.id);
                account.administrator = false;
                Instant now = clock.instant();
                active(account).toList().forEach(device -> device.ended(now, Order.NONE));
                stored(account).forEach(device -> device.ordered(Order.ADMINISTRATION));
            });
        }

        private Step erase(Account account) {
            return new Step(StepKind.ERASE, account, "erasure of " + account.name(), run -> !account.erased && !account.administrator, () -> {
                erasures.erase(acting, account.id);
                account.erased = true;
                Instant now = clock.instant();
                stored(account).forEach(device -> device.erased(now));
            });
        }

        private Step timePasses() {
            Duration passing = randomWhile();
            return new Step(StepKind.TIME_PASSES, null, passing + " pass without a connection, then the nightly clean-up runs", run -> true, () -> {
                clock.advance(passing);
                Instant now = clock.instant();
                cleanup.cleanUp();
                held.stream().filter(device -> device.active && !device.tokenUsableAt(now)).forEach(device -> device.ended(now, Order.NONE));
                held.stream().filter(device -> !device.active && !device.deleted && device.endedAt.isBefore(now.minus(ENDED_DEVICE_RETENTION)))
                        .forEach(device -> device.deleted = true);
            });
        }

        private Duration randomWhile() {
            int kind = random.nextInt(20);
            Duration jitter = Duration.ofSeconds(random.nextInt(3_600));
            if (kind < 6) {
                return Duration.ofMinutes(1 + random.nextInt(59)).plus(jitter);
            }
            if (kind < 12) {
                return Duration.ofHours(1 + random.nextInt(23)).plus(jitter);
            }
            if (kind < 16) {
                return Duration.ofDays(1 + random.nextInt(6)).plus(jitter);
            }
            if (kind < 19) {
                return Duration.ofDays(28 + random.nextInt(8)).plus(jitter);
            }
            return Duration.ofDays(380 + random.nextInt(60)).plus(jitter);
        }

        private boolean mayReplay(ModelDevice device) {
            Instant now = clock.instant();
            return device.active && device.spentRefreshToken != null && device.spentAt.plus(REPLAY_AFTER).isBefore(now)
                    && now.isBefore(device.spentAt.plus(REPLAY_WITHIN));
        }

        private Map<ModelDevice, Answer> askEveryDevice() {
            Map<ModelDevice, Answer> answers = new LinkedHashMap<>();
            for (ModelDevice device : held) {
                DeviceStatusService.DeviceStatusView view = statuses.statusOf(new DeviceStatusSecret(device.secret));
                answers.put(device, new Answer(view.status(), view.administrator()));
            }
            return answers;
        }

        private void checkAgainstTheModel(Map<ModelDevice, Answer> answers) {
            answers.forEach((device, answer) -> assertThat(answer)
                    .as("the status of %s after %s", device, trail)
                    .isEqualTo(device.expected()));
        }

        private void checkTransitions(Step taken, Map<ModelDevice, Answer> answers) {
            answers.forEach((device, answer) -> {
                Answer before = lastAnswers.get(device);
                String context = "the status of " + device + " after " + trail;
                if (before == null) {
                    assertThat(answer.status()).as("a new sign-in is signed in: " + context).isEqualTo(DeviceStatus.SIGNED_IN);
                    return;
                }
                if (taken.account() != null && taken.account() != device.account && taken.kind() != StepKind.TIME_PASSES) {
                    assertThat(answer.status()).as("a step of another account changes nothing: " + context).isEqualTo(before.status());
                }
                if (before.status() == DeviceStatus.WIPE_ALL) {
                    assertThat(answer.status()).as("an order to delete everything is never lowered or lifted: " + context)
                            .isIn(DeviceStatus.WIPE_ALL, DeviceStatus.UNKNOWN);
                }
                if (before.status() == DeviceStatus.WIPE_ADMINISTRATION) {
                    assertThat(answer.status()).as("an order to delete the administration's copy is never lifted: " + context)
                            .isIn(DeviceStatus.WIPE_ADMINISTRATION, DeviceStatus.WIPE_ALL, DeviceStatus.UNKNOWN);
                }
                if (before.status() == DeviceStatus.UNKNOWN) {
                    assertThat(answer.status()).as("a device the server forgot stays unknown: " + context).isEqualTo(DeviceStatus.UNKNOWN);
                }
                boolean newOrder = !WIPES.contains(before.status()) && WIPES.contains(answer.status())
                        || before.status() == DeviceStatus.WIPE_ADMINISTRATION && answer.status() == DeviceStatus.WIPE_ALL;
                if (newOrder) {
                    assertThat(taken.kind()).as("only a remote sign-out, a role removal or an erasure orders a delete: " + context)
                            .isIn(StepKind.SIGN_OUT_ELSEWHERE, StepKind.SIGN_OUT_EVERY_OTHER, StepKind.REMOVE_ROLE, StepKind.ERASE);
                }
                if (taken.kind() == StepKind.REMOVE_ROLE && answer.status() == DeviceStatus.WIPE_ALL && before.status() != DeviceStatus.WIPE_ALL) {
                    throw new AssertionError("a role removal never orders the donor's own copy deleted: " + context);
                }
                if (answer.status() == DeviceStatus.UNKNOWN && before.status() != DeviceStatus.UNKNOWN) {
                    assertThat(taken.kind()).as("the server forgets a device only at the clean-up, 400 days after it ended: " + context)
                            .isEqualTo(StepKind.TIME_PASSES);
                }
                if (answer.administrator()) {
                    assertThat(answer.status()).as("only a device still holding the account tells it holds the role: " + context)
                            .isIn(DeviceStatus.SIGNED_IN, DeviceStatus.SIGNED_OUT);
                }
            });
            if (taken.kind() == StepKind.ERASE) {
                answers.forEach((device, answer) -> {
                    if (device.account == taken.account() && !device.deleted) {
                        assertThat(answer.status()).as("an erasure reaches every device the server still knows: " + device + " after " + trail)
                                .isEqualTo(DeviceStatus.WIPE_ALL);
                    }
                });
            }
        }

        private Stream<ModelDevice> active(Account account) {
            return held.stream().filter(device -> device.account == account && device.active);
        }

        private List<ModelDevice> stored(Account account) {
            return held.stream().filter(device -> device.account == account && !device.deleted).toList();
        }

        private Donor donor(Account account) {
            return donors.findById(account.id).orElseThrow();
        }

        private DeviceId deviceIdOf(ModelDevice device) {
            return devices.findByStatusSecretHash(new DeviceStatusSecret(device.secret).hash()).orElseThrow().id();
        }

        private Instant expiryOf(SessionKind kind, Instant signedInAt, Instant issuedAt) {
            return issuedAt.plus(switch (kind) {
                case BROWSER -> BROWSER_IDLE;
                case REMEMBERED -> REMEMBERED;
                case APP -> APP;
                case PUBLIC -> throw new IllegalArgumentException("a public sign-in keeps no copy and gets no device secret");
            });
        }

        private DonorId register(String name, String email, String symbol) {
            Instant now = clock.instant();
            Donor donor = Donor.register(DonorId.newId(now), DonorType.PERSON, name, null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                    new EmailAddress(email), new PasswordHash("$hash"), new VariableSymbol(symbol), LocaleCode.CS, now);
            donor.verifyEmail(now);
            donors.save(donor);
            secondFactors.save(SecondFactor.reconstitute(donor.id(), AUTHENTICATOR_SECRET, now, now, null));
            return donor.id();
        }
    }

    private enum StepKind {
        SIGN_IN, REFRESH, SIGN_OUT_HERE, SIGN_OUT_ELSEWHERE, SIGN_OUT_EVERY_OTHER, REPLAY, PRESENT_ENDED_TOKEN, GRANT_ROLE, REMOVE_ROLE, ERASE, TIME_PASSES
    }

    private enum Order {
        NONE, ADMINISTRATION, ALL
    }

    private record Step(StepKind kind, Account account, String description, Predicate<Run> precondition, Runnable action) {
    }

    private record Answer(DeviceStatus status, boolean administrator) {
    }

    private record Transition(DeviceStatus before, StepKind step, DeviceStatus after) {
    }

    private static final class Account {

        private final DonorId id;
        private boolean administrator;
        private boolean erased;

        Account(DonorId id) {
            this.id = id;
        }

        String name() {
            return "donor " + id;
        }
    }

    private static final class ModelDevice {

        private static int numbered;

        private final Account account;
        private final SessionKind kind;
        private final String secret;
        private final Instant signedInAt;
        private final int number = ++numbered;
        private String refreshToken;
        private Instant tokenExpiresAt;
        private String spentRefreshToken;
        private Instant spentAt;
        private boolean active = true;
        private Instant endedAt;
        private Order order = Order.NONE;
        private boolean deleted;

        ModelDevice(Account account, SessionKind kind, String secret, Instant signedInAt) {
            this.account = account;
            this.kind = kind;
            this.secret = secret;
            this.signedInAt = signedInAt;
        }

        void issued(String token, Instant expiresAt) {
            this.refreshToken = token;
            this.tokenExpiresAt = expiresAt;
        }

        void rotated(String token, Instant at, Instant expiresAt) {
            this.spentRefreshToken = refreshToken;
            this.spentAt = at;
            issued(token, expiresAt);
        }

        boolean tokenUsableAt(Instant now) {
            return active && tokenExpiresAt.isAfter(now);
        }

        void ended(Instant at, Order written) {
            if (active) {
                active = false;
                endedAt = at;
                ordered(written);
            }
        }

        void ordered(Order written) {
            if (written.ordinal() > order.ordinal()) {
                order = written;
            }
        }

        void erased(Instant at) {
            active = false;
            endedAt = at;
            order = Order.ALL;
        }

        Answer expected() {
            if (deleted) {
                return new Answer(DeviceStatus.UNKNOWN, false);
            }
            DeviceStatus status = switch (order) {
                case ALL -> DeviceStatus.WIPE_ALL;
                case ADMINISTRATION -> DeviceStatus.WIPE_ADMINISTRATION;
                case NONE -> active ? DeviceStatus.SIGNED_IN : DeviceStatus.SIGNED_OUT;
            };
            boolean administrator = order == Order.NONE && account.administrator && !account.erased;
            return new Answer(status, administrator);
        }

        @Override
        public String toString() {
            return "device " + number + " (" + kind + ")";
        }
    }
}
