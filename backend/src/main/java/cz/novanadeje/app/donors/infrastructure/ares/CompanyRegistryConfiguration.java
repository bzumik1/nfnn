package cz.novanadeje.app.donors.infrastructure.ares;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration(proxyBeanMethods = false)
class CompanyRegistryConfiguration {

    @Bean
    CompanyRegistryBreaker companyRegistry(Clock clock) {
        return new CompanyRegistryBreaker(new AresCompanyRegistry(clock), clock);
    }
}
