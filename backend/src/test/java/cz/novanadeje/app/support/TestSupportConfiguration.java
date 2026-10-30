package cz.novanadeje.app.support;

import cz.novanadeje.app.donations.application.importing.BankImportProperties;
import cz.novanadeje.app.donations.application.importing.ImportBankPaymentsService;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;
import java.time.ZoneId;

@TestConfiguration(proxyBeanMethods = false)
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
    public SynchronousBankImportRequests synchronousBankImportRequests(ImportBankPaymentsService imports, BankImportProperties properties) {
        return new SynchronousBankImportRequests(imports, properties);
    }

    @Bean
    @Primary
    public FakeClientMetadataSource fakeClientMetadataSource() {
        return new FakeClientMetadataSource();
    }

    @Bean
    @Primary
    public FakeCompanyRegistry fakeCompanyRegistry() {
        return new FakeCompanyRegistry();
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
    public SwitchablePublicTestKeyPolicy switchablePublicTestKeyPolicy() {
        return new SwitchablePublicTestKeyPolicy();
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
