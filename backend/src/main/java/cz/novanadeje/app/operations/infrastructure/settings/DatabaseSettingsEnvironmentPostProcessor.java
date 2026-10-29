package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.settings.SecretSealer;
import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKey;
import cz.novanadeje.app.operations.domain.settings.Setting;
import org.apache.commons.logging.Log;
import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.logging.DeferredLogFactory;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

public class DatabaseSettingsEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    static final String SOURCE_NAME = "storedSettings";
    static final String ENABLED_PROPERTY = "app.operations.settings.from-database";
    static final String KEY_PROPERTY = "app.operations.settings.key";
    static final String BACKUP_KEY_PROPERTY = "app.operations.backup-key.value";
    private static final String TABLE_EXISTS = "select to_regclass('public.operations_setting') is not null";
    private static final String STORED = "select name, value, sealed from operations_setting";
    private static final String CARRIED_TABLE_EXISTS = "select to_regclass('public.operations_carried_settings_key') is not null";
    private static final String CARRIED = "select wrapped, stored_at from operations_carried_settings_key";

    private final Log log;

    public DatabaseSettingsEnvironmentPostProcessor(DeferredLogFactory logs) {
        this.log = logs.getLog(DatabaseSettingsEnvironmentPostProcessor.class);
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        if (!environment.getProperty(ENABLED_PROPERTY, Boolean.class, false)) {
            return;
        }
        AesGcmSecretSealer sealer = AesGcmSecretSealer.fromKey(environment.getProperty(KEY_PROPERTY));
        Map<String, Object> values = new LinkedHashMap<>();
        Map<Setting, String> unreadable = new LinkedHashMap<>();
        int carriedOver = 0;
        try (Connection connection = DriverManager.getConnection(environment.getProperty("spring.datasource.url"),
                environment.getProperty("spring.datasource.username"), environment.getProperty("spring.datasource.password"))) {
            if (!exists(connection, TABLE_EXISTS)) {
                log.info("No stored settings yet; the defaults apply until the first setup");
                return;
            }
            try (PreparedStatement statement = connection.prepareStatement(STORED); ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    Optional<Setting> setting = Setting.named(rows.getString("name"));
                    if (setting.isEmpty()) {
                        continue;
                    }
                    Optional<String> value = rows.getBoolean("sealed")
                            ? sealer.unseal(setting.get(), rows.getString("value"))
                            : Optional.of(rows.getString("value"));
                    if (value.isPresent()) {
                        values.put(setting.get().name(), value.get());
                    } else {
                        unreadable.put(setting.get(), rows.getString("value"));
                    }
                }
            }
            if (!unreadable.isEmpty()) {
                Optional<SecretSealer> previous = carriedSealer(connection, environment.getProperty(BACKUP_KEY_PROPERTY));
                if (previous.isPresent()) {
                    for (Map.Entry<Setting, String> entry : Map.copyOf(unreadable).entrySet()) {
                        Optional<String> value = previous.get().unseal(entry.getKey(), entry.getValue());
                        if (value.isPresent()) {
                            values.put(entry.getKey().name(), value.get());
                            unreadable.remove(entry.getKey());
                            carriedOver++;
                        }
                    }
                }
            }
        } catch (SQLException failure) {
            throw new IllegalStateException("The stored settings could not be read from the database (" + failure.getSQLState()
                    + "); the backend stops and starts again once the database answers", failure);
        }
        environment.getPropertySources().addFirst(new MapPropertySource(SOURCE_NAME, values));
        log.info("Loaded " + values.size() + " stored settings");
        if (carriedOver > 0) {
            log.info(carriedOver + " stored secret settings were read with the settings key the backup carried");
        }
        if (!unreadable.isEmpty()) {
            log.warn(unreadable.size() + " stored secret settings cannot be read with this settings key; enter them again in the administration");
        }
    }

    private static Optional<SecretSealer> carriedSealer(Connection connection, String backupKey) throws SQLException {
        if (!exists(connection, CARRIED_TABLE_EXISTS)) {
            return Optional.empty();
        }
        try (PreparedStatement statement = connection.prepareStatement(CARRIED); ResultSet rows = statement.executeQuery()) {
            if (!rows.next()) {
                return Optional.empty();
            }
            CarriedSettingsKey carried = new CarriedSettingsKey(rows.getString("wrapped"), rows.getTimestamp("stored_at").toInstant());
            return BackupKeySettingsKeyCarrier.of(null, backupKey).sealerOf(carried);
        }
    }

    private static boolean exists(Connection connection, String query) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(query); ResultSet result = statement.executeQuery()) {
            return result.next() && result.getBoolean(1);
        }
    }
}
