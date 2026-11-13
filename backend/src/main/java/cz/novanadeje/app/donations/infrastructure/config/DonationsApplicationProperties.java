package cz.novanadeje.app.donations.infrastructure.config;

import cz.novanadeje.app.donations.application.importing.BankImportProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.boot.context.properties.bind.Name;

@ConfigurationProperties("app.donations")
record DonationsApplicationProperties(@Name("import") @DefaultValue BankImportProperties bankImport) {
}
