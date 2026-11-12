package cz.novanadeje.app.shared.infrastructure.persistence;

import org.springframework.boot.jdbc.autoconfigure.JdbcConnectionDetails;
import org.springframework.boot.liquibase.autoconfigure.LiquibaseDataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import javax.sql.DataSource;
import java.util.Optional;
import java.util.Properties;

@Configuration(proxyBeanMethods = false)
class MigrationDataSourceConfiguration {

    @Bean(defaultCandidate = false)
    @LiquibaseDataSource
    DataSource migrationDataSource(JdbcConnectionDetails connection, MigrationSessionProperties session) {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(connection.getJdbcUrl());
        dataSource.setDriverClassName(connection.getDriverClassName());
        Properties properties = new Properties();
        Optional.ofNullable(connection.getUsername()).ifPresent(user -> properties.setProperty("user", user));
        Optional.ofNullable(connection.getPassword()).ifPresent(password -> properties.setProperty("password", password));
        properties.setProperty("logServerErrorDetail", "false");
        properties.setProperty("options", session.sessionOptions());
        dataSource.setConnectionProperties(properties);
        return dataSource;
    }
}
