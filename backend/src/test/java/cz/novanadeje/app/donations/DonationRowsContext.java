package cz.novanadeje.app.donations;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donations.application.report.MonthlyReportSender;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.shared.application.audit.AdminActionTrail;
import cz.novanadeje.app.support.TestSupportConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@IntegrationTest
@Import(TestSupportConfiguration.class)
@TestPropertySource(properties = "app.donations.receipt.first-year=2026")
@MockitoSpyBean(types = {MonthlyReportSender.class, SymbolClaimRepository.class, AdminActionTrail.class, DonationRepository.class})
public @interface DonationRowsContext {
}
