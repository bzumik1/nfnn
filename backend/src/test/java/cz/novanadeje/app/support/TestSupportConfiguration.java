package cz.novanadeje.app.support;

import cz.novanadeje.app.donations.application.importing.BankImportProperties;
import cz.novanadeje.app.donations.application.importing.ImportBankPaymentsService;
import cz.novanadeje.app.donors.infrastructure.ares.CompanyRegistryBreaker;
import java.time.Clock;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;
import java.time.ZoneId;

@TestConfiguration(proxyBeanMethods = false)
@Import(AsyncTaskTrackingConfiguration.class)
public class TestSupportConfiguration {

    @Bean
    @Primary
    public MutableClock mutableClock() {
        return new MutableClock(Instant.now(), ZoneId.of("Europe/Prague"));
    }

    @Bean
    @Primary
    public RecordingMailSender recordingMailSender() {
        return new RecordingMailSender();
    }

    @Bean
    @Primary
    public FakeFioClient fakeFioClient(MutableClock clock) {
        return new FakeFioClient(clock);
    }

    @Bean
    @Primary
    public SynchronousBankImportRequests synchronousBankImportRequests(ImportBankPaymentsService imports, BankImportProperties properties, Clock clock) {
        return new SynchronousBankImportRequests(imports, properties, clock);
    }

    @Bean
    @Primary
    public FakeClientMetadataSource fakeClientMetadataSource() {
        return new FakeClientMetadataSource();
    }

    @Bean
    @Primary
    public FakeBankCodeSource fakeBankCodeSource() {
        return new FakeBankCodeSource();
    }

    @Bean
    @Primary
    public FakeLatestReleaseSource fakeLatestReleaseSource() {
        return new FakeLatestReleaseSource();
    }

    @Bean
    @Primary
    public ResettableReleaseChecks resettableReleaseChecks() {
        return new ResettableReleaseChecks();
    }

    @Bean
    @Primary
    public FakeBankLogoSource fakeBankLogoSource() {
        return new FakeBankLogoSource();
    }

    @Bean
    public FakeCompanyRegistry fakeCompanyRegistry() {
        return new FakeCompanyRegistry();
    }

    @Bean
    @Primary
    public CompanyRegistryBreaker fakeCompanyRegistryBehindBreaker(FakeCompanyRegistry registry, MutableClock clock) {
        return new CompanyRegistryBreaker(registry, clock);
    }

    @Bean
    @Primary
    public RecordingResetTimer recordingResetTimer() {
        return new RecordingResetTimer();
    }

    @Bean
    @Primary
    public RecordingSetupCodeAnnouncer recordingSetupCodeAnnouncer() {
        return new RecordingSetupCodeAnnouncer();
    }

    @Bean
    @Primary
    public RecordingApplicationRestarter recordingApplicationRestarter() {
        return new RecordingApplicationRestarter();
    }

    @Bean
    @Primary
    public FakeMailServerProbe fakeMailServerProbe() {
        return new FakeMailServerProbe();
    }

    @Bean
    @Primary
    public SwitchablePublicBackupKeyPolicy switchablePublicBackupKeyPolicy() {
        return new SwitchablePublicBackupKeyPolicy();
    }

    @Bean
    @Primary
    public SwitchablePublicTestKeyPolicy switchablePublicTestKeyPolicy() {
        return new SwitchablePublicTestKeyPolicy();
    }

    @Bean
    @Primary
    public KeptAsideWithdrawnSeeds keptAsideWithdrawnSeeds() {
        return new KeptAsideWithdrawnSeeds();
    }

    @Bean
    @Primary
    public RecordingPushTransport recordingPushTransport() {
        return new RecordingPushTransport();
    }

    @Bean
    @Primary
    public RecordingPushRetryTimer recordingPushRetryTimer() {
        return new RecordingPushRetryTimer();
    }

    @Bean
    public static CachingPasswordHashers cachingPasswordHashers() {
        return new CachingPasswordHashers();
    }

    @Bean
    public DatabaseCleaner databaseCleaner(JdbcClient jdbcClient) {
        return new DatabaseCleaner(jdbcClient);
    }
}
